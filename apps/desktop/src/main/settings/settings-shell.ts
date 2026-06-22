import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import type {
  SettingsState,
  DeepPartial,
  SettingsCategoryId,
  SettingsGetResult,
  SettingsUpdateResult,
  SettingsResetResult,
  ApiKeySetResult,
  ApiKeyClearResult,
  TestProviderConnectionResult,
} from '@omue/shared-protocol';
import { validateProviderInstanceId, buildMemVaultRef } from '@omue/shared-protocol';
import {
  isSafeStorageAvailable,
  setApiKey,
  getApiKey,
  clearApiKeyEntries,
  isVaultCorrupt,
  restoreProviderEntries,
  snapshotProviderEntriesFor,
} from './apiKeyVault';
import { getDefaultSettings } from './defaultSettings';
import { loadSettings, writeSettings } from './settingsStore';
import { deepMergeSettings } from './settingsMerge';
import {
  isSettingsCategoryId,
  validateSettings,
  validateSettingsState,
  validateResetKeys,
} from './settingsSchema';
import {
  createSettingsMutationService,
  withProviderApiKeyRef,
  type SettingsMutationService,
  type SettingsSessionState,
  type VaultPort,
} from './settingsMutationService';
import {
  createProviderAuthorityResolver,
  toProviderReadiness,
  type ProviderAuthorityResolver,
  type ProviderReadiness,
} from './provider-authority';

interface InMemoryApiKeyEntry {
  ref: string;
  plaintext: string;
}

function createSessionState(): SettingsSessionState {
  return { inMemoryApiKeys: new Map<string, InMemoryApiKeyEntry>() };
}

const API_KEY_MAX_LEN = 4096;

function isNonEmptyString(value: unknown, maxLen: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maxLen;
}

function injectSessionMemoryKeys(settings: SettingsState, session: SettingsSessionState): SettingsState {
  if (session.inMemoryApiKeys.size === 0) return settings;
  let result = settings;
  for (const [providerInstanceId, entry] of session.inMemoryApiKeys.entries()) {
    const has = settings.modelProviders.providers.some((p) => p.instanceId === providerInstanceId);
    if (has) {
      result = withProviderApiKeyRef(result, providerInstanceId, entry.ref);
    }
  }
  return result;
}

/**
 * Build the production VaultPort backed by the real apiKeyVault module.
 * The shell-side vault port delegates to the real setApiKey /
 * clearApiKeyEntries / restoreProviderEntries / snapshotProviderEntriesFor
 * functions, with isSafeStorageAvailable and isVaultCorrupt as the
 * capability checks. The service holds the only mutation mutex; the
 * shell is a pure IPC validation + delegation layer.
 */
function buildProductionVaultPort(): VaultPort {
  return {
    isSafeStorageAvailable,
    isVaultCorrupt,
    async setApiKey(providerInstanceId, plaintext) {
      return setApiKey(providerInstanceId, plaintext);
    },
    async clearApiKeyEntries(providerInstanceId) {
      return clearApiKeyEntries(providerInstanceId);
    },
    snapshotProviderEntriesFor,
    async restoreProviderEntries(providerInstanceId, providerEntries) {
      return restoreProviderEntries(providerInstanceId, providerEntries);
    },
  };
}

export interface RegisterSettingsHandlersOptions {
  /**
   * Optional pre-built service. If omitted, the shell builds a
   * production service using the real `apiKeyVault` and `settingsStore`
   * modules plus a fresh session. Tests pass a custom service
   * constructed via `createSettingsMutationService`.
   */
  service?: SettingsMutationService;
  /**
   * Optional pre-built session state. Used when the caller wants to
   * share a session with an externally-constructed service. Ignored
   * if `service` is also provided (the service owns its session).
   */
  session?: SettingsSessionState;
}

export interface RegisteredSettingsRuntime {
  service: SettingsMutationService;
  resolveProviderAuthority: ProviderAuthorityResolver;
}

type ProviderReadinessIpcResult =
  | { ok: true; readiness: ProviderReadiness }
  | { ok: false; error: string };

export function registerSettingsHandlers(
  options: RegisterSettingsHandlersOptions = {},
): RegisteredSettingsRuntime {
  const session = options.session ?? createSessionState();
  const service =
    options.service ??
    createSettingsMutationService({
      loadSettings,
      getDefaultSettings,
      writeSettings: async (settings) => writeSettings(settings),
      vault: buildProductionVaultPort(),
      validateSettingsPatch: (patch) => validateSettings(patch),
      validateSettingsState,
      validateResetKeys: (keys) => validateResetKeys(keys),
      validateProviderInstanceId,
      buildMemVaultRef: (id, ts) => buildMemVaultRef(id, ts),
      deepMergeSettings,
      nowMs: () => Date.now(),
      session,
    });
  const authorityResolver: ProviderAuthorityResolver = createProviderAuthorityResolver(
    service,
    {
      isSafeStorageAvailable,
      isVaultCorrupt,
      getApiKey,
    },
  );

  ipcMain.handle('settings:get', async (): Promise<SettingsGetResult> => {
    try {
      const settings = await service.loadCurrentSettings();
      const safeStorageAvailable = isSafeStorageAvailable();
      const projected = injectSessionMemoryKeys(settings, service.getSession());
      return { ok: true, settings: projected, safeStorageAvailable };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Failed to load settings' };
    }
  });

  ipcMain.handle('settings:get-provider-authority', async (): Promise<ProviderReadinessIpcResult> => {
    try {
      const authority = await authorityResolver();
      return { ok: true, readiness: toProviderReadiness(authority) };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'Failed to resolve provider authority',
      };
    }
  });

  ipcMain.handle('settings:update', async (_event: IpcMainInvokeEvent, req: { patch?: unknown }): Promise<SettingsUpdateResult> => {
    if (
      !req ||
      typeof req !== 'object' ||
      !('patch' in req) ||
      typeof (req as Record<string, unknown>).patch !== 'object' ||
      (req as Record<string, unknown>).patch === null ||
      Array.isArray((req as Record<string, unknown>).patch)
    ) {
      return { ok: false, error: 'Patch must be a non-null object', settings: await loadSettings() };
    }
    try {
      return await service.updateSettings((req as { patch: DeepPartial<SettingsState> }).patch);
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Failed to update settings', settings: await loadSettings() };
    }
  });

  ipcMain.handle('settings:reset', async (_event: IpcMainInvokeEvent, req: { keys?: unknown }): Promise<SettingsResetResult> => {
    try {
      const keys = req?.keys;
      if (keys !== undefined && keys !== null) {
        if (!Array.isArray(keys)) {
          return { ok: false, error: 'keys must be an array', settings: await loadSettings() };
        }
        for (const k of keys) {
          if (!isSettingsCategoryId(k)) {
            return { ok: false, error: `Invalid reset category: ${String(k)}`, settings: await loadSettings() };
          }
        }
      }
      return await service.resetSettings(keys as SettingsCategoryId[] | undefined);
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Failed to reset settings', settings: await loadSettings() };
    }
  });

  ipcMain.handle('settings:api-key:set', async (_event: IpcMainInvokeEvent, req: unknown): Promise<ApiKeySetResult> => {
    if (!req || typeof req !== 'object') {
      return { ok: false, error: 'Invalid request' };
    }
    const r = req as { providerInstanceId?: unknown; apiKeyPlaintext?: unknown };
    const setIdErr = validateProviderInstanceId(r.providerInstanceId);
    if (setIdErr) {
      return { ok: false, error: setIdErr };
    }
    const providerInstanceId = r.providerInstanceId as string;
    if (!isNonEmptyString(r.apiKeyPlaintext, API_KEY_MAX_LEN)) {
      return { ok: false, error: 'API key must be a non-empty string' };
    }
    try {
      return await service.setApiKey(providerInstanceId, r.apiKeyPlaintext as string);
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Failed to set API key' };
    }
  });

  ipcMain.handle('settings:api-key:clear', async (_event: IpcMainInvokeEvent, req: unknown): Promise<ApiKeyClearOutcomeShape> => {
    if (!req || typeof req !== 'object') {
      return { ok: false, error: 'Invalid request' };
    }
    const r = req as { providerInstanceId?: unknown };
    const clearIdErr = validateProviderInstanceId(r.providerInstanceId);
    if (clearIdErr) {
      return { ok: false, error: clearIdErr };
    }
    try {
      return await service.clearApiKey(r.providerInstanceId as string);
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Failed to clear API key' };
    }
  });

  ipcMain.handle('settings:test-provider-connection', async (_event, req: unknown): Promise<TestProviderConnectionResult> => {
    // Real provider connection test is not implemented in this task.
    // Returning an explicit failure so the UI can display the unavailable state.
    const r = req as { providerInstanceId?: string } | undefined;
    void r;
    return {
      ok: false,
      error: 'Provider connection test is unavailable in this build (test_unavailable).',
      latencyMs: undefined,
      models: undefined,
    } as TestProviderConnectionResult;
  });

  return { service, resolveProviderAuthority: authorityResolver };
}

type ApiKeyClearOutcomeShape = ApiKeyClearResult;

export { deepMergeSettings };
