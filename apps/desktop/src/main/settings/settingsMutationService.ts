import type {
  SettingsState,
  DeepPartial,
  SettingsCategoryId,
  ProviderInstance,
  ModelProviderSettings,
} from '@omue/shared-protocol';
import { refBelongsToProvider, refIsMemOnly } from '@omue/shared-protocol';
import { normalizeSettingsSafety } from './settingsSchema';

export type SettingsWriteOutcome =
  | { ok: true; settings: SettingsState }
  | { ok: false; error: string; settings: SettingsState };

export type ApiKeySetOutcome =
  | { ok: true; apiKeyRef: string; persisted: boolean }
  | { ok: false; error: string };

export type ApiKeyClearOutcome =
  | { ok: true } | { ok: false; error: string };

export interface SettingsSessionState {
  inMemoryApiKeys: Map<string, { ref: string; plaintext: string }>;
}

export interface VaultPort {
  isSafeStorageAvailable(): boolean;
  isVaultCorrupt(): boolean;
  setApiKey(providerInstanceId: string, plaintext: string): Promise<
    | { ok: true; apiKeyRef: string }
    | { ok: false; kind: string; error: string }
  >;
  clearApiKeyEntries(providerInstanceId: string): Promise<
    | { ok: true; changed: boolean }
    | { ok: false; kind: string; error: string }
  >;
  snapshotProviderEntriesFor(providerInstanceId: string): Record<string, string>;
  restoreProviderEntries(
    providerInstanceId: string,
    providerEntries: Record<string, string>,
  ): Promise<{ ok: true } | { ok: false; kind: string; error: string }>;
}

export interface MutationFailureInjects {
  /**
   * If returns `fail: true`, the next settings write inside the lock
   * will fail with the supplied error message. Production callers wire
   * this to a constant `false`; only validation tests inject failures.
   */
  failNextSettingsWrite?: () => { fail: boolean; error?: string };
  /**
   * If returns `fail: true`, the next vault write inside the lock
   * will fail with the supplied error message. Only validation tests
   * inject failures.
   */
  failNextVaultWrite?: () => { fail: boolean; error?: string };
  /**
   * If returns `fail: true`, the next provider-entries restore inside
   * the lock will fail with the supplied error message. Only validation
   * tests inject failures.
   */
  failNextVaultRestore?: () => { fail: boolean; error?: string };
}

export type SettingsValidationFailure =
  | { ok: true }
  | { ok: false; errors: { path: string; message: string }[] };

export type ResetKeysValidationFailure =
  | { ok: true; keys: SettingsCategoryId[] }
  | { ok: false; errors: { path: string; message: string }[] };

export interface SettingsMutationServiceDeps {
  loadSettings: () => Promise<SettingsState>;
  getDefaultSettings: () => SettingsState;
  writeSettings: (settings: SettingsState) => Promise<{ ok: true } | { ok: false; error: string }>;
  vault: VaultPort;
  validateSettingsPatch: (patch: DeepPartial<SettingsState>) => SettingsValidationFailure;
  validateSettingsState: (settings: SettingsState) => SettingsValidationFailure;
  validateResetKeys: (keys: unknown) => ResetKeysValidationFailure;
  validateProviderInstanceId: (id: unknown) => string | null;
  buildMemVaultRef: (providerInstanceId: string, ts: number) => string;
  deepMergeSettings: (base: SettingsState, patch: DeepPartial<SettingsState>) => SettingsState;
  nowMs: () => number;
  session: SettingsSessionState;
  failureInjects?: MutationFailureInjects;
}

export interface SettingsMutationService {
  updateSettings(patch: DeepPartial<SettingsState>): Promise<SettingsWriteOutcome>;
  resetSettings(keys?: SettingsCategoryId[]): Promise<SettingsWriteOutcome>;
  setApiKey(providerInstanceId: string, plaintext: string): Promise<ApiKeySetOutcome>;
  clearApiKey(providerInstanceId: string): Promise<ApiKeyClearOutcome>;
  loadCurrentSettings(): Promise<SettingsState>;
  getSession(): SettingsSessionState;
}

/**
 * Strip the `apiKeyRef` field from any provider entry inside the patch
 * AND re-inject the current authoritative value (if any) by `instanceId`.
 * The settings mutation service is the SOLE owner of
 * authoritative `apiKeyRef` values — only `setApiKey` / `clearApiKey`
 * may set or clear them. Renderer-originated `settings:update` patches
 * must never be allowed to forge, replace, or persist an `apiKeyRef`
 * (or sneak a `mem-vault-*` session ref into disk). When the renderer
 * edits a provider it typically sends the full provider object
 * (including the projected `apiKeyRef`), so we strip the patch's
 * value and re-apply the current one to preserve the wire-format
 * round-trip while still rejecting forged values.
 */
export function stripProviderApiKeyRef(
  patch: DeepPartial<SettingsState>,
  current: SettingsState,
): DeepPartial<SettingsState> {
  const providers = patch.modelProviders?.providers;
  if (!Array.isArray(providers)) return patch;
  const currentProviders = new Map(
    current.modelProviders.providers.map((provider) => [provider.instanceId, provider]),
  );
  const sanitizedProviders = providers.map((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return entry;
    const { apiKeyRef: _stripped, ...rest } = entry as Record<string, unknown>;
    const instanceId = typeof rest.instanceId === 'string' ? rest.instanceId : undefined;
    const origApiKeyRef = instanceId ? currentProviders.get(instanceId)?.apiKeyRef : undefined;
    if (origApiKeyRef) {
      return { ...rest, apiKeyRef: origApiKeyRef } as DeepPartial<ProviderInstance>;
    }
    return rest as DeepPartial<ProviderInstance>;
  });
  return {
    ...patch,
    modelProviders: {
      ...(patch.modelProviders as DeepPartial<ModelProviderSettings> | undefined),
      providers: sanitizedProviders,
    },
  };
}

type ProviderPatchNormalization =
  | { ok: true; patch: DeepPartial<SettingsState> }
  | { ok: false; error: string };

function normalizeProviderPatch(
  patch: DeepPartial<SettingsState>,
  current: SettingsState,
  session: SettingsSessionState,
): ProviderPatchNormalization {
  const providers = patch.modelProviders?.providers;
  if (!Array.isArray(providers)) {
    return { ok: true, patch };
  }

  const currentById = new Map(
    current.modelProviders.providers.map((provider) => [provider.instanceId, provider]),
  );
  const nextIds = new Set<string>();
  const normalizedProviders: ProviderInstance[] = [];

  for (let index = 0; index < providers.length; index += 1) {
    const entry = providers[index];
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      return { ok: false, error: `modelProviders.providers[${index}] must be an object` };
    }
    const instanceId = (entry as DeepPartial<ProviderInstance>).instanceId;
    if (typeof instanceId !== 'string' || instanceId.length === 0) {
      return { ok: false, error: `modelProviders.providers[${index}].instanceId is required` };
    }
    if (nextIds.has(instanceId)) {
      return { ok: false, error: `Duplicate provider instanceId "${instanceId}"` };
    }
    nextIds.add(instanceId);

    const existing = currentById.get(instanceId);
    if (!existing) {
      normalizedProviders.push(entry as ProviderInstance);
      continue;
    }

    const patchAdvanced = entry.advanced;
    const merged: ProviderInstance = {
      ...existing,
      ...entry,
      instanceId,
      advanced: patchAdvanced
        ? { ...existing.advanced, ...patchAdvanced }
        : { ...existing.advanced },
      apiKeyRef: existing.apiKeyRef,
    };
    normalizedProviders.push(merged);
  }

  for (const provider of current.modelProviders.providers) {
    if (nextIds.has(provider.instanceId)) continue;
    if (provider.apiKeyRef || session.inMemoryApiKeys.has(provider.instanceId)) {
      return {
        ok: false,
        error: `Provider "${provider.instanceId}" has an API key; clear it before removing the provider`,
      };
    }
  }

  return {
    ok: true,
    patch: {
      ...patch,
      modelProviders: {
        ...(patch.modelProviders as DeepPartial<ModelProviderSettings> | undefined),
        providers: normalizedProviders,
      },
    },
  };
}

function resetModelProviders(
  current: SettingsState,
  defaults: SettingsState,
): ModelProviderSettings {
  const currentById = new Map(
    current.modelProviders.providers.map((provider) => [provider.instanceId, provider]),
  );
  const defaultIds = new Set(
    defaults.modelProviders.providers.map((provider) => provider.instanceId),
  );
  const builtInProviders = defaults.modelProviders.providers.map((provider) => {
    const currentProvider = currentById.get(provider.instanceId);
    return currentProvider?.apiKeyRef
      ? { ...provider, advanced: { ...provider.advanced }, apiKeyRef: currentProvider.apiKeyRef }
      : { ...provider, advanced: { ...provider.advanced } };
  });
  const customProviders = current.modelProviders.providers
    .filter((provider) => !defaultIds.has(provider.instanceId))
    .map((provider) => ({ ...provider, advanced: { ...provider.advanced } }));
  return { providers: [...builtInProviders, ...customProviders] };
}

function findProvider(settings: SettingsState, providerInstanceId: string): boolean {
  return settings.modelProviders.providers.some((p) => p.instanceId === providerInstanceId);
}

export function withProviderApiKeyRef(
  settings: SettingsState,
  providerInstanceId: string,
  ref: string | undefined,
): SettingsState {
  return {
    ...settings,
    modelProviders: {
      providers: settings.modelProviders.providers.map((p) =>
        p.instanceId === providerInstanceId ? { ...p, apiKeyRef: ref } : p,
      ),
    },
  };
}

function findProviderRefInSettings(settings: SettingsState, providerInstanceId: string): string | undefined {
  const p = settings.modelProviders.providers.find((x) => x.instanceId === providerInstanceId);
  return p?.apiKeyRef;
}

/**
 * Verify that a candidate persisted `apiKeyRef` is well-formed and owned
 * by the same provider's instanceId. Mirrors the rules used by the file
 * schema sanitizer (no `mem-vault-*`, parseable, parsed provider id
 * strictly equal).
 */
export function isValidPersistedApiKeyRef(ref: string, ownerInstanceId: string): boolean {
  if (!ref) return false;
  if (refIsMemOnly(ref)) return false;
  if (!refBelongsToProvider(ref, ownerInstanceId)) return false;
  return true;
}

/**
 * Create the production settings mutation service.
 *
 * All four mutations (update, reset, setApiKey, clearApiKey) acquire the
 * same single-slot mutex. The mutex is implemented as a chain promise:
 * each call appends a `then` so all calls run sequentially with no
 * interleaving. Inside the lock the service re-reads the latest
 * settings and vault, computes the next state, and writes. On settings
 * write failure the service restores ONLY the target provider's vault
 * entries from the in-lock snapshot (other providers' concurrent
 * updates are preserved). On session-only (no safeStorage) paths the
 * service never touches persisted files, but the session map is
 * updated only AFTER the (no-op) settings write so an in-flight
 * failure can roll it back.
 */
export function createSettingsMutationService(deps: SettingsMutationServiceDeps): SettingsMutationService {
  let chainTail: Promise<unknown> = Promise.resolve();

  const serialize = <T>(fn: () => Promise<T>): Promise<T> => {
    const next = chainTail.then(fn, fn);
    chainTail = next.catch(() => undefined);
    return next;
  };

  async function doUpdate(patch: DeepPartial<SettingsState>): Promise<SettingsWriteOutcome> {
    const current = await deps.loadSettings();
    const stripped = stripProviderApiKeyRef(patch, current);
    const validation = deps.validateSettingsPatch(stripped);
    if (!validation.ok) {
      return { ok: false, settings: current, error: validation.errors.map((e) => e.message).join('; ') };
    }
    const normalized = normalizeProviderPatch(stripped, current, deps.session);
    if (!normalized.ok) {
      return { ok: false, settings: current, error: normalized.error };
    }
    const next = normalizeSettingsSafety(
      deps.deepMergeSettings(current, normalized.patch),
    ) as SettingsState;
    const fullValidation = deps.validateSettingsState(next);
    if (!fullValidation.ok) {
      return {
        ok: false,
        settings: current,
        error: fullValidation.errors.map((e) => `${e.path}: ${e.message}`).join('; '),
      };
    }

    const inject = deps.failureInjects?.failNextSettingsWrite?.();
    if (inject?.fail) {
      return { ok: false, settings: current, error: inject.error ?? 'Failed to write settings file' };
    }
    const writeResult = await deps.writeSettings(next);
    if (!writeResult.ok) {
      return { ok: false, settings: current, error: writeResult.error };
    }
    return { ok: true, settings: next };
  }

  async function doReset(keys: SettingsCategoryId[] | undefined): Promise<SettingsWriteOutcome> {
    const keyCheck = deps.validateResetKeys(keys);
    if (!keyCheck.ok) {
      const current = await deps.loadSettings();
      return { ok: false, settings: current, error: keyCheck.errors.map((e) => e.message).join('; ') };
    }
    const current = await deps.loadSettings();
    const defaults = deps.getDefaultSettings();
    const resetProviders = resetModelProviders(current, defaults);
    let next: SettingsState;
    if (keyCheck.keys.length === 0) {
      next = {
        ...defaults,
        modelProviders: resetProviders,
      };
    } else {
      const merged: Record<string, unknown> = { ...(current as unknown as Record<string, unknown>) };
      const defRecord = defaults as unknown as Record<string, unknown>;
      for (const k of keyCheck.keys) {
        merged[k] = k === 'modelProviders' ? resetProviders : defRecord[k];
      }
      next = merged as unknown as SettingsState;
    }
    const fullValidation = deps.validateSettingsState(next);
    if (!fullValidation.ok) {
      return {
        ok: false,
        settings: current,
        error: fullValidation.errors.map((e) => `${e.path}: ${e.message}`).join('; '),
      };
    }

    const inject = deps.failureInjects?.failNextSettingsWrite?.();
    if (inject?.fail) {
      return { ok: false, settings: current, error: inject.error ?? 'Failed to write settings file' };
    }
    const writeResult = await deps.writeSettings(next);
    if (!writeResult.ok) {
      return { ok: false, settings: current, error: writeResult.error };
    }
    return { ok: true, settings: next };
  }

  async function doSetApiKey(
    providerInstanceId: string,
    plaintext: string,
  ): Promise<ApiKeySetOutcome> {
    if (deps.vault.isVaultCorrupt()) {
      return { ok: false, error: 'API key vault is corrupt; manual recovery required' };
    }

    const current = await deps.loadSettings();
    if (!findProvider(current, providerInstanceId)) {
      return { ok: false, error: `Provider not found: ${providerInstanceId}` };
    }

    if (!deps.vault.isSafeStorageAvailable()) {
      const ref = deps.buildMemVaultRef(providerInstanceId, deps.nowMs());
      deps.session.inMemoryApiKeys.set(providerInstanceId, { ref, plaintext });
      return { ok: true, apiKeyRef: ref, persisted: false };
    }

    const providerSnapshot = deps.vault.snapshotProviderEntriesFor(providerInstanceId);
    const vaultResult = await deps.vault.setApiKey(providerInstanceId, plaintext);
    if (!vaultResult.ok) {
      return { ok: false, error: vaultResult.error };
    }

    const restoreInject = deps.failureInjects?.failNextVaultRestore?.();
    const settingsInject = deps.failureInjects?.failNextSettingsWrite?.();

    if (settingsInject?.fail) {
      if (restoreInject?.fail) {
        return { ok: false, error: 'Vault rollback failed: ' + (restoreInject.error ?? 'restored failed') };
      }
      const rollback = await deps.vault.restoreProviderEntries(providerInstanceId, providerSnapshot);
      if (!rollback.ok) {
        return { ok: false, error: 'Vault rollback failed: ' + rollback.error };
      }
      return { ok: false, error: settingsInject.error ?? 'Failed to write settings file' };
    }

    const updated = withProviderApiKeyRef(current, providerInstanceId, vaultResult.apiKeyRef);
    const writeResult = await deps.writeSettings(updated);
    if (!writeResult.ok) {
      if (restoreInject?.fail) {
        return { ok: false, error: 'Vault rollback failed: ' + (restoreInject.error ?? 'restored failed') };
      }
      const rollback = await deps.vault.restoreProviderEntries(providerInstanceId, providerSnapshot);
      if (!rollback.ok) {
        return { ok: false, error: 'Vault rollback failed: ' + rollback.error };
      }
      return { ok: false, error: writeResult.error };
    }
    return { ok: true, apiKeyRef: vaultResult.apiKeyRef, persisted: true };
  }

  async function doClearApiKey(providerInstanceId: string): Promise<ApiKeyClearOutcome> {
    const current = await deps.loadSettings();
    if (!findProvider(current, providerInstanceId)) {
      return { ok: false, error: `Provider not found: ${providerInstanceId}` };
    }

    const previousMemEntry = deps.session.inMemoryApiKeys.get(providerInstanceId);
    const previousPersistedRef = findProviderRefInSettings(current, providerInstanceId);

    if (deps.vault.isSafeStorageAvailable()) {
      const providerSnapshot = deps.vault.snapshotProviderEntriesFor(providerInstanceId);
      const vaultResult = await deps.vault.clearApiKeyEntries(providerInstanceId);
      if (!vaultResult.ok) {
        return { ok: false, error: vaultResult.error };
      }
      const restoreInject = deps.failureInjects?.failNextVaultRestore?.();
      const settingsInject = deps.failureInjects?.failNextSettingsWrite?.();

      if (settingsInject?.fail) {
        if (restoreInject?.fail) {
          return { ok: false, error: 'Vault rollback failed: ' + (restoreInject.error ?? 'restored failed') };
        }
        const rollback = await deps.vault.restoreProviderEntries(providerInstanceId, providerSnapshot);
        if (!rollback.ok) {
          return { ok: false, error: 'Vault rollback failed: ' + rollback.error };
        }
        if (previousMemEntry) {
          deps.session.inMemoryApiKeys.set(providerInstanceId, previousMemEntry);
        }
        return { ok: false, error: settingsInject.error ?? 'Failed to write settings file' };
      }
      const updated = withProviderApiKeyRef(current, providerInstanceId, undefined);
      const writeResult = await deps.writeSettings(updated);
      if (!writeResult.ok) {
        if (restoreInject?.fail) {
          return { ok: false, error: 'Vault rollback failed: ' + (restoreInject.error ?? 'restored failed') };
        }
        const rollback = await deps.vault.restoreProviderEntries(providerInstanceId, providerSnapshot);
        if (!rollback.ok) {
          return { ok: false, error: 'Vault rollback failed: ' + rollback.error };
        }
        if (previousMemEntry) {
          deps.session.inMemoryApiKeys.set(providerInstanceId, previousMemEntry);
        }
        return { ok: false, error: writeResult.error };
      }
      deps.session.inMemoryApiKeys.delete(providerInstanceId);
      return { ok: true };
    }

    if (!previousMemEntry && !previousPersistedRef) {
      return { ok: true };
    }
    const settingsInject = deps.failureInjects?.failNextSettingsWrite?.();
    if (settingsInject?.fail) {
      if (previousMemEntry) {
        deps.session.inMemoryApiKeys.set(providerInstanceId, previousMemEntry);
      }
      return { ok: false, error: settingsInject.error ?? 'Failed to write settings file' };
    }
    const updated = withProviderApiKeyRef(current, providerInstanceId, undefined);
    const writeResult = await deps.writeSettings(updated);
    if (!writeResult.ok) {
      if (previousMemEntry) {
        deps.session.inMemoryApiKeys.set(providerInstanceId, previousMemEntry);
      }
      return { ok: false, error: writeResult.error };
    }
    deps.session.inMemoryApiKeys.delete(providerInstanceId);
    return { ok: true };
  }

  return {
    updateSettings(patch) { return serialize(() => doUpdate(patch)); },
    resetSettings(keys) { return serialize(() => doReset(keys)); },
    setApiKey(providerInstanceId, plaintext) { return serialize(() => doSetApiKey(providerInstanceId, plaintext)); },
    clearApiKey(providerInstanceId) { return serialize(() => doClearApiKey(providerInstanceId)); },
    loadCurrentSettings() { return deps.loadSettings(); },
    getSession() { return deps.session; },
  };
}
