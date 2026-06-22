import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type {
  AgentCard,
  AgentApprovalRequestedEvent,
  AgentAssetSessionRecord,
  AgentProjectSessionRecord,
  AgentCardActionId,
  AgentProposalEvent,
  AgentSandboxCompileResultEvent,
  AgentSessionClosedEvent,
  AgentSessionErrorEvent,
} from '@omue/shared-protocol';
import { REPAIR_SESSION_SCHEMA_VERSION } from '@omue/shared-protocol';
import {
  buildAgentCards,
  buildAgentCardsWithDiagnostics,
  adaptAgentProtocolEvent,
  createAgentCardActionHandler,
  getVisiblePendingApproval,
  isAgentCardActionEnabled,
  reducePendingApprovals,
  resolveAgentCardActionIntent,
  resolveAgentCardActionTargets,
  type AgentCardActionTargets,
  type MapperEvent,
} from '../renderer/components/workbench/agentCardMapper';

const SESSION_ID = 'session-integration';
const FIXTURE_TS = '2026-06-20T10:00:00.000Z';

function makeAssetSession(overrides?: Partial<AgentAssetSessionRecord>): AgentAssetSessionRecord {
  return {
    schemaVersion: REPAIR_SESSION_SCHEMA_VERSION,
    sessionId: SESSION_ID,
    scope: 'asset',
    userIntent: 'Repair the test blueprint',
    targetAssetPath: '/Game/Test/BP_A',
    createdAt: FIXTURE_TS,
    updatedAt: FIXTURE_TS,
    currentState: 'draft',
    retryCount: 0,
    maxRetries: 3,
    proposals: [],
    ...overrides,
  };
}

function makeProjectSession(overrides?: Partial<AgentProjectSessionRecord>): AgentProjectSessionRecord {
  return {
    schemaVersion: REPAIR_SESSION_SCHEMA_VERSION,
    sessionId: SESSION_ID,
    scope: 'project',
    userIntent: 'Find compile failures',
    createdAt: FIXTURE_TS,
    updatedAt: FIXTURE_TS,
    currentState: 'draft',
    retryCount: 0,
    maxRetries: 3,
    proposals: [],
    ...overrides,
  };
}

function makeFixProposal(
  proposalId = 'proposal-fix-1',
  proposedAt = FIXTURE_TS,
): AgentAssetSessionRecord['proposals'][number] {
  return {
    proposalId,
    proposedAt,
    kind: 'fix',
    summary: 'Set metadata marker',
    diagnosisSummary: 'Mock diagnosis',
    evidenceSummary: 'Mock evidence',
    confidence: 'medium',
    risk: 'low',
    typedPayload: {
      schemaVersion: 'omue.safeScratchBlueprintMutation.v1',
      payload: {
        schemaVersion: 'omue.safeScratchBlueprintMutation.v1',
        operationKind: 'set_blueprint_metadata_marker',
        targetAssetPath: '/Game/Test/BP_A',
        targetAssetKind: 'blueprint_scratch_fixture',
        allowlistPrefixes: ['/Game/Scratch/'],
        beforeState: { kind: 'missing_or_absent_allowed' },
        afterState: { kind: 'metadata_key_value', key: 'marker', value: 'v2' },
        requireApproval: true,
        requireSnapshot: true,
        display: { summary: 'Set marker on BP_A' },
      },
    },
  };
}

function makeApprovalMapperEvent(
  approvalId = 'approval-1',
  createdAt = '2026-06-20T10:06:00.000Z',
): MapperEvent {
  return {
    id: `event-${approvalId}`,
    kind: 'approval',
    sessionId: SESSION_ID,
    createdAt,
    approvalId,
    approval: { approvalId, requestedAt: createdAt, diffPreview: null },
  };
}

function makeDiagnosisProposal(
  proposalId: string,
  proposedAt: string,
  assetPath: string,
): AgentProjectSessionRecord['proposals'][number] {
  return {
    proposalId,
    proposedAt,
    kind: 'diagnosis',
    summary: `Inspect ${assetPath}`,
    evidenceSummary: `Evidence for ${assetPath}`,
    confidence: 'medium',
    risk: 'low',
    candidateAssets: [{
      assetPath,
      reason: `Candidate ${assetPath}`,
      confidence: 'high',
    }],
    suggestedNextSteps: ['Select the candidate'],
    typedPayload: null,
  };
}

function makeCompileMapperEvent(
  compileResultId: string,
  createdAt: string,
  success = true,
): MapperEvent {
  return {
    id: `event-${compileResultId}`,
    kind: 'compile',
    sessionId: SESSION_ID,
    createdAt,
    compileResultId,
    success,
  };
}

function getActionState(
  card: Pick<AgentCard, 'id' | 'kind'>,
  actionId: AgentCardActionId,
  overrides?: Partial<{
    sessionScope: 'asset' | 'project';
    currentState: AgentAssetSessionRecord['currentState'];
    pendingApprovalId: string | undefined;
    actionTargets: AgentCardActionTargets;
  }>,
): boolean {
  const context = {
    cardId: card.id,
    cardKind: card.kind,
    sessionId: SESSION_ID,
    sessionScope: overrides?.sessionScope ?? 'asset',
    currentState: overrides?.currentState ?? 'awaiting_approval',
    pendingApprovalId: overrides && 'pendingApprovalId' in overrides
      ? overrides.pendingApprovalId
      : 'approval-1',
    actionTargets: overrides?.actionTargets ?? { [actionId]: card.id },
  };
  return isAgentCardActionEnabled(context, actionId);
}

// ─── Real event timestamp tests ─────────────────────────────────

test('compile event completedAt propagates as card createdAt, not compileResultId', () => {
  const session = makeAssetSession();
  const compileTs = '2026-06-20T10:05:00.000Z';
  const events: MapperEvent[] = [
    {
      id: 'compile-1',
      kind: 'compile',
      sessionId: SESSION_ID,
      createdAt: compileTs,
      compileResultId: 'compile-result-001',
      success: true,
    },
  ];
  const cards = buildAgentCards(session, events);
  const validationCard = cards.find(c => c.kind === 'validation-result');
  assert.ok(validationCard, 'validation-result card must exist');
  // The mapper sets createdAt from event.createdAt (which the hook populates from completedAt).
  assert.equal(validationCard.createdAt, compileTs,
    'card createdAt must use real timestamp, not compileResultId');
  assert.notEqual(validationCard.createdAt, 'compile-result-001',
    'card createdAt must NOT be the compileResultId');
});

test('approval event requestedAt propagates as card createdAt, not approvalId', () => {
  const session = makeAssetSession();
  const approvalTs = '2026-06-20T10:06:00.000Z';
  const events: MapperEvent[] = [
    {
      id: 'approval-1',
      kind: 'approval',
      sessionId: SESSION_ID,
      createdAt: approvalTs,
      approvalId: 'approval-001',
      approval: { approvalId: 'approval-001', requestedAt: approvalTs, diffPreview: null },
    },
  ];
  const cards = buildAgentCards(session, events);
  const previewCard = cards.find(c => c.kind === 'change-preview');
  assert.ok(previewCard, 'change-preview card must exist');
  assert.equal(previewCard.createdAt, approvalTs,
    'card createdAt must use requestedAt, not approvalId');
  assert.notEqual(previewCard.createdAt, 'approval-001',
    'card createdAt must NOT be the approvalId');
});

test('error event with real createdAt is not replaced by errorId', () => {
  const session = makeProjectSession();
  const errorTs = '2026-06-20T10:01:00.000Z';
  const events: MapperEvent[] = [
    {
      id: 'error-1',
      kind: 'error',
      sessionId: SESSION_ID,
      createdAt: errorTs,
      errorId: 'err-001',
      errorCode: 'context_snapshot_unavailable',
      message: 'Bridge unreachable',
      scope: 'project',
      recoverable: true,
    },
  ];
  const cards = buildAgentCards(session, events);
  const failureCard = cards.find(c => c.kind === 'failure');
  assert.ok(failureCard, 'failure card must exist');
  assert.equal(failureCard.createdAt, errorTs,
    'card createdAt must be the real error timestamp');
  assert.notEqual(failureCard.createdAt, 'err-001',
    'card createdAt must NOT be the errorId');
});

test('closed event with closedAt uses real timestamp', () => {
  const session = makeAssetSession();
  const closeTs = '2026-06-20T10:10:00.000Z';
  const events: MapperEvent[] = [
    {
      id: 'closed-1',
      kind: 'closed',
      sessionId: SESSION_ID,
      createdAt: closeTs,
      closeReason: 'done',
    },
  ];
  const cards = buildAgentCards(session, events);
  const completion = cards.find(c => c.kind === 'completion');
  assert.ok(completion, 'completion card must exist');
  assert.equal(completion.createdAt, closeTs,
    'card createdAt must be the real closedAt');
});

test('no event ID appears as any card createdAt', () => {
  const session = makeAssetSession();
  const ts = '2026-06-20T10:00:00.000Z';
  const events: MapperEvent[] = [
    { id: 'e1', kind: 'proposal', sessionId: SESSION_ID, createdAt: ts, proposalId: 'p-1', proposal: { kind: 'diagnosis', summary: 's', evidenceSummary: 'e', confidence: 'medium', risk: 'low', candidateAssets: [], suggestedNextSteps: ['next'] } },
    { id: 'e2', kind: 'compile', sessionId: SESSION_ID, createdAt: ts, compileResultId: 'cr-1', success: true },
    { id: 'e3', kind: 'approval', sessionId: SESSION_ID, createdAt: ts, approvalId: 'a-1', approval: { approvalId: 'a-1', requestedAt: ts, diffPreview: null } },
    { id: 'e4', kind: 'error', sessionId: SESSION_ID, createdAt: ts, errorId: 'er-1', errorCode: 'test', message: 'test', scope: 'project', recoverable: false },
    { id: 'e5', kind: 'closed', sessionId: SESSION_ID, createdAt: ts, closeReason: 'done' },
  ];
  const cards = buildAgentCards(session, events);
  for (const card of cards) {
    assert.match(card.createdAt, /^\d{4}-\d{2}-\d{2}T|^\d{4}-\d{2}-\d{2}/,
      `card.createdAt for card ${card.id} (${card.kind}) must be a real timestamp, not an ID`);
    assert.doesNotMatch(card.createdAt, /^(compile-result|approval|err|p-)/,
      `card.createdAt for card ${card.id} (${card.kind}) must NOT be an event ID`);
  }
});

// ─── Error details pass-through test ────────────────────────────

test('error details field is preserved through mapper into FailureCard', () => {
  const session = makeProjectSession();
  const details = { phase: 'project_diagnosis', recoverableAttempts: 2 };
  const events: MapperEvent[] = [
    {
      id: 'e1',
      kind: 'error',
      sessionId: SESSION_ID,
      createdAt: FIXTURE_TS,
      errorId: 'err-details-1',
      errorCode: 'context_snapshot_unavailable',
      message: 'Bridge unreachable',
      scope: 'project',
      recoverable: true,
      details,
    },
  ];
  const cards = buildAgentCards(session, events);
  const failureCard = cards.find(c => c.kind === 'failure');
  assert.ok(failureCard, 'failure card must exist');
  if (failureCard && failureCard.kind === 'failure') {
    assert.deepEqual(failureCard.data.details, details,
      'error details must be preserved in FailureCard data');
  }
});

test('error details from persisted session errors are preserved', () => {
  const details = { phase: 'sandbox_compile' };
  const session = makeProjectSession({
    errors: [
      {
        errorId: 'err-persisted-1',
        sessionId: SESSION_ID,
        scope: 'project',
        errorCode: 'compile_failed',
        message: 'Blueprint compile failed',
        recoverable: true,
        createdAt: FIXTURE_TS,
        details,
      },
    ],
  });
  const cards = buildAgentCards(session, []);
  const failureCard = cards.find(c => c.kind === 'failure' && c.id === `failure:${SESSION_ID}:err-persisted-1`);
  assert.ok(failureCard, 'failure card from persisted error must exist');
  if (failureCard && failureCard.kind === 'failure') {
    assert.deepEqual(failureCard.data.details, details,
      'error details from persisted session must be preserved');
  }
});

// ─── Persisted error recovery test ──────────────────────────────

test('persisted errors with real timestamps are used over event-derived IDs', () => {
  const ts = '2026-06-20T10:00:00.000Z';
  const session = makeProjectSession({
    errors: [
      {
        errorId: 'err-persisted',
        sessionId: SESSION_ID,
        scope: 'project',
        errorCode: 'scope_execution_forbidden',
        message: 'No exec',
        recoverable: false,
        createdAt: ts,
      },
    ],
  });
  const events: MapperEvent[] = [
    {
      id: 'err-event',
      kind: 'error',
      sessionId: SESSION_ID,
      createdAt: ts,
      errorId: 'err-persisted',
      errorCode: 'scope_execution_forbidden',
      message: 'No exec',
      scope: 'project',
      recoverable: false,
    },
  ];
  const cards = buildAgentCards(session, events);
  const failures = cards.filter(c => c.id === `failure:${SESSION_ID}:err-persisted`);
  assert.equal(failures.length, 1,
    'Persisted and event errors with same id must dedupe to exactly one');
  if (failures[0] && failures[0].kind === 'failure') {
    assert.equal(failures[0].data.createdAt, ts,
      'Deduped error must preserve the persisted createdAt');
  }
});

// ─── Deterministic output test ──────────────────────────────────

test('same real-timestamp events produce deterministic card output across intervals', async () => {
  const session = makeAssetSession();
  const events: MapperEvent[] = [
    { id: 'p1', kind: 'proposal', sessionId: SESSION_ID, createdAt: '2026-06-20T10:01:00.000Z', proposalId: 'p-1', proposal: { kind: 'diagnosis', summary: 's', evidenceSummary: 'e', confidence: 'medium', risk: 'low', candidateAssets: [], suggestedNextSteps: ['next'] } },
    { id: 'c1', kind: 'compile', sessionId: SESSION_ID, createdAt: '2026-06-20T10:02:00.000Z', compileResultId: 'cr-1', success: true },
  ];
  const a = buildAgentCards(session, events);
  await new Promise(resolve => setTimeout(resolve, 10));
  const b = buildAgentCards(session, events);
  assert.deepEqual(a, b, 'Mapper must produce identical output for identical real-timestamp input');
});

// ─── Existing test preservation ──────────────────────────────────

test('existing deterministic compile test still passes with real timestamp', async () => {
  const session = makeAssetSession();
  const events: MapperEvent[] = [
    {
      id: 'compile-1',
      kind: 'compile',
      sessionId: SESSION_ID,
      createdAt: '2026-06-20T10:02:00.000Z',
      compileResultId: 'compile-result-001',
      success: true,
    },
  ];
  const a = buildAgentCards(session, events);
  await new Promise(resolve => setTimeout(resolve, 5));
  const b = buildAgentCards(session, events);
  assert.deepEqual(a, b, 'Mapper output must be deep-equal across time intervals');
});

test('existing error deterministic test still passes', async () => {
  const session = makeProjectSession();
  const events: MapperEvent[] = [
    {
      id: '1',
      kind: 'error',
      sessionId: SESSION_ID,
      createdAt: '2026-06-20T10:00:01.000Z',
      errorId: 'error-stable-1',
      errorCode: 'scope_execution_forbidden',
      message: 'Project cannot execute',
      scope: 'project',
      recoverable: false,
    },
  ];
  const a = buildAgentCards(session, events);
  await new Promise(resolve => setTimeout(resolve, 5));
  const b = buildAgentCards(session, events);
  assert.deepEqual(a, b);
});

test('existing legacy proposal parse failure test still passes', () => {
  const session = makeAssetSession();
  const events: MapperEvent[] = [
    {
      id: 'p-bad',
      kind: 'proposal',
      sessionId: SESSION_ID,
      createdAt: '2026-06-20T10:00:01.000Z',
      proposalId: 'p-1',
      typedPayloadJson: 'not valid json',
    },
  ];
  const result = buildAgentCardsWithDiagnostics(session, events);
  const failure = result.cards.find(c => c.kind === 'failure');
  assert.ok(failure);
  assert.equal(result.diagnostics.hasLegacyProposalParseFailed, true);
});

test('existing preservation tests: card ordering, legacy compat, user-intent fields', () => {
  // user-intent card
  const assetSession = makeAssetSession();
  const assetCards = buildAgentCards(assetSession, []);
  const uiCard = assetCards.find(c => c.kind === 'user-intent');
  assert.ok(uiCard);
  if (uiCard && uiCard.kind === 'user-intent') {
    assert.equal(uiCard.data.scope, 'asset');
  }

  // project user-intent
  const projSession = makeProjectSession();
  const projCards = buildAgentCards(projSession, []);
  const projUi = projCards.find(c => c.kind === 'user-intent');
  assert.ok(projUi);
  if (projUi && projUi.kind === 'user-intent') {
    assert.equal(projUi.data.scope, 'project');
  }

  // completion tones preserved
  const events: MapperEvent[] = [
    { id: 'c1', kind: 'closed', sessionId: SESSION_ID, createdAt: FIXTURE_TS, closeReason: 'done' },
  ];
  const cards = buildAgentCards(assetSession, events);
  const complete = cards.find(c => c.kind === 'completion');
  assert.ok(complete);
  if (complete && complete.kind === 'completion') {
    assert.equal(complete.data.tone, 'success');
  }
});

test('production Renderer adapter maps proposal fields and proposedAt without fallback', () => {
  const payload: AgentProposalEvent = {
    sessionId: SESSION_ID,
    proposalId: 'proposal-not-time',
    proposedAt: '2026-06-20T10:11:00.000Z',
    kind: 'diagnosis',
    proposal: {
      kind: 'diagnosis',
      summary: 'summary',
      evidenceSummary: 'evidence',
      confidence: 'high',
      risk: 'low',
      candidateAssets: [],
      suggestedNextSteps: ['next'],
    },
    escalationReason: 'unused legacy field',
  };
  const result = adaptAgentProtocolEvent({ kind: 'proposal', payload });
  assert.equal(result.event.kind, 'proposal');
  assert.equal(result.event.createdAt, payload.proposedAt);
  assert.equal(result.event.proposalId, payload.proposalId);
  assert.equal(result.event.proposalKind, payload.kind);
  assert.deepEqual(result.event.proposal, payload.proposal);
  assert.equal(result.event.escalationReason, payload.escalationReason);
});

test('production Renderer adapter maps compile fields and completedAt without fallback', () => {
  const payload: AgentSandboxCompileResultEvent = {
    sessionId: SESSION_ID,
    compileResultId: 'compile-not-time',
    completedAt: '2026-06-20T10:12:00.000Z',
    success: false,
    errorsJson: '[{"message":"failed"}]',
  };
  const result = adaptAgentProtocolEvent({ kind: 'compile', payload });
  if (result.event.kind !== 'compile') assert.fail('Expected compile event');
  assert.equal(result.event.createdAt, payload.completedAt);
  assert.equal(result.event.compileResultId, payload.compileResultId);
  assert.equal(result.event.success, false);
  assert.equal(result.event.errorsJson, payload.errorsJson);
});

test('production Renderer adapter maps approval fields and requestedAt without fallback', () => {
  const payload: AgentApprovalRequestedEvent = {
    sessionId: SESSION_ID,
    approvalId: 'approval-not-time',
    requestedAt: '2026-06-20T10:13:00.000Z',
    diffPreviewJson: '{"mode":"real","targetAssetPath":"/Game/Test/BP_A"}',
  };
  const result = adaptAgentProtocolEvent({ kind: 'approval', payload });
  if (result.event.kind !== 'approval') assert.fail('Expected approval event');
  assert.equal(result.event.createdAt, payload.requestedAt);
  assert.equal(result.event.approvalId, payload.approvalId);
  assert.equal(result.approval?.requestedAt, payload.requestedAt);
  assert.deepEqual(result.approval?.diffPreview, {
    mode: 'real',
    targetAssetPath: '/Game/Test/BP_A',
  });
  assert.equal(result.compatibilityError, undefined);
});

test('production Renderer adapter timestamps approval parse failures with requestedAt', () => {
  const payload: AgentApprovalRequestedEvent = {
    sessionId: SESSION_ID,
    approvalId: 'approval-bad-json',
    requestedAt: '2026-06-20T10:14:00.000Z',
    diffPreviewJson: '{bad json',
  };
  const result = adaptAgentProtocolEvent({ kind: 'approval', payload });
  assert.equal(result.compatibilityError?.errorCode, 'diff_preview_parse_failed');
  assert.equal(result.compatibilityError?.createdAt, payload.requestedAt);
  assert.equal(result.event.createdAt, payload.requestedAt);
});

test('production Renderer adapter maps structured error details and createdAt without fallback', () => {
  const payload: AgentSessionErrorEvent = {
    sessionId: SESSION_ID,
    errorId: 'error-not-time',
    errorCode: 'store_fallback',
    message: 'not persisted',
    scope: 'project',
    recoverable: true,
    createdAt: '2026-06-20T10:15:00.000Z',
    details: { persistence: 'not_persisted' },
  };
  const result = adaptAgentProtocolEvent({ kind: 'error', payload });
  if (result.event.kind !== 'error') assert.fail('Expected error event');
  assert.equal(result.event.createdAt, payload.createdAt);
  assert.equal(result.event.errorId, payload.errorId);
  assert.equal(result.event.scope, payload.scope);
  assert.equal(result.event.recoverable, payload.recoverable);
  assert.deepEqual(result.event.details, payload.details);
});

test('production Renderer adapter maps closed fields and closedAt without fallback', () => {
  const payload: AgentSessionClosedEvent = {
    sessionId: SESSION_ID,
    closeReason: 'escalated',
    closedAt: '2026-06-20T10:16:00.000Z',
  };
  const result = adaptAgentProtocolEvent({ kind: 'closed', payload });
  if (result.event.kind !== 'closed') assert.fail('Expected closed event');
  assert.equal(result.event.createdAt, payload.closedAt);
  assert.equal(result.event.closeReason, payload.closeReason);
});

test('production action policy binds approval actions only to the matching approval change-preview card', () => {
  const session = makeAssetSession({
    currentState: 'awaiting_approval',
    proposals: [makeFixProposal('proposal-1', '2026-06-20T10:05:00.000Z')],
  });
  const cards = buildAgentCards(session, [makeApprovalMapperEvent('approval-1')]);
  const previews = cards.filter(card => card.kind === 'change-preview');
  const actionTargets = resolveAgentCardActionTargets({
    cards,
    sessionId: SESSION_ID,
    sessionScope: 'asset',
    currentState: 'awaiting_approval',
    pendingApproval: { approvalId: 'approval-1' },
  });

  assert.deepEqual(previews.map(card => card.id), [
    `proposal:${SESSION_ID}:proposal-1:change-preview`,
    `approval:${SESSION_ID}:approval-1`,
  ]);
  assert.deepEqual(previews.map(card => ({
    id: card.id,
    approveEnabled: getActionState(card, 'approve', { actionTargets }),
    rejectEnabled: getActionState(card, 'reject', { actionTargets }),
  })), [
    {
      id: `proposal:${SESSION_ID}:proposal-1:change-preview`,
      approveEnabled: false,
      rejectEnabled: false,
    },
    {
      id: `approval:${SESSION_ID}:approval-1`,
      approveEnabled: true,
      rejectEnabled: true,
    },
  ]);
});

test('production resolver binds promote only to the latest deterministic successful validation card', () => {
  const cards = buildAgentCards(
    makeAssetSession({ currentState: 'awaiting_approval' }),
    [
      makeApprovalMapperEvent('approval-1', '2026-06-20T10:01:00.000Z'),
      makeCompileMapperEvent('compile-success-1', '2026-06-20T10:02:00.000Z'),
      makeCompileMapperEvent('compile-success-2', '2026-06-20T10:03:00.000Z'),
      makeCompileMapperEvent('compile-failed-later', '2026-06-20T10:04:00.000Z', false),
    ],
  );
  const validations = cards.filter(card => card.kind === 'validation-result');
  const actionTargets = resolveAgentCardActionTargets({
    cards,
    sessionId: SESSION_ID,
    sessionScope: 'asset',
    currentState: 'awaiting_approval',
    pendingApproval: { approvalId: 'approval-1' },
  });

  assert.equal(
    actionTargets.promote,
    `validation:${SESSION_ID}:compile-success-2`,
  );
  assert.equal(
    resolveAgentCardActionTargets({
      cards: [...cards].reverse(),
      sessionId: SESSION_ID,
      sessionScope: 'asset',
      currentState: 'awaiting_approval',
      pendingApproval: { approvalId: 'approval-1' },
    }).promote,
    actionTargets.promote,
  );
  assert.deepEqual(
    validations.map(card => getActionState(card, 'promote', { actionTargets })),
    [false, true, false],
  );
});

test('production resolver binds project actions only to the latest candidates card', () => {
  const cards = buildAgentCards(makeProjectSession({
    currentState: 'escalated_done',
    proposals: [
      makeDiagnosisProposal(
        'diagnosis-1',
        '2026-06-20T10:01:00.000Z',
        '/Game/Test/BP_Old',
      ),
      makeDiagnosisProposal(
        'diagnosis-2',
        '2026-06-20T10:02:00.000Z',
        '/Game/Test/BP_Current',
      ),
    ],
  }), []);
  const candidates = cards.filter(card => card.kind === 'project-candidates');
  const actionTargets = resolveAgentCardActionTargets({
    cards,
    sessionId: SESSION_ID,
    sessionScope: 'project',
    currentState: 'escalated_done',
  });

  assert.equal(
    actionTargets['select-target-asset'],
    `proposal:${SESSION_ID}:diagnosis-2:candidates`,
  );
  assert.equal(
    actionTargets['continue-diagnosis'],
    `proposal:${SESSION_ID}:diagnosis-2:candidates`,
  );
  assert.deepEqual(
    resolveAgentCardActionTargets({
      cards: [...cards].reverse(),
      sessionId: SESSION_ID,
      sessionScope: 'project',
      currentState: 'escalated_done',
    }),
    actionTargets,
  );
  assert.deepEqual(
    candidates.map(card => getActionState(card, 'select-target-asset', {
      sessionScope: 'project',
      currentState: 'escalated_done',
      pendingApprovalId: undefined,
      actionTargets,
    })),
    [false, true],
  );
});

test('production resolver uniquely binds cancel for active sessions and discard for terminal sessions', () => {
  const activeCards = buildAgentCards(makeAssetSession({
    currentState: 'awaiting_approval',
    proposals: [
      makeFixProposal('proposal-1', '2026-06-20T10:01:00.000Z'),
      makeFixProposal('proposal-2', '2026-06-20T10:02:00.000Z'),
    ],
  }), [makeApprovalMapperEvent('approval-1', '2026-06-20T10:03:00.000Z')]);
  const activeTargets = resolveAgentCardActionTargets({
    cards: activeCards,
    sessionId: SESSION_ID,
    sessionScope: 'asset',
    currentState: 'awaiting_approval',
    pendingApproval: { approvalId: 'approval-1' },
  });
  const activeLifecycleCards = activeCards.filter(
    card => card.kind === 'fix-plan' || card.kind === 'change-preview',
  );
  assert.equal(activeTargets.cancel, `approval:${SESSION_ID}:approval-1`);
  assert.equal(
    activeLifecycleCards.filter(card => getActionState(card, 'cancel', {
      actionTargets: activeTargets,
    })).length,
    1,
  );
  assert.equal(activeTargets.discard, undefined);

  const terminalCards = buildAgentCards(
    makeAssetSession({ currentState: 'done' }),
    [
      makeCompileMapperEvent('compile-1', '2026-06-20T10:01:00.000Z'),
      makeCompileMapperEvent('compile-2', '2026-06-20T10:02:00.000Z'),
    ],
  );
  const terminalTargets = resolveAgentCardActionTargets({
    cards: terminalCards,
    sessionId: SESSION_ID,
    sessionScope: 'asset',
    currentState: 'done',
  });
  const terminalValidations = terminalCards.filter(card => card.kind === 'validation-result');
  assert.equal(terminalTargets.cancel, undefined);
  assert.equal(terminalTargets.discard, `validation:${SESSION_ID}:compile-2`);
  assert.deepEqual(
    terminalValidations.map(card => getActionState(card, 'discard', {
      currentState: 'done',
      pendingApprovalId: undefined,
      actionTargets: terminalTargets,
    })),
    [false, true],
  );
});

test('production action policy enforces scope, state, pending approval identity, and unsupported actions', () => {
  const approvalCard = {
    id: `approval:${SESSION_ID}:approval-1`,
    kind: 'change-preview' as const,
  };
  const approveTarget = { approve: approvalCard.id };
  assert.equal(getActionState(approvalCard, 'approve', { actionTargets: approveTarget }), true);
  assert.equal(getActionState(approvalCard, 'approve', {
    sessionScope: 'project',
    actionTargets: approveTarget,
  }), false);
  assert.equal(getActionState(approvalCard, 'approve', {
    currentState: 'done',
    actionTargets: approveTarget,
  }), false);
  assert.equal(getActionState(approvalCard, 'approve', {
    pendingApprovalId: undefined,
    actionTargets: approveTarget,
  }), false);
  assert.equal(getActionState(approvalCard, 'approve', {
    pendingApprovalId: 'approval-other',
    actionTargets: approveTarget,
  }), false);

  const validationCard = {
    id: `validation:${SESSION_ID}:compile-1`,
    kind: 'validation-result' as const,
  };
  for (const actionId of [
    'apply-sandbox',
    'preview-fix',
    'alternate-plan',
    'view-diff',
    'view-logs',
    'regenerate',
  ] as const) {
    assert.equal(getActionState(validationCard, actionId), false);
  }
});

test('production action handler never forwards an action from a non-target card', () => {
  const forwarded: string[] = [];
  const handler = createAgentCardActionHandler({
    cardId: 'current-candidates',
    cardKind: 'project-candidates',
    sessionId: SESSION_ID,
    sessionScope: 'project',
    currentState: 'escalated_done',
    actionTargets: {
      'select-target-asset': 'current-candidates',
    },
  }, action => {
    forwarded.push(`${action.cardId}:${action.actionId}`);
  });
  handler({ cardId: 'historical-candidates', actionId: 'select-target-asset' });
  handler({ cardId: 'current-candidates', actionId: 'view-evidence' });
  handler({ cardId: 'current-candidates', actionId: 'select-target-asset' });
  assert.deepEqual(forwarded, ['current-candidates:select-target-asset']);
});

test('selected approval is visible only for the matching awaiting asset session', () => {
  const approval = {
    approvalId: 'approval-1',
    requestedAt: FIXTURE_TS,
    diffPreview: null,
  };
  const approvals = { [SESSION_ID]: approval };
  assert.equal(getVisiblePendingApproval(
    makeAssetSession({ currentState: 'awaiting_approval' }),
    approvals,
  ), approval);
  assert.equal(getVisiblePendingApproval(
    makeAssetSession({ currentState: 'done' }),
    approvals,
  ), undefined);
  assert.equal(getVisiblePendingApproval(
    makeProjectSession({ currentState: 'awaiting_approval' }),
    approvals,
  ), undefined);
});

test('production pending approval reducer writes approval requested', () => {
  const approval = {
    approvalId: 'approval-1',
    requestedAt: FIXTURE_TS,
    diffPreview: null,
  };
  const next = reducePendingApprovals({}, {
    type: 'requested',
    sessionId: SESSION_ID,
    approval,
  });
  assert.equal(next[SESSION_ID], approval);
});

for (const transitionType of [
  'approve-succeeded',
  'reject-succeeded',
  'session-closed',
] as const) {
  test(`production pending approval reducer clears on ${transitionType}`, () => {
    const approvals = {
      [SESSION_ID]: {
        approvalId: 'approval-1',
        requestedAt: FIXTURE_TS,
        diffPreview: null,
      },
      other: {
        approvalId: 'approval-2',
        requestedAt: FIXTURE_TS,
        diffPreview: null,
      },
    };
    const next = reducePendingApprovals(approvals, {
      type: transitionType,
      sessionId: SESSION_ID,
    });
    assert.equal(next[SESSION_ID], undefined);
    assert.equal(next.other, approvals.other);
  });
}

test('DiagnosisCard consumes AgentCardRenderer policy instead of importing the mapper', () => {
  const diagnosisSource = readFileSync(resolve(
    process.cwd(),
    'src/renderer/components/workbench/cards/DiagnosisCard.tsx',
  ), 'utf8');
  const rendererSource = readFileSync(resolve(
    process.cwd(),
    'src/renderer/components/workbench/AgentCardRenderer.tsx',
  ), 'utf8');

  assert.equal(diagnosisSource.includes('isAgentCardActionEnabled'), false);
  assert.equal(diagnosisSource.includes("isActionEnabled?.('view-evidence')"), true);
  assert.match(rendererSource, /<DiagnosisCard[\s\S]*isActionEnabled=\{isActionEnabled\}/);
});

test('change preview approve and validation promote share the production confirmation intent', () => {
  assert.equal(resolveAgentCardActionIntent('approve'), 'confirm-promote');
  assert.equal(resolveAgentCardActionIntent('promote'), 'confirm-promote');
  assert.equal(resolveAgentCardActionIntent('reject'), 'direct');

  const chatPanelSource = readFileSync(resolve(
    process.cwd(),
    'src/renderer/components/workbench/ChatPanel.tsx',
  ), 'utf8');
  assert.equal(
    chatPanelSource.match(/approveSelected\(/g)?.length,
    1,
    'Only the ConfirmModal callback may call approveSelected',
  );
  assert.equal(chatPanelSource.includes('approvePromote'), false);
});

test('rendered workbench exposes lifecycle actions only through guarded cards', () => {
  const chatPanelSource = readFileSync(resolve(
    process.cwd(),
    'src/renderer/components/workbench/ChatPanel.tsx',
  ), 'utf8');
  const shellSource = readFileSync(resolve(
    process.cwd(),
    'src/renderer/components/workbench/AgentWorkbenchShell.tsx',
  ), 'utf8');

  assert.equal(
    chatPanelSource.match(/approveSelected\(/g)?.length,
    1,
    'ChatPanel ConfirmModal callback must remain the only approveSelected call',
  );

  for (const directLifecycleCall of [
    'approveSelected(',
    'rejectSelected(',
    'cancelSession(',
    'discardSession(',
    'approvePromote',
    'rejectPromote',
  ]) {
    assert.equal(
      shellSource.includes(directLifecycleCall),
      false,
      `AgentWorkbenchShell must not call ${directLifecycleCall}`,
    );
  }

  for (const dangerousCommandId of [
    'approve-promote',
    'reject-promote',
    'cancel-session',
    'discard-session',
  ]) {
    assert.equal(
      shellSource.includes(`id: '${dangerousCommandId}'`),
      false,
      `CommandPalette must not expose ${dangerousCommandId}`,
    );
  }
});
