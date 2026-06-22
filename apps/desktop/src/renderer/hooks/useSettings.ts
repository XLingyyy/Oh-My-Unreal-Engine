import { useState, useCallback, useEffect, useRef } from 'react';
import type { SettingsState, SettingsCategoryId, DeepPartial, ThemeName } from '@omue/shared-protocol';
import { createDefaultSettings } from '@omue/shared-protocol';
import {
  computeRefreshOutcome,
  type SettingsApi,
  type SettingsApiResolver,
} from '@omue/shared-protocol';

type IpcSettingsApi = SettingsApi & {
  getProviderAuthority(): Promise<
    | { ok: true; readiness: ProviderReadiness }
    | { ok: false; error: string }
  >;
};

type SettingsPatch = {
  [K in keyof SettingsState]?: DeepPartial<SettingsState[K]>;
};

function getSettingsApi(): IpcSettingsApi | null {
  return (window as unknown as { omue?: { settings?: IpcSettingsApi } }).omue?.settings ?? null;
}

export interface UseSettingsResult {
  settings: SettingsState;
  providerReadiness: ProviderReadiness;
  safeStorageAvailable: boolean;
  loading: boolean;
  error: string | null;
  updateSettings: (patch: SettingsPatch) => Promise<{ ok: boolean; error?: string }>;
  updateCategory: <K extends keyof SettingsState>(category: K, values: DeepPartial<SettingsState[K]>) => Promise<{ ok: boolean; error?: string }>;
  resetSettings: (keys?: SettingsCategoryId[]) => Promise<{ ok: boolean; error?: string }>;
  refreshSettings: () => Promise<{ ok: boolean; error?: string }>;
  applyPersistedTheme: (onThemeChange: (theme: ThemeName) => void) => void;
}

async function fetchProviderReadiness(api: IpcSettingsApi | null): Promise<ProviderReadiness> {
  if (!api) {
    return {
      status: 'invalid_config',
      message: 'Settings IPC unavailable',
    };
  }
  try {
    const result = await api.getProviderAuthority();
    return result.ok
      ? result.readiness
      : { status: 'invalid_config', message: result.error };
  } catch (error) {
    return {
      status: 'invalid_config',
      message: error instanceof Error ? error.message : 'Provider authority unavailable',
    };
  }
}

export function useSettings(): UseSettingsResult {
  const [settings, setSettings] = useState<SettingsState>(() => createDefaultSettings());
  const [providerReadiness, setProviderReadiness] = useState<ProviderReadiness>({
    status: 'missing_provider',
  });
  const [safeStorageAvailable, setSafeStorageAvailable] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const mountedRef = useRef(true);
  const requestSeqRef = useRef(0);

  const resolveApi: SettingsApiResolver = useCallback(() => getSettingsApi(), []);

  useEffect(() => {
    mountedRef.current = true;

    const load = async () => {
      const outcome = await computeRefreshOutcome(resolveApi);
      const readiness = await fetchProviderReadiness(getSettingsApi());
      if (!mountedRef.current) return;

      if (outcome.kind === 'success' && outcome.settings) {
        setSettings(outcome.settings as SettingsState);
        setProviderReadiness(readiness);
        setSafeStorageAvailable(outcome.safeStorageAvailable);
        setError(null);
      } else {
        setError(outcome.error);
      }
      if (mountedRef.current) {
        setLoading(false);
      }
    };

    load();

    return () => {
      mountedRef.current = false;
    };
  }, [resolveApi]);

  const updateSettings = useCallback(async (patch: SettingsPatch): Promise<{ ok: boolean; error?: string }> => {
    const api = getSettingsApi();
    if (!api) {
      const message = 'Settings IPC unavailable';
      setError(message);
      return { ok: false, error: message };
    }

    const seq = (requestSeqRef.current += 1);

    try {
      const result = await api.update({ patch: patch as Record<string, unknown> });
      if (!mountedRef.current) return result;
      if (seq < requestSeqRef.current) return result;

      if (result.ok) {
        setSettings(result.settings as SettingsState);
        setProviderReadiness(await fetchProviderReadiness(api));
        setError(null);
        return { ok: true };
      }
      const message = result.error || 'Failed to update settings';
      if (mountedRef.current) {
        setError(message);
      }
      return { ok: false, error: message };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Update failed';
      if (mountedRef.current && seq >= requestSeqRef.current) {
        setError(message);
      }
      return { ok: false, error: message };
    }
  }, []);

  const updateCategory = useCallback(async <K extends keyof SettingsState>(category: K, values: DeepPartial<SettingsState[K]>): Promise<{ ok: boolean; error?: string }> => {
    const patch = { [category]: values } as SettingsPatch;
    return updateSettings(patch);
  }, [updateSettings]);

  const resetSettings = useCallback(async (keys?: SettingsCategoryId[]): Promise<{ ok: boolean; error?: string }> => {
    const api = getSettingsApi();
    if (!api) {
      const message = 'Settings IPC unavailable';
      setError(message);
      return { ok: false, error: message };
    }

    const seq = (requestSeqRef.current += 1);

    try {
      const result = await api.reset(keys ? { keys } : {});
      if (!mountedRef.current) return result;
      if (seq < requestSeqRef.current) return result;

      if (result.ok) {
        setSettings(result.settings as SettingsState);
        setProviderReadiness(await fetchProviderReadiness(api));
        setError(null);
        return { ok: true };
      }
      const message = result.error || 'Failed to reset settings';
      if (mountedRef.current) {
        setError(message);
      }
      return { ok: false, error: message };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Reset failed';
      if (mountedRef.current && seq >= requestSeqRef.current) {
        setError(message);
      }
      return { ok: false, error: message };
    }
  }, []);

  const refreshSettings = useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
    const outcome = await computeRefreshOutcome(resolveApi);
    const readiness = await fetchProviderReadiness(getSettingsApi());
    if (!mountedRef.current) {
      return { ok: outcome.kind === 'success', error: outcome.error ?? undefined };
    }
    if (outcome.kind === 'success') {
      setSettings(outcome.settings as SettingsState);
      setProviderReadiness(readiness);
      setSafeStorageAvailable(outcome.safeStorageAvailable);
      setError(null);
      return { ok: true };
    }
    setError(outcome.error);
    return { ok: false, error: outcome.error ?? undefined };
  }, [resolveApi]);

  const applyPersistedTheme = useCallback((onThemeChange: (theme: ThemeName) => void) => {
    setSettings(current => {
      const persistedTheme = current.appearance.theme;
      onThemeChange(persistedTheme);
      return current;
    });
  }, []);

  return {
    settings,
    providerReadiness,
    safeStorageAvailable,
    loading,
    error,
    updateSettings,
    updateCategory,
    resetSettings,
    refreshSettings,
    applyPersistedTheme,
  };
}
