import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const desktopDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(desktopDir, '..', '..');
const electronBinary = require('electron');
const npmCli = resolve(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
const uiMarkerPrefix = 'OMUE_AGENT_REAL_SAFETY_UI ';
const contextMarkerPrefix = 'OMUE_AGENT_REAL_CONTEXT_SMOKE ';
const requests = [];

function runSync(command, args, options, label) {
  const result = spawnSync(command, args, {
    ...options,
    encoding: 'utf8',
    stdio: 'pipe',
    windowsHide: true,
  });
  process.stdout.write(result.stdout ?? '');
  process.stderr.write(result.stderr ?? '');
  if (result.status !== 0) {
    throw new Error(
      `${label} failed with exit ${result.status}\n${result.stdout ?? ''}\n${result.stderr ?? ''}`,
    );
  }
  return result;
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

function waitForExit(child, timeoutMs) {
  return new Promise((resolveExit, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Electron safety UI smoke did not exit within ${timeoutMs}ms`));
    }, timeoutMs);
    child.once('exit', (code, signal) => {
      clearTimeout(timer);
      resolveExit({ code, signal });
    });
    child.once('error', error => {
      clearTimeout(timer);
      reject(error);
    });
  });
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

function jsonResponse(response, data) {
  response.writeHead(200, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  });
  response.end(JSON.stringify({ success: true, data }));
}

function notFound(response, url) {
  response.writeHead(404, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  });
  response.end(JSON.stringify({
    success: false,
    error: { code: 'NOT_FOUND', message: `Endpoint not implemented: ${url}` },
  }));
}

async function listenBridgeFixture() {
  const server = createServer((request, response) => {
    const url = request.url;
    requests.push({ method: request.method, url });

    if (request.method !== 'GET') return notFound(response, url);
    if (url === '/health') {
      return jsonResponse(response, {
        status: 'ok',
        bridgeVersion: 'omue-safety-smoke-1.0',
        editorStatus: 'idle',
      });
    }
    if (url === '/context/project') {
      return jsonResponse(response, {
        projectName: 'SafetySmokeProject',
        projectPath: 'C:/Projects/SafetySmokeProject',
        uprojectFile: 'C:/Projects/SafetySmokeProject/SafetySmokeProject.uproject',
        engineVersion: '5.7.0',
        editorStatus: 'idle',
      });
    }
    if (url === '/context/current-asset') {
      return jsonResponse(response, { selectedAsset: null, openAssets: [] });
    }
    if (url === '/compile/status') {
      return jsonResponse(response, {
        isCompiling: false,
        lastCompileResult: 'unknown',
        errorCount: 0,
        warningCount: 0,
        lastErrors: [],
      });
    }
    if (url?.startsWith('/logs/recent')) {
      return jsonResponse(response, { entries: [] });
    }
    if (url === '/context/blueprint-summary') {
      return jsonResponse(response, { selectedBlueprint: null });
    }
    if (url === '/context/blueprint-graphs') {
      return jsonResponse(response, { selectedBlueprint: null });
    }
    return notFound(response, url);
  });

  await new Promise((resolveListen, reject) => {
    server.once('error', reject);
    server.listen({ host: '127.0.0.1', port: 21805, exclusive: true }, resolveListen);
  });
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  return { server, baseUrl: 'http://127.0.0.1:21805' };
}

function closeServer(server) {
  return new Promise((resolveClose, reject) => {
    server.close(error => (error ? reject(error) : resolveClose()));
  });
}

let electron;
let fixture;
let userDataDir;

try {
  fixture = await listenBridgeFixture();
  userDataDir = await mkdtemp(join(tmpdir(), 'omue-safety-smoke-'));

  runSync(process.execPath, [npmCli, 'run', 'build:shared'], {
    cwd: repoRoot,
    env: process.env,
  }, 'shared protocol build');
  runSync(process.execPath, [npmCli, 'run', 'build'], {
    cwd: desktopDir,
    env: {
      ...process.env,
      VITE_OMUE_BRIDGE_MODE: 'real',
      VITE_OMUE_BRIDGE_BASE_URL: fixture.baseUrl,
    },
  }, 'real-mode desktop build');

  electron = startCaptured(electronBinary, [
    resolve(desktopDir, 'scripts/test-agent-real-safety-ui-runner.cjs'),
  ], {
    cwd: desktopDir,
    env: {
      ...process.env,
      OMUE_AGENT_SAFETY_SMOKE_USER_DATA: userDataDir,
      ELECTRON_ENABLE_LOGGING: '1',
      NO_COLOR: '1',
      FORCE_COLOR: '0',
    },
  });

  const result = await waitForExit(electron.child, 60_000);
  const output = electron.getOutput();
  const uiMarkerLine = output
    .split(/\r?\n/)
    .find(line => line.startsWith(uiMarkerPrefix));
  assert.ok(uiMarkerLine, `Electron output must contain ${uiMarkerPrefix.trim()}`);
  const uiMarker = JSON.parse(uiMarkerLine.slice(uiMarkerPrefix.length));

  assert.equal(result.code, 0, `Electron Settings safety UI smoke must exit 0\n${output}`);
  assert.equal(uiMarker.ok, true, `Settings safety UI marker reported failure\n${uiMarkerLine}`);
  assert.equal(uiMarker.sandboxEnabledControls.length, 0);
  assert.equal(uiMarker.assistantEnabledControls.length, 0);
  assert.equal(uiMarker.advancedEnabledControls.length, 0);
  assert.equal(uiMarker.hardSafetyCopyPresent, true);
  assert.equal(uiMarker.unavailableCopyPresent, true);
  assert.equal(uiMarker.dangerousCopyRendered, false);

  const healthRequests = requests.filter(request => request.url === '/health');
  const projectRequests = requests.filter(request => request.url === '/context/project');
  assert.ok(healthRequests.length > 0, 'real-mode Renderer must request /health');
  assert.ok(projectRequests.length > 0, 'real-mode Renderer must request /context/project');

  const contextRun = runSync(process.execPath, [
    resolve(desktopDir, 'scripts/test-agent-real-context-smoke.mjs'),
  ], {
    cwd: desktopDir,
    env: process.env,
    timeout: 120_000,
  }, 'real asset session context smoke');
  const contextMarkerLine = (contextRun.stdout ?? '')
    .split(/\r?\n/)
    .find(line => line.startsWith(contextMarkerPrefix));
  assert.ok(contextMarkerLine, `Context smoke output must contain ${contextMarkerPrefix.trim()}`);
  const contextMarker = JSON.parse(contextMarkerLine.slice(contextMarkerPrefix.length));
  assert.equal(contextMarker.ok, true);
  assert.equal(contextMarker.assetContextSource, 'real_readonly_bridge');
  assert.equal(contextMarker.noMockProvenance, true);

  const runtimeSource = await readFile(
    resolve(desktopDir, 'src/main/agent-loop-runtime.ts'),
    'utf8',
  );
  assert.match(runtimeSource, /record\.currentState !== 'awaiting_approval'/);
  assert.match(runtimeSource, /transition\(record, 'promoting'\)/);
  assert.match(runtimeSource, /transition\(record, 'sandbox_duplicating'\)/);
  assert.match(runtimeSource, /transition\(record, 'sandbox_applying'\)/);
  assert.doesNotMatch(
    runtimeSource,
    /defaultModificationMode|writeBackConfirmations|bypassSandboxPromote|advanced-automation/,
    'Agent runtime must not consume legacy Settings bypass fields',
  );

  console.log(`OMUE_AGENT_REAL_SAFETY_SMOKE_OK ${JSON.stringify({
    ui: uiMarker,
    realRendererRequests: requests.map(request => request.url),
    assetSession: contextMarker,
    approvalReached: false,
    approvalReason: 'loopback session stopped at the provider boundary; runtime hard-gate source checks passed',
    productionPolicyVerified: true,
    externalNetwork: false,
  })}`);
} finally {
  terminateOwnProcess(electron?.child);
  if (fixture?.server) await closeServer(fixture.server);
  if (userDataDir && userDataDir.startsWith(join(tmpdir(), 'omue-safety-smoke-'))) {
    await rm(userDataDir, { recursive: true, force: true });
  }
}
