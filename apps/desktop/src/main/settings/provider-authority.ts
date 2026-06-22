import type { AiProviderConfig } from '../ai-blueprint-explanation-provider-types';
import { checkBaseUrlQuery } from '../ai-blueprint-explanation-provider-types';
import type { ProviderInstance, SettingsState } from '@omue/shared-protocol';

export type ProviderAuthorityStatus =
  | 'ready'
  | 'missing_provider'
  | 'missing_key'
  | 'vault_unavailable'
  | 'vault_corrupt'
  | 'invalid_config';

export interface ProviderReadiness {
  status: ProviderAuthorityStatus;
  providerId?: string;
  displayName?: string;
  diagnosisModel?: string;
  message?: string;
}

export interface ProviderAuthority extends ProviderReadiness {
  config?: AiProviderConfig;
}

export interface ProviderAuthorityDeps {
  loadSettings: () => Promise<SettingsState>;
  getSessionApiKey: (providerInstanceId: string) => string | null;
  isSafeStorageAvailable: () => boolean;
  isVaultCorrupt: () => boolean;
  getApiKey: (ref: string) => string | null;
}

export type ProviderAuthorityResolver = () => Promise<ProviderAuthority>;

export interface ProviderAuthoritySettingsPort {
  loadCurrentSettings(): Promise<SettingsState>;
  getSession(): {
    inMemoryApiKeys: Map<string, { plaintext: string }>;
  };
}

export interface ProviderAuthorityVaultPort {
  isSafeStorageAvailable(): boolean;
  isVaultCorrupt(): boolean;
  getApiKey(ref: string): string | null;
}

const SUPPORTED_PROPOSAL_PROVIDER_KINDS = new Set([
  'openai',
  'anthropic',
  'deepseek',
]);

const DIAGNOSTIC_STATUS_PRIORITY: Record<
  Exclude<ProviderAuthorityStatus, 'ready' | 'missing_provider'>,
  number
> = {
  vault_corrupt: 0,
  vault_unavailable: 1,
  invalid_config: 2,
  missing_key: 3,
};

function providerIdentity(
  provider: ProviderInstance,
  diagnosisModel?: string,
): Pick<ProviderReadiness, 'providerId' | 'displayName' | 'diagnosisModel'> {
  return {
    providerId: provider.instanceId,
    displayName: provider.displayName,
    ...(diagnosisModel ? { diagnosisModel } : {}),
  };
}

function invalidProvider(
  provider: ProviderInstance,
  message: string,
  diagnosisModel?: string,
): ProviderAuthority {
  return {
    status: 'invalid_config',
    ...providerIdentity(provider, diagnosisModel),
    message,
  };
}

function toAiProviderConfig(
  provider: ProviderInstance,
  apiKey: string,
  model: string,
): AiProviderConfig {
  return {
    provider: provider.kind,
    baseUrl: provider.baseUrl.trim().replace(/\/+$/, ''),
    model,
    apiKey,
    timeoutMs: (provider.advanced?.timeout ?? 30) * 1000,
  };
}

function evaluateProvider(
  provider: ProviderInstance,
  deps: ProviderAuthorityDeps,
): ProviderAuthority {
  const kind = provider.kind.trim();
  const baseUrl = provider.baseUrl.trim();
  const diagnosisModel = (provider.diagnosisModel || provider.defaultModel).trim();

  if (!SUPPORTED_PROPOSAL_PROVIDER_KINDS.has(kind)) {
    return invalidProvider(
      provider,
      `Provider kind "${provider.kind}" is not supported by Agent proposals.`,
      diagnosisModel || undefined,
    );
  }

  if (!baseUrl) {
    return invalidProvider(provider, 'Provider base URL is required.', diagnosisModel || undefined);
  }

  try {
    const parsed = new URL(baseUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return invalidProvider(
        provider,
        'Provider base URL must use http or https.',
        diagnosisModel || undefined,
      );
    }
  } catch {
    return invalidProvider(
      provider,
      'Provider base URL is not a valid URL.',
      diagnosisModel || undefined,
    );
  }

  const queryError = checkBaseUrlQuery(baseUrl);
  if (queryError) {
    return invalidProvider(provider, queryError, diagnosisModel || undefined);
  }

  if (!diagnosisModel) {
    return invalidProvider(provider, 'Provider diagnosis/default model is required.');
  }

  const sessionApiKey = deps.getSessionApiKey(provider.instanceId);
  if (sessionApiKey) {
    return {
      status: 'ready',
      ...providerIdentity(provider, diagnosisModel),
      config: toAiProviderConfig(provider, sessionApiKey, diagnosisModel),
    };
  }

  if (!provider.apiKeyRef) {
    return {
      status: 'missing_key',
      ...providerIdentity(provider, diagnosisModel),
      message: 'Provider API key is missing.',
    };
  }

  if (deps.isVaultCorrupt()) {
    return {
      status: 'vault_corrupt',
      ...providerIdentity(provider, diagnosisModel),
      message: 'Provider API key vault is corrupt.',
    };
  }

  if (!deps.isSafeStorageAvailable()) {
    return {
      status: 'vault_unavailable',
      ...providerIdentity(provider, diagnosisModel),
      message: 'Secure API key storage is unavailable for the persisted key.',
    };
  }

  let persistedApiKey: string | null;
  try {
    persistedApiKey = deps.getApiKey(provider.apiKeyRef);
  } catch {
    return {
      status: 'vault_corrupt',
      ...providerIdentity(provider, diagnosisModel),
      message: 'Provider API key could not be read from the vault.',
    };
  }

  if (!persistedApiKey) {
    return {
      status: 'missing_key',
      ...providerIdentity(provider, diagnosisModel),
      message: 'Provider API key is missing or cannot be decrypted.',
    };
  }

  return {
    status: 'ready',
    ...providerIdentity(provider, diagnosisModel),
    config: toAiProviderConfig(provider, persistedApiKey, diagnosisModel),
  };
}

function compareProviderIdentity(a: ProviderReadiness, b: ProviderReadiness): number {
  return (a.providerId ?? '').localeCompare(b.providerId ?? '');
}

export async function resolveProviderAuthority(
  deps: ProviderAuthorityDeps,
): Promise<ProviderAuthority> {
  let settings: SettingsState;
  try {
    settings = await deps.loadSettings();
  } catch (error) {
    return {
      status: 'invalid_config',
      message: error instanceof Error ? error.message : 'Failed to load provider settings.',
    };
  }

  const enabledProviders = settings.modelProviders.providers.filter(provider => provider.enabled);
  if (enabledProviders.length === 0) {
    return { status: 'missing_provider' };
  }

  const evaluated = enabledProviders.map(provider => evaluateProvider(provider, deps));
  const ready = evaluated
    .filter((result): result is ProviderAuthority & { status: 'ready'; config: AiProviderConfig } =>
      result.status === 'ready' && Boolean(result.config),
    )
    .sort(compareProviderIdentity);

  if (ready.length > 0) {
    return ready[0];
  }

  return evaluated
    .sort((a, b) => {
      const aPriority = DIAGNOSTIC_STATUS_PRIORITY[
        a.status as Exclude<ProviderAuthorityStatus, 'ready' | 'missing_provider'>
      ];
      const bPriority = DIAGNOSTIC_STATUS_PRIORITY[
        b.status as Exclude<ProviderAuthorityStatus, 'ready' | 'missing_provider'>
      ];
      return aPriority - bPriority || compareProviderIdentity(a, b);
    })[0];
}

export function createProviderAuthorityResolver(
  settings: ProviderAuthoritySettingsPort,
  vault: ProviderAuthorityVaultPort,
): ProviderAuthorityResolver {
  return () =>
    resolveProviderAuthority({
      loadSettings: () => settings.loadCurrentSettings(),
      getSessionApiKey: providerInstanceId =>
        settings.getSession().inMemoryApiKeys.get(providerInstanceId)?.plaintext ?? null,
      isSafeStorageAvailable: () => vault.isSafeStorageAvailable(),
      isVaultCorrupt: () => vault.isVaultCorrupt(),
      getApiKey: ref => vault.getApiKey(ref),
    });
}

export function toProviderReadiness(authority: ProviderAuthority): ProviderReadiness {
  const {
    status,
    providerId,
    displayName,
    diagnosisModel,
    message,
  } = authority;
  return {
    status,
    ...(providerId ? { providerId } : {}),
    ...(displayName ? { displayName } : {}),
    ...(diagnosisModel ? { diagnosisModel } : {}),
    ...(message ? { message } : {}),
  };
}
