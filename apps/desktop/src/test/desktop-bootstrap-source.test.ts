import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const rendererMain = readFileSync(
  resolve(process.cwd(), 'src/renderer/main.tsx'),
  'utf8',
);
const bootstrapErrorPath = resolve(
  process.cwd(),
  'src/renderer/components/DesktopBootstrapError.tsx',
);

test('renderer guards window.omue before mounting App', () => {
  assert.match(rendererMain, /typeof window\.omue === ['"]undefined['"]/);
  assert.match(rendererMain, /<DesktopBootstrapError\s*\/>/);
  assert.ok(
    rendererMain.indexOf('typeof window.omue') < rendererMain.indexOf('<App />'),
    'window.omue guard must run before App is mounted',
  );
});

test('bootstrap error identifies preload failure without calling it a UE bridge outage', () => {
  const source = readFileSync(bootstrapErrorPath, 'utf8');
  assert.match(source, /Desktop Bridge failed to load/);
  assert.match(source, /window\.omue unavailable/);
  assert.match(source, /Electron DevTools/);
  assert.match(source, /Desktop build\/dev/);
  assert.match(source, /not a UE bridge disconnected state/i);
});
