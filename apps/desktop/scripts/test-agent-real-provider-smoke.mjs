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
const markerPrefix = 'OMUE_AGENT_REAL_PROVIDER_SMOKE ';
const fixtureModel = 'omue-smoke-diagnosis-model';
const fixtureKey = 'omue-smoke-key-do-not-log';
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
      reject(new Error(`Electron provider smoke did not exit within ${timeoutMs}ms`));
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

async function listenFixture() {
  const server = createServer((request, response) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', chunk => {
      body += chunk;
    });
    request.on('end', () => {
      let parsedBody;
      try {
        parsedBody = JSON.parse(body);
      } catch {
        parsedBody = null;
      }
      requests.push({
        method: request.method,
        url: request.url,
        authorization: request.headers.authorization,
        model: parsedBody?.model,
      });
      const escalation = JSON.stringify({
        kind: 'escalation',
        reason: 'Provider smoke stops before any write or compile action.',
        suggestedHumanAction: 'No action required.',
      });
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ output_text: escalation }));
    });
  });

  await new Promise((resolveListen, reject) => {
    server.once('error', reject);
    server.listen({ host: '127.0.0.1', port: 0, exclusive: true }, resolveListen);
  });
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}/v1`,
  };
}

function closeServer(server) {
  return new Promise((resolveClose, reject) => {
    server.close(error => error ? reject(error) : resolveClose());
  });
}

let electron;
let fixture;
let userDataDir;

try {
  runBuild();
  fixture = await listenFixture();
  userDataDir = await mkdtemp(join(tmpdir(), 'omue-provider-smoke-'));

  electron = startCaptured(electronBinary, [desktopDir], {
    cwd: desktopDir,
    env: {
      ...process.env,
      OMUE_AGENT_REAL_PROVIDER_SMOKE: '1',
      OMUE_AGENT_PROVIDER_SMOKE_USER_DATA: userDataDir,
      OMUE_AGENT_PROVIDER_SMOKE_BASE_URL: fixture.baseUrl,
      OMUE_AGENT_PROVIDER_SMOKE_MODEL: fixtureModel,
      OMUE_AGENT_PROVIDER_SMOKE_KEY: fixtureKey,
      OMUE_AGENT_MOCK_CONTEXT: '1',
      ELECTRON_ENABLE_LOGGING: '1',
      NO_COLOR: '1',
      FORCE_COLOR: '0',
    },
  });

  const result = await waitForExit(electron.child, 45_000);
  const output = electron.getOutput();
  const markerLine = output
    .split(/\r?\n/)
    .find(line => line.startsWith(markerPrefix));

  assert.ok(markerLine, `Electron output must contain ${markerPrefix.trim()}`);
  const marker = JSON.parse(markerLine.slice(markerPrefix.length));

  assert.equal(result.code, 0, `Electron provider smoke must exit 0\n${output}`);
  assert.equal(marker.ok, true, `Provider smoke marker reported failure\n${markerLine}`);
  assert.equal(marker.providerStatus, 'ready');
  assert.equal(marker.providerId, 'smoke-loopback-provider');
  assert.equal(marker.diagnosisModel, fixtureModel);
  assert.equal(marker.projectionContainsSecret, false);
  assert.equal(marker.startOk, true);
  assert.equal(marker.sessionState, 'escalated_done');
  assert.equal(marker.closeReason, 'escalated');

  assert.equal(requests.length, 1, 'loopback provider must receive exactly one request');
  assert.equal(requests[0].method, 'POST');
  assert.equal(requests[0].url, '/v1/responses');
  assert.equal(requests[0].model, fixtureModel);
  assert.equal(requests[0].authorization, `Bearer ${fixtureKey}`);
  assert.doesNotMatch(output, new RegExp(fixtureKey));

  console.log(
    `OMUE_AGENT_REAL_PROVIDER_SMOKE_OK ${JSON.stringify({
      marker,
      requestCount: requests.length,
      requestPath: requests[0].url,
      authorizationVerified: true,
      externalNetwork: false,
    })}`,
  );
} finally {
  terminateOwnProcess(electron?.child);
  if (fixture?.server) {
    await closeServer(fixture.server);
  }
  if (userDataDir && userDataDir.startsWith(join(tmpdir(), 'omue-provider-smoke-'))) {
    await rm(userDataDir, { recursive: true, force: true });
  }
}
