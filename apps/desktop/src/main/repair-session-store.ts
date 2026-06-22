import { app } from 'electron';
import fsp from 'fs/promises';
import path from 'path';
import type { AgentLoopState, RepairSessionRecord } from '@omue/shared-protocol';
import { coerceRepairSessionRecord, REPAIR_SESSION_SCHEMA_VERSION_VALUE } from './agent-session-validation';

const SESSION_FILE_EXTENSION = '.json';
const SESSION_ID_PATTERN = /^[A-Za-z0-9._-]+$/;
const RENAME_MAX_ATTEMPTS = 5;
const RENAME_RETRY_BASE_DELAY_MS = 50;

let sessionsDir: string | null = null;

export type StoreWriteResult =
  | { ok: true }
  | { ok: false; errorCode: 'store_error'; message: string };

function nowIso(): string {
  return new Date().toISOString();
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isAgentLoopState(value: unknown): value is AgentLoopState {
  return typeof value === 'string' && [
    'draft',
    'diagnosing',
    'proposing',
    'payload_validating',
    'preflighting',
    'sandbox_duplicating',
    'sandbox_applying',
    'sandbox_compiling',
    'awaiting_approval',
    'promoting',
    'done',
    'escalated_done',
    'closed',
    'interrupted',
  ].includes(value);
}

export function isTerminalAgentLoopState(value: AgentLoopState): boolean {
  return value === 'done' || value === 'escalated_done' || value === 'closed';
}

function safeSessionId(sessionId: string): string {
  if (!SESSION_ID_PATTERN.test(sessionId)) {
    throw new Error('Invalid session id.');
  }
  return sessionId;
}

async function renameWithRetry(tempPath: string, filePath: string): Promise<void> {
  let lastError: unknown = null;

  for (let attempt = 0; attempt < RENAME_MAX_ATTEMPTS; attempt += 1) {
    try {
      await fsp.rename(tempPath, filePath);
      return;
    } catch (err) {
      lastError = err;
      const code = (err as NodeJS.ErrnoException)?.code;
      const isTransient =
        code === 'EPERM'
        || code === 'EBUSY'
        || code === 'EACCES'
        || code === 'ETXTBSY';
      if (!isTransient || attempt === RENAME_MAX_ATTEMPTS - 1) {
        throw err;
      }

      const delay = RENAME_RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

async function getSessionsDir(): Promise<string> {
  if (sessionsDir === null) {
    sessionsDir = path.join(app.getPath('userData'), 'repair-sessions');
  }
  await fsp.mkdir(sessionsDir, { recursive: true });
  return sessionsDir;
}

async function getSessionPath(sessionId: string): Promise<string> {
  const dir = await getSessionsDir();
  return path.join(dir, `${safeSessionId(sessionId)}${SESSION_FILE_EXTENSION}`);
}

function interruptedStub(sessionId: string, message: string): RepairSessionRecord {
  const timestamp = nowIso();
  return {
    schemaVersion: REPAIR_SESSION_SCHEMA_VERSION_VALUE,
    sessionId,
    scope: 'project',
    userIntent: '',
    createdAt: timestamp,
    updatedAt: timestamp,
    currentState: 'interrupted',
    retryCount: 0,
    maxRetries: 3,
    proposals: [],
    failureReason: message,
    closeReason: 'interrupted',
  };
}

async function readRecordFromFile(fileName: string): Promise<RepairSessionRecord> {
  const sessionId = fileName.endsWith(SESSION_FILE_EXTENSION)
    ? fileName.slice(0, -SESSION_FILE_EXTENSION.length)
    : fileName;
  const filePath = path.join(await getSessionsDir(), fileName);

  try {
    const raw = await fsp.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    const { record } = coerceRepairSessionRecord(parsed, sessionId);
    return record;
  } catch (err) {
    return interruptedStub(
      sessionId,
      err instanceof Error
        ? `Failed to read repair session file: ${err.message}`
        : 'Failed to read repair session file.',
    );
  }
}

export async function saveSession(record: RepairSessionRecord): Promise<StoreWriteResult> {
  try {
    const filePath = await getSessionPath(record.sessionId);
    const tempPath = `${filePath}.tmp`;
    const body = JSON.stringify(record, null, 2);
    await fsp.writeFile(tempPath, body, 'utf8');
    await renameWithRetry(tempPath, filePath);
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      errorCode: 'store_error',
      message: err instanceof Error ? err.message : 'Failed to save repair session.',
    };
  }
}

export async function loadSession(sessionId: string): Promise<RepairSessionRecord | null> {
  try {
    const filePath = await getSessionPath(sessionId);
    const raw = await fsp.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    return coerceRepairSessionRecord(parsed, sessionId).record;
  } catch {
    return null;
  }
}

export async function listSessions(): Promise<RepairSessionRecord[]> {
  const dir = await getSessionsDir();
  const files = await fsp.readdir(dir);
  const records = await Promise.all(
    files
      .filter((fileName) => fileName.endsWith(SESSION_FILE_EXTENSION))
      .map((fileName) => readRecordFromFile(fileName)),
  );
  return records.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function deleteSession(sessionId: string): Promise<void> {
  try {
    await fsp.unlink(await getSessionPath(sessionId));
  } catch {
    // Best-effort discard: missing or already-removed files are acceptable.
  }
}

export async function scanAndMarkInterrupted(): Promise<RepairSessionRecord[]> {
  const dir = await getSessionsDir();
  const files = await fsp.readdir(dir);
  const updated: RepairSessionRecord[] = [];

  for (const fileName of files) {
    if (!fileName.endsWith(SESSION_FILE_EXTENSION)) continue;

    const sessionId = fileName.slice(0, -SESSION_FILE_EXTENSION.length);
    const filePath = path.join(dir, fileName);
    let record: RepairSessionRecord;
    let shouldRewrite = false;

    try {
      const raw = await fsp.readFile(filePath, 'utf8');
      const parsed = JSON.parse(raw) as unknown;
      const coerced = coerceRepairSessionRecord(parsed, sessionId);
      record = coerced.record;
      shouldRewrite = coerced.shouldRewrite;
    } catch (err) {
      record = interruptedStub(
        sessionId,
        err instanceof Error
          ? `Failed to parse repair session file: ${err.message}`
          : 'Failed to parse repair session file.',
      );
      shouldRewrite = false;
    }

    if (!isTerminalAgentLoopState(record.currentState)) {
      record.currentState = 'interrupted';
      record.updatedAt = nowIso();
      record.failureReason = record.failureReason ?? 'Session interrupted while the app was not running.';
      record.closeReason = 'interrupted';
      shouldRewrite = true;
    }

    if (shouldRewrite) {
      await saveSession(record);
    }
    updated.push(record);
  }

  return updated;
}
