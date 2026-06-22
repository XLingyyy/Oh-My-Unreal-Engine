import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const desktopDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const runnerPath = resolve(desktopDir, 'scripts/test-agent-real-recovery-smoke-runner.cjs');
const electronBinary = require('electron');
const npmCli = resolve(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
const bridgeBaseUrl =
  process.env.OMUE_REAL_BRIDGE_BASE_URL ?? 'http://127.0.0.1:21805';
const terminalStates = new Set(['done', 'escalated_done', 'closed', 'interrupted']);

function runBuild() {
  const result = spawnSync(process.execPath, [npmCli, 'run', 'build'], {
    cwd: desktopDir,
    env: {
      ...process.env,
      VITE_OMUE_BRIDGE_MODE: 'real',
    },
    encoding: 'utf8',
    stdio: 'pipe',
    windowsHide: true,
  });
  if (result.status !== 0) {
    throw new Error(
      `production real-mode desktop build failed\n${result.stdout ?? ''}\n${result.stderr ?? ''}`,
    );
  }
  process.stdout.write(result.stdout ?? '');
  process.stderr.write(result.stderr ?? '');
}

async function readBridgeData(pathname) {
  let response;
  try {
    response = await fetch(`${bridgeBaseUrl}${pathname}`, {
      signal: AbortSignal.timeout(4_000),
    });
  } catch (error) {
    throw new Error(
      `REAL_UE_BRIDGE_REQUIRED: ${bridgeBaseUrl}${pathname} is unavailable. `
      + 'Start UE with OmueUnrealBridge, select or open a Blueprint asset, then rerun '
      + '`npm -w @omue/desktop run test:agent-real-recovery-smoke`. '
      + `Cause: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (!response.ok) {
    throw new Error(
      `REAL_UE_BRIDGE_REQUIRED: ${bridgeBaseUrl}${pathname} returned HTTP ${response.status}.`,
    );
  }
  const payload = await response.json();
  return payload?.data ?? payload;
}

async function findAssetTarget() {
  await readBridgeData('/health');
  const current = await readBridgeData('/context/current-asset');
  const target =
    current?.selectedAsset?.assetPath
    ?? current?.openAssets?.find(asset => asset?.assetPath)?.assetPath;
  if (!target) {
    throw new Error(
      'REAL_UE_ASSET_REQUIRED: Open or select a Blueprint asset in UE before running '
      + 'the recovery smoke.',
    );
  }
  return target;
}

async function allocatePort() {
  const server = createServer();
  await new Promise((resolveListen, reject) => {
    server.once('error', reject);
    server.listen({ host: '127.0.0.1', port: 0, exclusive: true }, resolveListen);
  });
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const port = address.port;
  await new Promise((resolveClose, reject) => {
    server.close(error => (error ? reject(error) : resolveClose()));
  });
  return port;
}

function startCaptured(command, args, options) {
  const child = spawn(command, args, {
    ...options,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  let output = '';
  child.stdout.on('data', chunk => {
    const text = chunk.toString();
    output += text;
    process.stdout.write(text);
  });
  child.stderr.on('data', chunk => {
    const text = chunk.toString();
    output += text;
    process.stderr.write(text);
  });
  return { child, getOutput: () => output };
}

function terminateOwnProcess(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], {
      stdio: 'ignore',
      windowsHide: true,
    });
  } else {
    child.kill('SIGTERM');
  }
}

async function waitFor(getValue, predicate, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  let lastValue;
  while (Date.now() < deadline) {
    try {
      lastValue = await getValue();
      if (predicate(lastValue)) return lastValue;
    } catch {
      // The renderer may be between execution contexts during reload.
    }
    await new Promise(resolveWait => setTimeout(resolveWait, 150));
  }
  throw new Error(`Timed out waiting for ${label}. Last value: ${JSON.stringify(lastValue)}`);
}

async function findDebuggerTarget(port) {
  return waitFor(
    async () => {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`, {
        signal: AbortSignal.timeout(1_000),
      });
      const targets = await response.json();
      return targets.find(target =>
        target.type === 'page' && typeof target.webSocketDebuggerUrl === 'string');
    },
    Boolean,
    20_000,
    'Electron renderer debugger target',
  );
}

class CdpClient {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.nextId = 1;
    this.pending = new Map();
  }

  async connect() {
    await new Promise((resolveOpen, reject) => {
      this.socket.addEventListener('open', resolveOpen, { once: true });
      this.socket.addEventListener('error', reject, { once: true });
    });
    this.socket.addEventListener('message', event => {
      const message = JSON.parse(String(event.data));
      if (!message.id) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
    });
  }

  call(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolveCall, rejectCall) => {
      this.pending.set(id, { resolve: resolveCall, reject: rejectCall });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const result = await this.call('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (result.exceptionDetails) {
      throw new Error(
        result.exceptionDetails.exception?.description
        ?? result.exceptionDetails.text
        ?? 'Renderer evaluation failed',
      );
    }
    return result.result?.value;
  }

  close() {
    this.socket.close();
  }
}

async function listSessions(cdp) {
  const result = await cdp.evaluate('window.omue.agent.listSessions()');
  assert.equal(result?.ok, true, `listSessions failed: ${JSON.stringify(result)}`);
  return result.sessions;
}

async function startSession(cdp, request) {
  const result = await cdp.evaluate(
    `window.omue.agent.startSession(${JSON.stringify(request)})`,
  );
  assert.equal(result?.ok, true, `startSession failed: ${JSON.stringify(result)}`);
  return result.sessionId;
}

async function waitForTerminalSession(cdp, sessionId) {
  return waitFor(
    () => listSessions(cdp),
    sessions => {
      const session = sessions.find(item => item.sessionId === sessionId);
      return session && terminalStates.has(session.currentState);
    },
    45_000,
    `terminal session ${sessionId}`,
  );
}

async function reloadAndInspectLifecycle(cdp, expectedTitle) {
  await cdp.evaluate('location.reload(); true');
  await waitFor(
    () => cdp.evaluate(`({
      ready: Boolean(window.omue?.agent && document.querySelector('#root')),
      lifecycleCount: document.querySelectorAll('.ue-card-scan').length,
      title: document.querySelector('.ue-card-scan .ue-card-title')?.textContent?.trim() ?? '',
      meta: document.querySelector('.ue-card-scan .ue-card-meta')?.textContent?.trim() ?? ''
    })`),
    value => value?.ready && value.lifecycleCount === 1 && value.title === expectedTitle,
    20_000,
    `${expectedTitle} lifecycle card`,
  );
  const state = await cdp.evaluate(`({
    lifecycleCount: document.querySelectorAll('.ue-card-scan').length,
    title: document.querySelector('.ue-card-scan .ue-card-title')?.textContent?.trim() ?? '',
    meta: document.querySelector('.ue-card-scan .ue-card-meta')?.textContent?.trim() ?? ''
  })`);
  assert.equal(state.lifecycleCount, 1);
  assert.equal(state.title, expectedTitle);
  assert.doesNotMatch(state.meta, /^0 resources scanned/i);
  return state;
}

let electron;
let userDataDir;
let cdp;

try {
  const targetAssetPath = await findAssetTarget();
  runBuild();
  const debugPort = await allocatePort();
  userDataDir = await mkdtemp(join(tmpdir(), 'omue-recovery-smoke-'));

  electron = startCaptured(electronBinary, [
    runnerPath,
    `--remote-debugging-port=${debugPort}`,
  ], {
    cwd: desktopDir,
    env: {
      ...process.env,
      VITE_OMUE_BRIDGE_MODE: 'real',
      OMUE_AGENT_BRIDGE_BASE_URL: bridgeBaseUrl,
      OMUE_AGENT_RECOVERY_SMOKE_USER_DATA: userDataDir,
      OMUE_AGENT_RECOVERY_SMOKE_DEBUG_PORT: String(debugPort),
      ELECTRON_ENABLE_LOGGING: '1',
      NO_COLOR: '1',
      FORCE_COLOR: '0',
    },
  });

  const target = await findDebuggerTarget(debugPort);
  cdp = new CdpClient(target.webSocketDebuggerUrl);
  await cdp.connect();
  await waitFor(
    () => cdp.evaluate('Boolean(window.omue?.agent && document.querySelector("#root"))'),
    Boolean,
    20_000,
    'production Renderer bootstrap',
  );

  const projectSessionId = await startSession(cdp, {
    scope: 'project',
    userIntent: 'Recovery smoke project diagnosis',
  });
  await waitForTerminalSession(cdp, projectSessionId);
  const projectLifecycle = await reloadAndInspectLifecycle(cdp, 'Project diagnosis progress');

  const assetSessionId = await startSession(cdp, {
    scope: 'asset',
    userIntent: 'Recovery smoke asset diagnosis',
    targetAssetPath,
    parentSessionId: projectSessionId,
    inheritedEvidenceSummary: 'Recovery smoke inherited evidence',
  });
  await waitForTerminalSession(cdp, assetSessionId);
  const assetLifecycle = await reloadAndInspectLifecycle(cdp, 'Asset repair progress');

  const sessionsBeforeRetry = await listSessions(cdp);
  const originalSession = sessionsBeforeRetry.find(
    session => session.sessionId === assetSessionId,
  );
  assert.ok(originalSession);
  assert.equal(originalSession.currentState, 'escalated_done');
  assert.ok(originalSession.errors?.some(error => error.recoverable === true));

  const clicked = await cdp.evaluate(`(() => {
    const button = [...document.querySelectorAll('button')]
      .find(item => item.textContent?.trim() === 'Retry as new session');
    if (!button) return false;
    button.click();
    return true;
  })()`);
  assert.equal(clicked, true, 'FailureCard must expose Retry as new session.');

  const sessionsAfterRetry = await waitFor(
    () => listSessions(cdp),
    sessions => sessions.some(session =>
      session.sessionId !== assetSessionId
      && session.scope === 'asset'
      && session.userIntent === originalSession.userIntent
      && session.targetAssetPath === originalSession.targetAssetPath),
    20_000,
    'replacement session creation',
  );
  const replacement = sessionsAfterRetry.find(session =>
    session.sessionId !== assetSessionId
    && session.scope === 'asset'
    && session.userIntent === originalSession.userIntent
    && session.targetAssetPath === originalSession.targetAssetPath);
  assert.ok(replacement);
  await waitForTerminalSession(cdp, replacement.sessionId);

  const finalSessions = await listSessions(cdp);
  const preservedOriginal = finalSessions.find(
    session => session.sessionId === assetSessionId,
  );
  const finalReplacement = finalSessions.find(
    session => session.sessionId === replacement.sessionId,
  );
  const originalSessionPreserved = Boolean(
    preservedOriginal
    && preservedOriginal.currentState === 'escalated_done'
    && preservedOriginal.closeReason === 'escalated',
  );
  assert.equal(originalSessionPreserved, true);
  assert.ok(finalReplacement);
  assert.equal(finalReplacement.parentSessionId, originalSession.parentSessionId);
  assert.equal(
    finalReplacement.inheritedEvidenceSummary,
    originalSession.inheritedEvidenceSummary,
  );

  const touchedSessions = finalSessions.filter(session =>
    [projectSessionId, assetSessionId, replacement.sessionId].includes(session.sessionId));
  const noExecutionSideEffects = touchedSessions.every(session =>
    !session.sandbox && !session.approval && !session.promote);
  assert.equal(noExecutionSideEffects, true);

  console.log(`OMUE_AGENT_REAL_RECOVERY_SMOKE_OK ${JSON.stringify({
    bridgeBaseUrl,
    targetAssetPath,
    projectSessionId,
    assetSessionId,
    replacementSessionId: replacement.sessionId,
    projectLifecycle,
    assetLifecycle,
    originalSessionPreserved,
    replacementPreservedScope: finalReplacement.scope === originalSession.scope,
    replacementPreservedIntent: finalReplacement.userIntent === originalSession.userIntent,
    replacementPreservedTarget:
      finalReplacement.targetAssetPath === originalSession.targetAssetPath,
    replacementPreservedParent:
      finalReplacement.parentSessionId === originalSession.parentSessionId,
    replacementPreservedEvidence:
      finalReplacement.inheritedEvidenceSummary === originalSession.inheritedEvidenceSummary,
    noExecutionSideEffects,
    compileTriggered: false,
    pieTriggered: false,
    automationTriggered: false,
    approvalTriggered: false,
    promoteTriggered: false,
  })}`);
} finally {
  cdp?.close();
  terminateOwnProcess(electron?.child);
  if (userDataDir && userDataDir.startsWith(join(tmpdir(), 'omue-recovery-smoke-'))) {
    await rm(userDataDir, { recursive: true, force: true });
  }
}
