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
const markerPrefix = 'OMUE_AGENT_REAL_CONTEXT_SMOKE ';
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
      reject(new Error(`Electron context smoke did not exit within ${timeoutMs}ms`));
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
        bridgeVersion: 'omue-context-smoke-1.0',
        editorStatus: 'idle',
      });
    }

    if (url === '/context/project') {
      return jsonResponse(response, {
        projectName: 'ContextSmokeProject',
        projectPath: 'C:/Projects/ContextSmokeProject',
        uprojectFile: 'C:/Projects/ContextSmokeProject/ContextSmokeProject.uproject',
        engineVersion: '5.7.0',
        editorStatus: 'idle',
      });
    }

    if (url === '/context/current-asset') {
      return jsonResponse(response, {
        selectedAsset: {
          assetName: 'BP_Smoke_Target',
          assetPath: '/Game/Blueprints/BP_Smoke_Target',
          assetClass: 'Blueprint',
          packagePath: '/Game/Blueprints/',
          isDirty: false,
          isSelected: true,
          isOpenInEditor: true,
        },
        openAssets: [
          {
            assetName: 'BP_Smoke_Target',
            assetPath: '/Game/Blueprints/BP_Smoke_Target',
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
          name: 'BP_Smoke_Target',
          packagePath: '/Game/Blueprints/',
          objectPath: '/Game/Blueprints/BP_Smoke_Target',
          assetClass: 'Blueprint',
          parentClassName: 'Actor',
          generatedClassName: 'BP_Smoke_Target_C',
          skeletonClassName: 'BP_Smoke_Target_Skeleton',
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
            assetPath: '/Game/Blueprints/BP_Smoke_Target',
            includedGraphIds: [],
          },
          blueprint: {
            name: 'BP_Smoke_Target',
            packagePath: '/Game/Blueprints/',
            objectPath: '/Game/Blueprints/BP_Smoke_Target',
            assetClass: 'Blueprint',
            parentClassName: 'Actor',
            generatedClassName: 'BP_Smoke_Target_C',
            skeletonClassName: 'BP_Smoke_Target_Skeleton',
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

    // Any other endpoint (including /context/snapshot) returns 404
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
  userDataDir = await mkdtemp(join(tmpdir(), 'omue-context-smoke-'));

  electron = startCaptured(electronBinary, [desktopDir], {
    cwd: desktopDir,
    env: {
      ...process.env,
      OMUE_AGENT_REAL_CONTEXT_SMOKE: '1',
      OMUE_AGENT_CONTEXT_SMOKE_USER_DATA: userDataDir,
      OMUE_AGENT_BRIDGE_BASE_URL: fixture.baseUrl,
      ELECTRON_ENABLE_LOGGING: '1',
      NO_COLOR: '1',
      FORCE_COLOR: '0',
    },
  });

  const result = await waitForExit(electron.child, 60_000);
  const output = electron.getOutput();
  const markerLine = output
    .split(/\r?\n/)
    .find(line => line.startsWith(markerPrefix));

  assert.ok(markerLine, `Electron output must contain ${markerPrefix.trim()}`);
  const marker = JSON.parse(markerLine.slice(markerPrefix.length));

  assert.equal(result.code, 0, `Electron context smoke must exit 0\n${output}`);
  assert.equal(marker.ok, true, `Context smoke marker reported failure\n${markerLine}`);

  // Project session should NOT have failed at context collection
  assert.equal(marker.projectContextError, 'none',
    'project session must not fail at context collection (no /context/snapshot 404)');

  // Asset session must have real_readonly_bridge provenance
  assert.equal(marker.assetContextSource, 'real_readonly_bridge',
    'asset context must come from real_readonly_bridge, not mock');
  assert.equal(marker.assetContextHasMock, false,
    'asset context must not contain mock_local_fixture or mock-agent-loop');
  assert.equal(marker.noMockProvenance, true);

  // Verify /context/snapshot was NEVER called on the fixture
  const snapshotRequests = requests.filter(r => r.url === '/context/snapshot');
  assert.equal(snapshotRequests.length, 0,
    `Main production path must never request /context/snapshot, but fixture received ${snapshotRequests.length} requests`);

  // Verify the real endpoints WERE called
  const projectRequests = requests.filter(r => r.url === '/context/project');
  assert.ok(projectRequests.length > 0,
    'Main production path must request /context/project');
  const currentAssetRequests = requests.filter(r => r.url === '/context/current-asset');
  assert.ok(currentAssetRequests.length > 0,
    'Main production path must request /context/current-asset for asset sessions');

  console.log(
    `OMUE_AGENT_REAL_CONTEXT_SMOKE_OK ${JSON.stringify({
      marker,
      totalRequests: requests.length,
      endpointPaths: requests.map(r => r.url),
      noSnapshotEndpoint: snapshotRequests.length === 0,
      externalNetwork: false,
    })}`,
  );
} finally {
  terminateOwnProcess(electron?.child);
  if (fixture?.server) {
    await closeServer(fixture.server);
  }
  if (userDataDir && userDataDir.startsWith(join(tmpdir(), 'omue-context-smoke-'))) {
    await rm(userDataDir, { recursive: true, force: true });
  }
}
