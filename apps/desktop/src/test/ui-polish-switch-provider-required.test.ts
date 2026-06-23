import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const workbenchDir = resolve(process.cwd(), 'src/renderer/components/workbench');
const readWorkbench = (file: string) => readFileSync(resolve(workbenchDir, file), 'utf8');

const cssSource = readWorkbench('workbench.css');
const modelProviderSource = readWorkbench('ModelProviderSettings.tsx');
const chatInputSource = readWorkbench('ChatInputV2.tsx');

// ── 1. Switch CSS dimensional stability ──────────────────────────

test('Switch CSS uses fixed width/height and defensive flex auto to survive any parent flex direction', () => {
  const switchBlock = cssSource.match(/\.ue-switch\s*\{([^}]*)\}/);
  assert.ok(switchBlock, '.ue-switch rule must exist');
  const block = switchBlock![1];
  assert.match(block, /min-width\s*:\s*36px/, '.ue-switch must set min-width: 36px');
  assert.match(block, /min-height\s*:\s*20px/, '.ue-switch must set min-height: 20px');
  assert.match(block, /width\s*:\s*36px/, '.ue-switch must set width: 36px');
  assert.match(block, /height\s*:\s*20px/, '.ue-switch must set height: 20px');
  assert.match(block, /flex\s*:\s*0\s+0\s+auto/, '.ue-switch must set flex: 0 0 auto — flex-basis must not override fixed height in column containers');
  assert.match(block, /box-sizing\s*:\s*border-box/, '.ue-switch must set box-sizing: border-box');
  assert.doesNotMatch(block, /flex\s*:\s*0\s+0\s+36px/, '.ue-switch must NOT use fixed-px flex-basis that becomes height in column containers');
});

test('Switch track is absolute-filled capsule', () => {
  const trackBlock = cssSource.match(/\.ue-switch-track\s*\{([^}]*)\}/);
  assert.ok(trackBlock, '.ue-switch-track rule must exist');
  const block = trackBlock![1];
  assert.match(block, /position\s*:\s*absolute/, '.ue-switch-track must be absolute positioned');
  assert.match(block, /inset\s*:\s*0/, '.ue-switch-track must fill the switch container');
  assert.match(block, /border-radius\s*:\s*999px/, '.ue-switch-track must be a pill capsule');
});

test('Switch thumb has proper dimensions for 36x20 capsule', () => {
  const thumbBlock = cssSource.match(/\.ue-switch-thumb\s*\{([^}]*)\}/);
  assert.ok(thumbBlock, '.ue-switch-thumb rule must exist');
  const block = thumbBlock![1];
  assert.match(block, /width\s*:\s*16px/, '.ue-switch-thumb must be 16px wide');
  assert.match(block, /height\s*:\s*16px/, '.ue-switch-thumb must be 16px tall');
  assert.match(block, /left\s*:\s*2px/, '.ue-switch-thumb must be inset 2px from left');
  assert.match(block, /top\s*:\s*2px/, '.ue-switch-thumb must be inset 2px from top');
  assert.match(block, /border-radius\s*:\s*999px/, '.ue-switch-thumb must be circular');
  assert.match(block, /transform/, '.ue-switch-thumb must use transform for checked movement');
});

test('Switch checked state translates thumb 16px right', () => {
  assert.match(
    cssSource,
    /\.ue-switch input:checked\s*\+\s*\.ue-switch-track\s*\.ue-switch-thumb\s*\{[^}]*transform\s*:\s*translateX\(16px\)/,
    'checked thumb must translate 16px right',
  );
});

test('Switch provider-enable modifier retains min-width defense', () => {
  const enableBlock = cssSource.match(/\.ue-settings-provider-enable\s*\{([^}]*)\}/);
  assert.ok(enableBlock, '.ue-settings-provider-enable rule must exist');
  const block = enableBlock![1];
  assert.match(block, /min-width\s*:\s*36px/, '.ue-settings-provider-enable must retain min-width: 36px');
  assert.match(block, /flex\s*:\s*0\s+0\s+auto/, '.ue-settings-provider-enable must set flex: 0 0 auto');
});

test('Switch has workbench-root scoped dimensional stability rule', () => {
  const scopedBlock = cssSource.match(/\.workbench-root\s+\.ue-switch\s*\{([^}]*)\}/);
  assert.ok(scopedBlock, '.workbench-root .ue-switch scoped rule must exist');
  const block = scopedBlock![1];
  assert.match(block, /min-width\s*:\s*36px/, 'scoped rule must set min-width: 36px');
  assert.match(block, /min-height\s*:\s*20px/, 'scoped rule must set min-height: 20px');
  assert.match(block, /flex\s*:\s*0\s+0\s+auto/, 'scoped rule must set flex: 0 0 auto');
});

// ── 2. Streaming advanced row uses shared Switch ────────────────

test('Streaming advanced row uses shared Switch primitive, not hand-rolled toggle', () => {
  assert.match(
    modelProviderSource,
    /t\.streaming[\s\S]*?<Switch/,
    'streaming label must be followed by <Switch component',
  );
  assert.match(
    modelProviderSource,
    /<Switch[\s\S]*?checked=\{provider\.advanced\.streaming\}/,
    'streaming Switch must bind to provider.advanced.streaming',
  );
  assert.match(
    modelProviderSource,
    /ariaLabel=\{t\.streaming\}/,
    'streaming Switch must use t.streaming aria label',
  );
  assert.doesNotMatch(
    modelProviderSource,
    /ue-settings-toggle-slider/,
    'ModelProviderSettings must not use legacy toggle slider for streaming',
  );
});

test('Streaming row is in advanced section, not in card header', () => {
  const advSectionIdx = modelProviderSource.indexOf('ue-settings-advanced-section');
  assert.ok(advSectionIdx >= 0, 'advanced section must exist');
  const advSection = modelProviderSource.substring(advSectionIdx);
  assert.match(advSection, /t\.streaming/, 'streaming must be in advanced section');
});

test('Provider card header uses shared Switch with className prop', () => {
  assert.match(
    modelProviderSource,
    /<Switch\s+checked=\{provider\.enabled\}[\s\S]*?className="ue-settings-provider-enable"/,
    'header Switch must pass the provider-enable className',
  );
});

// ── 2a. Toggle row layout regression ─────────────────────────
test('.ue-settings-toggle-row explicitly forces flex-direction: row to survive .ue-settings-field column inheritance', () => {
  const toggleBlock = cssSource.match(/\.ue-settings-toggle-row\s*\{([^}]*)\}/);
  assert.ok(toggleBlock, '.ue-settings-toggle-row rule must exist');
  const block = toggleBlock![1];
  assert.match(block, /flex-direction\s*:\s*row/, '.ue-settings-toggle-row must set flex-direction: row');
  assert.match(block, /display\s*:\s*flex/, '.ue-settings-toggle-row must set display: flex');
});

test('Switch focus-visible ring uses outline-offset on track, .ue-switch container must NOT clip it with overflow hidden', () => {
  const switchBlock = cssSource.match(/\.ue-switch\s*\{([^}]*)\}/);
  assert.ok(switchBlock, '.ue-switch rule must exist');
  const switchBody = switchBlock![1];
  assert.doesNotMatch(switchBody, /overflow\s*:\s*hidden/, '.ue-switch must NOT set overflow: hidden — it clips the focus-visible outline-offset ring');

  const focusBlock = cssSource.match(/\.ue-switch input:focus-visible\s*\+\s*\.ue-switch-track\s*\{([^}]*)\}/);
  assert.ok(focusBlock, '.ue-switch input:focus-visible + .ue-switch-track must exist');
  const block = focusBlock![1];
  assert.match(block, /outline\s*:/, 'focus-visible track must use outline');
  assert.match(block, /outline-offset\s*:\s*2px/, 'focus-visible track must set outline-offset: 2px for visibility');
  assert.match(block, /var\(--accent-primary\)/, 'focus ring must use accent-primary token');
});

// ── 3. Provider-required CTA CSS contract ──────────────────────

test('CTA no longer uses undefined --bg-warning / --border-warning / --text-warning dark fallbacks', () => {
  const ctaBlock = cssSource.match(/\.ue-chat-input-model-required\s*\{([^}]*)\}/);
  assert.ok(ctaBlock, '.ue-chat-input-model-required rule must exist');
  const block = ctaBlock![1];
  assert.doesNotMatch(block, /--bg-warning/, 'CTA must not use --bg-warning');
  assert.doesNotMatch(block, /--border-warning/, 'CTA must not use --border-warning');
  assert.doesNotMatch(block, /--text-warning/, 'CTA must not use --text-warning');
  assert.doesNotMatch(block, /#3d2e00/, 'CTA must not contain dark fallback #3d2e00');
  assert.doesNotMatch(block, /#8b6f00/, 'CTA must not contain dark fallback #8b6f00');
  assert.doesNotMatch(block, /#ffc107/, 'CTA must not contain hardcoded #ffc107');
});

test('CTA uses --warning token with color-mix for theme-adaptive styling', () => {
  const ctaBlock = cssSource.match(/\.ue-chat-input-model-required\s*\{([^}]*)\}/);
  assert.ok(ctaBlock, '.ue-chat-input-model-required rule must exist');
  const block = ctaBlock![1];
  assert.match(block, /var\(--warning\)/, 'CTA must use var(--warning) token');
  assert.match(block, /color-mix/, 'CTA must use color-mix for adaptive background and border');
  assert.match(block, /background\s*:\s*color-mix/, 'CTA background must use color-mix');
  assert.match(block, /border\s*:.*color-mix/, 'CTA border must use color-mix');
});

test('CTA has explicit hover and focus-visible states', () => {
  assert.match(
    cssSource,
    /\.ue-chat-input-model-required:hover\s*\{/,
    'CTA must define hover state',
  );
  assert.match(
    cssSource,
    /\.ue-chat-input-model-required:focus-visible\s*\{/,
    'CTA must define focus-visible state',
  );
  assert.doesNotMatch(
    cssSource,
    /\.ue-chat-input-model-required:hover[\s\S]*?filter\s*:\s*brightness/,
    'CTA hover must not use filter: brightness fallback',
  );
});

test('CTA has font-weight for visibility', () => {
  const ctaBlock = cssSource.match(/\.ue-chat-input-model-required\s*\{([^}]*)\}/);
  assert.ok(ctaBlock, '.ue-chat-input-model-required rule must exist');
  const block = ctaBlock![1];
  assert.match(block, /font-weight\s*:\s*500/, 'CTA must set font-weight: 500 for visibility');
});

test('CTA has transition for smooth interactive states', () => {
  const ctaBlock = cssSource.match(/\.ue-chat-input-model-required\s*\{([^}]*)\}/);
  assert.ok(ctaBlock, '.ue-chat-input-model-required rule must exist');
  const block = ctaBlock![1];
  assert.match(block, /transition/, 'CTA must define transition for interactive states');
});

// ── 4. CTA component wiring ───────────────────────────────────

test('CTA preserves onOpenSettings onClick and aria wiring', () => {
  assert.match(
    chatInputSource,
    /className="ue-chat-input-model-required"/,
    'ChatInputV2 must have the CTA class',
  );
  assert.match(
    chatInputSource,
    /onClick=\{onOpenSettings\}/,
    'CTA must keep onOpenSettings onClick handler',
  );
  assert.match(
    chatInputSource,
    /aria-label=\{inputCopy\.providerRequired\}/,
    'CTA must keep providerRequired aria label',
  );
  assert.match(
    chatInputSource,
    /\{inputCopy\.providerRequired\}/,
    'CTA must display providerRequired copy',
  );
});

test('ChatInputV2 still conditionally renders CTA only when provider is not ready', () => {
  assert.match(
    chatInputSource,
    /providerReady && diagnosisModel\s*\?[\s\S]*?:\s*\([\s\S]*?ue-chat-input-model-required/,
    'CTA must render only when providerReady is falsy or diagnosisModel is empty',
  );
});

// ── 5. Forbidden scope guards ────────────────────────────────

test('forbidden: no new shared-protocol imports introduced by this task', () => {
  assert.doesNotMatch(
    chatInputSource,
    /from\s+['"]@omue\/shared-protocol['"]/,
    'ChatInputV2.tsx must not import from @omue/shared-protocol',
  );
  const modelImports = modelProviderSource.match(/from ['"]@omue\/shared-protocol['"]/g);
  assert.ok(modelImports, 'ModelProviderSettings keeps its existing shared-protocol import');
  assert.equal(
    modelImports.length,
    1,
    'ModelProviderSettings must not add a second shared-protocol import statement',
  );
});

test('forbidden: no hardcoded dark-only color values in CTA', () => {
  assert.doesNotMatch(
    cssSource,
    /\.ue-chat-input-model-required[\s\S]*?(?:#3d2e00|#8b6f00|bg-warning|border-warning|text-warning)/,
    'no rule touching model-required may use dark-only fallback colors',
  );
});
