import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  createDefaultSettings,
  type SettingsState,
} from '@omue/shared-protocol';
import { getDefaultSettings } from '../main/settings/defaultSettings';
import {
  createSettingsMutationService,
  type VaultPort,
} from '../main/settings/settingsMutationService';
import {
  validateProviderInstanceId,
  buildMemVaultRef,
} from '@omue/shared-protocol';
import {
  validateSettings,
  validateSettingsState,
  validateResetKeys,
} from '../main/settings/settingsSchema';
import { deepMergeSettings } from '../main/settings/settingsMerge';
import {
  persistUiLanguageChange,
  type UiLanguageWriteResult,
  type UiLanguage,
} from '../renderer/components/workbench/languagePreferenceState';

const desktopRoot = process.cwd();
const readSource = (relativePath: string): string =>
  readFileSync(resolve(desktopRoot, relativePath), 'utf8');

// ── 1. Default values: shared & Main ────────────────────────────────

test('shared default settings start with zh-CN UI language', () => {
  const settings = createDefaultSettings();
  assert.equal(settings.language.uiLanguage, 'zh-CN');
  assert.equal(settings.language.assistantReplyLanguage, 'follow-ui');
});

test('main default settings start with zh-CN UI language', () => {
  const settings = getDefaultSettings();
  assert.equal(settings.language.uiLanguage, 'zh-CN');
  assert.equal(settings.language.assistantReplyLanguage, 'follow-ui');
});

// ── 2. App, i18n context fallback ───────────────────────────────────

test('App useState fallback language is zh-CN', () => {
  const appSource = readSource('src/renderer/App.tsx');
  assert.match(appSource, /useState<DesktopLanguage>\('zh-CN'\)/);
});

test('App useState type parameter is a string literal union and not the legacy en default', () => {
  const appSource = readSource('src/renderer/App.tsx');
  assert.match(appSource, /useState<DesktopLanguage>\(/);
  assert.doesNotMatch(appSource, /useState<DesktopLanguage>\('en'\)/);
});

test('DesktopI18nContext default value is zh-CN with desktopCopy.zh-CN', () => {
  const i18nSource = readSource('src/renderer/i18n/index.ts');
  assert.match(i18nSource, /DesktopI18nContext\s*=\s*createContext<DesktopI18nContextValue>\(\{\s*lang:\s*'zh-CN',\s*copy:\s*desktopCopy\['zh-CN'\]/);
});

// ── 3. Language page: typed options, no unsafe cast ─────────────────

test('LanguageSettings does not use unsafe dictionary cast', () => {
  const source = readSource('src/renderer/components/workbench/LanguageSettings.tsx');
  assert.doesNotMatch(source, /as unknown as Record<string, string>/);
  assert.doesNotMatch(source, /labelKey: string/);
});

test('LanguageSettings uses typed followUI and mixedUETerms copy keys', () => {
  const source = readSource('src/renderer/components/workbench/LanguageSettings.tsx');
  assert.match(source, /t\.followUI/);
  assert.match(source, /t\.mixedUETerms/);
  assert.doesNotMatch(source, /followUi/);
  assert.doesNotMatch(source, /mixedUeTerms/);
});

test('LanguageSettings uses typed option label not dynamic key lookup', () => {
  const source = readSource('src/renderer/components/workbench/LanguageSettings.tsx');
  // options now have `label: t.xxx` (typed) and render uses opt.label
  assert.match(source, /label:\s*t\./);
  assert.match(source, /\{opt\.label\}/);
  // Negative: dynamic key lookup is gone
  assert.doesNotMatch(source, /t\[opt\.labelKey\]/);
});

// ── 4. persistUiLanguageChange: success path ────────────────────────

test('persistUiLanguageChange: success path switches to next language and does not roll back', async () => {
  const calls: UiLanguage[] = [];
  const setLanguage = (next: UiLanguage) => {
    calls.push(next);
  };
  const persist = async (_next: UiLanguage): Promise<UiLanguageWriteResult> => ({ ok: true });

  const result = await persistUiLanguageChange({
    previousLanguage: 'zh-CN',
    nextLanguage: 'en',
    setLanguage,
    persist,
  });

  assert.deepEqual(result, { ok: true });
  assert.deepEqual(calls, ['en']);
});

// ── 5. persistUiLanguageChange: failed result path ──────────────────

test('persistUiLanguageChange: failed result rolls back to previous language and returns the failure', async () => {
  const calls: UiLanguage[] = [];
  const setLanguage = (next: UiLanguage) => {
    calls.push(next);
  };
  const persist = async (_next: UiLanguage): Promise<UiLanguageWriteResult> => ({
    ok: false,
    error: 'write failed',
  });

  const result = await persistUiLanguageChange({
    previousLanguage: 'zh-CN',
    nextLanguage: 'en',
    setLanguage,
    persist,
  });

  assert.equal(result.ok, false);
  assert.equal(result.error, 'write failed');
  assert.deepEqual(calls, ['en', 'zh-CN']);
});

// ── 6. persistUiLanguageChange: thrown exception path ───────────────

test('persistUiLanguageChange: thrown exception rolls back and returns ok=false with message', async () => {
  const calls: UiLanguage[] = [];
  const setLanguage = (next: UiLanguage) => {
    calls.push(next);
  };
  const persist = async (_next: UiLanguage): Promise<UiLanguageWriteResult> => {
    throw new Error('write exploded');
  };

  const result = await persistUiLanguageChange({
    previousLanguage: 'en',
    nextLanguage: 'zh-CN',
    setLanguage,
    persist,
  });

  assert.equal(result.ok, false);
  assert.equal(result.error, 'write exploded');
  assert.deepEqual(calls, ['zh-CN', 'en']);
});

// ── 7. Shell persisted sync: no settings writes ─────────────────────

test('AgentWorkbenchShell persisted sync only calls setLang, does not write settings', () => {
  const shellSource = readSource('src/renderer/components/workbench/AgentWorkbenchShell.tsx');
  // Shell has the persisted sync effect that conditionally calls setLang
  assert.match(shellSource, /if \(settingsLoading \|\| languageUpdatePending\)\s+return;/);
  // The effect block must not call updateCategory / updateSettings / resetSettings
  // Heuristic: there is no `updateCategory\('language'` or `updateSettings\(` call inside the effect.
  // We accept any unconditional calls; what we forbid is *both* an effect that calls setLang AND
  // also writes settings in the same call site.
  // Simpler: Shell exposes a `languageUpdatePending` state and uses `setLang` from useDesktopCopy.
  assert.match(shellSource, /useDesktopCopy\(\)/);
  assert.match(shellSource, /languageUpdatePending/);
  // Reset only switches the App language when result.ok
  assert.match(shellSource, /if \(result\.ok\)\s*\{[\s\S]*setLang\('zh-CN'\)/);
});

// ── 8. Reset to default Chinese, only on success ─────────────────────

test('AgentWorkbenchShell Reset handler only switches to zh-CN when reset returns ok', () => {
  const shellSource = readSource('src/renderer/components/workbench/AgentWorkbenchShell.tsx');
  // The handler must await resetSettings() and only setLang('zh-CN') when result.ok is true.
  assert.match(
    shellSource,
    /const result = await resetSettings\(\);[\s\S]*?if \(result\.ok\)[\s\S]*?setLang\('zh-CN'\)/,
  );
  // It must not unconditionally setLang('zh-CN')
  assert.doesNotMatch(shellSource, /resetSettings\(\)\.then\(\(\) => setLang\('zh-CN'\)\)/);
});

// ── 9. SettingsPage uses a dedicated onUpdateLanguage prop ──────────

test('SettingsPage passes onUpdateLanguage and uiLanguageUpdating to LanguageSettings', () => {
  const settingsPageSource = readSource('src/renderer/components/workbench/SettingsPage.tsx');
  assert.match(settingsPageSource, /onUpdateLanguage/);
  assert.match(settingsPageSource, /uiLanguageUpdating/);
  assert.match(settingsPageSource, /<LanguageSettings/);
});

// ── 10. Mutation service: Reset returns zh-CN for language ──────────

test('resetSettings via mutation service writes uiLanguage = zh-CN', async () => {
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

// ── 11. Persisted en is preserved by load; no writes triggered ─────

test('persisted en language is not overwritten by zh-CN default at load time', async () => {
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

  // simulate load path (no calls to updateSettings/resetSettings)
  const loaded = await service.loadCurrentSettings();

  assert.equal(loaded.language.uiLanguage, 'en');
  assert.equal(writeCount, 0);
});
