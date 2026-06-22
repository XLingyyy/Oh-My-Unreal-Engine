import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  createDefaultSettings,
  type AgentCardKind,
} from '@omue/shared-protocol';
import {
  mergeAppearanceSettings,
  normalizeAppearanceAccent,
  persistAppearanceChange,
  type AppearancePatch,
} from '../renderer/components/workbench/appearancePreferenceState';
import {
  canAutoCollapseAgentCard,
  formatAgentCardTimestamp,
  getAgentCardActor,
  tokenizeCode,
} from '../renderer/components/workbench/agentCardPresentation';

const desktopRoot = process.cwd();
const readSource = (relativePath: string): string =>
  readFileSync(resolve(desktopRoot, relativePath), 'utf8');

test('mergeAppearanceSettings updates scalar fields without mutating current settings', () => {
  const current = createDefaultSettings().appearance;
  const next = mergeAppearanceSettings(current, {
    theme: 'light',
    density: 'spacious',
  });

  assert.notEqual(next, current);
  assert.equal(current.theme, 'ue-agent');
  assert.equal(next.theme, 'light');
  assert.equal(next.density, 'spacious');
  assert.deepEqual(next.layouts, current.layouts);
  assert.deepEqual(next.chatDisplay, current.chatDisplay);
});

test('mergeAppearanceSettings deep-merges layouts and preserves untouched fields', () => {
  const current = createDefaultSettings().appearance;
  const next = mergeAppearanceSettings(current, {
    layouts: { showLeftRail: false },
  });

  assert.equal(next.layouts.showLeftRail, false);
  assert.equal(next.layouts.showProjectExplorer, current.layouts.showProjectExplorer);
  assert.equal(next.layouts.showRightInspector, current.layouts.showRightInspector);
  assert.equal(next.layouts.showStatusBar, current.layouts.showStatusBar);
});

test('mergeAppearanceSettings deep-merges chatDisplay and preserves untouched fields', () => {
  const current = createDefaultSettings().appearance;
  const next = mergeAppearanceSettings(current, {
    chatDisplay: { showTimestamps: false },
  });

  assert.equal(next.chatDisplay.showTimestamps, false);
  assert.equal(next.chatDisplay.showAvatars, current.chatDisplay.showAvatars);
  assert.equal(next.chatDisplay.codeSyntaxHighlight, current.chatDisplay.codeSyntaxHighlight);
  assert.equal(next.chatDisplay.collapseLongMessages, current.chatDisplay.collapseLongMessages);
  assert.equal(next.chatDisplay.showActionButtons, current.chatDisplay.showActionButtons);
});

test('persistAppearanceChange applies optimistic state before a successful write', async () => {
  const current = createDefaultSettings().appearance;
  const patch: AppearancePatch = {
    theme: 'github-dark',
    layouts: { showProjectExplorer: false },
  };
  const applied: typeof current[] = [];
  let persistedPatch: AppearancePatch | null = null;

  const result = await persistAppearanceChange({
    current,
    patch,
    apply: next => applied.push(next),
    persist: async nextPatch => {
      persistedPatch = nextPatch;
      assert.equal(applied.length, 1, 'optimistic preview must be applied before persistence');
      return { ok: true };
    },
  });

  assert.deepEqual(result, { ok: true });
  assert.deepEqual(persistedPatch, patch);
  assert.equal(applied.length, 1);
  assert.equal(applied[0]?.theme, 'github-dark');
  assert.equal(applied[0]?.layouts.showProjectExplorer, false);
});

test('persistAppearanceChange rolls back exactly when persistence returns ok=false', async () => {
  const current = createDefaultSettings().appearance;
  const applied: typeof current[] = [];

  const result = await persistAppearanceChange({
    current,
    patch: { fontSize: 'large' },
    apply: next => applied.push(next),
    persist: async () => ({ ok: false, error: 'write failed' }),
  });

  assert.deepEqual(result, { ok: false, error: 'write failed' });
  assert.equal(applied.length, 2);
  assert.equal(applied[0]?.fontSize, 'large');
  assert.equal(applied[1], current, 'rollback must restore the exact previous object');
});

test('persistAppearanceChange rolls back exactly when persistence throws', async () => {
  const current = createDefaultSettings().appearance;
  const applied: typeof current[] = [];

  const result = await persistAppearanceChange({
    current,
    patch: { accentColor: 'purple' },
    apply: next => applied.push(next),
    persist: async () => {
      throw new Error('write exploded');
    },
  });

  assert.deepEqual(result, { ok: false, error: 'write exploded' });
  assert.equal(applied.length, 2);
  assert.equal(applied[0]?.accentColor, 'purple');
  assert.equal(applied[1], current);
});

test('normalizeAppearanceAccent accepts supported accents and falls back to blue', () => {
  assert.equal(normalizeAppearanceAccent('blue'), 'blue');
  assert.equal(normalizeAppearanceAccent('purple'), 'purple');
  assert.equal(normalizeAppearanceAccent('green'), 'green');
  assert.equal(normalizeAppearanceAccent('orange'), 'blue');
  assert.equal(normalizeAppearanceAccent(''), 'blue');
});

test('Theme authority is Settings-only and Appearance uses one write path', () => {
  const themeSource = readSource('src/renderer/hooks/useTheme.ts');
  const shellSource = readSource('src/renderer/components/workbench/AgentWorkbenchShell.tsx');
  const pageSource = readSource('src/renderer/components/workbench/SettingsPage.tsx');
  const appearanceSource = readSource('src/renderer/components/workbench/AppearanceSettings.tsx');

  assert.doesNotMatch(themeSource, /localStorage/);
  assert.doesNotMatch(themeSource, /getInitialTheme/);
  assert.match(themeSource, /document\.documentElement\.dataset\.theme\s*=\s*theme/);
  assert.doesNotMatch(shellSource, /THEME_STORAGE_KEY|localStorage|getInitialTheme|handleSetTheme/);
  assert.equal(
    (shellSource.match(/updateCategory\('appearance'/g) ?? []).length,
    1,
    'Shell must have exactly one Appearance settings write call site',
  );
  assert.match(shellSource, /if \(settingsLoading \|\| appearanceUpdatePending\)\s+return;/);
  assert.match(shellSource, /persistAppearanceChange/);
  assert.match(pageSource, /onUpdateAppearance/);
  assert.doesNotMatch(pageSource, /onSetTheme/);
  assert.doesNotMatch(appearanceSource, /onSetTheme/);
  assert.doesNotMatch(appearanceSource, /as unknown as Record<string, string>/);
  assert.doesNotMatch(appearanceSource, /labelKey:\s*string|t\[[^\]]+\]/);
  assert.match(appearanceSource, /aria-busy=\{updating\}/);
  assert.match(appearanceSource, /disabled=\{updating\}/);
});

test('Workbench root exposes all Appearance presentation attributes', () => {
  const shellSource = readSource('src/renderer/components/workbench/AgentWorkbenchShell.tsx');
  for (const attribute of [
    'data-theme',
    'data-accent',
    'data-density',
    'data-font-size',
    'data-show-left-rail',
    'data-show-project-explorer',
    'data-show-right-inspector',
    'data-show-timestamps',
    'data-show-avatars',
    'data-syntax-highlight',
    'data-collapse-long',
    'data-show-actions',
  ]) {
    assert.match(shellSource, new RegExp(attribute), `Shell must expose ${attribute}`);
  }
});

test('Accent modifiers are presentation-only and do not overwrite semantic colors', () => {
  const css = readSource('src/renderer/components/workbench/workbench.css');
  for (const accent of ['blue', 'purple', 'green']) {
    const selector = `.workbench-root[data-accent='${accent}']`;
    const start = css.indexOf(selector);
    assert.notEqual(start, -1, `${selector} must exist`);
    const rest = css.slice(start);
    const nextAccent = rest.indexOf('.workbench-root[data-accent=', selector.length);
    const block = nextAccent === -1 ? rest.slice(0, 800) : rest.slice(0, nextAccent);
    assert.match(block, /--accent-primary:/);
    assert.match(block, /--accent-primary-strong:/);
    assert.match(block, /--accent-primary-hover:/);
    assert.doesNotMatch(
      block,
      /--(?:success|warning|danger|accent-success|accent-warning|accent-error)\s*:/,
      `${accent} must not redefine semantic status tokens`,
    );
  }
});

test('Density and font size use root modifiers with centralized tokens', () => {
  const css = readSource('src/renderer/components/workbench/workbench.css');
  for (const density of ['compact', 'comfortable', 'spacious']) {
    assert.match(css, new RegExp(`data-density=['"]${density}['"]`));
  }
  for (const fontSize of ['small', 'medium', 'large']) {
    assert.match(css, new RegExp(`data-font-size=['"]${fontSize}['"]`));
  }
  for (const token of [
    '--ue-density-control',
    '--ue-density-panel',
    '--ue-font-caption',
    '--ue-font-body',
    '--ue-font-control',
    '--ue-font-title',
    '--ue-font-heading',
    '--ue-font-code',
  ]) {
    assert.match(css, new RegExp(token));
  }
  const shellSource = readSource('src/renderer/components/workbench/AgentWorkbenchShell.tsx');
  assert.doesNotMatch(shellSource, /fontSize:\s*['"`]?\d/);
});

test('Layout settings hide only real regions and preserve business state', () => {
  const appearanceSource = readSource('src/renderer/components/workbench/AppearanceSettings.tsx');
  const shellSource = readSource('src/renderer/components/workbench/AgentWorkbenchShell.tsx');
  const css = readSource('src/renderer/components/workbench/workbench.css');

  assert.doesNotMatch(appearanceSource, /showStatusBar/);
  assert.match(shellSource, /explorerEnabled/);
  assert.match(shellSource, /inspectorEnabled/);
  assert.match(css, /data-show-left-rail=['"]false['"]/);
  assert.match(css, /data-show-project-explorer=['"]false['"]/);
  assert.match(css, /data-show-right-inspector=['"]false['"]/);
  assert.match(css, /data-show-left-rail=['"]false['"][^\n]*[\s\S]*?\.ue-explorer-overlay/);

  const appearanceHandlerStart = shellSource.indexOf('const handleUpdateAppearance');
  assert.notEqual(appearanceHandlerStart, -1);
  const appearanceHandler = shellSource.slice(appearanceHandlerStart, appearanceHandlerStart + 1800);
  assert.doesNotMatch(
    appearanceHandler,
    /handleNewSession|setSelectedSessionId|selectAssetTarget|refreshContext|setComposer|reset/i,
  );
});

test('Agent Card actor mapping distinguishes User Intent from Agent cards', () => {
  const kinds: AgentCardKind[] = [
    'user-intent',
    'scan-status',
    'diagnosis',
    'fix-plan',
    'change-preview',
    'validation-result',
    'project-candidates',
    'failure',
    'completion',
  ];

  for (const kind of kinds) {
    assert.equal(getAgentCardActor(kind), kind === 'user-intent' ? 'user' : 'agent');
  }
});

test('Agent Card timestamps follow locale and 12h/24h preference', () => {
  const createdAt = '2026-06-22T08:05:00.000Z';
  const date = new Date(createdAt);
  const expectedZh24 = new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
  const expectedEn12 = new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(date);

  assert.equal(formatAgentCardTimestamp(createdAt, 'zh-CN', '24h'), expectedZh24);
  assert.equal(formatAgentCardTimestamp(createdAt, 'en', '12h'), expectedEn12);
  assert.equal(formatAgentCardTimestamp('not-a-date', 'en', '24h'), 'not-a-date');
});

test('Only safe non-actionable Agent Card kinds can auto-collapse', () => {
  assert.equal(canAutoCollapseAgentCard('user-intent', false), true);
  assert.equal(canAutoCollapseAgentCard('scan-status', false), true);
  assert.equal(canAutoCollapseAgentCard('completion', false), true);
  assert.equal(canAutoCollapseAgentCard('diagnosis', false), false);
  assert.equal(canAutoCollapseAgentCard('fix-plan', false), false);
  assert.equal(canAutoCollapseAgentCard('project-candidates', false), false);
  assert.equal(canAutoCollapseAgentCard('change-preview', false), false);
  assert.equal(canAutoCollapseAgentCard('validation-result', false), false);
  assert.equal(canAutoCollapseAgentCard('failure', false), false);
  assert.equal(canAutoCollapseAgentCard('user-intent', true), false);
});

test('Safe tokenizer recognizes basic token kinds and round-trips every character', () => {
  const code = [
    'const π = 42;',
    'const text = "a\\\\\\"b"; // note',
    '/* block */ if (π >= 3.14) { return text; }',
    '<script>alert(1)</script>',
  ].join('\n');
  const tokens = tokenizeCode(code);

  assert.equal(tokens.map(token => token.text).join(''), code);
  for (const kind of ['keyword', 'string', 'number', 'comment', 'punctuation']) {
    assert.ok(tokens.some(token => token.kind === kind), `tokenizer must emit ${kind}`);
  }
  assert.ok(tokens.map(token => token.text).join('').includes('<script>'));
});

test('CodeSnippet and AgentCardFrame render safe React text with factual metadata', () => {
  const snippetSource = readSource('src/renderer/components/workbench/CodeSnippet.tsx');
  const frameSource = readSource('src/renderer/components/workbench/AgentCardFrame.tsx');
  const rendererSource = readSource('src/renderer/components/workbench/AgentCardRenderer.tsx');
  const chatSource = readSource('src/renderer/components/workbench/ChatPanel.tsx');

  assert.match(snippetSource, /tokenizeCode\(code\)/);
  assert.match(snippetSource, /ue-code-token-/);
  assert.doesNotMatch(snippetSource, /dangerouslySetInnerHTML/);
  assert.match(frameSource, /<time[^>]+dateTime=\{card\.createdAt\}/);
  assert.match(frameSource, /getAgentCardActor/);
  assert.match(frameSource, /ResizeObserver/);
  assert.match(frameSource, /ue-card-frame-content/);
  assert.match(frameSource, /ue-card-frame-collapse-toggle/);
  assert.doesNotMatch(frameSource, /dangerouslySetInnerHTML/);
  assert.match(rendererSource, /<AgentCardFrame/);
  assert.match(chatSource, /presentation=/);
});

test('Chat display CSS preserves tab order and keeps critical actions visible', () => {
  const css = readSource('src/renderer/components/workbench/workbench.css');

  assert.match(css, /data-syntax-highlight=['"]true['"]/);
  assert.match(css, /data-syntax-highlight=['"]false['"]/);
  assert.match(css, /data-action-mode=['"]hover['"]/);
  assert.match(css, /:hover[\s\S]*?\.ue-card-actions/);
  assert.match(css, /:focus-within[\s\S]*?\.ue-card-actions/);
  assert.match(css, /data-critical-actions=['"]true['"]/);
  assert.doesNotMatch(
    css,
    /data-action-mode=['"]hover['"][^{]*\{[^}]*(?:display\s*:\s*none|visibility\s*:\s*hidden)/,
  );
});

test('Action visibility: non-critical hover mode static opacity is 0, hover/focus restore to 1, critical always 1', () => {
  const css = readSource('src/renderer/components/workbench/workbench.css');

  const staticRule =
    /\.ue-card-frame\[data-action-mode='hover'\]:not\(\[data-critical-actions='true'\]\)\s+\.ue-card-actions\s*\{[^}]*opacity\s*:\s*0\s*;/;
  assert.match(css, staticRule, 'non-critical hover-mode static state must be opacity: 0');

  assert.doesNotMatch(
    css,
    /\.ue-card-frame\[data-action-mode='hover'\]:not\(\[data-critical-actions='true'\]\)\s+\.ue-card-actions\s*\{[^}]*opacity\s*:\s*0\.18/,
    'opacity: 0.18 must not remain in non-critical hover-mode static state',
  );

  const hoverRestore =
    /\.ue-card-frame\[data-action-mode='hover'\]:not\(\[data-critical-actions='true'\]\):hover\s+\.ue-card-actions[\s\S]*?opacity\s*:\s*1/;
  assert.match(css, hoverRestore, 'hover must restore non-critical actions to opacity: 1');

  const focusRestore =
    /\.ue-card-frame\[data-action-mode='hover'\]:not\(\[data-critical-actions='true'\]\):focus-within\s+\.ue-card-actions[\s\S]*?opacity\s*:\s*1/;
  assert.match(css, focusRestore, 'focus-within must restore non-critical actions to opacity: 1');

  const criticalAlways =
    /\.ue-card-frame\[data-critical-actions='true'\]\s+\.ue-card-actions\s*\{[^}]*opacity\s*:\s*1/;
  assert.match(css, criticalAlways, 'critical actions must always be opacity: 1');

  assert.doesNotMatch(
    css,
    /data-action-mode['"][^{]*\{[^}]*(?:display\s*:\s*none|visibility\s*:\s*hidden|pointer-events\s*:\s*none)/,
    'must not use display:none, visibility:hidden, or pointer-events:none to hide actions',
  );
  assert.doesNotMatch(
    css,
    /\.ue-card-actions[^{]*\{[^}]*disabled/,
    'must not use disabled to hide actions',
  );
});
