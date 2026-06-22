import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ProviderInstance } from '@omue/shared-protocol';
import {
  deriveProviderCardStatus,
  getProviderVendorLabel,
} from '../renderer/components/workbench/providerCardState';

// ── Fixtures ────────────────────────────────────────────────────────

const FIXTURE_TS = '2026-06-21T00:00:00.000Z';

function makeProvider(overrides?: Partial<ProviderInstance>): ProviderInstance {
  return {
    instanceId: 'openai',
    enabled: true,
    displayName: 'OpenAI GPT-5',
    kind: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-5.5',
    chatModel: 'gpt-5.5',
    diagnosisModel: 'gpt-5.5',
    summaryModel: 'gpt-5.5',
    advanced: {
      timeout: 30,
      retries: 3,
      streaming: true,
      temperature: 0.7,
      maxTokens: 4096,
      reasoningEffort: 'auto',
      proxy: '',
    },
    ...overrides,
  };
}

// ── 1. deriveProviderCardStatus: status priority rules ────────────

test('deriveProviderCardStatus: disabled provider overrides every other status', () => {
  const provider = makeProvider({ enabled: false });
  const status = deriveProviderCardStatus(provider, {
    status: 'ready',
    providerId: 'openai',
  });
  assert.equal(status.kind, 'disabled');
});

test('deriveProviderCardStatus: authority ready + exact providerId match => ready', () => {
  const provider = makeProvider();
  const status = deriveProviderCardStatus(provider, {
    status: 'ready',
    providerId: 'openai',
  });
  assert.equal(status.kind, 'ready');
});

test('deriveProviderCardStatus: authority ready but different providerId => configured-unverified', () => {
  const provider = makeProvider();
  const status = deriveProviderCardStatus(provider, {
    status: 'ready',
    providerId: 'anthropic',
  });
  assert.equal(status.kind, 'configured-unverified');
});

test('deriveProviderCardStatus: missing_key + exact providerId match => needs-api-key', () => {
  const provider = makeProvider();
  const status = deriveProviderCardStatus(provider, {
    status: 'missing_key',
    providerId: 'openai',
    message: 'Provider API key is missing.',
  });
  assert.equal(status.kind, 'needs-api-key');
});

test('deriveProviderCardStatus: invalid_config + exact providerId match => invalid (with message)', () => {
  const provider = makeProvider();
  const status = deriveProviderCardStatus(provider, {
    status: 'invalid_config',
    providerId: 'openai',
    message: 'Provider base URL is not a valid URL.',
  });
  assert.equal(status.kind, 'invalid');
  assert.equal(status.message, 'Provider base URL is not a valid URL.');
});

test('deriveProviderCardStatus: vault_unavailable + exact providerId match => invalid', () => {
  const provider = makeProvider();
  const status = deriveProviderCardStatus(provider, {
    status: 'vault_unavailable',
    providerId: 'openai',
    message: 'Secure API key storage is unavailable for the persisted key.',
  });
  assert.equal(status.kind, 'invalid');
});

test('deriveProviderCardStatus: vault_corrupt + exact providerId match => invalid', () => {
  const provider = makeProvider();
  const status = deriveProviderCardStatus(provider, {
    status: 'vault_corrupt',
    providerId: 'openai',
    message: 'Provider API key vault is corrupt.',
  });
  assert.equal(status.kind, 'invalid');
});

test('deriveProviderCardStatus: authority pointing at a different provider never claims needs-api-key for this one', () => {
  const provider = makeProvider();
  const status = deriveProviderCardStatus(provider, {
    status: 'missing_key',
    providerId: 'anthropic',
  });
  assert.equal(status.kind, 'configured-unverified');
});

test('deriveProviderCardStatus: missing_provider never overrides enabled providers', () => {
  const provider = makeProvider();
  const status = deriveProviderCardStatus(provider, { status: 'missing_provider' });
  assert.equal(status.kind, 'configured-unverified');
});

test('deriveProviderCardStatus: apiKeyRef alone never upgrades status (session-only keys do not persist)', () => {
  const provider = makeProvider({ apiKeyRef: 'vault:openai:key' });
  const status = deriveProviderCardStatus(provider, {
    status: 'ready',
    providerId: 'anthropic',
  });
  assert.equal(status.kind, 'configured-unverified');
});

test('deriveProviderCardStatus: disabled provider wins even when authority is ready', () => {
  const provider = makeProvider({ enabled: false, apiKeyRef: 'vault:openai:key' });
  const status = deriveProviderCardStatus(provider, {
    status: 'ready',
    providerId: 'openai',
  });
  assert.equal(status.kind, 'disabled');
});

test('deriveProviderCardStatus: invalid message is omitted when authority has no message', () => {
  const provider = makeProvider();
  const status = deriveProviderCardStatus(provider, {
    status: 'invalid_config',
    providerId: 'openai',
  });
  assert.equal(status.kind, 'invalid');
  assert.equal(status.message, undefined);
});

// ── 2. getProviderVendorLabel: pure display mapping ───────────────

test('getProviderVendorLabel: openai -> OpenAI', () => {
  assert.equal(getProviderVendorLabel(makeProvider({ kind: 'openai' })), 'OpenAI');
});

test('getProviderVendorLabel: anthropic -> Anthropic', () => {
  assert.equal(
    getProviderVendorLabel(makeProvider({ kind: 'anthropic', instanceId: 'anthropic', displayName: 'Anthropic Claude' })),
    'Anthropic',
  );
});

test('getProviderVendorLabel: deepseek -> DeepSeek', () => {
  assert.equal(
    getProviderVendorLabel(makeProvider({ kind: 'deepseek', instanceId: 'deepseek', displayName: 'DeepSeek V3' })),
    'DeepSeek',
  );
});

test('getProviderVendorLabel: gemini -> Gemini', () => {
  assert.equal(
    getProviderVendorLabel(makeProvider({ kind: 'gemini', instanceId: 'gemini', displayName: 'Gemini Pro' })),
    'Gemini',
  );
});

test('getProviderVendorLabel: google -> Gemini', () => {
  assert.equal(
    getProviderVendorLabel(makeProvider({ kind: 'google', instanceId: 'google', displayName: 'Google AI' })),
    'Gemini',
  );
});

test('getProviderVendorLabel: custom uses displayName when present', () => {
  assert.equal(
    getProviderVendorLabel(makeProvider({ kind: 'custom', instanceId: 'custom-1', displayName: 'Internal Gateway' })),
    'Internal Gateway',
  );
});

test('getProviderVendorLabel: custom with empty displayName falls back to "Custom Provider"', () => {
  assert.equal(
    getProviderVendorLabel(makeProvider({ kind: 'custom', instanceId: 'custom-1', displayName: '' })),
    'Custom Provider',
  );
});

test('getProviderVendorLabel: unknown kind uses displayName when present', () => {
  assert.equal(
    getProviderVendorLabel(
      makeProvider({ kind: 'mystery-vendor', instanceId: 'mystery', displayName: 'Mystery Provider' }),
    ),
    'Mystery Provider',
  );
});

test('getProviderVendorLabel: unknown kind without displayName falls back to kind', () => {
  assert.equal(
    getProviderVendorLabel(
      makeProvider({ kind: 'mystery-vendor', instanceId: 'mystery', displayName: '' }),
    ),
    'mystery-vendor',
  );
});

test('getProviderVendorLabel: never returns the persisted displayName for openai/anthropic/deepseek/gemini', () => {
  // The default display name "OpenAI GPT-5" is what the OLD header rendered.
  // The accordion must show the vendor label, not the model-string displayName.
  assert.notEqual(
    getProviderVendorLabel(makeProvider({ kind: 'openai', displayName: 'OpenAI GPT-5' })),
    'OpenAI GPT-5',
  );
  assert.equal(
    getProviderVendorLabel(makeProvider({ kind: 'openai', displayName: 'OpenAI GPT-5' })),
    'OpenAI',
  );
});

// ── 3. Source-level structural assertions ─────────────────────────

const shellSource = readFileSync(
  resolve(process.cwd(), 'src/renderer/components/workbench/AgentWorkbenchShell.tsx'),
  'utf8',
);
const settingsPageSource = readFileSync(
  resolve(process.cwd(), 'src/renderer/components/workbench/SettingsPage.tsx'),
  'utf8',
);
const modelProviderSource = readFileSync(
  resolve(process.cwd(), 'src/renderer/components/workbench/ModelProviderSettings.tsx'),
  'utf8',
);
const workbenchCssSource = readFileSync(
  resolve(process.cwd(), 'src/renderer/components/workbench/workbench.css'),
  'utf8',
);

test('Shell passes providerReadiness into SettingsPage as a prop', () => {
  assert.match(shellSource, /providerReadiness=\{providerReadiness\}/);
});

test('SettingsPage declares providerReadiness in its props', () => {
  assert.match(settingsPageSource, /providerReadiness:\s*ProviderReadiness/);
});

test('SettingsPage forwards providerReadiness to ModelProviderSettings', () => {
  assert.match(
    settingsPageSource,
    /<ModelProviderSettings[\s\S]*?providerReadiness=\{providerReadiness\}[\s\S]*?\/>/,
  );
});

test('ModelProviderSettings declares providerReadiness in its props', () => {
  assert.match(modelProviderSource, /providerReadiness:\s*ProviderReadiness/);
});

test('ModelProviderSettings uses single-open accordion state initialized to null', () => {
  assert.match(
    modelProviderSource,
    /useState<string\s*\|\s*null>\(null\)/,
    'expandedProviderId should initialize to null so all cards collapse by default',
  );
  assert.match(
    modelProviderSource,
    /setExpandedProviderId\(prev\s*=>\s*\(?\s*prev\s*===\s*instanceId\s*\?\s*null\s*:\s*instanceId\s*\)?\)/,
    'opening another card must close the previously open one (single-open accordion)',
  );
});

test('ModelProviderSettings renders each provider as an <article> with aria-expanded and aria-controls', () => {
  assert.match(modelProviderSource, /<article[^>]*className="ue-settings-provider-card"/);
  assert.match(modelProviderSource, /aria-expanded=\{isExpanded\}/);
  assert.match(modelProviderSource, /aria-controls=\{bodyId\}/);
  assert.match(modelProviderSource, /id=\{bodyId\}/);
});

test('ModelProviderSettings header uses the shared Switch primitive, not a hand-rolled toggle', () => {
  // The header Switch must be the one exported from ./Switch.
  assert.match(
    modelProviderSource,
    /<Switch\s+checked=\{provider\.enabled\}[\s\S]*?onCheckedChange=\{value => updateProvider\(provider\.instanceId, \{ enabled: value \}\)\}[\s\S]*?\/>/,
  );
});

test('ModelProviderSettings renders the body only when the provider is the expanded one', () => {
  // The body must be inside a ternary conditional on isExpanded and end with `: null`
  // so collapsed cards never render their fields.
  const ternaryMatch = modelProviderSource.match(
    /isExpanded\s*\?\s*\(\s*<div[^>]*id=\{bodyId\}/,
  );
  assert.ok(ternaryMatch, 'card body must be conditional on isExpanded and start with the bodyId div');
  const tailMatch = modelProviderSource.match(
    /\)\s*:\s*null\s*\}\s*$/m,
  );
  assert.ok(tailMatch, 'card body ternary must end with `: null` so collapsed cards render nothing');
});

test('ModelProviderSettings does not expose handleTestConnection, testLoading, refreshModels, or fetchModels', () => {
  assert.doesNotMatch(modelProviderSource, /handleTestConnection/);
  assert.doesNotMatch(modelProviderSource, /testLoading/);
  assert.doesNotMatch(modelProviderSource, /handleRefreshModels/);
  assert.doesNotMatch(modelProviderSource, /refreshModels/);
  assert.doesNotMatch(modelProviderSource, /fetchModels/);
});

test('ModelProviderSettings Test connection button has no onClick handler and no fake success path', () => {
  const buttonMatch = modelProviderSource.match(
    /<button[^>]*ue-settings-btn-disabled[^>]*>[\s\S]*?<\/button>/,
  );
  assert.ok(buttonMatch, 'Test connection button must exist with the disabled modifier class');
  const buttonSource = buttonMatch![0];
  assert.doesNotMatch(buttonSource, /onClick=/, 'Test connection button must not have an onClick handler');
  assert.match(buttonSource, /disabled/);
  assert.match(buttonSource, /title=\{t\.testConnectionUnavailable\}/);
  assert.match(buttonSource, /\{t\.testConnectionUnavailable\}/);
});

test('ModelProviderSettings imports the new helper and does not implement authority in renderer', () => {
  assert.match(modelProviderSource, /from\s+['"]\.\/providerCardState['"]/);
  assert.match(modelProviderSource, /getProviderVendorLabel\(provider\)/);
  assert.match(modelProviderSource, /deriveProviderCardStatus\(provider,\s*providerReadiness\)/);
});

test('ModelProviderSettings still wires all existing onUpdate patch paths (displayName, baseUrl, defaultModel, models, advanced)', () => {
  // These onUpdate patch paths must remain so the persisted ProviderInstance shape is unchanged.
  // The model-purposes use a computed key (allowed), so check for the per-purpose text fields too.
  assert.match(modelProviderSource, /updateProvider\(provider\.instanceId, \{ displayName/);
  assert.match(modelProviderSource, /updateProvider\(provider\.instanceId, \{ baseUrl/);
  assert.match(modelProviderSource, /updateProvider\(provider\.instanceId, \{ defaultModel/);
  // The three model purpose fields are mapped from a single dynamic onChange, so the patch
  // shape uses a computed key; the test accepts either a direct per-purpose key or the
  // computed `[purpose]` form, but always asserts that the model purpose onChange exists.
  assert.match(
    modelProviderSource,
    /updateProvider\(provider\.instanceId, \{ \[purpose\]:\s*e\.target\.value \}/,
  );
  assert.match(modelProviderSource, /updateProvider\(provider\.instanceId, \{\s*\n?\s*advanced:/);
  // API key save/clear helpers must still exist.
  assert.match(modelProviderSource, /handleSaveApiKey/);
  assert.match(modelProviderSource, /handleClearApiKey/);
});

test('ModelProviderSettings header uses the new card markup with summary + actions regions', () => {
  assert.match(modelProviderSource, /ue-settings-provider-summary/);
  assert.match(modelProviderSource, /ue-settings-provider-header-actions/);
  assert.match(modelProviderSource, /ue-settings-provider-card-body/);
});

// ── 4. i18n surface assertions (en + zh) ──────────────────────────

const dictEnSource = readFileSync(
  resolve(process.cwd(), 'src/renderer/i18n/dict-en.ts'),
  'utf8',
);
const dictZhSource = readFileSync(
  resolve(process.cwd(), 'src/renderer/i18n/dict-zh.ts'),
  'utf8',
);

test('i18n types declare the five provider card status labels + expand/collapse aria strings', () => {
  const typesSource = readFileSync(
    resolve(process.cwd(), 'src/renderer/i18n/types.ts'),
    'utf8',
  );
  for (const key of [
    'providerStatusReady',
    'providerStatusDisabled',
    'providerStatusNeedsApiKey',
    'providerStatusConfiguredUnverified',
    'providerStatusInvalid',
    'providerExpandAria',
    'providerCollapseAria',
  ]) {
    assert.match(
      typesSource,
      new RegExp(`${key}\\s*:`),
      `types.ts must declare modelProviders.${key}`,
    );
  }
});

test('dict-en and dict-zh define every new provider card i18n key', () => {
  for (const key of [
    'providerStatusReady',
    'providerStatusDisabled',
    'providerStatusNeedsApiKey',
    'providerStatusConfiguredUnverified',
    'providerStatusInvalid',
    'providerExpandAria',
    'providerCollapseAria',
  ]) {
    assert.match(
      dictEnSource,
      new RegExp(`${key}\\s*:`),
      `dict-en.ts must provide modelProviders.${key}`,
    );
    assert.match(
      dictZhSource,
      new RegExp(`${key}\\s*:`),
      `dict-zh.ts must provide modelProviders.${key}`,
    );
  }
});

// ── 5. CSS surface assertions ────────────────────────────────────

test('workbench.css defines provider card header summary, actions, body, and status badge modifiers', () => {
  for (const selector of [
    '.ue-settings-provider-card',
    '.ue-settings-provider-card-header',
    '.ue-settings-provider-summary',
    '.ue-settings-provider-header-actions',
    '.ue-settings-provider-card-body',
    '.ue-settings-provider-vendor',
    '.ue-settings-provider-kind-label',
    '.ue-provider-status-badge',
    '.ue-provider-status-ready',
    '.ue-provider-status-disabled',
    '.ue-provider-status-needs-api-key',
    '.ue-provider-status-configured-unverified',
    '.ue-provider-status-invalid',
  ]) {
    assert.match(
      workbenchCssSource,
      new RegExp(selector.replace(/\./g, '\\.').replace(/\s/g, '\\s*')),
      `workbench.css should define ${selector}`,
    );
  }
});

test('workbench.css provider card header prevents actions from covering the title', () => {
  // The summary region must be allowed to shrink (min-width:0) and the actions
  // region must not be allowed to grow (flex: 0 0 auto) so a long vendor name
  // does not get pushed under the Switch.
  const summaryBlock = workbenchCssSource.match(
    /\.ue-settings-provider-summary\s*\{[^}]*\}/,
  );
  assert.ok(summaryBlock, '.ue-settings-provider-summary must have a rule block');
  assert.match(
    summaryBlock![0],
    /min-width\s*:\s*0/,
    'summary region must allow shrinking so the vendor name can ellipsize',
  );

  const actionsBlock = workbenchCssSource.match(
    /\.ue-settings-provider-header-actions\s*\{[^}]*\}/,
  );
  assert.ok(actionsBlock, '.ue-settings-provider-header-actions must have a rule block');
  assert.match(
    actionsBlock![0],
    /flex\s*:\s*0\s+0\s+auto/,
    'actions region must not grow over the title',
  );
});

// Use FIXTURE_TS so the linter does not flag an unused import in the future.
void FIXTURE_TS;
