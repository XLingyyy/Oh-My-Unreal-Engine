import { test } from 'node:test';
import assert from 'node:assert/strict';
import type {
  AgentAssetSessionRecord,
  AgentProjectSessionRecord,
  AgentSessionErrorEvent,
} from '@omue/shared-protocol';
import { REPAIR_SESSION_SCHEMA_VERSION } from '@omue/shared-protocol';
import {
  buildAgentCards,
  buildAgentCardsWithDiagnostics,
  stableHash,
  stableStringify,
  type MapperEvent,
} from '../renderer/components/workbench/agentCardMapper';
import { normalizeAgentProposalEvent } from '../renderer/components/workbench/agentEventCompatibility';

const SESSION_ID = 'session-test';
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

test('buildAgentCards: same input produces deep-equal output', () => {
  const session = makeAssetSession();
  const events: MapperEvent[] = [];
  const a = buildAgentCards(session, events);
  const b = buildAgentCards(session, events);
  assert.deepEqual(a, b);
});

test('buildAgentCards: deterministic for compile events across intervals', async () => {
  const session = makeAssetSession();
  const events: MapperEvent[] = [
    {
      id: 'compile-1',
      kind: 'compile',
      sessionId: SESSION_ID,
      createdAt: 'compile-result-001',
      compileResultId: 'compile-result-001',
      success: true,
    },
  ];
  const a = buildAgentCards(session, events);
  await new Promise(resolve => setTimeout(resolve, 5));
  const b = buildAgentCards(session, events);
  assert.deepEqual(a, b, 'Mapper output must be deep-equal across time intervals');
  const compileCard = a.find(card => card.kind === 'validation-result');
  assert.ok(compileCard);
});

test('buildAgentCards: deterministic for error events across intervals', async () => {
  const session = makeProjectSession();
  const errorEvent: AgentSessionErrorEvent = {
    sessionId: SESSION_ID,
    errorId: 'error-stable-1',
    errorCode: 'scope_execution_forbidden',
    message: 'Project cannot execute',
    scope: 'project',
    recoverable: false,
    createdAt: '2026-06-20T10:00:01.000Z',
  };
  const events: MapperEvent[] = [
    {
      id: '1',
      kind: 'error',
      sessionId: SESSION_ID,
      createdAt: errorEvent.createdAt!,
      errorId: errorEvent.errorId,
      errorCode: errorEvent.errorCode,
      message: errorEvent.message,
      scope: errorEvent.scope,
      recoverable: errorEvent.recoverable,
    },
  ];
  const a = buildAgentCards(session, events);
  await new Promise(resolve => setTimeout(resolve, 5));
  const b = buildAgentCards(session, events);
  assert.deepEqual(a, b);
});

test('buildAgentCards: maps state events to ScanStatusCard', () => {
  const session = makeAssetSession();
  const events: MapperEvent[] = [
    {
      id: 'state-1',
      kind: 'state',
      sessionId: SESSION_ID,
      createdAt: '2026-06-20T10:00:00.000Z',
      currentState: 'awaiting_approval',
      retryCount: 0,
    },
  ];
  const cards = buildAgentCards(session, events);
  const scanCard = cards.find(card => card.kind === 'scan-status');
  assert.ok(scanCard, 'ScanStatusCard should be created from state events');
});

test('buildAgentCards: maps approval event to change-preview with approval context', () => {
  const session = makeAssetSession();
  const events: MapperEvent[] = [
    {
      id: 'approval-1',
      kind: 'approval',
      sessionId: SESSION_ID,
      createdAt: 'approval-001',
      approvalId: 'approval-001',
      approval: { approvalId: 'approval-001', requestedAt: 'approval-001', diffPreview: null },
    },
  ];
  const cards = buildAgentCards(session, events);
  const changePreview = cards.find(card => card.kind === 'change-preview');
  assert.ok(changePreview, 'Approval event should map to change-preview card');
});

test('buildAgentCards: preserves structured proposal from event', () => {
  const session = makeAssetSession();
  const events: MapperEvent[] = [
    {
      id: 'proposal-event-1',
      kind: 'proposal',
      sessionId: SESSION_ID,
      createdAt: 'p-001',
      proposalId: 'p-001',
      proposalKind: 'fix',
      proposal: {
        kind: 'fix',
        summary: 'Set marker',
        diagnosisSummary: 'Need to set marker',
        evidenceSummary: 'Missing key',
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
            afterState: { kind: 'metadata_key_value', key: 'k', value: 'v' },
            requireApproval: true,
            requireSnapshot: true,
            display: { summary: 'Set marker' },
          },
        },
      },
    },
  ];
  const cards = buildAgentCards(session, events);
  const fixPlan = cards.find(card => card.kind === 'fix-plan');
  const changePreview = cards.find(card => card.kind === 'change-preview');
  assert.ok(fixPlan, 'fix-plan card should be created from structured proposal event');
  assert.ok(changePreview, 'change-preview card should be created from structured proposal event');
});

test('buildAgentCards: maps persisted errors to FailureCard with stable ID', () => {
  const session = makeProjectSession({
    errors: [
      {
        errorId: 'err-1',
        sessionId: SESSION_ID,
        scope: 'project',
        errorCode: 'context_snapshot_unavailable',
        message: 'Bridge unreachable',
        recoverable: true,
        createdAt: '2026-06-20T10:00:00.000Z',
      },
    ],
  });
  const cards = buildAgentCards(session, []);
  const failure = cards.find(card => card.id === `failure:${SESSION_ID}:err-1`);
  assert.ok(failure, 'Persisted errors must be mapped to FailureCard with stable id');
});

test('buildAgentCards: dedupes persisted error from same event error', () => {
  const session = makeProjectSession({
    errors: [
      {
        errorId: 'err-shared',
        sessionId: SESSION_ID,
        scope: 'project',
        errorCode: 'scope_execution_forbidden',
        message: 'No exec',
        recoverable: false,
        createdAt: '2026-06-20T10:00:00.000Z',
      },
    ],
  });
  const events: MapperEvent[] = [
    {
      id: 'err-shared-event',
      kind: 'error',
      sessionId: SESSION_ID,
      createdAt: '2026-06-20T10:00:00.000Z',
      errorId: 'err-shared',
      errorCode: 'scope_execution_forbidden',
      message: 'No exec',
      scope: 'project',
      recoverable: false,
    },
  ];
  const cards = buildAgentCards(session, events);
  const failures = cards.filter(card => card.id === `failure:${SESSION_ID}:err-shared`);
  assert.equal(failures.length, 1, 'Persisted and event errors with same id must dedupe');
});

test('buildAgentCards: uses stableHash fallback for missing fact ID', () => {
  const session = makeProjectSession();
  const events: MapperEvent[] = [
    {
      id: 'error-no-id',
      kind: 'error',
      sessionId: SESSION_ID,
      createdAt: '2026-06-20T10:00:00.000Z',
      errorCode: 'no_provider_config',
      message: 'no provider',
      scope: 'project',
      recoverable: true,
    },
  ];
  const a = buildAgentCards(session, events);
  const b = buildAgentCards(session, events);
  assert.deepEqual(a, b);
  const failure = a.find(card => card.kind === 'failure');
  assert.ok(failure);
  if (failure && failure.kind === 'failure') {
    assert.ok(failure.id.startsWith('failure:'));
  }
});

test('stableStringify: excludes time-bound keys when excludeTime is set', () => {
  const a = stableStringify({ createdAt: '2026-06-20T10:00:00.000Z', summary: 'x' }, { excludeTime: true });
  const b = stableStringify({ createdAt: '2099-12-31T23:59:59.000Z', summary: 'x' }, { excludeTime: true });
  assert.equal(a, b, 'Time-bound keys must be excluded from stableStringify with excludeTime');
});

test('buildAgentCards: includes user-intent card with scope and target path', () => {
  const session = makeAssetSession();
  const cards = buildAgentCards(session, []);
  const userIntent = cards.find(card => card.kind === 'user-intent');
  assert.ok(userIntent);
  if (userIntent && userIntent.kind === 'user-intent') {
    assert.equal(userIntent.data.scope, 'asset');
    assert.equal(userIntent.data.targetAssetPath, '/Game/Test/BP_A');
  }
});

test('buildAgentCards: project session includes user-intent without target path', () => {
  const session = makeProjectSession();
  const cards = buildAgentCards(session, []);
  const userIntent = cards.find(card => card.kind === 'user-intent');
  assert.ok(userIntent);
  if (userIntent && userIntent.kind === 'user-intent') {
    assert.equal(userIntent.data.scope, 'project');
  }
});

test('buildAgentCards: project session with diagnosis proposal creates diagnosis + candidates cards', () => {
  const session = makeProjectSession({
    proposals: [
      {
        proposalId: 'p-1',
        proposedAt: FIXTURE_TS,
        kind: 'diagnosis',
        summary: 'Compile failures cluster in input mapping',
        evidenceSummary: 'Repeated IA_Jump references',
        confidence: 'medium',
        risk: 'low',
        candidateAssets: [
          { assetPath: '/Game/Input/IMC_Default', reason: 'Missing SpaceBar mapping', confidence: 'high' },
        ],
        suggestedNextSteps: ['Open IMC_Default', 'Run a project session scoped to it'],
        typedPayload: null,
      },
    ],
  });
  const cards = buildAgentCards(session, []);
  const diagnosis = cards.find(c => c.kind === 'diagnosis');
  const candidates = cards.find(c => c.kind === 'project-candidates');
  assert.ok(diagnosis);
  assert.ok(candidates);
});

test('buildAgentCards: asset session with fix proposal creates fix-plan + change-preview cards', () => {
  const session = makeAssetSession({
    proposals: [
      {
        proposalId: 'p-1',
        proposedAt: FIXTURE_TS,
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
      },
    ],
  });
  const cards = buildAgentCards(session, []);
  const fixPlan = cards.find(c => c.kind === 'fix-plan');
  const changePreview = cards.find(c => c.kind === 'change-preview');
  assert.ok(fixPlan);
  assert.ok(changePreview);
});

test('buildAgentCards: reversed event order produces same cards and order', () => {
  const session = makeAssetSession();
  const eventsForward: MapperEvent[] = [
    { id: '1', kind: 'proposal', sessionId: SESSION_ID, createdAt: '2026-06-20T10:00:01.000Z', proposalId: 'p-1', typedPayloadJson: '{}' },
    { id: '2', kind: 'compile', sessionId: SESSION_ID, createdAt: '2026-06-20T10:00:02.000Z', success: true },
  ];
  const eventsReverse = eventsForward.slice().reverse();
  const a = buildAgentCards(session, eventsForward);
  const b = buildAgentCards(session, eventsReverse);
  assert.deepEqual(a, b);
});

test('buildAgentCards: legacy proposal parse failure produces FailureCard', () => {
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

test('buildAgentCards: completion tone reflects closeReason', () => {
  const session = makeAssetSession();
  const cases: Array<{
    closeReason: 'done' | 'rejected' | 'cancelled' | 'escalated' | 'interrupted';
    expectedTone: 'success' | 'closed' | 'warning';
  }> = [
    { closeReason: 'done', expectedTone: 'success' },
    { closeReason: 'rejected', expectedTone: 'closed' },
    { closeReason: 'cancelled', expectedTone: 'closed' },
    { closeReason: 'escalated', expectedTone: 'warning' },
  ];
  for (const c of cases) {
    const events: MapperEvent[] = [
      { id: `closed-${c.closeReason}`, kind: 'closed', sessionId: SESSION_ID, createdAt: '2026-06-20T10:00:09.000Z', closeReason: c.closeReason },
    ];
    const cards = buildAgentCards(session, events);
    const completion = cards.find(card => card.kind === 'completion');
    assert.ok(completion, `completion missing for ${c.closeReason}`);
    if (completion && completion.kind === 'completion') {
      assert.equal(completion.data.tone, c.expectedTone, `wrong tone for ${c.closeReason}`);
    }
  }
});

test('buildAgentCards: structured error event maps to FailureCard', () => {
  const session = makeProjectSession();
  const errorEvent: AgentSessionErrorEvent = {
    sessionId: SESSION_ID,
    errorId: 'error-1',
    errorCode: 'scope_execution_forbidden',
    message: 'Project cannot execute',
    scope: 'project',
    recoverable: false,
    createdAt: '2026-06-20T10:00:00.000Z',
  };
  const events: MapperEvent[] = [
    {
      id: '1',
      kind: 'error',
      sessionId: SESSION_ID,
      createdAt: '2026-06-20T10:00:01.000Z',
      errorId: errorEvent.errorId,
      errorCode: errorEvent.errorCode,
      message: errorEvent.message,
      scope: errorEvent.scope,
      recoverable: errorEvent.recoverable,
    },
  ];
  const cards = buildAgentCards(session, events);
  const failure = cards.find(c => c.kind === 'failure');
  assert.ok(failure);
  if (failure && failure.kind === 'failure') {
    assert.equal(failure.data.errorCode, 'scope_execution_forbidden');
    assert.equal(failure.data.recoverable, false);
  }
});

test('buildAgentCards: card stage ordering is enforced', () => {
  const session = makeAssetSession({
    proposals: [
      {
        proposalId: 'p-1',
        proposedAt: FIXTURE_TS,
        kind: 'fix',
        summary: 'fix',
        diagnosisSummary: 'd',
        evidenceSummary: 'e',
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
            afterState: { kind: 'metadata_key_value', key: 'm', value: 'v' },
            requireApproval: true,
            requireSnapshot: true,
            display: { summary: 'd' },
          },
        },
      },
    ],
  });
  const cards = buildAgentCards(session, []);
  const kinds = cards.map(c => c.kind);
  const userIntentIndex = kinds.indexOf('user-intent');
  const fixPlanIndex = kinds.indexOf('fix-plan');
  assert.ok(userIntentIndex >= 0);
  assert.ok(fixPlanIndex >= 0);
  assert.ok(userIntentIndex < fixPlanIndex);
});

test('buildAgentCards: same fact from event and persisted record is deduped', () => {
  const session = makeProjectSession({
    proposals: [
      {
        proposalId: 'p-1',
        proposedAt: FIXTURE_TS,
        kind: 'escalation',
        escalationReason: 'Bridge unreachable',
        typedPayload: null,
      },
    ],
  });
  const events: MapperEvent[] = [
    {
      id: 'p-1-event',
      kind: 'proposal',
      sessionId: SESSION_ID,
      createdAt: FIXTURE_TS,
      proposalId: 'p-1',
      escalationReason: 'Bridge unreachable',
    },
  ];
  const cards = buildAgentCards(session, events);
  const failures = cards.filter(c => c.kind === 'failure' && c.title === 'Escalation');
  assert.equal(failures.length, 1, 'Persisted and event-derived escalations should dedupe');
});

test('normalizeAgentProposalEvent: prefers structured proposal', () => {
  const result = normalizeAgentProposalEvent({
    sessionId: 's1',
    proposalId: 'p1',
    proposedAt: '2026-06-20T10:00:00.000Z',
    proposal: { kind: 'escalation', reason: 'x' },
  });
  assert.equal(result.proposal?.kind, 'escalation');
});

test('normalizeAgentProposalEvent: parses legacy typed payload JSON', () => {
  const result = normalizeAgentProposalEvent({
    sessionId: 's1',
    proposalId: 'p1',
    proposedAt: '2026-06-20T10:00:00.000Z',
    typedPayloadJson: JSON.stringify({
      schemaVersion: 'omue.safeScratchBlueprintMutation.v1',
      payload: {
        schemaVersion: 'omue.safeScratchBlueprintMutation.v1',
        operationKind: 'set_blueprint_metadata_marker',
        targetAssetPath: '/Game/Test/BP_A',
        targetAssetKind: 'blueprint_scratch_fixture',
        allowlistPrefixes: ['/Game/Scratch/'],
        beforeState: { kind: 'missing_or_absent_allowed' },
        afterState: { kind: 'metadata_key_value', key: 'm', value: 'v' },
        requireApproval: true,
        requireSnapshot: true,
        display: { summary: 'd' },
      },
    }),
  });
  assert.equal(result.proposal?.kind, 'fix');
});

test('normalizeAgentProposalEvent: returns legacy parse failure for invalid JSON', () => {
  const result = normalizeAgentProposalEvent({
    sessionId: 's1',
    proposalId: 'p1',
    proposedAt: '2026-06-20T10:00:00.000Z',
    typedPayloadJson: 'not json',
  });
  assert.equal(result.proposal, null);
  assert.equal(result.errorCode, 'legacy_proposal_parse_failed');
});

test('stableStringify: canonicalizes key order', () => {
  assert.equal(stableStringify({ b: 1, a: 2 }), '{"a":2,"b":1}');
});

test('stableHash: same input produces same hash', () => {
  assert.equal(stableHash('test'), stableHash('test'));
  assert.notEqual(stableHash('test'), stableHash('test2'));
});
