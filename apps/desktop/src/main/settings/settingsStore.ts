import { app } from 'electron';
import * as fs from 'node:fs';
import * as fsPromises from 'node:fs/promises';
import * as path from 'node:path';
import type { SettingsState } from '@omue/shared-protocol';
import { runRenameWithRetry, type RenameFn, type SleepFn } from '@omue/shared-protocol';
import { getDefaultSettings } from './defaultSettings';
import { deepMergeSettings } from './settingsMerge';
import {
  normalizeSettingsSafety,
  sanitizeSettingsFile,
  type ValidationError,
} from './settingsSchema';

const RENAME_MAX_ATTEMPTS = 5;
const RENAME_RETRY_BASE_DELAY_MS = 50;
const TRANSIENT_ERRNO_CODES: ReadonlySet<string> = new Set(['EPERM', 'EBUSY', 'EACCES', 'ETXTBSY']);

const defaultSleep: SleepFn = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const defaultRename: RenameFn = (tempPath, filePath) => fsPromises.rename(tempPath, filePath);

export interface SettingsIoAdapters {
  rename: RenameFn;
  sleep: SleepFn;
}

const productionAdapters: SettingsIoAdapters = { rename: defaultRename, sleep: defaultSleep };

let activeAdapters: SettingsIoAdapters = productionAdapters;

export function setSettingsIoAdapters(adapters: SettingsIoAdapters | null): void {
  activeAdapters = adapters ?? productionAdapters;
}

export function getSettingsIoAdapters(): SettingsIoAdapters {
  return activeAdapters;
}

function getSettingsPath(): string {
  return path.join(app.getPath('userData'), 'settings.json');
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
    throw result.error ?? new Error('settings rename failed after retries');
  }
}

async function writeSettingsFile(filePath: string, settings: SettingsState): Promise<void> {
  const dir = path.dirname(filePath);
  await fsPromises.mkdir(dir, { recursive: true });
  const tmpPath = `${filePath}.tmp`;
  await fsPromises.writeFile(tmpPath, JSON.stringify(settings, null, 2), 'utf-8');
  await renameWithRetry(tmpPath, filePath);
}

async function backupCorrupt(filePath: string, errors: ValidationError[]): Promise<SettingsState> {
  const defaults = getDefaultSettings();
  try {
    const backupPath = `${filePath}.bak.${Date.now()}`;
    await fsPromises.rename(filePath, backupPath);
    console.warn(`[settings] Corrupt settings backed up to ${backupPath}`, errors);
  } catch {
    console.warn('[settings] Could not back up corrupt settings file, using in-memory defaults');
  }
  try {
    await writeSettingsFile(filePath, defaults);
  } catch (err) {
    console.warn('[settings] Could not write default settings file, using in-memory defaults', err);
  }
  return defaults;
}

export async function loadSettings(): Promise<SettingsState> {
  const filePath = getSettingsPath();

  try {
    await fsPromises.access(filePath, fs.constants.F_OK);
  } catch {
    const defaults = getDefaultSettings();
    try {
      await writeSettingsFile(filePath, defaults);
    } catch {
      console.warn('[settings] Could not write initial settings file, using in-memory defaults');
    }
    return defaults;
  }

  let raw: string;
  try {
    raw = await fsPromises.readFile(filePath, 'utf-8');
  } catch {
    return getDefaultSettings();
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown parse error';
    return backupCorrupt(filePath, [{ path: '', message: `Failed to parse: ${message}` }]);
  }

  const sanitized = sanitizeSettingsFile(parsed);
  if (!sanitized.ok) {
    return backupCorrupt(filePath, sanitized.errors);
  }

  return normalizeSettingsSafety(
    deepMergeSettings(getDefaultSettings(), sanitized.data),
  ) as SettingsState;
}

export async function writeSettings(settings: SettingsState): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const filePath = getSettingsPath();
    await writeSettingsFile(filePath, settings);
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to write settings file';
    console.warn('[settings] Write failed', err);
    return { ok: false, error: message };
  }
}
