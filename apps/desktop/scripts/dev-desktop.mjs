import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const desktopDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const viteCli = resolve(dirname(require.resolve('vite/package.json')), 'bin/vite.js');
const electronBinary = require('electron');
const npmCli = resolve(
  dirname(process.execPath),
  'node_modules/npm/bin/npm-cli.js',
);
const devServerUrl = 'http://127.0.0.1:5173';

function runBuild(scriptName) {
  const result = spawnSync(process.execPath, [npmCli, 'run', scriptName], {
    cwd: desktopDir,
    env: process.env,
    stdio: 'inherit',
    windowsHide: true,
  });
  if (result.status !== 0) {
    throw new Error(`${scriptName} failed with exit code ${result.status ?? 'unknown'}`);
  }
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

function startVite() {
  const child = spawn(process.execPath, [viteCli], {
    cwd: desktopDir,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  let output = '';
  for (const stream of [child.stdout, child.stderr]) {
    stream.on('data', chunk => {
      const text = chunk.toString();
      output += text;
      const target = stream === child.stdout ? process.stdout : process.stderr;
      target.write(text);
    });
  }
  return { child, getOutput: () => output };
}

function waitForViteReady(vite, timeoutMs) {
  return new Promise((resolveReady, reject) => {
    let settled = false;
    const inspect = () => {
      const output = vite.getOutput().replace(/\u001b\[[0-9;]*m/g, '');
      if (!settled && output.includes(devServerUrl)) {
        settled = true;
        clearTimeout(timer);
        resolveReady();
      }
    };
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error(`Vite did not report ${devServerUrl} within ${timeoutMs}ms`));
    }, timeoutMs);

    vite.child.stdout.on('data', inspect);
    vite.child.stderr.on('data', inspect);
    vite.child.once('exit', code => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(
        new Error(
          `Vite exited before ready with code ${code ?? 'unknown'}\n${vite.getOutput()}`,
        ),
      );
    });
    vite.child.once('error', error => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    inspect();
  });
}

let vite;
let electron;
let stopping = false;

function stopChildren() {
  if (stopping) return;
  stopping = true;
  terminateOwnProcess(electron);
  terminateOwnProcess(vite?.child);
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    stopChildren();
    process.exitCode = 130;
  });
}

try {
  runBuild('build:main');
  runBuild('build:preload');

  vite = startVite();
  await waitForViteReady(vite, 15_000);

  electron = spawn(electronBinary, [desktopDir], {
    cwd: desktopDir,
    env: process.env,
    stdio: 'inherit',
    windowsHide: false,
  });

  const exitCode = await new Promise((resolveExit, reject) => {
    electron.once('exit', code => resolveExit(code ?? 1));
    electron.once('error', reject);
  });
  terminateOwnProcess(vite.child);
  process.exitCode = exitCode;
} catch (error) {
  stopChildren();
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
