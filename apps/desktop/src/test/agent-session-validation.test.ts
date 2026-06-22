import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateStartSessionRequest,
  coerceRepairSessionRecord,
  canEnterExecutionState,
  canCallExecutionAction,
  isAgentLoopState,
  appendSessionErrorToRecord,
  buildInheritedEvidenceSummary,
  persistSessionErrorBeforeEmit,
  persistTerminalSessionErrorBeforeEmit,
  saveRecordAndEmitProgress,
} from '../main/agent-session-validation';
import { REPAIR_SESSION_SCHEMA_VERSION } from '@omue/shared-protocol';
import type {
  AgentAssetSessionRecord,
  AgentProjectSessionRecord,
  AgentSessionErrorStoredRecord,
} from '@omue/shared-protocol';

test('validateStartSessionRequest: trims and accepts valid asset request', () => {
  const result = validateStartSessionRequest({
    scope: 'asset',
    userIntent: ' fix compile error ',
    targetAssetPath: '/Game/Test/BP_A',
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.request.scope, 'asset');
    assert.equal(result.request.userIntent, 'fix compile error');
    assert.equal(result.request.targetAssetPath, '/Game/Test/BP_A');
  }
});

test('validateStartSessionRequest: rejects empty userIntent for asset scope', () => {
  const result = validateStartSessionRequest({
    scope: 'asset',
    userIntent: '   ',
    targetAssetPath: '/Game/Test/BP_A',
  });
  assert.equal(result.ok, false);
});

test('validateStartSessionRequest: rejects userIntent longer than 2000 characters', () => {
  const result = validateStartSessionRequest({
    scope: 'project',
    userIntent: 'x'.repeat(2001),
  });
  assert.equal(result.ok, false);
});

test('validateStartSessionRequest: project scope rejects targetAssetPath', () => {
  const result = validateStartSessionRequest({
    scope: 'project',
    userIntent: 'find compile failures',
    targetAssetPath: '/Game/Test/BP_A',
  });
  assert.equal(result.ok, false);
});

test('validateStartSessionRequest: asset scope requires targetAssetPath', () => {
  const result = validateStartSessionRequest({
    scope: 'asset',
    userIntent: 'fix it',
  });
  assert.equal(result.ok, false);
});

test('validateStartSessionRequest: accepts valid project request', () => {
  const result = validateStartSessionRequest({
    scope: 'project',
    userIntent: 'find compile failures',
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.request.scope, 'project');
  }
});

test('validateStartSessionRequest: rejects non-object input', () => {
  const result = validateStartSessionRequest(null);
  assert.equal(result.ok, false);
});

test('validateStartSessionRequest: rejects invalid scope', () => {
  const result = validateStartSessionRequest({
    scope: 'global',
    userIntent: 'do something',
  });
  assert.equal(result.ok, false);
});

test('validateStartSessionRequest: accepts asset request with parentSessionId and inheritedEvidenceSummary', () => {
  const result = validateStartSessionRequest({
    scope: 'asset',
    userIntent: 'fix',
    targetAssetPath: '/Game/Test/BP_A',
    parentSessionId: 'project-session-123',
    inheritedEvidenceSummary: 'some evidence',
  });
  assert.equal(result.ok, true);
  if (result.ok && result.request.scope === 'asset') {
    assert.equal(result.request.parentSessionId, 'project-session-123');
    assert.equal(result.request.inheritedEvidenceSummary, 'some evidence');
  }
});

test('validateStartSessionRequest: rejects inheritedEvidenceSummary over 8000 characters', () => {
  const result = validateStartSessionRequest({
    scope: 'asset',
    userIntent: 'fix',
    targetAssetPath: '/Game/Test/BP_A',
    inheritedEvidenceSummary: 'x'.repeat(8001),
  });
  assert.equal(result.ok, false);
});

test('coerceRepairSessionRecord: legacy v1 record with target path becomes asset scope', () => {
  const legacyRecord = {
    schemaVersion: 'omue.repairSession.v1',
    sessionId: 'legacy-1',
    targetAssetPath: '/Game/Test/BP_Legacy',
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
    currentState: 'draft',
    retryCount: 0,
    maxRetries: 3,
    proposals: [],
  };
  const { record } = coerceRepairSessionRecord(legacyRecord, 'legacy-1');
  assert.equal(record.scope, 'asset');
  assert.equal(record.sessionId, 'legacy-1');
  assert.equal(record.userIntent, '');
  if (record.scope === 'asset') {
    assert.equal(record.targetAssetPath, '/Game/Test/BP_Legacy');
  }
});

test('coerceRepairSessionRecord: rejects non-object input with interrupted stub', () => {
  const { record } = coerceRepairSessionRecord('not an object', 'fallback-id');
  assert.equal(record.currentState, 'interrupted');
  assert.equal(record.closeReason, 'interrupted');
});

test('coerceRepairSessionRecord: legacy v1 record without target path becomes project scope', () => {
  const legacyRecord = {
    schemaVersion: 'omue.repairSession.v1',
    sessionId: 'legacy-2',
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
    currentState: 'draft',
    retryCount: 0,
    maxRetries: 3,
    proposals: [],
  };
  const { record } = coerceRepairSessionRecord(legacyRecord, 'legacy-2');
  assert.equal(record.scope, 'project');
});

test('coerceRepairSessionRecord: detects unknown schema and marks interrupted', () => {
  const future = {
    schemaVersion: 'omue.repairSession.v999',
    sessionId: 'future',
    scope: 'project',
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
    currentState: 'draft',
    retryCount: 0,
    maxRetries: 3,
    proposals: [],
  };
  const { record, shouldRewrite } = coerceRepairSessionRecord(future, 'future');
  assert.equal(record.currentState, 'interrupted');
  assert.equal(shouldRewrite, true);
});

test('canEnterExecutionState: project cannot enter execution states', () => {
  assert.equal(canEnterExecutionState('project', 'draft'), true);
  assert.equal(canEnterExecutionState('project', 'diagnosing'), true);
  assert.equal(canEnterExecutionState('project', 'proposing'), true);
  assert.equal(canEnterExecutionState('project', 'payload_validating'), false);
  assert.equal(canEnterExecutionState('project', 'preflighting'), false);
  assert.equal(canEnterExecutionState('project', 'sandbox_duplicating'), false);
  assert.equal(canEnterExecutionState('project', 'sandbox_compiling'), false);
  assert.equal(canEnterExecutionState('project', 'awaiting_approval'), false);
  assert.equal(canEnterExecutionState('project', 'promoting'), false);
  assert.equal(canEnterExecutionState('project', 'done'), true);
  assert.equal(canEnterExecutionState('project', 'escalated_done'), true);
  assert.equal(canEnterExecutionState('project', 'closed'), true);
  assert.equal(canEnterExecutionState('project', 'interrupted'), true);
});

test('canEnterExecutionState: asset can enter all states', () => {
  assert.equal(canEnterExecutionState('asset', 'draft'), true);
  assert.equal(canEnterExecutionState('asset', 'payload_validating'), true);
  assert.equal(canEnterExecutionState('asset', 'promoting'), true);
  assert.equal(canEnterExecutionState('asset', 'awaiting_approval'), true);
});

test('canCallExecutionAction: project cannot call execution actions', () => {
  assert.equal(canCallExecutionAction('project', 'approve'), false);
  assert.equal(canCallExecutionAction('project', 'reject'), false);
  assert.equal(canCallExecutionAction('project', 'apply-sandbox'), false);
  assert.equal(canCallExecutionAction('project', 'duplicate-sandbox'), false);
  assert.equal(canCallExecutionAction('project', 'compile-sandbox'), false);
  assert.equal(canCallExecutionAction('project', 'promote'), false);
});

test('canCallExecutionAction: asset can call execution actions', () => {
  assert.equal(canCallExecutionAction('asset', 'approve'), true);
  assert.equal(canCallExecutionAction('asset', 'promote'), true);
});

test('isAgentLoopState: detects known and unknown states', () => {
  assert.equal(isAgentLoopState('draft'), true);
  assert.equal(isAgentLoopState('awaiting_approval'), true);
  assert.equal(isAgentLoopState('not_a_state'), false);
  assert.equal(isAgentLoopState(123), false);
});

test('coerceRepairSessionRecord: preserves persisted errors array', () => {
  const record = {
    schemaVersion: REPAIR_SESSION_SCHEMA_VERSION,
    sessionId: 's-errors',
    scope: 'project',
    userIntent: 'investigate',
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
    currentState: 'draft',
    retryCount: 0,
    maxRetries: 3,
    proposals: [],
    errors: [
      {
        errorId: 'err-1',
        sessionId: 's-errors',
        scope: 'project',
        errorCode: 'context_snapshot_unavailable',
        message: 'no snapshot',
        recoverable: true,
        createdAt: '2026-06-01T00:00:00.000Z',
      },
    ],
  };
  const { record: coerced } = coerceRepairSessionRecord(record, 's-errors');
  assert.ok(coerced.errors);
  assert.equal(coerced.errors?.length, 1);
  assert.equal(coerced.errors?.[0].errorId, 'err-1');
});

test('coerceRepairSessionRecord: missing errors field does not inject one', () => {
  const record = {
    schemaVersion: REPAIR_SESSION_SCHEMA_VERSION,
    sessionId: 's-no-errors',
    scope: 'project',
    userIntent: 'investigate',
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
    currentState: 'draft',
    retryCount: 0,
    maxRetries: 3,
    proposals: [],
  };
  const { record: coerced } = coerceRepairSessionRecord(record, 's-no-errors');
  assert.equal(coerced.errors, undefined);
});

test('appendSessionErrorToRecord: appends a new error to a record without errors', () => {
  const session: AgentProjectSessionRecord = {
    schemaVersion: REPAIR_SESSION_SCHEMA_VERSION,
    sessionId: 's-app',
    scope: 'project',
    userIntent: 'x',
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
    currentState: 'draft',
    retryCount: 0,
    maxRetries: 3,
    proposals: [],
  };
  const error: AgentSessionErrorStoredRecord = {
    errorId: 'err-new',
    sessionId: 's-app',
    scope: 'project',
    errorCode: 'no_provider_config',
    message: 'no provider',
    recoverable: true,
    createdAt: '2026-06-01T00:00:00.000Z',
  };
  const updated = appendSessionErrorToRecord(session, error);
  assert.equal(updated.errors?.length, 1);
  assert.equal(updated.errors?.[0].errorId, 'err-new');
});

test('appendSessionErrorToRecord: dedupes by errorId', () => {
  const session: AgentProjectSessionRecord = {
    schemaVersion: REPAIR_SESSION_SCHEMA_VERSION,
    sessionId: 's-dup',
    scope: 'project',
    userIntent: 'x',
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
    currentState: 'draft',
    retryCount: 0,
    maxRetries: 3,
    proposals: [],
    errors: [
      {
        errorId: 'err-shared',
        sessionId: 's-dup',
        scope: 'project',
        errorCode: 'no_provider_config',
        message: 'm',
        recoverable: true,
        createdAt: '2026-06-01T00:00:00.000Z',
      },
    ],
  };
  const sameId: AgentSessionErrorStoredRecord = {
    errorId: 'err-shared',
    sessionId: 's-dup',
    scope: 'project',
    errorCode: 'no_provider_config',
    message: 'm',
    recoverable: true,
    createdAt: '2026-06-01T00:00:00.000Z',
  };
  const updated = appendSessionErrorToRecord(session, sameId);
  assert.equal(updated.errors?.length, 1, 'Identical errorId must dedupe');
});

test('persistSessionErrorBeforeEmit: saves appended error before emitting it', async () => {
  const order: string[] = [];
  const capture: { savedRecord?: AgentProjectSessionRecord } = {};
  const session: AgentProjectSessionRecord = {
    schemaVersion: REPAIR_SESSION_SCHEMA_VERSION,
    sessionId: 's-persist-error',
    scope: 'project',
    userIntent: 'x',
    createdAt: '2026-06-20T10:00:00.000Z',
    updatedAt: '2026-06-20T10:00:00.000Z',
    currentState: 'diagnosing',
    retryCount: 0,
    maxRetries: 3,
    proposals: [],
  };
  const error: AgentSessionErrorStoredRecord = {
    errorId: 'err-persist',
    sessionId: session.sessionId,
    scope: 'project',
    errorCode: 'context_snapshot_unavailable',
    message: 'Bridge unavailable',
    recoverable: true,
    createdAt: '2026-06-20T10:01:00.000Z',
  };

  const result = await persistSessionErrorBeforeEmit(session, error, {
    save: async record => {
      order.push('save');
      capture.savedRecord = JSON.parse(JSON.stringify(record)) as AgentProjectSessionRecord;
      return { ok: true };
    },
    emitError: emitted => {
      order.push(`emit:${emitted.errorId}`);
    },
    now: () => '2026-06-20T10:01:01.000Z',
    createErrorId: () => 'fallback-unused',
  });

  assert.equal(result.ok, true);
  assert.deepEqual(order, ['save', 'emit:err-persist']);
  assert.equal(capture.savedRecord?.errors?.[0]?.errorId, 'err-persist');
  assert.equal(session.errors?.[0]?.errorId, 'err-persist');
});

test('persistTerminalSessionErrorBeforeEmit: saved record survives reload with error and terminal metadata', async () => {
  const order: string[] = [];
  let savedJson = '';
  const session: AgentProjectSessionRecord = {
    schemaVersion: REPAIR_SESSION_SCHEMA_VERSION,
    sessionId: 's-terminal-error',
    scope: 'project',
    userIntent: 'x',
    createdAt: '2026-06-20T10:00:00.000Z',
    updatedAt: '2026-06-20T10:00:00.000Z',
    currentState: 'proposing',
    retryCount: 0,
    maxRetries: 3,
    proposals: [],
  };
  const error: AgentSessionErrorStoredRecord = {
    errorId: 'err-terminal',
    sessionId: session.sessionId,
    scope: 'project',
    errorCode: 'no_provider_config',
    message: 'AI provider not configured.',
    recoverable: true,
    createdAt: '2026-06-20T10:02:00.000Z',
  };

  const result = await persistTerminalSessionErrorBeforeEmit(
    session,
    error,
    'escalated',
    error.message,
    {
      save: async record => {
        order.push('save');
        savedJson = JSON.stringify(record);
        return { ok: true };
      },
      emitProgress: () => order.push('emit-progress'),
      emitError: () => order.push('emit-error'),
      emitClosed: () => order.push('emit-closed'),
      now: () => '2026-06-20T10:03:00.000Z',
      createErrorId: () => 'fallback-unused',
    },
  );

  assert.equal(result.ok, true);
  assert.deepEqual(order, ['save', 'emit-progress', 'emit-error', 'emit-closed']);
  const reloaded = coerceRepairSessionRecord(JSON.parse(savedJson), session.sessionId).record;
  assert.equal(reloaded.errors?.[0]?.errorId, 'err-terminal');
  assert.equal(reloaded.currentState, 'escalated_done');
  assert.equal(reloaded.closeReason, 'escalated');
  assert.equal(reloaded.closedAt, '2026-06-20T10:03:00.000Z');
  assert.equal(reloaded.failureReason, error.message);
});

test('persistSessionErrorBeforeEmit: save failure emits one factual non-persisted fallback', async () => {
  const emitted: AgentSessionErrorStoredRecord[] = [];
  const session: AgentProjectSessionRecord = {
    schemaVersion: REPAIR_SESSION_SCHEMA_VERSION,
    sessionId: 's-error-save-failed',
    scope: 'project',
    userIntent: 'x',
    createdAt: '2026-06-20T10:00:00.000Z',
    updatedAt: '2026-06-20T10:00:00.000Z',
    currentState: 'diagnosing',
    retryCount: 0,
    maxRetries: 3,
    proposals: [],
  };
  const error: AgentSessionErrorStoredRecord = {
    errorId: 'err-original',
    sessionId: session.sessionId,
    scope: 'project',
    errorCode: 'context_snapshot_unavailable',
    message: 'Bridge unavailable',
    recoverable: true,
    createdAt: '2026-06-20T10:01:00.000Z',
  };

  const result = await persistSessionErrorBeforeEmit(session, error, {
    save: async () => ({ ok: false, errorCode: 'store_error', message: 'disk full' }),
    emitError: fallback => emitted.push(fallback),
    now: () => '2026-06-20T10:01:01.000Z',
    createErrorId: () => 'err-store-fallback',
  });

  assert.equal(result.ok, false);
  assert.equal(session.errors, undefined, 'failed save must not claim the in-memory record was persisted');
  assert.equal(emitted.length, 1);
  assert.equal(emitted[0]?.errorId, 'err-store-fallback');
  assert.equal(emitted[0]?.errorCode, 'store_fallback');
  assert.equal(emitted[0]?.createdAt, '2026-06-20T10:01:01.000Z');
  assert.deepEqual(emitted[0]?.details, {
    persistence: 'not_persisted',
    originalErrorId: 'err-original',
    originalErrorCode: 'context_snapshot_unavailable',
    saveErrorCode: 'store_error',
    saveMessage: 'disk full',
  });
});

test('saveRecordAndEmitProgress: save failure emits fallback with timestamp and persistence details', async () => {
  const order: string[] = [];
  const session: AgentProjectSessionRecord = {
    schemaVersion: REPAIR_SESSION_SCHEMA_VERSION,
    sessionId: 's-progress-save-failed',
    scope: 'project',
    userIntent: 'x',
    createdAt: '2026-06-20T10:00:00.000Z',
    updatedAt: '2026-06-20T10:00:00.000Z',
    currentState: 'proposing',
    retryCount: 1,
    maxRetries: 3,
    proposals: [],
  };
  const capture: { fallback?: AgentSessionErrorStoredRecord } = {};

  const result = await saveRecordAndEmitProgress(session, {
    save: async () => {
      order.push('save');
      return { ok: false, errorCode: 'store_error', message: 'read-only filesystem' };
    },
    emitProgress: () => order.push('emit-progress'),
    emitError: event => {
      order.push('emit-error');
      capture.fallback = event;
    },
    now: () => '2026-06-20T10:04:00.000Z',
    createErrorId: () => 'err-progress-fallback',
  });

  assert.equal(result.ok, false);
  assert.deepEqual(order, ['save', 'emit-error']);
  assert.equal(capture.fallback?.createdAt, '2026-06-20T10:04:00.000Z');
  assert.equal(capture.fallback?.recoverable, true);
  assert.deepEqual(capture.fallback?.details, {
    persistence: 'not_persisted',
    attemptedState: 'proposing',
    saveErrorCode: 'store_error',
    saveMessage: 'read-only filesystem',
  });
});

test('coerceRepairSessionRecord: legacy missing event times use session updatedAt at compatibility boundary', () => {
  const updatedAt = '2026-06-20T10:05:00.000Z';
  const { record } = coerceRepairSessionRecord({
    schemaVersion: REPAIR_SESSION_SCHEMA_VERSION,
    sessionId: 's-legacy-times',
    scope: 'asset',
    userIntent: 'x',
    targetAssetPath: '/Game/Test/BP_A',
    createdAt: '2026-06-20T10:00:00.000Z',
    updatedAt,
    currentState: 'awaiting_approval',
    retryCount: 0,
    maxRetries: 3,
    proposals: [{
      proposalId: 'proposal-is-not-time',
      kind: 'escalation',
      escalationReason: 'legacy',
      typedPayload: null,
    }],
    errors: [{
      errorId: 'error-is-not-time',
      sessionId: 's-legacy-times',
      scope: 'asset',
      errorCode: 'legacy_error',
      message: 'legacy',
      recoverable: true,
    }],
    approval: {
      approvalId: 'approval-is-not-time',
    },
  }, 's-legacy-times');

  assert.equal(record.proposals[0]?.proposedAt, updatedAt);
  assert.equal(record.errors?.[0]?.createdAt, updatedAt);
  assert.equal(record.scope, 'asset');
  if (record.scope === 'asset') {
    assert.equal(record.approval?.requestedAt, updatedAt);
  }
});

test('buildInheritedEvidenceSummary: returns empty for parent without diagnosis proposals', () => {
  const parent: AgentProjectSessionRecord = {
    schemaVersion: REPAIR_SESSION_SCHEMA_VERSION,
    sessionId: 'p-empty',
    scope: 'project',
    userIntent: 'x',
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
    currentState: 'done',
    retryCount: 0,
    maxRetries: 3,
    proposals: [],
  };
  assert.equal(buildInheritedEvidenceSummary(parent), '');
});

test('buildInheritedEvidenceSummary: composes evidence from diagnosis proposals', () => {
  const parent: AgentProjectSessionRecord = {
    schemaVersion: REPAIR_SESSION_SCHEMA_VERSION,
    sessionId: 'p-diag',
    scope: 'project',
    userIntent: 'find compile failures',
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
    currentState: 'done',
    retryCount: 0,
    maxRetries: 3,
    proposals: [
      {
        proposalId: 'p-1',
        proposedAt: '2026-06-01T00:00:00.000Z',
        kind: 'diagnosis',
        summary: 'Compile failures in input mapping',
        evidenceSummary: 'Repeated IA_Jump references',
        confidence: 'medium',
        risk: 'low',
        candidateAssets: [
          { assetPath: '/Game/Input/IMC_Default', reason: 'Missing SpaceBar mapping', confidence: 'high' },
        ],
        suggestedNextSteps: ['Open IMC_Default'],
        typedPayload: null,
      },
    ],
  };
  const summary = buildInheritedEvidenceSummary(parent);
  assert.ok(summary.includes('Compile failures in input mapping'));
  assert.ok(summary.includes('Repeated IA_Jump references'));
  assert.ok(summary.includes('/Game/Input/IMC_Default'));
  assert.ok(summary.includes('Open IMC_Default'));
});

test('buildInheritedEvidenceSummary: truncates to maxLength', () => {
  const parent: AgentProjectSessionRecord = {
    schemaVersion: REPAIR_SESSION_SCHEMA_VERSION,
    sessionId: 'p-long',
    scope: 'project',
    userIntent: 'x',
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
    currentState: 'done',
    retryCount: 0,
    maxRetries: 3,
    proposals: [
      {
        proposalId: 'p-1',
        proposedAt: '2026-06-01T00:00:00.000Z',
        kind: 'diagnosis',
        summary: 'summary',
        evidenceSummary: 'x'.repeat(100),
        confidence: 'low',
        risk: 'low',
        suggestedNextSteps: [],
        typedPayload: null,
      },
    ],
  };
  const summary = buildInheritedEvidenceSummary(parent, 50);
  assert.equal(summary.length, 50, 'Inherited summary must be truncated to maxLength');
});

test('buildInheritedEvidenceSummary: ignores non-diagnosis proposals', () => {
  const parent: AgentProjectSessionRecord = {
    schemaVersion: REPAIR_SESSION_SCHEMA_VERSION,
    sessionId: 'p-mix',
    scope: 'project',
    userIntent: 'x',
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
    currentState: 'done',
    retryCount: 0,
    maxRetries: 3,
    proposals: [
      {
        proposalId: 'esc-1',
        proposedAt: '2026-06-01T00:00:00.000Z',
        kind: 'escalation',
        escalationReason: 'Bridge unreachable',
        typedPayload: null,
      },
    ],
  };
  assert.equal(buildInheritedEvidenceSummary(parent), '');
});
