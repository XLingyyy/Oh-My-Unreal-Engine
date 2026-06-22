import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const rendererDir = resolve(process.cwd(), 'src/renderer');
const workbenchDir = resolve(rendererDir, 'components/workbench');
const tokensCssPath = resolve(rendererDir, 'theme/tokens.css');
const workbenchCssPath = resolve(workbenchDir, 'workbench.css');

const read = (p: string) => readFileSync(p, 'utf8');

const SETTINGS_FILES = [
  'GeneralSettings.tsx',
  'ModelProviderSettings.tsx',
  'AppearanceSettings.tsx',
  'PrivacyLogSettings.tsx',
  'UEConnectionSettings.tsx',
];

const THEMES = ['ue-agent', 'github-dark', 'vscode-dark', 'light'] as const;

const CANONICAL_TOKENS = [
  '--bg-base',
  '--bg-surface',
  '--bg-card',
  '--bg-card-hover',
  '--bg-input',
  '--text-primary',
  '--text-secondary',
  '--text-muted',
  '--border-default',
  '--border-subtle',
  '--accent-primary',
] as const;

const COMPAT_TOKENS = ['--bg-panel', '--bg-card-soft', '--accent-blue', '--success', '--warning', '--danger'] as const;

test('UI foundation uses shared local primitives', () => {
  assert.equal(
    existsSync(resolve(workbenchDir, 'Switch.tsx')),
    true,
    'Switch.tsx should exist as the sole editable Settings switch implementation',
  );
  assert.equal(
    existsSync(resolve(workbenchDir, 'SettingsRow.tsx')),
    true,
    'SettingsRow.tsx should exist as the standard title/description/control row',
  );
});

test('Switch primitive is implemented as a native checkbox with track + thumb', () => {
  const source = read(resolve(workbenchDir, 'Switch.tsx'));
  assert.match(source, /type="checkbox"/, 'Switch should render a native checkbox');
  assert.match(source, /ue-switch-track/, 'Switch should provide a track span');
  assert.match(source, /ue-switch-thumb/, 'Switch should provide a thumb span');
  assert.match(source, /onCheckedChange/, 'Switch should expose onCheckedChange prop');
  assert.match(source, /disabledReason/, 'Switch should expose disabledReason prop');
});

test('SettingsRow primitive lays out title/description/control', () => {
  const source = read(resolve(workbenchDir, 'SettingsRow.tsx'));
  assert.match(source, /ue-settings-row/, 'SettingsRow should provide .ue-settings-row container');
  assert.match(source, /ue-settings-row-title/, 'SettingsRow should provide title slot');
  assert.match(source, /ue-settings-row-description/, 'SettingsRow should provide description slot');
  assert.match(source, /ue-settings-row-control/, 'SettingsRow should provide control slot');
});

test('Workbench fake entry points are removed from TopBar', () => {
  const topBar = read(resolve(workbenchDir, 'TopBar.tsx'));
  assert.doesNotMatch(topBar, /SearchIcon/, 'TopBar should no longer render SearchIcon');
  assert.doesNotMatch(topBar, /BellIcon/, 'TopBar should no longer render BellIcon');
  assert.doesNotMatch(topBar, /HelpIcon/, 'TopBar should no longer render HelpIcon');
  assert.doesNotMatch(topBar, /ThemeIcon/, 'TopBar should no longer render ThemeIcon');
  assert.doesNotMatch(topBar, /ue-topbar-avatar/, 'TopBar should no longer render avatar button');
  assert.doesNotMatch(topBar, /openAnotherProject/, 'TopBar should no longer render Open another project');
});

test('AgentWorkbenchShell removes hidden theme entry points', () => {
  const shell = read(resolve(workbenchDir, 'AgentWorkbenchShell.tsx'));
  assert.doesNotMatch(shell, /toggle-theme/, 'toggle-theme command should be removed');
  assert.doesNotMatch(shell, /Ctrl\/Cmd\+Shift\+T/, 'Ctrl/Cmd+Shift+T shortcut handler should be removed');
  assert.doesNotMatch(shell, /toggleTheme\(\)/, 'toggleTheme should not be invoked from Shell directly');
});

test('LeftRail renders only Chat and Settings', () => {
  const rail = read(resolve(workbenchDir, 'LeftRail.tsx'));
  assert.doesNotMatch(rail, /'code'/, 'code rail entry should be removed');
  assert.doesNotMatch(rail, /'graph'/, 'graph rail entry should be removed');
  assert.doesNotMatch(rail, /'run'/, 'run rail entry should be removed');
  assert.doesNotMatch(rail, /'issues'/, 'issues rail entry should be removed');
  assert.doesNotMatch(rail, /'assets'/, 'assets rail entry should be removed');
});

test('ChatInput removes fake attachment/mention/slash entries', () => {
  const input = read(resolve(workbenchDir, 'ChatInputV2.tsx'));
  assert.doesNotMatch(input, /AttachmentIcon/, 'Attachment icon should be removed');
  assert.doesNotMatch(input, /contextMention/, 'mention button should be removed');
  assert.doesNotMatch(input, /commandSlash/, 'slash button should be removed');
});

test('Settings toggles use the new Switch primitive', () => {
  for (const file of SETTINGS_FILES) {
    const source = read(resolve(workbenchDir, file));
    assert.match(source, /from ['"]\.\/Switch['"]/, `${file} should import Switch`);
    assert.doesNotMatch(
      source,
      /ue-settings-toggle-slider/,
      `${file} should no longer hand-roll the legacy toggle slider markup`,
    );
  }
});

test('Provider Settings no longer exposes mock Refresh models or fake success fallback', () => {
  const provider = read(resolve(workbenchDir, 'ModelProviderSettings.tsx'));
  assert.doesNotMatch(provider, /refreshMock/, 'Refresh models mock feedback handler should be removed');
  assert.doesNotMatch(provider, /testSuccess\(1024,\s*4\)/, 'fake testSuccess(1024, 4) fallback should be removed');
  assert.doesNotMatch(provider, /handleRefreshModels/, 'handleRefreshModels should be removed');
  assert.doesNotMatch(provider, /refreshModels/, 'Refresh models button should be removed');
});

test('All four themes define the canonical token set', () => {
  const tokens = read(tokensCssPath);
  for (const theme of THEMES) {
    const selector = `:root[data-theme='${theme}']`;
    const start = tokens.indexOf(selector);
    assert.notEqual(start, -1, `theme selector ${selector} should exist in tokens.css`);
    const rest = tokens.slice(start);
    const nextRoot = rest.indexOf(':root', 5);
    const block = nextRoot === -1 ? rest : rest.slice(0, nextRoot);
    for (const token of CANONICAL_TOKENS) {
      assert.match(
        block,
        new RegExp(`${token.replace(/[-]/g, '\\-')}:`),
        `theme ${theme} must define canonical token ${token}`,
      );
    }
  }
});

test('All four themes define compatibility aliases consumed by workbench.css', () => {
  const tokens = read(tokensCssPath);
  for (const theme of THEMES) {
    const selector = `:root[data-theme='${theme}']`;
    const start = tokens.indexOf(selector);
    const rest = tokens.slice(start);
    const nextRoot = rest.indexOf(':root', 5);
    const block = nextRoot === -1 ? rest : rest.slice(0, nextRoot);
    for (const token of COMPAT_TOKENS) {
      assert.match(
        block,
        new RegExp(`${token.replace(/[-]/g, '\\-')}:`),
        `theme ${theme} must define compatibility alias ${token}`,
      );
    }
  }
});

test('Workbench CSS provides Switch and SettingsRow visual states scoped to .workbench-root', () => {
  const css = read(workbenchCssPath);
  for (const selector of ['.ue-switch', '.ue-switch-track', '.ue-switch-thumb', '.ue-settings-row']) {
    assert.match(
      css,
      new RegExp(selector.replace(/\./g, '\\.')),
      `workbench.css should define ${selector}`,
    );
  }
  assert.match(css, /\.ue-switch input\[type="checkbox"\]/, 'Switch should hide native checkbox');
  assert.match(css, /\.ue-switch input:checked\s*\+\s*\.ue-switch-track/, 'Switch should style checked state');
  assert.match(css, /\.ue-switch input:focus-visible\s*\+\s*\.ue-switch-track/, 'Switch should style focus-visible state');
  assert.match(css, /\.ue-switch input:disabled\s*\+\s*\.ue-switch-track/, 'Switch should style disabled state');
});

test('Workbench CSS scopes native control normalization to .workbench-root', () => {
  const css = read(workbenchCssPath);
  for (const selector of [
    '.workbench-root button',
    '.workbench-root input',
    '.workbench-root select',
    '.workbench-root textarea',
  ]) {
    assert.match(
      css,
      new RegExp(selector.replace(/\./g, '\\.').replace(/ /g, '\\s*')),
      `${selector} should be defined in workbench.css`,
    );
  }
});

test('Orphan CSS selectors for removed fake entries are deleted from workbench.css', () => {
  const css = read(workbenchCssPath);
  const removedSelectors = [
    '\\.ue-topbar-avatar\\b',
    '\\.ue-topbar-avatar:hover',
    '\\.ue-rail-item-disabled',
    '\\.ue-settings-toggle-slider',
    '\\.ue-settings-toggle-slider::before',
    '\\.ue-settings-toggle input:checked \\+ \\.ue-settings-toggle-slider',
  ];
  for (const re of removedSelectors) {
    assert.doesNotMatch(css, new RegExp(re), `workbench.css should not contain orphan selector ${re}`);
  }
});

test('Active workbench buttons share a themed .ue-button base, not native browser chrome', () => {
  const css = read(workbenchCssPath);
  assert.match(
    css,
    /^\.ue-button\s*\{[^}]*background\s*:[^;]+;[^}]*border\s*:[^;]+;[^}]*border-radius\s*:[^;]+;[^}]*color\s*:[^;]+;[^}]*\}/m,
    '.ue-button must define background/border/border-radius/color as base, not only font/color',
  );
  assert.match(
    css,
    /\.ue-button:hover(?::not\(:disabled\))?/,
    '.ue-button must define a hover state',
  );
  assert.match(
    css,
    /\.ue-button:focus-visible/,
    '.ue-button must define a focus-visible state',
  );
  assert.match(
    css,
    /\.ue-button:disabled/,
    '.ue-button must define a disabled state',
  );
  assert.match(
    css,
    /\.ue-button-secondary/,
    '.ue-button-secondary variant must exist for header buttons',
  );
  assert.match(
    css,
    /\.ue-button-ghost/,
    '.ue-button-ghost variant must exist for resume interrupted button',
  );
});

test('Session list item has its own themed button styles instead of native <button>', () => {
  const css = read(workbenchCssPath);
  assert.match(
    css,
    /^\.ue-chat-header-list-item\s*\{[^}]*background\s*:[^;]+;[^}]*border\s*:[^;]+;[^}]*border-radius\s*:[^;]+;[^}]*color\s*:[^;]+;[^}]*\}/m,
    '.ue-chat-header-list-item must define themed background/border/border-radius/color',
  );
  assert.match(
    css,
    /\.ue-chat-header-list-item:hover(?::not\(:disabled\))?/,
    '.ue-chat-header-list-item must define a hover state',
  );
  assert.match(
    css,
    /\.ue-chat-header-list-item:focus-visible/,
    '.ue-chat-header-list-item must define a focus-visible state',
  );
});

test('ChatInput scope toggle has its own themed button styles', () => {
  const css = read(workbenchCssPath);
  assert.match(
    css,
    /^\.ue-chat-input-scope-toggle\s*\{[^}]*background\s*:[^;]+;[^}]*border\s*:[^;]+;[^}]*border-radius\s*:[^;]+;[^}]*color\s*:[^;]+;[^}]*\}/m,
    '.ue-chat-input-scope-toggle must define themed background/border/border-radius/color',
  );
  assert.match(
    css,
    /\.ue-chat-input-scope-toggle:hover(?::not\(:disabled\))?/,
    '.ue-chat-input-scope-toggle must define a hover state',
  );
  assert.match(
    css,
    /\.ue-chat-input-scope-toggle:focus-visible/,
    '.ue-chat-input-scope-toggle must define a focus-visible state',
  );
});

test('Provider Settings no longer uses the orphan .ue-settings-collapse-btn class', () => {
  const provider = read(resolve(workbenchDir, 'ModelProviderSettings.tsx'));
  assert.doesNotMatch(
    provider,
    /ue-settings-collapse-btn/,
    'ModelProviderSettings must not use the orphan .ue-settings-collapse-btn class',
  );
  const css = read(workbenchCssPath);
  assert.doesNotMatch(
    css,
    /^\.ue-settings-collapse-btn\b/m,
    'workbench.css should not contain an orphan .ue-settings-collapse-btn rule',
  );
});

test('UE Connection no longer renders the Install/update button', () => {
  const ueConn = read(resolve(workbenchDir, 'UEConnectionSettings.tsx'));
  assert.doesNotMatch(
    ueConn,
    /t\.installUpdate/,
    'UEConnectionSettings must not render the Install/update button',
  );
  assert.doesNotMatch(
    ueConn,
    />\s*\{t\.installUpdate\}\s*</,
    'UEConnectionSettings must not display installUpdate label',
  );
});

test('Provider Test connection button is rendered as disabled with explicit unavailable copy', () => {
  const provider = read(resolve(workbenchDir, 'ModelProviderSettings.tsx'));
  assert.match(
    provider,
    /t\.testConnectionUnavailable/,
    'ModelProviderSettings must reference modelProviders.testConnectionUnavailable for the Test connection button label',
  );
  const testConnMatch = provider.match(
    /<button[^>]*ue-settings-btn-disabled[^>]*>[\s\S]*?<\/button>/,
  );
  assert.ok(testConnMatch, 'Test connection button must exist with the disabled modifier class');
  const buttonSource = testConnMatch[0];
  assert.match(
    buttonSource,
    /disabled(?:\s|=)/,
    'Test connection button must render as disabled in current build',
  );
  assert.doesNotMatch(
    buttonSource,
    /onClick=/,
    'Test connection button must not have any onClick handler in the current build',
  );
  assert.match(
    buttonSource,
    /title=\{t\.testConnectionUnavailable\}/,
    'Test connection button must set title to testConnectionUnavailable',
  );
  assert.match(
    buttonSource,
    /\{t\.testConnectionUnavailable\}/,
    'Test connection button must display testConnectionUnavailable as visible label',
  );
});

test('All four themes bind color-scheme explicitly (3 dark + 1 light)', () => {
  const css = read(workbenchCssPath);
  assert.doesNotMatch(
    css,
    /\.workbench-root\s*\{[^}]*color-scheme\s*:\s*light\s+dark/m,
    '.workbench-root must no longer use the ambiguous color-scheme: light dark',
  );

  const darkRule = css.match(
    /(\.workbench-root\[data-theme=['"](ue-agent|github-dark|vscode-dark)['"]\](?:\s*,\s*\.workbench-root\[data-theme=['"](?:ue-agent|github-dark|vscode-dark)['"]\])*)\s*\{\s*color-scheme\s*:\s*dark\b/,
  );
  assert.ok(darkRule, 'one rule must bind all three dark themes to color-scheme: dark');
  const darkSelectorNames = new Set(
    Array.from(darkRule![1].matchAll(/data-theme=['"]([^'"]+)['"]/g)).map(m => m[1]),
  );
  for (const theme of ['ue-agent', 'github-dark', 'vscode-dark']) {
    assert.ok(
      darkSelectorNames.has(theme),
      `dark color-scheme rule must include selector for ${theme}`,
    );
  }

  const lightMatch = css.match(
    /\.workbench-root\[data-theme=['"]light['"]\]\s*\{\s*color-scheme\s*:\s*light\b/,
  );
  assert.ok(
    lightMatch,
    'light theme must explicitly bind color-scheme: light',
  );
});

