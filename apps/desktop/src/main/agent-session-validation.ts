import {
  AGENT_PROPOSAL_INHERITED_EVIDENCE_SUMMARY_MAX,
  AGENT_PROPOSAL_PROPOSAL_KINDS,
  AGENT_USER_INTENT_MAX,
  REPAIR_SESSION_SCHEMA_VERSION,
} from '@omue/shared-protocol';
import type {
  AgentLoopCloseReason,
  AgentLoopState,
  AgentProgressEvent,
  AgentProposalStoredRecord,
  AgentSessionClosedEvent,
  AgentSessionErrorEvent,
  AgentSessionErrorStoredRecord,
  AgentSessionScope,
  AgentAssetSessionRecord,
  AgentProjectSessionRecord,
  RepairSessionRecord,
  StartSessionRequest,
} from '@omue/shared-protocol';

export const REPAIR_SESSION_SCHEMA_VERSION_VALUE = REPAIR_SESSION_SCHEMA_VERSION;

const AGENT_LOOP_STATES: readonly AgentLoopState[] = [
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
];

const AGENT_LOOP_CLOSE_REASONS: readonly AgentLoopCloseReason[] = [
  'done',
  'escalated',
  'cancelled',
  'rejected',
  'interrupted',
];

export type StartSessionValidationOk = {
  ok: true;
  request: StartSessionRequest;
};

export type StartSessionValidationError = {
  ok: false;
  message: string;
};

export type StartSessionValidationResult =
  | StartSessionValidationOk
  | StartSessionValidationError;

export function isAgentLoopState(value: unknown): value is AgentLoopState {
  return typeof value === 'string' && (AGENT_LOOP_STATES as readonly string[]).includes(value);
}

export function isAgentLoopCloseReason(
  value: unknown,
): value is AgentLoopCloseReason {
  return (
    typeof value === 'string'
    && (AGENT_LOOP_CLOSE_REASONS as readonly string[]).includes(value)
  );
}

export function isAgentProposalStoredKind(
  value: unknown,
): value is AgentProposalStoredRecord['kind'] {
  return (
    typeof value === 'string'
    && (AGENT_PROPOSAL_PROPOSAL_KINDS as readonly string[]).includes(value)
  );
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeUserIntent(value: unknown): string | null {
  if (!isString(value)) return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > AGENT_USER_INTENT_MAX) return null;
  return trimmed;
}

function isStringArrayOfStrings(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string' && item.length > 0);
}

export function validateStartSessionRequest(
  value: unknown,
): StartSessionValidationResult {
  if (!isObject(value)) {
    return { ok: false, message: 'StartSessionRequest must be an object.' };
  }

  const scope = value.scope;
  if (scope !== 'asset' && scope !== 'project') {
    return { ok: false, message: 'scope must be "asset" or "project".' };
  }

  const userIntent = normalizeUserIntent(value.userIntent);
  if (userIntent === null) {
    return {
      ok: false,
      message: `userIntent must be a non-empty string up to ${AGENT_USER_INTENT_MAX} characters.`,
    };
  }

  const compileIssueIds = value.compileIssueIds;
  if (
    compileIssueIds !== undefined
    && !(isStringArrayOfStrings(compileIssueIds))
  ) {
    return { ok: false, message: 'compileIssueIds must be an array of non-empty strings.' };
  }

  if (scope === 'asset') {
    const target = value.targetAssetPath;
    if (typeof target !== 'string' || target.trim().length === 0) {
      return { ok: false, message: 'targetAssetPath is required for asset scope.' };
    }

    const inheritedEvidenceSummary = value.inheritedEvidenceSummary;
    if (
      inheritedEvidenceSummary !== undefined
      && (typeof inheritedEvidenceSummary !== 'string'
        || inheritedEvidenceSummary.length > AGENT_PROPOSAL_INHERITED_EVIDENCE_SUMMARY_MAX)
    ) {
      return {
        ok: false,
        message: `inheritedEvidenceSummary must be a string up to ${AGENT_PROPOSAL_INHERITED_EVIDENCE_SUMMARY_MAX} characters.`,
      };
    }

    const parentSessionId = value.parentSessionId;
    if (parentSessionId !== undefined && typeof parentSessionId !== 'string') {
      return { ok: false, message: 'parentSessionId must be a string when present.' };
    }

    const request: StartSessionRequest = {
      scope: 'asset',
      userIntent,
      targetAssetPath: target.trim(),
      ...(parentSessionId ? { parentSessionId } : {}),
      ...(inheritedEvidenceSummary ? { inheritedEvidenceSummary } : {}),
      ...(compileIssueIds ? { compileIssueIds } : {}),
    };
    return { ok: true, request };
  }

  if ('targetAssetPath' in value && value.targetAssetPath !== undefined) {
    return { ok: false, message: 'targetAssetPath is forbidden for project scope.' };
  }

  const request: StartSessionRequest = {
    scope: 'project',
    userIntent,
    ...(compileIssueIds ? { compileIssueIds } : {}),
  };
  return { ok: true, request };
}

export type CoerceRecordResult = {
  record: RepairSessionRecord;
  shouldRewrite: boolean;
};

function interruptedStub(
  sessionId: string,
  message: string,
): AgentProjectSessionRecord {
  const timestamp = new Date().toISOString();
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

function safeString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

function safeOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length === 0) return undefined;
  return value;
}

function safeNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function safeArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function normalizeStoredProposals(
  value: unknown,
  compatibilityTime: string,
): AgentProposalStoredRecord[] {
  return safeArray<unknown>(value)
    .filter(isObject)
    .map(item => ({
      ...item,
      proposedAt: safeString(item.proposedAt, compatibilityTime),
    } as unknown as AgentProposalStoredRecord));
}

function normalizeStoredErrors(
  value: unknown,
  compatibilityTime: string,
): AgentSessionErrorStoredRecord[] {
  return safeArray<unknown>(value)
    .filter(isObject)
    .map(item => ({
      ...item,
      createdAt: safeString(item.createdAt, compatibilityTime),
    } as unknown as AgentSessionErrorStoredRecord));
}

function safeObject<T>(value: unknown): T | undefined {
  if (!isObject(value)) return undefined;
  return value as T;
}

function safeScope(value: unknown): AgentSessionScope | undefined {
  if (value === 'asset' || value === 'project') return value;
  return undefined;
}

function buildBaseFields(
  value: Record<string, unknown>,
  fallbackSessionId: string,
): Omit<
  AgentAssetSessionRecord,
  'scope' | 'targetAssetPath' | 'parentSessionId' | 'inheritedEvidenceSummary'
> {
  const sessionId = safeString(value.sessionId, fallbackSessionId);
  const userIntent = safeString(value.userIntent, '');
  const createdAt = safeString(value.createdAt, new Date().toISOString());
  const updatedAt = safeString(value.updatedAt, createdAt);
  const currentState: AgentLoopState = isAgentLoopState(value.currentState)
    ? value.currentState
    : 'interrupted';
  const retryCount = safeNumber(value.retryCount, 0);
  const maxRetries = safeNumber(value.maxRetries, 3);
  const proposals = normalizeStoredProposals(value.proposals, updatedAt);
  const contextSnapshot = safeObject<AgentAssetSessionRecord['contextSnapshot']>(
    value.contextSnapshot,
  );
  const failureReason = safeOptionalString(value.failureReason);
  const closedAt = safeOptionalString(value.closedAt);
  const closeReason = isAgentLoopCloseReason(value.closeReason)
    ? value.closeReason
    : undefined;
  const lastProposalFailure = safeObject<AgentAssetSessionRecord['lastProposalFailure']>(
    value.lastProposalFailure,
  );
  const errors = normalizeStoredErrors(value.errors, updatedAt);

  return {
    schemaVersion: REPAIR_SESSION_SCHEMA_VERSION_VALUE,
    sessionId,
    userIntent,
    createdAt,
    updatedAt,
    currentState,
    retryCount,
    maxRetries,
    proposals,
    ...(contextSnapshot ? { contextSnapshot } : {}),
    ...(failureReason ? { failureReason } : {}),
    ...(closedAt ? { closedAt } : {}),
    ...(closeReason ? { closeReason } : {}),
    ...(errors.length > 0 ? { errors } : {}),
    ...(lastProposalFailure ? { lastProposalFailure } : {}),
  };
}

export function coerceRepairSessionRecord(
  value: unknown,
  fallbackSessionId: string,
): CoerceRecordResult {
  if (!isObject(value)) {
    return {
      record: interruptedStub(fallbackSessionId, 'Session file is not a JSON object.'),
      shouldRewrite: false,
    };
  }

  const storedScope = safeScope(value.scope);
  const storedTargetAssetPath =
    typeof value.targetAssetPath === 'string' && value.targetAssetPath.length > 0
      ? value.targetAssetPath
      : undefined;

  let scope: AgentSessionScope;
  if (storedScope === 'asset' || storedScope === 'project') {
    scope = storedScope;
  } else if (storedTargetAssetPath) {
    scope = 'asset';
  } else {
    scope = 'project';
  }

  const baseFields = buildBaseFields(value, fallbackSessionId);

  if (scope === 'asset') {
    if (!storedTargetAssetPath) {
      const fallback: AgentProjectSessionRecord = {
        ...baseFields,
        scope: 'project',
      };
      const interrupted: AgentProjectSessionRecord = {
        ...fallback,
        currentState: 'interrupted',
        failureReason: 'Asset scope record is missing targetAssetPath.',
        closeReason: 'interrupted',
      };
      return { record: interrupted, shouldRewrite: true };
    }

    const parentSessionId = safeOptionalString(value.parentSessionId);
    const inheritedEvidenceSummary = safeOptionalString(value.inheritedEvidenceSummary);
    const sandbox = safeObject<AgentAssetSessionRecord['sandbox']>(value.sandbox);
    const rawApproval = safeObject<AgentAssetSessionRecord['approval']>(value.approval);
    const approval = rawApproval
      ? {
          ...rawApproval,
          requestedAt: safeString(rawApproval.requestedAt, baseFields.updatedAt),
        }
      : undefined;
    const promote = safeObject<AgentAssetSessionRecord['promote']>(value.promote);

    const assetRecord: AgentAssetSessionRecord = {
      ...baseFields,
      scope: 'asset',
      targetAssetPath: storedTargetAssetPath,
      ...(parentSessionId ? { parentSessionId } : {}),
      ...(inheritedEvidenceSummary ? { inheritedEvidenceSummary } : {}),
      ...(sandbox ? { sandbox } : {}),
      ...(approval ? { approval } : {}),
      ...(promote ? { promote } : {}),
    };

    return finalizeRecord(value, assetRecord);
  }

  const projectRecord: AgentProjectSessionRecord = {
    ...baseFields,
    scope: 'project',
  };
  return finalizeRecord(value, projectRecord);
}

function finalizeRecord(
  raw: Record<string, unknown>,
  record: RepairSessionRecord,
): CoerceRecordResult {
  const unknownSchema = raw.schemaVersion !== REPAIR_SESSION_SCHEMA_VERSION_VALUE;
  const invalidState = !isAgentLoopState(raw.currentState);
  if (unknownSchema || invalidState) {
    record.currentState = 'interrupted';
    record.updatedAt = new Date().toISOString();
    record.failureReason = unknownSchema
      ? 'Unknown repair session schema version.'
      : 'Invalid repair session state.';
    record.closeReason = 'interrupted';
    return { record, shouldRewrite: true };
  }

  if (record.currentState === 'interrupted' && record.closeReason !== 'interrupted') {
    record.closeReason = 'interrupted';
  }

  return { record, shouldRewrite: false };
}

export function canEnterExecutionState(
  scope: AgentSessionScope,
  state: AgentLoopState,
): boolean {
  if (scope === 'project') {
    return state === 'draft'
      || state === 'diagnosing'
      || state === 'proposing'
      || state === 'done'
      || state === 'escalated_done'
      || state === 'closed'
      || state === 'interrupted';
  }
  return true;
}

export function canCallExecutionAction(
  scope: AgentSessionScope,
  action: 'approve' | 'reject' | 'apply-sandbox' | 'duplicate-sandbox' | 'compile-sandbox' | 'promote',
): boolean {
  if (scope === 'project') return false;
  return true;
}

export function appendSessionErrorToRecord(
  record: RepairSessionRecord,
  error: AgentSessionErrorStoredRecord,
): RepairSessionRecord {
  const existing = record.errors ?? [];
  if (existing.some(item => item.errorId === error.errorId)) {
    return record;
  }
  return {
    ...record,
    errors: [...existing, error],
  };
}

export type AgentSessionSaveResult =
  | { ok: true }
  | { ok: false; errorCode: 'store_error'; message: string };

type PersistenceBaseDeps = {
  save: (record: RepairSessionRecord) => Promise<AgentSessionSaveResult>;
  emitError: (event: AgentSessionErrorEvent) => void;
  now: () => string;
  createErrorId: () => string;
};

type SaveProgressDeps = PersistenceBaseDeps & {
  emitProgress: (event: AgentProgressEvent) => void;
};

type SaveTerminalErrorDeps = PersistenceBaseDeps & {
  emitProgress: (event: AgentProgressEvent) => void;
  emitClosed: (event: AgentSessionClosedEvent) => void;
};

export type AgentSessionPersistenceResult =
  | { ok: true }
  | { ok: false; errorCode: 'store_error'; message: string };

function createPersistenceFallback(
  record: RepairSessionRecord,
  saved: Extract<AgentSessionSaveResult, { ok: false }>,
  deps: PersistenceBaseDeps,
  details: Record<string, unknown>,
): AgentSessionErrorEvent {
  return {
    sessionId: record.sessionId,
    errorId: deps.createErrorId(),
    errorCode: 'store_fallback',
    message: `Session data was not persisted: ${saved.message}`,
    scope: record.scope,
    recoverable: true,
    createdAt: deps.now(),
    details: {
      persistence: 'not_persisted',
      ...details,
      saveErrorCode: saved.errorCode,
      saveMessage: saved.message,
    },
  };
}

export async function saveRecordAndEmitProgress(
  record: RepairSessionRecord,
  deps: SaveProgressDeps,
): Promise<AgentSessionPersistenceResult> {
  const updatedRecord = {
    ...record,
    updatedAt: deps.now(),
  } as RepairSessionRecord;
  const saved = await deps.save(updatedRecord);
  if (!saved.ok) {
    deps.emitError(createPersistenceFallback(record, saved, deps, {
      attemptedState: record.currentState,
    }));
    return saved;
  }

  Object.assign(record, updatedRecord);
  deps.emitProgress({
    sessionId: record.sessionId,
    currentState: record.currentState,
    updatedAt: record.updatedAt,
    retryCount: record.retryCount,
  });
  return { ok: true };
}

export async function persistSessionErrorBeforeEmit(
  record: RepairSessionRecord,
  error: AgentSessionErrorStoredRecord,
  deps: PersistenceBaseDeps,
): Promise<AgentSessionPersistenceResult> {
  const updatedRecord = appendSessionErrorToRecord(
    {
      ...record,
      updatedAt: error.createdAt,
    } as RepairSessionRecord,
    error,
  );
  const saved = await deps.save(updatedRecord);
  if (!saved.ok) {
    deps.emitError(createPersistenceFallback(record, saved, deps, {
      originalErrorId: error.errorId,
      originalErrorCode: error.errorCode,
    }));
    return saved;
  }

  Object.assign(record, updatedRecord);
  deps.emitError(error);
  return { ok: true };
}

function terminalStateForCloseReason(
  closeReason: AgentLoopCloseReason,
): AgentLoopState {
  if (closeReason === 'done') return 'done';
  if (closeReason === 'escalated') return 'escalated_done';
  return 'closed';
}

export async function persistTerminalSessionErrorBeforeEmit(
  record: RepairSessionRecord,
  error: AgentSessionErrorStoredRecord,
  closeReason: AgentLoopCloseReason,
  failureReason: string,
  deps: SaveTerminalErrorDeps,
): Promise<AgentSessionPersistenceResult> {
  const closedAt = deps.now();
  const terminalRecord = appendSessionErrorToRecord(
    {
      ...record,
      currentState: terminalStateForCloseReason(closeReason),
      updatedAt: closedAt,
      closedAt,
      closeReason,
      failureReason,
    } as RepairSessionRecord,
    error,
  );
  const saved = await deps.save(terminalRecord);
  if (!saved.ok) {
    deps.emitError(createPersistenceFallback(record, saved, deps, {
      originalErrorId: error.errorId,
      originalErrorCode: error.errorCode,
      attemptedState: terminalRecord.currentState,
      attemptedCloseReason: closeReason,
    }));
    return saved;
  }

  Object.assign(record, terminalRecord);
  deps.emitProgress({
    sessionId: record.sessionId,
    currentState: record.currentState,
    updatedAt: record.updatedAt,
    retryCount: record.retryCount,
  });
  deps.emitError(error);
  deps.emitClosed({
    sessionId: record.sessionId,
    closeReason,
    closedAt,
  });
  return { ok: true };
}

export function buildInheritedEvidenceSummary(
  parent: AgentProjectSessionRecord,
  maxLength: number = AGENT_PROPOSAL_INHERITED_EVIDENCE_SUMMARY_MAX,
): string {
  const segments: string[] = [];
  for (const proposal of parent.proposals) {
    if (proposal.kind !== 'diagnosis') continue;
    const parts: string[] = [];
    if (proposal.summary) parts.push(`# ${proposal.summary}`);
    if (proposal.evidenceSummary) parts.push(proposal.evidenceSummary);
    const candidates = proposal.candidateAssets ?? [];
    if (candidates.length > 0) {
      parts.push('Candidates:');
      for (const candidate of candidates) {
        parts.push(`- ${candidate.assetPath} (${candidate.confidence}): ${candidate.reason}`);
      }
    }
    if (proposal.suggestedNextSteps && proposal.suggestedNextSteps.length > 0) {
      parts.push(`Next steps: ${proposal.suggestedNextSteps.join('; ')}`);
    }
    if (parts.length > 0) {
      segments.push(parts.join('\n'));
    }
  }
  if (segments.length === 0) return '';
  const combined = segments.join('\n\n');
  return combined.length > maxLength ? combined.slice(0, maxLength) : combined;
}
