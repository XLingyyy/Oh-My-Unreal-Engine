// Pure, React-free outcome logic for settings save/clear/refresh flows.
// The `useSettings` hook delegates the "did this succeed / what should
// the user see" decision to this module so that validation tests can
// exercise the real failure-injection paths (api-missing / refresh
// failure / write failure) without rendering React.

export type SettingsApi = {
  get(req: Record<string, unknown>): Promise<
    | { ok: true; settings: unknown; safeStorageAvailable: boolean }
    | { ok: false; error: string }
  >;
  update(req: { patch: Record<string, unknown> }): Promise<
    | { ok: true; settings: unknown }
    | { ok: false; error: string; settings?: unknown }
  >;
  reset(req: { keys?: string[] }): Promise<
    | { ok: true; settings: unknown }
    | { ok: false; error: string; settings?: unknown }
  >;
  apiKey: {
    set(req: { providerInstanceId: string; apiKeyPlaintext: string }): Promise<
      | { ok: true; apiKeyRef: string; persisted: boolean }
      | { ok: false; error: string }
    >;
    clear(req: { providerInstanceId: string }): Promise<
      { ok: true } | { ok: false; error: string }
    >;
  };
  testProviderConnection: (req: Record<string, unknown>) => Promise<{
    ok: boolean;
    latencyMs?: number;
    models?: string[];
    error?: string;
  }>;
};

export type SettingsApiResolver = () => SettingsApi | null;

export type RefreshOutcomeKind =
  | 'success'
  | 'api-missing'
  | 'load-failed'
  | 'exception';

export interface RefreshOutcome {
  kind: RefreshOutcomeKind;
  error: string | null;
  settings: unknown;
  safeStorageAvailable: boolean;
}

export async function computeRefreshOutcome(
  resolveApi: SettingsApiResolver,
): Promise<RefreshOutcome> {
  const api = resolveApi();
  if (!api) {
    return {
      kind: 'api-missing',
      error: 'Settings IPC unavailable',
      settings: null,
      safeStorageAvailable: false,
    };
  }
  try {
    const result = await api.get({});
    if (result.ok) {
      return {
        kind: 'success',
        error: null,
        settings: result.settings,
        safeStorageAvailable: result.safeStorageAvailable,
      };
    }
    return {
      kind: 'load-failed',
      error: result.error || 'Failed to load settings',
      settings: null,
      safeStorageAvailable: false,
    };
  } catch (err) {
    return {
      kind: 'exception',
      error: err instanceof Error ? err.message : 'Refresh failed',
      settings: null,
      safeStorageAvailable: false,
    };
  }
}

export type ApiKeySaveKind =
  | 'success-secure'
  | 'success-session'
  | 'api-missing'
  | 'save-failed'
  | 'refresh-failed'
  | 'exception';

export interface ApiKeySaveOutcome {
  kind: ApiKeySaveKind;
  error: string | null;
  apiKeyRef: string | null;
  persisted: boolean;
}

export interface ApiKeySaveContext {
  resolveApi: SettingsApiResolver;
  refresh: () => Promise<{ ok: boolean; error?: string }>;
  safeStorageAvailable: boolean;
}

export async function computeApiKeySaveOutcome(
  providerInstanceId: string,
  apiKeyPlaintext: string,
  ctx: ApiKeySaveContext,
): Promise<ApiKeySaveOutcome> {
  const api = ctx.resolveApi();
  if (!api) {
    return { kind: 'api-missing', error: 'Settings IPC unavailable', apiKeyRef: null, persisted: false };
  }
  try {
    const setResult = await api.apiKey.set({ providerInstanceId, apiKeyPlaintext });
    if (!setResult.ok) {
      return { kind: 'save-failed', error: setResult.error, apiKeyRef: null, persisted: false };
    }
    const refresh = await ctx.refresh();
    if (!refresh.ok) {
      return {
        kind: 'refresh-failed',
        error: refresh.error ?? 'Refresh failed',
        apiKeyRef: setResult.apiKeyRef,
        persisted: setResult.persisted,
      };
    }
    return {
      kind: setResult.persisted ? 'success-secure' : 'success-session',
      error: null,
      apiKeyRef: setResult.apiKeyRef,
      persisted: setResult.persisted,
    };
  } catch (err) {
    return {
      kind: 'exception',
      error: err instanceof Error ? err.message : 'Save failed',
      apiKeyRef: null,
      persisted: false,
    };
  }
}

export type ApiKeyClearKind =
  | 'success'
  | 'api-missing'
  | 'clear-failed'
  | 'refresh-failed'
  | 'exception';

export interface ApiKeyClearOutcome {
  kind: ApiKeyClearKind;
  error: string | null;
}

export async function computeApiKeyClearOutcome(
  providerInstanceId: string,
  ctx: ApiKeySaveContext,
): Promise<ApiKeyClearOutcome> {
  const api = ctx.resolveApi();
  if (!api) {
    return { kind: 'api-missing', error: 'Settings IPC unavailable' };
  }
  try {
    const clearResult = await api.apiKey.clear({ providerInstanceId });
    if (!clearResult.ok) {
      return { kind: 'clear-failed', error: clearResult.error };
    }
    const refresh = await ctx.refresh();
    if (!refresh.ok) {
      return { kind: 'refresh-failed', error: refresh.error ?? 'Refresh failed' };
    }
    return { kind: 'success', error: null };
  } catch (err) {
    return { kind: 'exception', error: err instanceof Error ? err.message : 'Clear failed' };
  }
}
