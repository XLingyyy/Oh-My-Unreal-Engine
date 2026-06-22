import { safeStorage } from 'electron';
import { app } from 'electron';
import * as fs from 'node:fs';
import * as fsPromises from 'node:fs/promises';
import * as path from 'node:path';
import {
  buildVaultRef,
  parseVaultRef,
  refBelongsToProvider,
  runRenameWithRetry,
  validateProviderInstanceId,
  type RenameFn,
  type SleepFn,
} from '@omue/shared-protocol';
import {
  buildNextVaultEntries,
  removeProviderEntries,
  snapshotProviderEntries,
  applyProviderPatch,
} from './vault-transaction.js';

interface VaultData {
  entries: Record<string, string>;
}

export interface VaultError {
  ok: false;
  error: string;
  kind: 'corrupt' | 'write_failed' | 'encryption_unavailable' | 'invalid_input';
}

export interface VaultSetSuccess {
  ok: true;
  apiKeyRef: string;
}

export type VaultSetResult = VaultSetSuccess | VaultError;

export type VaultClearResult = { ok: true; changed: boolean } | VaultError;

const RENAME_MAX_ATTEMPTS = 5;
const RENAME_RETRY_BASE_DELAY_MS = 50;
const TRANSIENT_ERRNO_CODES: ReadonlySet<string> = new Set(['EPERM', 'EBUSY', 'EACCES', 'ETXTBSY']);
const API_KEY_MAX_LEN = 4096;

const defaultSleep: SleepFn = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const defaultRename: RenameFn = (tempPath, filePath) => fsPromises.rename(tempPath, filePath);

function getVaultPath(): string {
  return path.join(app.getPath('userData'), 'api-key-vault.json');
}

export interface VaultIoAdapters {
  rename: RenameFn;
  sleep: SleepFn;
}

const productionAdapters: VaultIoAdapters = { rename: defaultRename, sleep: defaultSleep };

let activeAdapters: VaultIoAdapters = productionAdapters;

export function setVaultIoAdapters(adapters: VaultIoAdapters | null): void {
  activeAdapters = adapters ?? productionAdapters;
}

export function getVaultIoAdapters(): VaultIoAdapters {
  return activeAdapters;
}

async function renameWithRetry(tempPath: string, filePath: string): Promise<void> {
  const result = await runRenameWithRetry(tempPath, filePath, {
    rename: activeAdapters.rename,
    sleep: activeAdapters.sleep,
    maxAttempts: RENAME_MAX_ATTEMPTS,
    baseDelayMs: RENAME_RETRY_BASE_DELAY_MS,
    transientErrnoCodes: TRANSIENT_ERRNO_CODES,
  });
  if (!result.ok) {
    throw result.error ?? new Error('rename failed after retries');
  }
}

async function writeVault(vault: VaultData): Promise<void> {
  const vaultPath = getVaultPath();
  const dir = path.dirname(vaultPath);
  await fsPromises.mkdir(dir, { recursive: true });
  const tmpPath = `${vaultPath}.tmp`;
  await fsPromises.writeFile(tmpPath, JSON.stringify(vault, null, 2), 'utf-8');
  await renameWithRetry(tmpPath, vaultPath);
}

function isVaultData(value: unknown): value is VaultData {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const entries = (value as Record<string, unknown>).entries;
  if (typeof entries !== 'object' || entries === null || Array.isArray(entries)) return false;
  for (const v of Object.values(entries as Record<string, unknown>)) {
    if (typeof v !== 'string') return false;
  }
  return true;
}

export type ReadVaultResult =
  | { ok: true; data: VaultData }
  | { ok: false; kind: 'corrupt'; error: string };

function readVault(): ReadVaultResult {
  const vaultPath = getVaultPath();
  if (!fs.existsSync(vaultPath)) {
    return { ok: true, data: { entries: {} } };
  }
  let raw: string;
  try {
    raw = fs.readFileSync(vaultPath, 'utf-8');
  } catch (err) {
    return { ok: false, kind: 'corrupt', error: err instanceof Error ? err.message : 'Failed to read vault' };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return { ok: false, kind: 'corrupt', error: err instanceof Error ? err.message : 'Vault is not valid JSON' };
  }
  if (!isVaultData(parsed)) {
    return { ok: false, kind: 'corrupt', error: 'Vault schema is invalid' };
  }
  return { ok: true, data: parsed };
}

export function isSafeStorageAvailable(): boolean {
  try {
    return safeStorage.isEncryptionAvailable();
  } catch {
    return false;
  }
}

export function getApiKey(ref: string): string | null {
  if (!ref) return null;
  if (!isSafeStorageAvailable()) return null;
  try {
    const read = readVault();
    if (!read.ok) return null;
    const parsed = parseVaultRef(ref);
    if (!parsed.ok) {
      const ciphertext = read.data.entries[ref];
      if (!ciphertext) return null;
      const buffer = Buffer.from(ciphertext, 'base64');
      return safeStorage.decryptString(buffer);
    }
    const target = parsed.providerInstanceId;
    const matchKey = Object.keys(read.data.entries).find(k => refBelongsToProvider(k, target) && k === ref);
    if (!matchKey) return null;
    const ciphertext = read.data.entries[matchKey];
    if (!ciphertext) return null;
    const buffer = Buffer.from(ciphertext, 'base64');
    return safeStorage.decryptString(buffer);
  } catch {
    return null;
  }
}

function validateProviderId(providerInstanceId: string): string | null {
  return validateProviderInstanceId(providerInstanceId);
}

function validatePlaintext(plaintext: string): string | null {
  if (typeof plaintext !== 'string' || plaintext.length === 0) {
    return 'API key must not be empty';
  }
  if (plaintext.length > API_KEY_MAX_LEN) {
    return 'API key too long';
  }
  return null;
}

export async function setApiKey(providerInstanceId: string, plaintext: string): Promise<VaultSetResult> {
  const idErr = validateProviderId(providerInstanceId);
  if (idErr) return { ok: false, kind: 'invalid_input', error: idErr };
  const keyErr = validatePlaintext(plaintext);
  if (keyErr) return { ok: false, kind: 'invalid_input', error: keyErr };

  if (!isSafeStorageAvailable()) {
    return { ok: false, kind: 'encryption_unavailable', error: 'safeStorage not available' };
  }

  let ciphertext: string;
  try {
    ciphertext = safeStorage.encryptString(plaintext).toString('base64');
  } catch (err) {
    return { ok: false, kind: 'encryption_unavailable', error: err instanceof Error ? err.message : 'Encryption failed' };
  }

  const read = readVault();
  if (!read.ok) {
    return { ok: false, kind: read.kind, error: read.error };
  }

  const ref = buildVaultRef(providerInstanceId);
  const nextEntries = buildNextVaultEntries(read.data.entries, providerInstanceId, ref, ciphertext);

  try {
    await writeVault({ entries: nextEntries });
  } catch (err) {
    return { ok: false, kind: 'write_failed', error: err instanceof Error ? err.message : 'Failed to write vault file' };
  }
  return { ok: true, apiKeyRef: ref };
}

export async function clearApiKeyEntries(providerInstanceId: string): Promise<VaultClearResult> {
  const idErr = validateProviderId(providerInstanceId);
  if (idErr) return { ok: false, kind: 'invalid_input', error: idErr };

  const read = readVault();
  if (!read.ok) {
    return { ok: false, kind: read.kind, error: read.error };
  }

  const removed = removeProviderEntries(read.data.entries, providerInstanceId);
  if (!removed.changed) {
    return { ok: true, changed: false };
  }

  try {
    await writeVault({ entries: removed.entries });
  } catch (err) {
    return { ok: false, kind: 'write_failed', error: err instanceof Error ? err.message : 'Failed to write vault file' };
  }
  return { ok: true, changed: true };
}

export function isVaultCorrupt(): boolean {
  const read = readVault();
  return !read.ok && read.kind === 'corrupt';
}

/**
 * Restore ONLY the target provider's entries, leaving any concurrent updates
 * made by other providers untouched. Reads the current vault, then writes back
 * a merged result: target provider's entries from `providerEntries`, all
 * other providers' entries from the live vault. This is the precise
 * replacement for the previous `restoreVaultEntries(fullSnapshot)` which
 * could clobber concurrent updates.
 */
export async function restoreProviderEntries(
  providerInstanceId: string,
  providerEntries: Record<string, string>,
): Promise<{ ok: true } | { ok: false; kind: string; error: string }> {
  const idErr = validateProviderId(providerInstanceId);
  if (idErr) {
    return { ok: false, kind: 'invalid_input', error: idErr };
  }
  for (const k of Object.keys(providerEntries)) {
    if (!refBelongsToProvider(k, providerInstanceId)) {
      return {
        ok: false,
        kind: 'invalid_input',
        error: `ref "${k}" does not belong to provider "${providerInstanceId}"`,
      };
    }
  }

  const read = readVault();
  if (!read.ok) {
    return { ok: false, kind: read.kind, error: read.error };
  }

  const merged = applyProviderPatch(read.data.entries, providerInstanceId, providerEntries);

  try {
    await writeVault({ entries: merged });
    return { ok: true };
  } catch (err) {
    return { ok: false, kind: 'write_failed', error: err instanceof Error ? err.message : 'Vault restore failed' };
  }
}

export function snapshotProviderEntriesFor(
  providerInstanceId: string,
): Record<string, string> {
  const read = readVault();
  if (!read.ok) return {};
  if (!providerInstanceId) return { ...read.data.entries };
  return snapshotProviderEntries(read.data.entries, providerInstanceId);
}
