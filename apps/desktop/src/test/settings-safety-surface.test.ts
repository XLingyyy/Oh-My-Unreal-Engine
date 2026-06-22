import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import {
  createDefaultSettings,
  validateProviderInstanceId,
  buildMemVaultRef,
  type SettingsState,
} from '@omue/shared-protocol';
import { getDefaultSettings } from '../main/settings/defaultSettings';
import { deepMergeSettings } from '../main/settings/settingsMerge';
import {
  normalizeSettingsSafety,
  sanitizeSettingsFile,
  validateResetKeys,
  validateSettings,
  validateSettingsState,
} from '../main/settings/settingsSchema';
import {
  createSettingsMutationService,
  type VaultPort,
} from '../main/settings/settingsMutationService';

const desktopRoot = process.cwd();
const readSource = (relativePath: string): string =>
  readFileSync(resolve(desktopRoot, relativePath), 'utf8');

function unsafeSettings(): SettingsState {
  const settings = getDefaultSettings();
  settings.assistant.defaultWorkMode = 'advanced-automation';
  settings.assistant.repairBehaviors.autoRetryOnFailure = true;
  settings.assistant.repairBehaviors.requireApproval = false;
  settings.sandboxSecurity.defaultModificationMode = 'direct-write';
  settings.sandboxSecurity.writeBackConfirmations = {
    sandboxApply: false,
    promote: false,
    rollback: false,
    bulkOperation: false,
  };
  settings.sandboxSecurity.riskPolicy = 'advanced';
  settings.advanced.devToggles.bypassSandboxPromote = true;
  settings.advanced.experimentalFeatures = {
    enableAutoScan: true,
    enableMultiStepRepair: true,
    enableAutoRollback: true,
  };
  return settings;
}

function assertSafe(settings: SettingsState): void {
  assert.equal(settings.sandboxSecurity.defaultModificationMode, 'sandbox-always');
  assert.deepEqual(settings.sandboxSecurity.writeBackConfirmations, {
    sandboxApply: true,
    promote: true,
    rollback: true,
    bulkOperation: true,
  });
  assert.equal(settings.sandboxSecurity.riskPolicy, 'cautious');
  assert.equal(settings.assistant.defaultWorkMode, 'diagnosis-suggestions');
  assert.equal(settings.assistant.repairBehaviors.autoRetryOnFailure, false);
  assert.equal(settings.assistant.repairBehaviors.requireApproval, true);
  assert.equal(settings.advanced.devToggles.bypassSandboxPromote, false);
  assert.deepEqual(settings.advanced.experimentalFeatures, {
    enableAutoScan: false,
    enableMultiStepRepair: false,
    enableAutoRollback: false,
  });
}

test('historical dangerous persisted values normalize to hard-safe values', () => {
  const result = sanitizeSettingsFile(unsafeSettings());
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assertSafe(result.data as SettingsState);
});

test('direct normalization preserves schema compatibility while forcing safe values', () => {
  const normalized = normalizeSettingsSafety(unsafeSettings()) as SettingsState;
  assertSafe(normalized);
  assert.ok('bypassSandboxPromote' in normalized.advanced.devToggles);
  assert.ok('defaultModificationMode' in normalized.sandboxSecurity);
  assert.ok('requireApproval' in normalized.assistant.repairBehaviors);
});

test('main and shared default settings start from safe values', () => {
  assertSafe(getDefaultSettings());
  assertSafe(createDefaultSettings());
});

test('renderer-originated dangerous patches are normalized before persistence', async () => {
  let current = getDefaultSettings();
  let persisted: SettingsState | null = null;
  const vault: VaultPort = {
    isSafeStorageAvailable: () => false,
    isVaultCorrupt: () => false,
    setApiKey: async () => ({ ok: false, kind: 'unavailable', error: 'not used' }),
    clearApiKeyEntries: async () => ({ ok: true, changed: false }),
    snapshotProviderEntriesFor: () => ({}),
    restoreProviderEntries: async () => ({ ok: true }),
  };
  const service = createSettingsMutationService({
    loadSettings: async () => current,
    getDefaultSettings,
    writeSettings: async settings => {
      persisted = settings;
      current = settings;
      return { ok: true };
    },
    vault,
    validateSettingsPatch: validateSettings,
    validateSettingsState,
    validateResetKeys,
    validateProviderInstanceId,
    buildMemVaultRef,
    deepMergeSettings,
    nowMs: () => 1,
    session: { inMemoryApiKeys: new Map() },
  });

  const result = await service.updateSettings({
    assistant: {
      defaultWorkMode: 'advanced-automation',
      repairBehaviors: {
        autoRetryOnFailure: true,
        requireApproval: false,
      },
    },
    sandboxSecurity: {
      defaultModificationMode: 'direct-write',
      writeBackConfirmations: {
        sandboxApply: false,
        promote: false,
        rollback: false,
        bulkOperation: false,
      },
      riskPolicy: 'advanced',
    },
    advanced: {
      devToggles: { bypassSandboxPromote: true },
      experimentalFeatures: {
        enableAutoScan: true,
        enableMultiStepRepair: true,
        enableAutoRollback: true,
      },
    },
  });

  assert.equal(result.ok, true);
  assert.ok(persisted);
  assertSafe(persisted);
  if (result.ok) assertSafe(result.settings);
});

test('active Settings source exposes no enabled dangerous or unwired controls', () => {
  const sandboxSource = readSource('src/renderer/components/workbench/SandboxSecuritySettings.tsx');
  const assistantSource = readSource('src/renderer/components/workbench/AssistantSettings.tsx');
  const advancedSource = readSource('src/renderer/components/workbench/AdvancedSettings.tsx');

  assert.doesNotMatch(sandboxSource, /direct-write|directWrite/);
  assert.doesNotMatch(sandboxSource, /type=["'](?:checkbox|radio)["']|<select|onUpdate\(/);
  assert.match(sandboxSource, /sandboxAlwaysEnforced/);
  assert.match(sandboxSource, /approvalAlwaysRequired/);
  assert.match(sandboxSource, /promoteConfirmationRequired/);
  assert.match(sandboxSource, /settingsCannotOverride/);

  assert.doesNotMatch(assistantSource, /advanced-automation|autoRetryOnFailure|requireApproval/);
  assert.doesNotMatch(assistantSource, /type=["'](?:checkbox|radio)["']|<select|onUpdate\(/);
  assert.match(assistantSource, /controlsUnavailable/);
  assert.match(assistantSource, /runtimePolicyNotice/);

  assert.doesNotMatch(advancedSource, /bypassSandboxPromote/);
  assert.doesNotMatch(advancedSource, /type=["'](?:checkbox|radio)["']|<select|onUpdate\(/);
  assert.match(advancedSource, /controlsUnavailable/);
  assert.match(advancedSource, /automationUnavailable/);
});

test('provider and appearance Settings remain mounted', () => {
  const settingsPageSource = readSource('src/renderer/components/workbench/SettingsPage.tsx');
  assert.match(settingsPageSource, /case 'modelProviders'/);
  assert.match(settingsPageSource, /<ModelProviderSettings/);
  assert.match(settingsPageSource, /case 'appearance'/);
  assert.match(settingsPageSource, /<AppearanceSettings/);
});

test('real safety smoke is a real script, not echo SKIP', () => {
  const packageJson = JSON.parse(readSource('package.json')) as {
    scripts?: Record<string, string>;
  };
  const command = packageJson.scripts?.['test:agent-real-safety-smoke'];
  assert.equal(command, 'node scripts/test-agent-real-safety-smoke.mjs');
  assert.doesNotMatch(command ?? '', /echo\s+SKIP/i);
});

test('resetSettings writes uiLanguage = zh-CN (default) for full reset', async () => {
  let current: SettingsState = getDefaultSettings();
  current.language.uiLanguage = 'en';
  let persisted: SettingsState | null = null;

  const vault: VaultPort = {
    isSafeStorageAvailable: () => false,
    isVaultCorrupt: () => false,
    setApiKey: async () => ({ ok: false, kind: 'unavailable', error: 'not used' }),
    clearApiKeyEntries: async () => ({ ok: true, changed: false }),
    snapshotProviderEntriesFor: () => ({}),
    restoreProviderEntries: async () => ({ ok: true }),
  };

  const service = createSettingsMutationService({
    loadSettings: async () => current,
    getDefaultSettings,
    writeSettings: async settings => {
      persisted = settings;
      current = settings;
      return { ok: true };
    },
    vault,
    validateSettingsPatch: validateSettings,
    validateSettingsState,
    validateResetKeys,
    validateProviderInstanceId,
    buildMemVaultRef,
    deepMergeSettings,
    nowMs: () => 1,
    session: { inMemoryApiKeys: new Map() },
  });

  const result = await service.resetSettings();

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.settings.language.uiLanguage, 'zh-CN');
  const persistedAfterReset: SettingsState = ((): SettingsState => {
    if (persisted === null) {
      throw new Error('persisted settings should have been written');
    }
    return persisted;
  })();
  assert.equal(persistedAfterReset.language.uiLanguage, 'zh-CN');
});

test('persisted en uiLanguage is preserved by load; load does not write to disk', async () => {
  let current: SettingsState = getDefaultSettings();
  current.language.uiLanguage = 'en';
  let writeCount = 0;

  const vault: VaultPort = {
    isSafeStorageAvailable: () => false,
    isVaultCorrupt: () => false,
    setApiKey: async () => ({ ok: false, kind: 'unavailable', error: 'not used' }),
    clearApiKeyEntries: async () => ({ ok: true, changed: false }),
    snapshotProviderEntriesFor: () => ({}),
    restoreProviderEntries: async () => ({ ok: true }),
  };

  const service = createSettingsMutationService({
    loadSettings: async () => current,
    getDefaultSettings,
    writeSettings: async settings => {
      writeCount += 1;
      current = settings;
      return { ok: true };
    },
    vault,
    validateSettingsPatch: validateSettings,
    validateSettingsState,
    validateResetKeys,
    validateProviderInstanceId,
    buildMemVaultRef,
    deepMergeSettings,
    nowMs: () => 1,
    session: { inMemoryApiKeys: new Map() },
  });

  // simulate the load path: only read, no updateSettings/resetSettings calls
  const loaded = await service.loadCurrentSettings();

  assert.equal(loaded.language.uiLanguage, 'en');
  assert.equal(writeCount, 0);
});
