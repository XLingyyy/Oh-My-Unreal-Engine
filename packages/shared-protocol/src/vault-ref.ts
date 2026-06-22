// Strict vault-ref format helpers.
// Ref grammar: `vault-<providerInstanceId>-<timestampMs>`
//   - providerInstanceId: matches PROVIDER_INSTANCE_ID_PATTERN (allows [A-Za-z0-9_-])
//   - timestampMs: digits only
// Because the provider segment itself may contain `-`, we MUST split from
// the right: the last `-<digits>` token is the timestamp, the rest is the provider.

import { PROVIDER_INSTANCE_ID_PATTERN } from './provider-validation.js';

export const VAULT_REF_PREFIX = 'vault-';
export const MEM_VAULT_REF_PREFIX = 'mem-vault-';
export const VAULT_REF_TIMESTAMP_PATTERN = /^\d+$/;
export const VAULT_REF_PATTERN = new RegExp(
  `^${VAULT_REF_PREFIX}([A-Za-z0-9_-]{1,128})-(\\d+)$`,
);

export interface ParsedVaultRef {
  ok: true;
  providerInstanceId: string;
  timestampMs: string;
  fullRef: string;
}

export interface InvalidVaultRef {
  ok: false;
  reason: string;
}

export function parseVaultRef(ref: unknown): ParsedVaultRef | InvalidVaultRef {
  if (typeof ref !== 'string' || ref.length === 0) {
    return { ok: false, reason: 'Vault ref must be a non-empty string' };
  }
  if (!ref.startsWith(VAULT_REF_PREFIX)) {
    return { ok: false, reason: 'Vault ref must start with "vault-"' };
  }
  const match = VAULT_REF_PATTERN.exec(ref);
  if (!match) {
    return { ok: false, reason: 'Vault ref has invalid format' };
  }
  const providerInstanceId = match[1];
  const timestampMs = match[2];
  return { ok: true, providerInstanceId, timestampMs, fullRef: ref };
}

export function buildVaultRef(providerInstanceId: string, timestampMs: number | string = Date.now()): string {
  return `${VAULT_REF_PREFIX}${providerInstanceId}-${timestampMs}`;
}

export function buildMemVaultRef(providerInstanceId: string, timestampMs: number | string = Date.now()): string {
  return `${MEM_VAULT_REF_PREFIX}${providerInstanceId}-${timestampMs}`;
}

export function refBelongsToProvider(ref: string, providerInstanceId: string): boolean {
  if (typeof ref !== 'string' || typeof providerInstanceId !== 'string') return false;
  if (providerInstanceId.length === 0) return false;
  const parsed = parseVaultRef(ref);
  if (!parsed.ok) return false;
  return parsed.providerInstanceId === providerInstanceId;
}

export function refIsMemOnly(ref: string): boolean {
  return typeof ref === 'string' && ref.startsWith(MEM_VAULT_REF_PREFIX);
}
