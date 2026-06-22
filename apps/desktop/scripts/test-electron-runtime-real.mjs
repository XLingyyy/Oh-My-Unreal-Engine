import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const desktopDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const viteCli = resolve(dirname(require.resolve('vite/package.json')), 'bin/vite.js');
const electronBinary = require('electron');
const npmCli = resolve(
  dirname(process.execPath),
  'node_modules/npm/bin/npm-cli.js',
);
const devServerUrl = 'http://127.0.0.1:5173';
const smokeMarker = 'OMUE_ELECTRON_RUNTIME_SMOKE ';

function runBuild(scriptName) {
  const result = spawnSync(process.execPath, [npmCli, 'run', scriptName], {
    cwd: desktopDir,
    env: process.env,
    encoding: 'utf8',
    stdio: 'pipe',
    windowsHide: true,
  });
  if (result.status !== 0) {
    throw new Error(
      `${scriptName} failed\n${result.error?.message ?? ''}\n${result.stdout ?? ''}\n${result.stderr ?? ''}`.trim(),
    );
  }
  process.stdout.write(result.stdout ?? '');
  process.stderr.write(result.stderr ?? '');
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

async function assertPortAvailable() {
  const probe = createServer();
  await new Promise((resolveListen, reject) => {
    const onError = error => {
      if (error && typeof error === 'object' && error.code === 'EADDRINUSE') {
        reject(
          new Error(
            '127.0.0.1:5173 is already occupied; runtime smoke refuses to attach to or stop an existing server',
          ),
        );
        return;
      }
      reject(error);
    };
    probe.once('error', onError);
    probe.listen({ host: '127.0.0.1', port: 5173, exclusive: true }, () => {
      probe.off('error', onError);
      resolveListen();
    });
  });
  await new Promise(resolveClose => probe.close(resolveClose));
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

function waitForViteReady(captured, timeoutMs) {
  return new Promise((resolveReady, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error(`Vite did not report ${devServerUrl} within ${timeoutMs}ms`));
    }, timeoutMs);

    const inspect = () => {
      const plainOutput = captured.getOutput().replace(/\u001b\[[0-9;]*m/g, '');
      if (!settled && plainOutput.includes(devServerUrl)) {
        settled = true;
        clearTimeout(timer);
        resolveReady();
      }
    };

    captured.child.stdout.on('data', inspect);
    captured.child.stderr.on('data', inspect);
    captured.child.once('exit', code => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error(`Vite exited before ready with code ${code}\n${captured.getOutput()}`));
    });
    captured.child.once('error', error => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    inspect();
  });
}

function waitForExit(child, timeoutMs, label) {
  return new Promise((resolveExit, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} did not exit within ${timeoutMs}ms`));
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

let vite;
let electron;

try {
  runBuild('build:main');
  runBuild('build:preload');
  await assertPortAvailable();

  vite = startCaptured(process.execPath, [viteCli], {
    cwd: desktopDir,
    env: {
      ...process.env,
      VITE_OMUE_BRIDGE_MODE: 'real',
      NO_COLOR: '1',
      FORCE_COLOR: '0',
    },
  });
  await waitForViteReady(vite, 15_000);

  electron = startCaptured(electronBinary, [desktopDir], {
    cwd: desktopDir,
    env: {
      ...process.env,
      VITE_OMUE_BRIDGE_MODE: 'real',
      OMUE_ELECTRON_RUNTIME_SMOKE: '1',
      ELECTRON_ENABLE_LOGGING: '1',
      NO_COLOR: '1',
      FORCE_COLOR: '0',
    },
  });

  const result = await waitForExit(electron.child, 30_000, 'Electron runtime smoke');
  const output = electron.getOutput();
  const markerLine = output
    .split(/\r?\n/)
    .find(line => line.startsWith(smokeMarker));

  assert.ok(markerLine, `Electron output must contain ${smokeMarker.trim()}`);
  const marker = JSON.parse(markerLine.slice(smokeMarker.length));

  assert.equal(result.code, 0, `Electron runtime smoke must exit 0\n${output}`);
  assert.equal(marker.ok, true, `Runtime smoke marker reported failure\n${markerLine}`);
  assert.equal(marker.omueType, 'object');
  assert.equal(marker.agentType, 'object');
  assert.ok(marker.rootTextLength > 0, 'Renderer #root must contain actual content');
  assert.doesNotMatch(output, /Unable to load preload script/i);
  assert.doesNotMatch(output, /module not found:\s*\.\/settingsApi/i);
  assert.doesNotMatch(
    output,
    /Cannot read properties of undefined \(reading ['"]agent['"]\)/i,
  );
  assert.doesNotMatch(output, /'console-message' arguments are deprecated/i);

  console.log(`OMUE_ELECTRON_RUNTIME_REAL_OK ${JSON.stringify(marker)}`);
} finally {
  terminateOwnProcess(electron?.child);
  terminateOwnProcess(vite?.child);
}
