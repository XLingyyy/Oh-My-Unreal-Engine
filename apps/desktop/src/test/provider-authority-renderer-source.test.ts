import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const shellSource = readFileSync(
  resolve(process.cwd(), 'src/renderer/components/workbench/AgentWorkbenchShell.tsx'),
  'utf8',
);
const settingsPageSource = readFileSync(
  resolve(process.cwd(), 'src/renderer/components/workbench/SettingsPage.tsx'),
  'utf8',
);
const chatPanelSource = readFileSync(
  resolve(process.cwd(), 'src/renderer/components/workbench/ChatPanel.tsx'),
  'utf8',
);

test('Renderer consumes Main provider readiness without selecting providers locally', () => {
  assert.doesNotMatch(shellSource, /modelProviders\.providers\.filter/);
  assert.doesNotMatch(shellSource, /const first = enabled\[0\]/);
  assert.match(shellSource, /providerReadiness/);
  assert.match(shellSource, /useSettings\(\)/);
});

test('Provider required opens Settings directly on Model Providers', () => {
  assert.match(shellSource, /openSettings\(['"]modelProviders['"]\)/);
  assert.match(settingsPageSource, /initialCategory/);
  assert.match(settingsPageSource, /useState<SettingsCategoryId>\(initialCategory\)/);
});

test('authority refresh runs before starting the next Agent session', () => {
  assert.match(chatPanelSource, /await onBeforeStartSession\?\.\(\)/);
});
