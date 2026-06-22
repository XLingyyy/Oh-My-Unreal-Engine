import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const desktopDir = resolve(fileURLToPath(new URL('..', import.meta.url)));
const preloadDir = resolve(desktopDir, 'dist/preload');
const preloadPath = resolve(preloadDir, 'preload.js');
const mainArtifactPath = resolve(desktopDir, 'dist/main/main.js');
const viteConfigPath = resolve(desktopDir, 'vite.config.ts');

assert.equal(statSync(preloadPath).isFile(), true, 'dist/preload/preload.js must exist');
assert.ok(statSync(preloadPath).size > 0, 'dist/preload/preload.js must be non-empty');

const runtimeJavaScript = readdirSync(preloadDir)
  .filter(fileName => fileName.endsWith('.js'))
  .sort();
assert.deepEqual(
  runtimeJavaScript,
  ['preload.js'],
  `dist/preload must contain exactly one runtime JavaScript file; found ${runtimeJavaScript.join(', ')}`,
);

const preloadSource = readFileSync(preloadPath, 'utf8');
assert.doesNotMatch(
  preloadSource,
  /require\((["'])\.\/settingsApi\1\)/,
  'preload.js must not require a separate settingsApi module',
);
assert.doesNotMatch(
  preloadSource,
  /require\((["'])\.\.?\/[^"']+\1\)/,
  'preload.js must not depend on any local runtime module',
);

const mainArtifact = readFileSync(mainArtifactPath, 'utf8');
assert.match(mainArtifact, /sandbox:\s*true/, 'BrowserWindow must explicitly enable sandbox');
assert.match(
  mainArtifact,
  /contextIsolation:\s*true/,
  'BrowserWindow must keep contextIsolation enabled',
);
assert.match(
  mainArtifact,
  /nodeIntegration:\s*false/,
  'BrowserWindow must keep nodeIntegration disabled',
);

const viteConfig = readFileSync(viteConfigPath, 'utf8');
assert.match(viteConfig, /host:\s*['"]127\.0\.0\.1['"]/, 'Vite host must be 127.0.0.1');
assert.match(viteConfig, /port:\s*5173/, 'Vite port must be 5173');
assert.match(viteConfig, /strictPort:\s*true/, 'Vite strictPort must be enabled');

console.log(
  `OMUE_PRELOAD_ARTIFACT_OK ${JSON.stringify({
    runtimeJavaScript,
    preloadBytes: statSync(preloadPath).size,
  })}`,
);
