import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const desktopDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const viteCli = resolve(dirname(require.resolve('vite/package.json')), 'bin/vite.js');
const host = '127.0.0.1';
const port = 5173;

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

function listen(server) {
  return new Promise((resolveListen, reject) => {
    const onError = error => {
      if (error && typeof error === 'object' && error.code === 'EADDRINUSE') {
        reject(
          new Error(
            `${host}:${port} was already occupied before the test; refusing to stop or reuse an existing process`,
          ),
        );
        return;
      }
      reject(error);
    };
    server.once('error', onError);
    server.listen({ host, port, exclusive: true }, () => {
      server.off('error', onError);
      resolveListen();
    });
  });
}

function close(server) {
  return new Promise(resolveClose => server.close(() => resolveClose()));
}

function waitForExit(child, timeoutMs) {
  return new Promise((resolveExit, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Vite did not exit within ${timeoutMs}ms while ${host}:${port} was occupied`));
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

const listener = createServer();
let viteProcess;

try {
  await listen(listener);

  let output = '';
  viteProcess = spawn(process.execPath, [viteCli], {
    cwd: desktopDir,
    env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  viteProcess.stdout.on('data', chunk => {
    output += chunk.toString();
  });
  viteProcess.stderr.on('data', chunk => {
    output += chunk.toString();
  });

  const result = await waitForExit(viteProcess, 10_000);
  const plainOutput = output.replace(/\u001b\[[0-9;]*m/g, '');

  assert.notEqual(result.code, 0, `Vite must fail when ${host}:${port} is occupied`);
  assert.match(plainOutput, /5173/, 'Vite conflict output must identify port 5173');
  assert.match(
    plainOutput,
    /(already\s+in\s+use|is\s+in\s+use|address\s+in\s+use)/i,
    'Vite conflict output must state that port 5173 is occupied',
  );
  assert.doesNotMatch(plainOutput, /5174/, 'Vite must not fall through to port 5174');

  console.log(
    `OMUE_DEV_PORT_CONFLICT_OK ${JSON.stringify({
      exitCode: result.code,
      mentions5173: true,
      mentions5174: false,
    })}`,
  );
} finally {
  terminateOwnProcess(viteProcess);
  if (listener.listening) {
    await close(listener);
  }
}
