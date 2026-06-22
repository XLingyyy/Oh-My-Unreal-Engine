// Settings unit validation script (no external dependencies).
//
// This script exercises the PRODUCTION settings mutation service
// (`apps/desktop/src/main/settings/settingsMutationService.js` after
// `npm -w @omue/desktop run build:main`) directly. It builds an
// in-memory store and an in-memory vault that internally call the
// production `vault-transaction` helpers (buildNextVaultEntries,
// removeProviderEntries, snapshotProviderEntries, applyProviderPatch)
// and shared-protocol vault-ref parsers, so the behavior tests
// exercise the same code path the real Electron Main process uses.
//
// Three kinds of checks run here:
//   (A) Behavior tests against the production mutation service
//       (update, reset, setApiKey, clearApiKey, replace/clear rollback,
//        rollback failure, session projection, concurrent same/diff
//        providers, settings:update vs api-key:set interleaving, rename
//        retry, schema cross-field owner check).
//   (B) Static source scans (wiring sanity grep) — kept as supplementary
//       evidence; they DO NOT replace the behavior tests above.
//   (C) Build-artifact smoke (ESM + CJS + marker files exist; CJS index
//       is require()-able; marker overrides "type": "commonjs").
//
// Run after `npm run build:shared && npm -w @omue/desktop run build:main`:
//   node apps/desktop/scripts/validate-settings.mjs

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as fsPromises from 'node:fs/promises';
import * as crypto from 'node:crypto';

const __filename = fileURLToPath(import.meta.url);
const require = createRequire(import.meta.url);

const desktopRoot = path.resolve(__filename, '..', '..');
const compiledDir = path.join(desktopRoot, 'dist', 'main', 'settings');
const sharedRoot = path.resolve(desktopRoot, '..', '..', 'packages', 'shared-protocol');

const {
  deepMergeSettings,
  validateSettings,
  validateSettingsState,
  sanitizeSettingsFile,
  validateResetKeys,
  getDefaultSettings,
  createSettingsMutationService,
} = require(path.join(compiledDir, 'index.js'));

const {
  buildNextVaultEntries,
  removeProviderEntries,
  snapshotProviderEntries,
  applyProviderPatch,
} = require(path.join(compiledDir, 'vault-transaction.js'));

const shared = require(path.join(sharedRoot, 'dist-cjs', 'index.js'));
const {
  runRenameWithRetry,
  buildVaultRef,
  buildMemVaultRef,
  parseVaultRef,
  refBelongsToProvider,
  validateProviderInstanceId,
  PROVIDER_INSTANCE_ID_PATTERN,
} = shared;

const results = [];
let failures = 0;
function check(name, cond, detail) {
  const ok = !!cond;
  if (!ok) failures += 1;
  results.push({ name, ok, detail: detail ?? '' });
}

// ── Test harness: in-memory store + vault + failure injectors ─────
function createTestHarness(opts = {}) {
  let settings = opts.initialSettings ?? getDefaultSettings();
  let vaultEntries = opts.initialVault ?? {};
  let timestampCounter = 1_700_000_000_000;
  const sleepTimings = [];

  const failureInjects = {
    failNextSettingsWrite: undefined,
    failNextVaultWrite: undefined,
    failNextVaultRestore: undefined,
  };

  const session = { inMemoryApiKeys: new Map() };

  async function loadSettings() {
    // Return a deep clone so service merge does not mutate stored state.
    return JSON.parse(JSON.stringify(settings));
  }

  async function writeSettings(next) {
    const inject = failureInjects.failNextSettingsWrite?.();
    if (inject?.fail) {
      return { ok: false, error: inject.error ?? 'simulated write failure' };
    }
    settings = JSON.parse(JSON.stringify(next));
    return { ok: true };
  }

  const vault = {
    isSafeStorageAvailable() {
      return opts.safeStorageAvailable !== false;
    },
    isVaultCorrupt() {
      return false;
    },
    async setApiKey(providerInstanceId, plaintext) {
      const inject = failureInjects.failNextVaultWrite?.();
      if (inject?.fail) {
        return { ok: false, kind: 'write_failed', error: inject.error ?? 'simulated vault failure' };
      }
      const ref = buildVaultRef(providerInstanceId, timestampCounter++);
      const ciphertext = Buffer.from(plaintext, 'utf-8').toString('base64');
      vaultEntries = buildNextVaultEntries(vaultEntries, providerInstanceId, ref, ciphertext);
      return { ok: true, apiKeyRef: ref };
    },
    async clearApiKeyEntries(providerInstanceId) {
      const inject = failureInjects.failNextVaultWrite?.();
      if (inject?.fail) {
        return { ok: false, kind: 'write_failed', error: inject.error ?? 'simulated vault failure' };
      }
      const result = removeProviderEntries(vaultEntries, providerInstanceId);
      vaultEntries = result.entries;
      return { ok: true, changed: result.changed };
    },
    snapshotProviderEntriesFor(providerInstanceId) {
      return snapshotProviderEntries(vaultEntries, providerInstanceId);
    },
    async restoreProviderEntries(providerInstanceId, providerEntries) {
      const inject = failureInjects.failNextVaultRestore?.();
      if (inject?.fail) {
        return { ok: false, kind: 'write_failed', error: inject.error ?? 'simulated restore failure' };
      }
      vaultEntries = applyProviderPatch(vaultEntries, providerInstanceId, providerEntries);
      return { ok: true };
    },
  };

  const nowMs = () => timestampCounter++;

  const service = createSettingsMutationService({
    loadSettings,
    writeSettings,
    vault,
    validateSettingsPatch: validateSettings,
    validateSettingsState,
    validateResetKeys,
    validateProviderInstanceId,
    buildMemVaultRef,
    deepMergeSettings,
    getDefaultSettings,
    nowMs,
    session,
    failureInjects,
  });

  return {
    service,
    session,
    getSettings: () => JSON.parse(JSON.stringify(settings)),
    getVaultEntries: () => ({ ...vaultEntries }),
    setSettings: (next) => { settings = JSON.parse(JSON.stringify(next)); },
    setVaultEntries: (next) => { vaultEntries = { ...next }; },
    injectSettingsWriteFail: (error) => {
      failureInjects.failNextSettingsWrite = () => ({ fail: true, error: error ?? 'simulated write failure' });
    },
    clearSettingsWriteFail: () => {
      failureInjects.failNextSettingsWrite = undefined;
    },
    injectVaultWriteFail: (error) => {
      failureInjects.failNextVaultWrite = () => ({ fail: true, error: error ?? 'simulated vault failure' });
    },
    clearVaultWriteFail: () => {
      failureInjects.failNextVaultWrite = undefined;
    },
    injectVaultRestoreFail: (error) => {
      failureInjects.failNextVaultRestore = () => ({ fail: true, error: error ?? 'simulated restore failure' });
    },
    clearVaultRestoreFail: () => {
      failureInjects.failNextVaultRestore = undefined;
    },
    sleepTimings,
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function getDefaultProvider(instanceId) {
  return clone(getDefaultSettings().modelProviders.providers.find((p) => p.instanceId === instanceId));
}

function makeCompleteProvider(instanceId, overrides = {}) {
  const template = getDefaultProvider('openai-gpt5');
  return {
    ...template,
    instanceId,
    displayName: overrides.displayName ?? `Provider ${instanceId}`,
    kind: overrides.kind ?? 'custom',
    ...overrides,
    advanced: {
      ...template.advanced,
      ...(overrides.advanced ?? {}),
    },
  };
}

function withoutApiKeyRef(provider) {
  const { apiKeyRef: _apiKeyRef, ...rest } = provider;
  return rest;
}

// ── Scenario 1: secure set succeeds end-to-end ──────────────────
{
  const h = createTestHarness();
  const out = await h.service.setApiKey('openai-gpt5', 'sk-test-1');
  check('1. secure set: returns apiKeyRef + persisted=true; vault+settings both updated',
    out.ok && out.persisted === true && out.apiKeyRef && out.apiKeyRef.startsWith('vault-openai-gpt5-'),
    `out=${JSON.stringify(out)}`);
  const vault = h.getVaultEntries();
  const settings = h.getSettings();
  const provider = settings.modelProviders.providers.find((p) => p.instanceId === 'openai-gpt5');
  const storedCipher = vault[out.apiKeyRef];
  check('1b. secure set: vault stores base64 ciphertext that decrypts back to plaintext',
    storedCipher === Buffer.from('sk-test-1', 'utf-8').toString('base64'),
    `cipher=${storedCipher}`);
  check('1c. secure set: persisted settings.apiKeyRef matches returned ref and is owned by openai-gpt5',
    provider?.apiKeyRef === out.apiKeyRef && refBelongsToProvider(out.apiKeyRef, 'openai-gpt5'),
    `provider.apiKeyRef=${provider?.apiKeyRef}`);
}

// ── Scenario 2: replace settings write fails → vault entries restored ─
{
  const h = createTestHarness();
  // Pre-populate with an existing key for openai-gpt5
  await h.service.setApiKey('openai-gpt5', 'sk-original');
  const beforeVault = h.getVaultEntries();
  const beforeRef = Object.keys(beforeVault).find((k) => k.startsWith('vault-openai-gpt5-'));

  h.injectSettingsWriteFail('disk full');
  const out = await h.service.setApiKey('openai-gpt5', 'sk-replacement');
  h.clearSettingsWriteFail();

  check('2. replace settings write fails: returns error and did NOT persist new key',
    !out.ok && out.error === 'disk full',
    `out=${JSON.stringify(out)}`);
  const afterVault = h.getVaultEntries();
  const hasOriginal = beforeRef && afterVault[beforeRef] === beforeVault[beforeRef];
  const hasNewReplacement = Object.keys(afterVault).some((k) => k !== beforeRef && k.startsWith('vault-openai-gpt5-'));
  check('2b. replace settings write fails: original ciphertext preserved, no new entry',
    hasOriginal && !hasNewReplacement,
    `originalKey=${beforeRef}, keys=${Object.keys(afterVault).sort().join(',')}`);
}

// ── Scenario 3: clear settings write fails → vault entries restored ─
{
  const h = createTestHarness();
  await h.service.setApiKey('openai-gpt5', 'sk-original');
  const beforeVault = h.getVaultEntries();
  const beforeRef = Object.keys(beforeVault).find((k) => k.startsWith('vault-openai-gpt5-'));

  h.injectSettingsWriteFail('disk full');
  const out = await h.service.clearApiKey('openai-gpt5');
  h.clearSettingsWriteFail();

  check('3. clear settings write fails: returns error and does NOT drop the key',
    !out.ok && out.error === 'disk full',
    `out=${JSON.stringify(out)}`);
  const afterVault = h.getVaultEntries();
  check('3b. clear settings write fails: original ciphertext preserved (per-provider snapshot restored)',
    afterVault[beforeRef] === beforeVault[beforeRef],
    `keys=${Object.keys(afterVault).sort().join(',')}`);
}

// ── Scenario 4: rollback write fails → returns "Vault rollback failed" ─
{
  const h = createTestHarness();
  h.injectVaultRestoreFail('vault locked');
  h.injectSettingsWriteFail('disk full');
  const out = await h.service.setApiKey('openai-gpt5', 'sk-1');
  h.clearVaultRestoreFail();
  h.clearSettingsWriteFail();

  check('4. rollback failure: returns "Vault rollback failed: ..." sentinel',
    !out.ok && out.error.startsWith('Vault rollback failed:') && out.error.includes('vault locked'),
    `out=${JSON.stringify(out)}`);
}

// ── Scenario 5: session-only set: mem ref only in projection, never persisted ─
{
  const h = createTestHarness({ safeStorageAvailable: false });
  const out = await h.service.setApiKey('openai-gpt5', 'sk-session');
  check('5. session-only set: returns apiKeyRef starting with mem-vault- and persisted=false',
    out.ok && out.persisted === false && out.apiKeyRef.startsWith('mem-vault-openai-gpt5-'),
    `out=${JSON.stringify(out)}`);
  const settings = h.getSettings();
  const provider = settings.modelProviders.providers.find((p) => p.instanceId === 'openai-gpt5');
  check('5b. session-only set: persisted settings has NO apiKeyRef (mem ref lives only in session)',
    provider && provider.apiKeyRef === undefined,
    `provider.apiKeyRef=${provider?.apiKeyRef}`);
  // Projection (what settings:get would return) should inject the mem ref
  const projected = (() => {
    let s = settings;
    for (const [id, entry] of h.session.inMemoryApiKeys.entries()) {
      s = JSON.parse(JSON.stringify(s));
      const p = s.modelProviders.providers.find((x) => x.instanceId === id);
      if (p) p.apiKeyRef = entry.ref;
    }
    return s;
  })();
  const projectedProvider = projected.modelProviders.providers.find((p) => p.instanceId === 'openai-gpt5');
  check('5c. session-only set: projected settings shows mem ref for the provider',
    projectedProvider?.apiKeyRef === out.apiKeyRef,
    `projected.apiKeyRef=${projectedProvider?.apiKeyRef}`);
}

// ── Scenario 6: session-only clear settings write fails → mem key preserved ─
{
  const h = createTestHarness({ safeStorageAvailable: false });
  await h.service.setApiKey('openai-gpt5', 'sk-session');
  const memBefore = h.session.inMemoryApiKeys.get('openai-gpt5');

  h.injectSettingsWriteFail('disk full');
  const out = await h.service.clearApiKey('openai-gpt5');
  h.clearSettingsWriteFail();

  check('6. session-only clear failure: returns error and does NOT delete mem entry',
    !out.ok && out.error === 'disk full',
    `out=${JSON.stringify(out)}`);
  const memAfter = h.session.inMemoryApiKeys.get('openai-gpt5');
  check('6b. session-only clear failure: session mem entry preserved (rollback path)',
    memAfter && memAfter.ref === memBefore.ref && memAfter.plaintext === memBefore.plaintext,
    `memAfter=${JSON.stringify(memAfter)}`);
}

// ── Scenario 7: different-provider concurrent sets: both refs preserved ─
{
  const h = createTestHarness();
  const [outFoo, outBar] = await Promise.all([
    h.service.setApiKey('openai-gpt5', 'sk-foo'),
    h.service.setApiKey('anthropic-claude4', 'sk-bar'),
  ]);
  check('7. concurrent different-provider sets: both succeed with distinct refs',
    outFoo.ok && outBar.ok && outFoo.apiKeyRef !== outBar.apiKeyRef,
    `foo=${outFoo.apiKeyRef}, bar=${outBar.apiKeyRef}`);
  const vault = h.getVaultEntries();
  const fooInVault = Object.keys(vault).some((k) => refBelongsToProvider(k, 'openai-gpt5'));
  const barInVault = Object.keys(vault).some((k) => refBelongsToProvider(k, 'anthropic-claude4'));
  check('7b. concurrent different-provider sets: both ciphertexts present in vault',
    fooInVault && barInVault,
    `keys=${Object.keys(vault).sort().join(',')}`);
  const settings = h.getSettings();
  const fooProvider = settings.modelProviders.providers.find((p) => p.instanceId === 'openai-gpt5');
  const barProvider = settings.modelProviders.providers.find((p) => p.instanceId === 'anthropic-claude4');
  check('7c. concurrent different-provider sets: both providers have apiKeyRef in persisted settings',
    fooProvider?.apiKeyRef === outFoo.apiKeyRef && barProvider?.apiKeyRef === outBar.apiKeyRef,
    `foo=${fooProvider?.apiKeyRef}, bar=${barProvider?.apiKeyRef}`);
}

// ── Scenario 8: same-provider concurrent sets: queue order preserved, no lost update ─
{
  const h = createTestHarness();
  // A: succeeds
  const outA = await h.service.setApiKey('openai-gpt5', 'sk-first');
  // Configure fail for B's settings write
  h.injectSettingsWriteFail('disk full');
  // B: fails on settings write, must roll back to A's state (no overwriting A's success)
  const outB = await h.service.setApiKey('openai-gpt5', 'sk-second');
  h.clearSettingsWriteFail();

  check('8. same-provider sequential A→B: A succeeds, B fails',
    outA.ok && !outB.ok && outB.error === 'disk full',
    `A=${JSON.stringify(outA)}, B=${JSON.stringify(outB)}`);
  const vault = h.getVaultEntries();
  // After rollback, only A's ref should remain; B's ref was rolled back
  const aRefStillPresent = vault[outA.apiKeyRef] !== undefined;
  const bRefAbsent = !Object.keys(vault).some((k) => k === outB.apiKeyRef);
  check('8b. same-provider A→B rollback: A ciphertext preserved, B ciphertext discarded',
    aRefStillPresent && bRefAbsent,
    `keys=${Object.keys(vault).sort().join(',')}, Aref=${outA.apiKeyRef}`);
  const settings = h.getSettings();
  const provider = settings.modelProviders.providers.find((p) => p.instanceId === 'openai-gpt5');
  check('8c. same-provider A→B rollback: persisted settings still has A\'s ref (no clobber)',
    provider?.apiKeyRef === outA.apiKeyRef,
    `provider.apiKeyRef=${provider?.apiKeyRef}`);
}

// ── Scenario 8d: true concurrent same-provider via Promise.all (queue serializes) ─
{
  const h = createTestHarness();
  // Fire two setApiKey calls without awaiting (truly concurrent from caller side)
  const a = h.service.setApiKey('openai-gpt5', 'sk-A');
  const b = h.service.setApiKey('openai-gpt5', 'sk-B');
  const [outA, outB] = await Promise.all([a, b]);
  check('8d. concurrent same-provider Promise.all: both complete (queue serializes them)',
    outA.ok && outB.ok,
    `A=${JSON.stringify(outA)}, B=${JSON.stringify(outB)}`);
  const vault = h.getVaultEntries();
  // No "leftover" from the first call: only the last call's ref should be present
  const fooRefs = Object.keys(vault).filter((k) => refBelongsToProvider(k, 'openai-gpt5'));
  check('8e. concurrent same-provider: only one ref for openai-gpt5 (no leftover snapshot from first call)',
    fooRefs.length === 1,
    `foo refs=${fooRefs.join(',')}, all=${Object.keys(vault).sort().join(',')}`);
  const settings = h.getSettings();
  const provider = settings.modelProviders.providers.find((p) => p.instanceId === 'openai-gpt5');
  check('8f. concurrent same-provider: persisted ref is whichever call won the queue',
    provider?.apiKeyRef === fooRefs[0],
    `provider.apiKeyRef=${provider?.apiKeyRef}, vault winner=${fooRefs[0]}`);
}

// ── Scenario 9: settings:update + api-key:set concurrent: both fields preserved ─
{
  const h = createTestHarness();
  // Start two mutations without awaiting
  const updateP = h.service.updateSettings({
    assistant: { name: 'UpdatedAssistant' },
    appearance: { theme: 'github-dark' },
  });
  const setKeyP = h.service.setApiKey('openai-gpt5', 'sk-concurrent');
  const [updOut, setOut] = await Promise.all([updateP, setKeyP]);

  check('9. update+setApiKey concurrent: both complete successfully',
    updOut.ok && setOut.ok,
    `upd=${JSON.stringify(updOut)}, set=${JSON.stringify(setOut)}`);
  const settings = h.getSettings();
  check('9b. update+setApiKey concurrent: ordinary fields from update are persisted',
    settings.assistant.name === 'UpdatedAssistant' && settings.appearance.theme === 'github-dark',
    `name=${settings.assistant.name}, theme=${settings.appearance.theme}`);
  const provider = settings.modelProviders.providers.find((p) => p.instanceId === 'openai-gpt5');
  check('9c. update+setApiKey concurrent: apiKeyRef from setApiKey is persisted',
    provider?.apiKeyRef === setOut.apiKeyRef,
    `provider.apiKeyRef=${provider?.apiKeyRef}, set.apiKeyRef=${setOut.apiKeyRef}`);
}

// ── Scenario 9d: provider update preserves authoritative refs and complete objects ─
{
  const h = createTestHarness();
  await h.service.setApiKey('openai-gpt5', 'sk-original');
  const originalRef = h.getSettings().modelProviders.providers.find((p) => p.instanceId === 'openai-gpt5').apiKeyRef;
  const currentProviders = h.getSettings().modelProviders.providers;

  // Try to forge a different ref via a partial provider update.
  const out = await h.service.updateSettings({
    modelProviders: {
      providers: currentProviders.map((provider) =>
        provider.instanceId === 'openai-gpt5'
          ? { instanceId: 'openai-gpt5', displayName: 'Renamed OpenAI', apiKeyRef: 'vault-otherprovider-1234' }
          : provider),
    },
  });
  check('9d. settings:update safely merges a partial existing provider object',
    out.ok &&
      out.settings.modelProviders.providers.find((p) => p.instanceId === 'openai-gpt5')?.advanced?.timeout === 30,
    `out=${JSON.stringify(out)}`);
  const settings = h.getSettings();
  const provider = settings.modelProviders.providers.find((p) => p.instanceId === 'openai-gpt5');
  check('9e. settings:update cannot forge apiKeyRef and preserves the authoritative ref',
    provider?.apiKeyRef === originalRef &&
      provider?.displayName === 'Renamed OpenAI' &&
      provider?.advanced?.timeout === 30,
    `provider=${JSON.stringify(provider)}, original=${originalRef}`);
}

// ── Scenario 9f: canonical reset behavior and provider authority ─
{
  const defaults = getDefaultSettings();

  // 1. Category reset restores canonical defaults without touching provider refs.
  {
    const h = createTestHarness();
    await h.service.setApiKey('openai-gpt5', 'sk-reset-category');
    const ref = h.getSettings().modelProviders.providers.find((p) => p.instanceId === 'openai-gpt5').apiKeyRef;
    await h.service.updateSettings({ appearance: { theme: 'github-dark' } });
    const out = await h.service.resetSettings(['appearance']);
    const settings = h.getSettings();
    check('9f-1. appearance category reset restores the canonical default and preserves provider ref',
      out.ok &&
        settings.appearance.theme === defaults.appearance.theme &&
        settings.modelProviders.providers.find((p) => p.instanceId === 'openai-gpt5')?.apiKeyRef === ref,
      `out=${JSON.stringify(out)}, theme=${settings.appearance.theme}`);
  }

  // 2. Full reset restores ordinary categories to canonical defaults.
  {
    const h = createTestHarness();
    await h.service.updateSettings({
      general: { startupBehavior: 'new-session' },
      assistant: { name: 'Changed Assistant' },
      appearance: { theme: 'github-dark' },
    });
    const out = await h.service.resetSettings();
    const settings = h.getSettings();
    check('9f-2. full reset restores ordinary canonical defaults',
      out.ok &&
        settings.general.startupBehavior === defaults.general.startupBehavior &&
        settings.assistant.name === defaults.assistant.name &&
        settings.appearance.theme === defaults.appearance.theme,
      `out=${JSON.stringify(out)}`);
  }

  // 3. modelProviders reset restores built-in config while preserving persisted refs.
  {
    const initial = getDefaultSettings();
    initial.modelProviders.providers[0].baseUrl = 'https://custom.example/v1';
    const h = createTestHarness({ initialSettings: initial });
    await h.service.setApiKey('openai-gpt5', 'sk-reset-provider');
    const ref = h.getSettings().modelProviders.providers.find((p) => p.instanceId === 'openai-gpt5').apiKeyRef;
    const out = await h.service.resetSettings(['modelProviders']);
    const provider = h.getSettings().modelProviders.providers.find((p) => p.instanceId === 'openai-gpt5');
    check('9f-3. modelProviders reset uses built-in canonical config and preserves persisted ref by instanceId',
      out.ok &&
        provider?.baseUrl === getDefaultProvider('openai-gpt5').baseUrl &&
        provider?.apiKeyRef === ref,
      `out=${JSON.stringify(out)}, provider=${JSON.stringify(provider)}`);
  }

  // 4. Full reset retains custom providers and their persisted/session keys.
  {
    const customPersisted = makeCompleteProvider('custom-persisted', {
      baseUrl: 'https://custom.persisted/v1',
      apiKeyRef: buildVaultRef('custom-persisted', 1_700_000_000_010),
    });
    const initial = getDefaultSettings();
    initial.modelProviders.providers[0].baseUrl = 'https://changed-built-in/v1';
    initial.modelProviders.providers.push(customPersisted);
    const h = createTestHarness({ initialSettings: initial, safeStorageAvailable: false });
    const customSession = makeCompleteProvider('custom-session', { baseUrl: 'https://custom.session/v1' });
    const withSessionProvider = h.getSettings();
    withSessionProvider.modelProviders.providers.push(customSession);
    h.setSettings(withSessionProvider);
    await h.service.setApiKey('custom-session', 'sk-session-reset');
    const sessionRef = h.session.inMemoryApiKeys.get('custom-session')?.ref;
    const out = await h.service.resetSettings();
    const settings = h.getSettings();
    const persistedAfter = settings.modelProviders.providers.find((p) => p.instanceId === 'custom-persisted');
    const sessionAfter = settings.modelProviders.providers.find((p) => p.instanceId === 'custom-session');
    check('9f-4. reset retains custom providers plus persisted and session key ownership',
      out.ok &&
        persistedAfter?.baseUrl === customPersisted.baseUrl &&
        persistedAfter?.apiKeyRef === customPersisted.apiKeyRef &&
        sessionAfter?.baseUrl === customSession.baseUrl &&
        h.session.inMemoryApiKeys.get('custom-session')?.ref === sessionRef &&
        settings.modelProviders.providers.find((p) => p.instanceId === 'openai-gpt5')?.baseUrl === getDefaultProvider('openai-gpt5').baseUrl,
      `out=${JSON.stringify(out)}, providers=${JSON.stringify(settings.modelProviders.providers)}`);
  }

  // Reset write failure must retain current state.
  {
    const h = createTestHarness();
    await h.service.updateSettings({ appearance: { theme: 'github-dark' } });
    h.injectSettingsWriteFail('reset write failed');
    const out = await h.service.resetSettings(['appearance']);
    check('9f-5. reset write failure preserves the current state',
      !out.ok &&
        out.settings.appearance.theme === 'github-dark' &&
        h.getSettings().appearance.theme === 'github-dark',
      `out=${JSON.stringify(out)}`);
  }
}

// ── Scenario 9g: provider arrays normalize by instanceId ──────────
{
  // 5. Omitting apiKeyRef still preserves the current ref.
  {
    const h = createTestHarness();
    await h.service.setApiKey('openai-gpt5', 'sk-omit-ref');
    const before = h.getSettings();
    const ref = before.modelProviders.providers.find((p) => p.instanceId === 'openai-gpt5').apiKeyRef;
    const out = await h.service.updateSettings({
      modelProviders: {
        providers: before.modelProviders.providers.map((provider) =>
          provider.instanceId === 'openai-gpt5'
            ? { instanceId: provider.instanceId, displayName: 'Omitted Ref Provider' }
            : withoutApiKeyRef(provider)),
      },
    });
    const after = h.getSettings().modelProviders.providers.find((p) => p.instanceId === 'openai-gpt5');
    check('9g-1. provider update omitting apiKeyRef preserves authoritative ref and complete fields',
      out.ok &&
        after?.apiKeyRef === ref &&
        after?.displayName === 'Omitted Ref Provider' &&
        after?.advanced?.timeout === 30,
      `out=${JSON.stringify(out)}, provider=${JSON.stringify(after)}`);
  }

  // 6. Reordering providers keeps refs attached to instanceId.
  {
    const h = createTestHarness();
    const openaiOut = await h.service.setApiKey('openai-gpt5', 'sk-openai-reorder');
    const anthropicOut = await h.service.setApiKey('anthropic-claude4', 'sk-anthropic-reorder');
    const reversed = h.getSettings().modelProviders.providers.slice().reverse().map(withoutApiKeyRef);
    const out = await h.service.updateSettings({ modelProviders: { providers: reversed } });
    const after = h.getSettings().modelProviders.providers;
    check('9g-2. provider reorder preserves refs by instanceId',
      out.ok &&
        after[0].instanceId === 'google-gemini3' &&
        after.find((p) => p.instanceId === 'openai-gpt5')?.apiKeyRef === openaiOut.apiKeyRef &&
        after.find((p) => p.instanceId === 'anthropic-claude4')?.apiKeyRef === anthropicOut.apiKeyRef,
      `out=${JSON.stringify(out)}, providers=${JSON.stringify(after)}`);
  }

  // 7. A new provider must not inherit the old provider's same-index ref.
  {
    const h = createTestHarness();
    await h.service.setApiKey('openai-gpt5', 'sk-index-owner');
    const before = h.getSettings();
    const newProvider = makeCompleteProvider('custom-new', {
      apiKeyRef: buildVaultRef('custom-new', 1_700_000_000_020),
    });
    const out = await h.service.updateSettings({
      modelProviders: {
        providers: [newProvider, ...before.modelProviders.providers.map(withoutApiKeyRef)],
      },
    });
    const after = h.getSettings().modelProviders.providers;
    check('9g-3. new provider does not inherit a ref from the provider previously at the same index',
      out.ok &&
        after.find((p) => p.instanceId === 'custom-new')?.apiKeyRef === undefined &&
        after.find((p) => p.instanceId === 'openai-gpt5')?.apiKeyRef ===
          before.modelProviders.providers.find((p) => p.instanceId === 'openai-gpt5')?.apiKeyRef,
      `out=${JSON.stringify(out)}, providers=${JSON.stringify(after)}`);
  }

  // 8. Forged, mem, empty, and omitted refs cannot replace the current ref.
  {
    const candidates = [
      buildVaultRef('anthropic-claude4', 1_700_000_000_030),
      buildMemVaultRef('openai-gpt5', 1_700_000_000_031),
      '',
      undefined,
    ];
    let allPreserved = true;
    const details = [];
    for (const candidate of candidates) {
      const h = createTestHarness();
      await h.service.setApiKey('openai-gpt5', 'sk-authoritative');
      const before = h.getSettings();
      const ref = before.modelProviders.providers.find((p) => p.instanceId === 'openai-gpt5').apiKeyRef;
      const providers = before.modelProviders.providers.map((provider) => {
        const clean = withoutApiKeyRef(provider);
        return provider.instanceId === 'openai-gpt5' && candidate !== undefined
          ? { ...clean, apiKeyRef: candidate }
          : clean;
      });
      const out = await h.service.updateSettings({ modelProviders: { providers } });
      const afterRef = h.getSettings().modelProviders.providers.find((p) => p.instanceId === 'openai-gpt5')?.apiKeyRef;
      const preserved = out.ok && afterRef === ref;
      allPreserved = allPreserved && preserved;
      details.push(`${String(candidate)}:${preserved}`);
    }
    check('9g-4. forged, mem, empty, and omitted refs cannot replace the authoritative ref',
      allPreserved,
      details.join(', '));
  }

  // 9. Persisted or session keys block provider removal through ordinary update.
  {
    const persisted = createTestHarness();
    await persisted.service.setApiKey('openai-gpt5', 'sk-remove-persisted');
    const persistedBefore = persisted.getSettings();
    const persistedOut = await persisted.service.updateSettings({
      modelProviders: {
        providers: persistedBefore.modelProviders.providers
          .filter((p) => p.instanceId !== 'openai-gpt5')
          .map(withoutApiKeyRef),
      },
    });

    const session = createTestHarness({ safeStorageAvailable: false });
    await session.service.setApiKey('openai-gpt5', 'sk-remove-session');
    const sessionBefore = session.getSettings();
    const sessionOut = await session.service.updateSettings({
      modelProviders: {
        providers: sessionBefore.modelProviders.providers.filter((p) => p.instanceId !== 'openai-gpt5'),
      },
    });

    check('9g-5. ordinary update rejects removal of providers with persisted or session keys',
      !persistedOut.ok &&
        !sessionOut.ok &&
        persisted.getSettings().modelProviders.providers.some((p) => p.instanceId === 'openai-gpt5') &&
        session.getSettings().modelProviders.providers.some((p) => p.instanceId === 'openai-gpt5'),
      `persisted=${JSON.stringify(persistedOut)}, session=${JSON.stringify(sessionOut)}`);
  }

  // 10. Partial existing provider entries merge safely; partial new providers are rejected.
  {
    const h = createTestHarness();
    const before = h.getSettings();
    const mergedOut = await h.service.updateSettings({
      modelProviders: {
        providers: before.modelProviders.providers.map((provider) =>
          provider.instanceId === 'openai-gpt5'
            ? { instanceId: provider.instanceId, advanced: { timeout: 99 } }
            : provider),
      },
    });
    const merged = h.getSettings().modelProviders.providers.find((p) => p.instanceId === 'openai-gpt5');
    const incompleteOut = await h.service.updateSettings({
      modelProviders: {
        providers: [...h.getSettings().modelProviders.providers, { instanceId: 'custom-incomplete' }],
      },
    });
    check('9g-6. partial existing provider merges to a complete object and partial new provider is rejected',
      mergedOut.ok &&
        merged?.advanced.timeout === 99 &&
        merged?.advanced.retries === 3 &&
        merged?.baseUrl === getDefaultProvider('openai-gpt5').baseUrl &&
        !incompleteOut.ok &&
        !h.getSettings().modelProviders.providers.some((p) => p.instanceId === 'custom-incomplete'),
      `merged=${JSON.stringify(mergedOut)}, incomplete=${JSON.stringify(incompleteOut)}`);
  }

  // 11. Duplicate instanceIds are rejected without changing state.
  {
    const h = createTestHarness();
    const before = h.getSettings();
    const duplicateOut = await h.service.updateSettings({
      modelProviders: {
        providers: [...before.modelProviders.providers, clone(before.modelProviders.providers[0])],
      },
    });
    check('9g-7. duplicate provider instanceId is rejected and current state is retained',
      !duplicateOut.ok &&
        h.getSettings().modelProviders.providers.length === before.modelProviders.providers.length,
      `out=${JSON.stringify(duplicateOut)}`);
  }
}

// ── Scenario 10: rename retry still uses the production production helper ─
{
  const TRANSIENT = new Set(['EPERM', 'EBUSY', 'EACCES', 'ETXTBSY']);
  // 10a. transient × 2 then success
  {
    const delays = [];
    let calls = 0;
    const rename = async (_t, _d) => {
      calls += 1;
      if (calls <= 2) {
        const err = new Error(`transient ${calls}`);
        err.code = 'EPERM';
        throw err;
      }
    };
    const sleep = async (ms) => { delays.push(ms); };
    const r = await runRenameWithRetry('tmp', 'dst', { rename, sleep, maxAttempts: 5, baseDelayMs: 50, transientErrnoCodes: TRANSIENT });
    check('10. renameWithRetry: 2 transient errors then success → 3 attempts, delays 50,100',
      r.ok && r.attempts === 3 && delays.length === 2 && delays[0] === 50 && delays[1] === 100,
      `attempts=${r.attempts}, delays=${delays.join(',')}`);
  }
  // 10b. persistent transient → exhausts retries
  {
    const delays = [];
    let calls = 0;
    const rename = async () => {
      calls += 1;
      const err = new Error('busy');
      err.code = 'EBUSY';
      throw err;
    };
    const sleep = async (ms) => { delays.push(ms); };
    const r = await runRenameWithRetry('tmp', 'dst', { rename, sleep, maxAttempts: 5, baseDelayMs: 50, transientErrnoCodes: TRANSIENT });
    check('10b. renameWithRetry: persistent transient → 5 attempts, 4 backoff delays',
      !r.ok && r.attempts === 5 && delays.length === 4 && delays.join(',') === '50,100,200,400' && r.error,
      `attempts=${r.attempts}, delays=${delays.join(',')}`);
  }
  // 10c. non-transient → no retry
  {
    const delays = [];
    let calls = 0;
    const rename = async () => {
      calls += 1;
      const err = new Error('disk full');
      err.code = 'ENOSPC';
      throw err;
    };
    const sleep = async (ms) => { delays.push(ms); };
    const r = await runRenameWithRetry('tmp', 'dst', { rename, sleep, maxAttempts: 5, baseDelayMs: 50, transientErrnoCodes: TRANSIENT });
    check('10c. renameWithRetry: non-transient ENOSPC → 1 attempt, no retry',
      !r.ok && r.attempts === 1 && delays.length === 0 && r.error?.code === 'ENOSPC',
      `attempts=${r.attempts}, delays=${delays.join(',')}`);
  }
}

// ── Scenario 11: schema cross-field owner check (sanitize persisted file) ─
{
  // foo + vault-bar-* → REJECTED (parsed owner "bar" does not match instanceId "foo")
  const sanitizeFooWithBarRef = sanitizeSettingsFile({
    modelProviders: {
      providers: [
        makeCompleteProvider('foo', { apiKeyRef: 'vault-bar-1700000000000' }),
      ],
    },
  });
  check('11. schema rejects foo + vault-bar-* (cross-field owner mismatch)',
    !sanitizeFooWithBarRef.ok && sanitizeFooWithBarRef.errors.some((e) => e.path.includes('apiKeyRef') && /bar/.test(e.message)),
    JSON.stringify(sanitizeFooWithBarRef.errors));

  // foo-bar + vault-foo-bar-* → ACCEPTED (parsed owner "foo-bar" matches instanceId "foo-bar")
  const sanitizeFooBar = sanitizeSettingsFile({
    modelProviders: {
      providers: [
        makeCompleteProvider('foo-bar', { apiKeyRef: 'vault-foo-bar-1700000000000' }),
      ],
    },
  });
  check('11b. schema accepts foo-bar + vault-foo-bar-* (owner match)',
    sanitizeFooBar.ok,
    JSON.stringify(sanitizeFooBar.errors));

  // mem-vault-* → REJECTED even with matching instanceId
  const sanitizeMem = sanitizeSettingsFile({
    modelProviders: {
      providers: [
        makeCompleteProvider('openai-gpt5', { apiKeyRef: 'mem-vault-openai-gpt5-1700000000000' }),
      ],
    },
  });
  check('11c. schema rejects mem-vault-* in persisted file (session ref forbidden)',
    !sanitizeMem.ok && sanitizeMem.errors.some((e) => e.path.includes('apiKeyRef') && /mem-vault/.test(e.message)),
    JSON.stringify(sanitizeMem.errors));

  // malformed ref → REJECTED
  const sanitizeMalformed = sanitizeSettingsFile({
    modelProviders: {
      providers: [
        makeCompleteProvider('openai-gpt5', { apiKeyRef: 'not-a-vault-ref' }),
      ],
    },
  });
  check('11d. schema rejects malformed apiKeyRef',
    !sanitizeMalformed.ok && sanitizeMalformed.errors.some((e) => e.path.includes('apiKeyRef')),
    JSON.stringify(sanitizeMalformed.errors));

  // empty apiKeyRef → accepted (no ref set is valid)
  const sanitizeEmpty = sanitizeSettingsFile({
    modelProviders: {
      providers: [
        makeCompleteProvider('openai-gpt5', { apiKeyRef: '' }),
      ],
    },
  });
  check('11e. schema accepts empty apiKeyRef (= no ref)',
    sanitizeEmpty.ok,
    JSON.stringify(sanitizeEmpty.errors));

  const sanitizeIncomplete = sanitizeSettingsFile({
    modelProviders: {
      providers: [
        { instanceId: 'openai-gpt5' },
      ],
    },
  });
  check('11f. schema rejects persisted provider entries missing required fields',
    !sanitizeIncomplete.ok &&
      sanitizeIncomplete.errors.some((e) => e.path.includes('modelProviders.providers[0]') && /required/.test(e.message)),
    JSON.stringify(sanitizeIncomplete));

  const sanitizeDuplicate = sanitizeSettingsFile({
    modelProviders: {
      providers: [
        makeCompleteProvider('duplicate-provider'),
        makeCompleteProvider('duplicate-provider'),
      ],
    },
  });
  check('11g. schema rejects duplicate persisted provider instanceIds',
    !sanitizeDuplicate.ok &&
      sanitizeDuplicate.errors.some((e) => e.path.includes('instanceId') && /duplicate/i.test(e.message)),
    JSON.stringify(sanitizeDuplicate));
}

// ── Scenario 12: production main settings actually wire to the service (static scan) ─
{
  const fs2 = require('node:fs');
  const settingsShellSrc = fs2.readFileSync(path.join(desktopRoot, 'src', 'main', 'settings', 'settings-shell.ts'), 'utf-8');
  const settingsStoreSrc = fs2.readFileSync(path.join(desktopRoot, 'src', 'main', 'settings', 'settingsStore.ts'), 'utf-8');
  const settingsSchemaSrc = fs2.readFileSync(path.join(desktopRoot, 'src', 'main', 'settings', 'settingsSchema.ts'), 'utf-8');
  const apiKeyVaultSrc = fs2.readFileSync(path.join(desktopRoot, 'src', 'main', 'settings', 'apiKeyVault.ts'), 'utf-8');
  const serviceSrc = fs2.readFileSync(path.join(desktopRoot, 'src', 'main', 'settings', 'settingsMutationService.ts'), 'utf-8');

  check('12. settings-shell.ts constructs the production service and delegates',
    settingsShellSrc.includes('createSettingsMutationService') &&
    settingsShellSrc.includes('service.updateSettings(') &&
    settingsShellSrc.includes('service.resetSettings(') &&
    settingsShellSrc.includes('service.setApiKey(') &&
    settingsShellSrc.includes('service.clearApiKey(') &&
    !settingsShellSrc.includes('setSettingsWriteInjector'),
    'shell delegates to service; no global write injector');

  check('12b. settingsStore.ts no longer exports updateSettings/resetSettings (moved to service)',
    !/export\s+async\s+function\s+updateSettings\s*\(/.test(settingsStoreSrc) &&
    !/export\s+async\s+function\s+resetSettings\s*\(/.test(settingsStoreSrc),
    'updateSettings/resetSettings removed from settingsStore');

  check('12c. settingsSchema.ts no longer has API_KEY_REF_PATTERN (uses shared parseVaultRef)',
    !/API_KEY_REF_PATTERN/.test(settingsSchemaSrc) &&
    settingsSchemaSrc.includes('parseVaultRef(') &&
    settingsSchemaSrc.includes('refIsMemOnly(') &&
    settingsSchemaSrc.includes('refBelongsToProvider(') &&
    settingsSchemaSrc.includes('validateProviderApiKeyRefOwner('),
    'schema uses shared ref parser + cross-field owner check');

  check('12d. apiKeyVault.ts uses refBelongsToProvider (no startsWith prefix matching)',
    apiKeyVaultSrc.includes('refBelongsToProvider(') &&
    !/startsWith\(\s*['"`]vault-/.test(apiKeyVaultSrc),
    'no startsWith("vault-") prefix matching in apiKeyVault');

  check('12e. settingsMutationService.ts holds a single shared mutex (chain promise)',
    serviceSrc.includes('chainTail') &&
    serviceSrc.includes('chainTail.then(fn, fn)') &&
    serviceSrc.includes('chainTail = next.catch'),
    'single shared mutex for all 4 mutations');
}

// ── Scenario 13: shared index re-exports the public surface used by tests ─
{
  const required = [
    'runRenameWithRetry',
    'buildVaultRef',
    'buildMemVaultRef',
    'parseVaultRef',
    'refBelongsToProvider',
    'validateProviderInstanceId',
    'PROVIDER_INSTANCE_ID_PATTERN',
  ];
  const missing = required.filter((n) => !(n in shared));
  check('13. shared-protocol index re-exports the helpers used by desktop + tests',
    missing.length === 0,
    missing.join(', '));
}

// ── Scenario 14: shared-protocol has dual ESM + CJS build artifacts + marker ─
{
  const fs2 = require('node:fs');
  const esmIndex = path.join(sharedRoot, 'dist', 'index.js');
  const cjsIndex = path.join(sharedRoot, 'dist-cjs', 'index.js');
  const cjsMarker = path.join(sharedRoot, 'dist-cjs', 'package.json');
  check('14. shared-protocol ESM build present and uses export syntax',
    fs2.existsSync(esmIndex) && /^export\s/m.test(fs2.readFileSync(esmIndex, 'utf-8')),
    esmIndex);
  check('14b. shared-protocol CJS build present and uses require + Object.defineProperty',
    fs2.existsSync(cjsIndex) &&
    fs2.readFileSync(cjsIndex, 'utf-8').includes('require(') &&
    fs2.readFileSync(cjsIndex, 'utf-8').includes('Object.defineProperty'),
    cjsIndex);
  const marker = JSON.parse(fs2.readFileSync(cjsMarker, 'utf-8'));
  check('14c. shared-protocol dist-cjs/package.json marker overrides type to commonjs',
    marker && marker.type === 'commonjs',
    JSON.stringify(marker));
  // Verify the CJS entry can be require'd cleanly (this is what Electron does)
  let canRequire = true;
  let cjsError = '';
  try {
    require(cjsIndex);
  } catch (err) {
    canRequire = false;
    cjsError = err instanceof Error ? err.message : String(err);
  }
  check('14d. shared-protocol CJS entry is require()-able (no ERR_REQUIRE_ESM)',
    canRequire,
    cjsError);
}

// ── Scenario 15: CJS marker is generated by build helper (build helper present) ─
{
  const fs2 = require('node:fs');
  const helper = path.join(sharedRoot, 'scripts', 'build-cjs-marker.mjs');
  const pkgJson = JSON.parse(fs2.readFileSync(path.join(sharedRoot, 'package.json'), 'utf-8'));
  check('15. build-cjs-marker.mjs script present',
    fs2.existsSync(helper),
    helper);
  check('15b. package.json build chain includes build-cjs-marker (so marker is always regenerated)',
    typeof pkgJson.scripts === 'object' &&
    typeof pkgJson.scripts.build === 'string' &&
    pkgJson.scripts.build.includes('build-cjs-marker.mjs') &&
    typeof pkgJson.scripts['build:cjs'] === 'string' &&
    pkgJson.scripts['build:cjs'].includes('build-cjs-marker.mjs'),
    JSON.stringify(pkgJson.scripts));
  check('15c. package.json files include dist-cjs (CJS runtime shippable)',
    Array.isArray(pkgJson.files) && pkgJson.files.includes('dist-cjs'),
    JSON.stringify(pkgJson.files));
}

// ── Scenario 16: deep missing fields filled with defaults (smoke for defaults + merge) ─
{
  const defaults = getDefaultSettings();
  const partial = { appearance: { theme: 'light' } };
  const merged = deepMergeSettings(defaults, partial);
  check('16. deep missing fields filled with defaults',
    merged.appearance.theme === 'light' &&
    merged.appearance.density === 'comfortable' &&
    merged.appearance.layouts.showLeftRail === true &&
    merged.general.startupBehavior === 'restore-last' &&
    merged.modelProviders.providers.length === 4,
    `theme=${merged.appearance.theme}, density=${merged.appearance.density}, providers=${merged.modelProviders.providers.length}`);
}

// ── Scenario 17: unknown fields not injected; invalid enum rejected (smoke) ─
{
  const sanitized = sanitizeSettingsFile({ general: { startupBehavior: 'restore-last', bogus: 123 }, unknownTop: { x: 1 }, appearance: { theme: 'ue-agent', extra: true } });
  check('17. unknown fields not injected (file sanitize)',
    sanitized.ok && !('unknownTop' in sanitized.data) && !('bogus' in (sanitized.data.general ?? {})),
    JSON.stringify(sanitized));
  const badEnum = validateSettings({ appearance: { theme: 'neon-pink' } });
  check('17b. invalid enum rejected (patch validate)',
    !badEnum.ok,
    JSON.stringify(badEnum));
}

// ── Report ──────────────────────────────────────────────────────────
console.log('=== Settings unit validation ===');
for (const r of results) {
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? ' :: ' + r.detail : ''}`);
}
console.log(`\n${results.length - failures}/${results.length} passed, ${failures} failed`);
if (failures > 0) {
  process.exit(1);
}
