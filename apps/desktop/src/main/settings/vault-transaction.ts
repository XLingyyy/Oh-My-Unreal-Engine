// Pure helper functions for vault transaction logic.
// Electron-free, importable by both production code and validation scripts.
//
// IMPORTANT: provider matching uses parseVaultRef (precise provider+timestamp
// split) — NEVER startsWith prefix matching. Provider `foo` and provider
// `foo-bar` are both valid IDs and must not collide.

import {
  buildVaultRef,
  parseVaultRef,
  refBelongsToProvider,
} from '@omue/shared-protocol';

export function buildNextVaultEntries(
  currentEntries: Record<string, string>,
  providerInstanceId: string,
  newRef: string,
  newCiphertext: string,
): Record<string, string> {
  const next: Record<string, string> = {};
  for (const [k, v] of Object.entries(currentEntries)) {
    if (!refBelongsToProvider(k, providerInstanceId)) {
      next[k] = v;
    }
  }
  next[newRef] = newCiphertext;
  return next;
}

export interface RemoveResult {
  entries: Record<string, string>;
  removed: string[];
  changed: boolean;
}

export function removeProviderEntries(
  entries: Record<string, string>,
  providerInstanceId: string,
): RemoveResult {
  const next: Record<string, string> = {};
  const removed: string[] = [];
  for (const [k, v] of Object.entries(entries)) {
    if (refBelongsToProvider(k, providerInstanceId)) {
      removed.push(k);
    } else {
      next[k] = v;
    }
  }
  return { entries: next, removed, changed: removed.length > 0 };
}

export function hasProviderEntry(entries: Record<string, string>, providerInstanceId: string): boolean {
  for (const k of Object.keys(entries)) {
    if (refBelongsToProvider(k, providerInstanceId)) return true;
  }
  return false;
}

export function listProviderRefs(entries: Record<string, string>, providerInstanceId: string): string[] {
  const out: string[] = [];
  for (const k of Object.keys(entries)) {
    if (refBelongsToProvider(k, providerInstanceId)) out.push(k);
  }
  return out;
}

/**
 * Build the next entries after applying per-provider changes, merged into
 * any concurrent updates made by other providers. This is the key fix for
 * "full-vault snapshot rollback can clobber concurrent provider updates":
 * we never restore a full-vault snapshot; we only replace the target
 * provider's entries with the desired post-state (typically the rollback
 * pre-state), leaving all other providers' entries untouched.
 */
export function applyProviderPatch(
  currentEntries: Record<string, string>,
  providerInstanceId: string,
  providerEntries: Record<string, string>,
): Record<string, string> {
  const next: Record<string, string> = {};
  for (const [k, v] of Object.entries(currentEntries)) {
    if (!refBelongsToProvider(k, providerInstanceId)) {
      next[k] = v;
    }
  }
  for (const [k, v] of Object.entries(providerEntries)) {
    if (!refBelongsToProvider(k, providerInstanceId)) {
      throw new Error(`applyProviderPatch: ref "${k}" does not belong to provider "${providerInstanceId}"`);
    }
    next[k] = v;
  }
  return next;
}

export function applyLatestSeq<T>(responses: Array<{ seq: number; value: T }>): T | null {
  let latestSeq = 0;
  let latestValue: T | null = null;
  for (const r of responses) {
    if (r.seq >= latestSeq) {
      latestSeq = r.seq;
      latestValue = r.value;
    }
  }
  return latestValue;
}

export function snapshotProviderEntries(
  entries: Record<string, string>,
  providerInstanceId: string,
): Record<string, string> {
  const snapshot: Record<string, string> = {};
  for (const [k, v] of Object.entries(entries)) {
    if (refBelongsToProvider(k, providerInstanceId)) {
      snapshot[k] = v;
    }
  }
  return snapshot;
}

export { buildVaultRef, parseVaultRef, refBelongsToProvider };
