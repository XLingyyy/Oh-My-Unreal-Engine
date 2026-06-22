import type { ProviderInstance } from './settings/settingsTypes';
import type { ProviderReadiness } from '../../../main/settings/provider-authority';

export type ProviderCardStatusKind =
  | 'disabled'
  | 'ready'
  | 'needs-api-key'
  | 'configured-unverified'
  | 'invalid';

export interface ProviderCardStatus {
  kind: ProviderCardStatusKind;
  message?: string;
}

const VENDOR_LABELS: Record<string, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  deepseek: 'DeepSeek',
  gemini: 'Gemini',
  google: 'Gemini',
};

function normalizeKind(kind: string): string {
  return kind.trim().toLowerCase();
}

function isPointingAt(
  readiness: ProviderReadiness,
  provider: ProviderInstance,
): boolean {
  return readiness.providerId === provider.instanceId;
}

/**
 * Map a Provider + current authority readiness to the honest UI status.
 *
 * Rules (in priority order):
 *  1. `provider.enabled === false` => 'disabled' (overrides everything).
 *  2. `readiness.status === 'ready'` AND `readiness.providerId === provider.instanceId`
 *     => 'ready'.
 *  3. authority points at this provider and is one of:
 *       - 'missing_key'        => 'needs-api-key'
 *       - 'invalid_config'
 *       - 'vault_unavailable'
 *       - 'vault_corrupt'      => 'invalid' (forwards authority message verbatim)
 *  4. otherwise              => 'configured-unverified'.
 *
 * Notes:
 *  - `apiKeyRef` MUST NOT be used to derive a `needs-api-key` conclusion for
 *    this provider, because a session-only key never writes to a persistent
 *    ref and the global authority only ever names a single selected provider.
 *  - When authority points at a different provider, the most honest Renderer
 *    conclusion is "configured but unverified by the active authority".
 */
export function deriveProviderCardStatus(
  provider: ProviderInstance,
  readiness: ProviderReadiness,
): ProviderCardStatus {
  if (provider.enabled === false) {
    return { kind: 'disabled' };
  }

  if (
    readiness.status === 'ready' &&
    isPointingAt(readiness, provider)
  ) {
    return { kind: 'ready' };
  }

  if (isPointingAt(readiness, provider)) {
    if (readiness.status === 'missing_key') {
      return { kind: 'needs-api-key' };
    }
    if (
      readiness.status === 'invalid_config' ||
      readiness.status === 'vault_unavailable' ||
      readiness.status === 'vault_corrupt'
    ) {
      return readiness.message
        ? { kind: 'invalid', message: readiness.message }
        : { kind: 'invalid' };
    }
  }

  return { kind: 'configured-unverified' };
}

/**
 * Pure display mapping for the vendor title shown in the collapsed card header.
 * Never writes back to the persisted ProviderInstance fields.
 *
 * - openai -> "OpenAI"
 * - anthropic -> "Anthropic"
 * - deepseek -> "DeepSeek"
 * - gemini / google -> "Gemini"
 * - custom -> provider.displayName || "Custom Provider"
 * - other -> provider.displayName || provider.kind
 */
export function getProviderVendorLabel(provider: ProviderInstance): string {
  const kind = normalizeKind(provider.kind);
  const mapped = VENDOR_LABELS[kind];
  if (mapped) {
    return mapped;
  }
  const name = provider.displayName?.trim();
  if (name) {
    return name;
  }
  if (kind === 'custom') {
    return 'Custom Provider';
  }
  return provider.kind;
}
