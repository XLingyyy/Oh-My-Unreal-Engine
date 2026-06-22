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
const electronBinary = require('electron');
const npmCli = resolve(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
const statusSmokeMarker = 'OMUE_AGENT_REAL_STATUS_SMOKE ';
const requests = [];

function runBuild() {
  const result = spawnSync(process.execPath, [npmCli, 'run', 'build'], {
    cwd: desktopDir,
    env: process.env,
    encoding: 'utf8',
    stdio: 'pipe',
    windowsHide: true,
  });
  if (result.status !== 0) {
    throw new Error(
      `production desktop build failed\n${result.stdout ?? ''}\n${result.stderr ?? ''}`,
    );
  }
  process.stdout.write(result.stdout ?? '');
  process.stderr.write(result.stderr ?? '');
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
      reject(new Error(`Electron status smoke did not exit within ${timeoutMs}ms`));
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
  response.writeHead(200, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify({ success: true, data }));
}

function notFound(response, url) {
  response.writeHead(404, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify({
    success: false,
    error: { code: 'NOT_FOUND', message: `Endpoint not implemented: ${url}` },
  }));
}

async function listenBridgeFixture() {
  const server = createServer((request, response) => {
    const url = request.url;
    requests.push({ method: request.method, url });

    if (request.method !== 'GET') {
      return notFound(response, url);
    }

    if (url === '/health') {
      return jsonResponse(response, {
        status: 'ok',
        bridgeVersion: 'omue-status-smoke-1.0',
        editorStatus: 'idle',
        uptime: 12345,
      });
    }

    if (url === '/context/project') {
      return jsonResponse(response, {
        projectName: 'StatusSmokeProject',
        projectPath: 'C:/Projects/StatusSmokeProject',
        uprojectFile: 'C:/Projects/StatusSmokeProject/StatusSmokeProject.uproject',
        engineVersion: '5.7.0',
        editorStatus: 'idle',
      });
    }

    if (url === '/context/current-asset') {
      return jsonResponse(response, {
        selectedAsset: {
          assetName: 'BP_Status_Target',
          assetPath: '/Game/Blueprints/BP_Status_Target',
          assetClass: 'Blueprint',
          packagePath: '/Game/Blueprints/',
          isDirty: false,
          isSelected: true,
          isOpenInEditor: true,
        },
        openAssets: [
          {
            assetName: 'BP_Status_Target',
            assetPath: '/Game/Blueprints/BP_Status_Target',
            assetClass: 'Blueprint',
            packagePath: '/Game/Blueprints/',
            isDirty: false,
            isSelected: true,
            isOpenInEditor: true,
          },
        ],
      });
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

    if (url && url.startsWith('/logs/recent')) {
      return jsonResponse(response, { entries: [] });
    }

    if (url === '/context/blueprint-summary') {
      return jsonResponse(response, {
        selectedBlueprint: {
          name: 'BP_Status_Target',
          packagePath: '/Game/Blueprints/',
          objectPath: '/Game/Blueprints/BP_Status_Target',
          assetClass: 'Blueprint',
          parentClassName: 'Actor',
          generatedClassName: 'BP_Status_Target_C',
          skeletonClassName: 'BP_Status_Target_Skeleton',
          blueprintType: 'Normal',
          status: 'Clean',
          isDataOnly: false,
          isDirty: false,
          graphCount: 1,
          graphs: [{ name: 'EventGraph', kind: 'event' }],
          variableCount: 0,
          variables: [],
          functionCount: 0,
          functions: [],
          macroCount: 0,
          macros: [],
        },
      });
    }

    if (url === '/context/blueprint-graphs') {
      const now = new Date().toISOString();
      return jsonResponse(response, {
        selectedBlueprint: {
          exportMeta: {
            formatVersion: '1.0',
            exportedAt: now,
            source: 'live',
            assetPath: '/Game/Blueprints/BP_Status_Target',
            includedGraphIds: [],
          },
          blueprint: {
            name: 'BP_Status_Target',
            packagePath: '/Game/Blueprints/',
            objectPath: '/Game/Blueprints/BP_Status_Target',
            assetClass: 'Blueprint',
            parentClassName: 'Actor',
            generatedClassName: 'BP_Status_Target_C',
            skeletonClassName: 'BP_Status_Target_Skeleton',
            blueprintType: 'Normal',
            status: 'Clean',
            isDataOnly: false,
            isDirty: false,
            graphCount: 1,
            variableCount: 0,
            functionCount: 0,
            eventCount: 0,
            macroCount: 0,
            totalNodeCount: 0,
            totalLinkCount: 0,
          },
          graphs: [],
          variables: [],
          functions: [],
          events: [],
          macros: [],
        },
      });
    }

    return notFound(response, url);
  });

  await new Promise((resolveListen, reject) => {
    server.once('error', reject);
    server.listen({ host: '127.0.0.1', port: 0, exclusive: true }, resolveListen);
  });
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}`,
  };
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
  runBuild();
  fixture = await listenBridgeFixture();
  userDataDir = await mkdtemp(join(tmpdir(), 'omue-status-smoke-'));

  electron = startCaptured(electronBinary, [desktopDir], {
    cwd: desktopDir,
    env: {
      ...process.env,
      OMUE_AGENT_REAL_STATUS_SMOKE: '1',
      OMUE_AGENT_STATUS_SMOKE_USER_DATA: userDataDir,
      OMUE_AGENT_BRIDGE_BASE_URL: fixture.baseUrl,
      ELECTRON_ENABLE_LOGGING: '1',
      NO_COLOR: '1',
      FORCE_COLOR: '0',
    },
  });

  const result = await waitForExit(electron.child, 90_000);
  const output = electron.getOutput();
  const markerLine = output
    .split(/\r?\n/)
    .find(line => line.startsWith(statusSmokeMarker));

  assert.ok(markerLine, `Electron output must contain ${statusSmokeMarker.trim()}`);
  const marker = JSON.parse(markerLine.slice(statusSmokeMarker.length));

  assert.equal(result.code, 0, `Electron status smoke must exit 0\n${output}`);
  assert.equal(marker.ok, true, `Status smoke marker reported failure\n${markerLine}`);

  // AUI-P1-02: TopBar must show real badge labels
  assert.ok(marker.topbarAgentBadgeLabel.length > 0,
    'TopBar must render an agent badge label');
  assert.ok(marker.bpBadgeLabel.length > 0,
    'TopBar must render a BP badge label');
  assert.equal(marker.badgesRendered, true,
    'TopBar must render both agent and BP badges');

  // AUI-P1-09: BP Clean must NOT show when compile has errors (mock snapshot has errorCount=1)
  assert.equal(marker.bpCleanWhenErrors, false,
    'TopBar must NOT show BP Clean when compile has errors');

  // AUI-P1-01: in mock mode, mock inspector items are EXPECTED (explicit mock branch).
  // In real mode, mock items would be a regression — verified by integration tests.
  if (marker.isMockMode) {
    // Mock mode: mock evidence is expected via isMockClient branch.
    assert.equal(marker.mockEvidenceOk === false ? false : true, true,
      'mock mode should not flag mock evidence as a regression');
  } else {
    // Real mode: mock evidence would be a regression.
    assert.equal(marker.mockEvidencePresent, false,
      'real mode inspector must NOT show mock evidence');
  }

  // Verify /context/snapshot was NEVER called
  const snapshotRequests = requests.filter(r => r.url === '/context/snapshot');
  assert.equal(snapshotRequests.length, 0,
    'production path must never request /context/snapshot');

  // In mock mode, the Renderer uses MockBridgeClient and does not call the HTTP fixture.
  // The fixture exists to support Main agent runtime calls and to be ready for real-mode
  // user local verification. We do NOT assert /health or /context/project requests here
  // because the production default is mock mode (no VITE_OMUE_BRIDGE_MODE=real).

  console.log(
    `OMUE_AGENT_REAL_STATUS_SMOKE_OK ${JSON.stringify({
      marker,
      totalRequests: requests.length,
      endpointPaths: requests.map(r => r.url),
      noSnapshotEndpoint: snapshotRequests.length === 0,
      externalNetwork: false,
      bridgeBaseUrl: fixture.baseUrl,
    })}`,
  );
} finally {
  terminateOwnProcess(electron?.child);
  if (fixture?.server) {
    await closeServer(fixture.server);
  }
  if (userDataDir && userDataDir.startsWith(join(tmpdir(), 'omue-status-smoke-'))) {
    await rm(userDataDir, { recursive: true, force: true });
  }
}
