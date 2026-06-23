import { test } from 'node:test';
import assert from 'node:assert/strict';
import type {
  AgentAssetSessionRecord,
  AgentProjectSessionRecord,
  AgentProposalStoredRecord,
  AgentSessionErrorStoredRecord,
  BlueprintAssetSummary,
  ChangeItem,
  CompileIssue,
  CompileStatus,
  EvidenceItem,
  AgentUiLogEntry,
  LogEntry,
  OmueContextSnapshot,
  ProjectContext,
  EditorRuntimeStatus,
} from '@omue/shared-protocol';
import { REPAIR_SESSION_SCHEMA_VERSION } from '@omue/shared-protocol';
import {
  adaptEvidenceItems,
  adaptChangeItems,
  adaptLogEntries,
  buildInspectorData,
  type InspectorDataAdapterInput,
  type InspectorSourceKind,
} from '../renderer/components/workbench/inspectorDataAdapter';

// ── Fixtures ────────────────────────────────────────────────────────

const FIXTURE_TS = '2026-06-21T00:00:00.000Z';

const MOCK_EVIDENCE_TEXTS = {
  finding: {
    'evidence-imc-default': 'f1',
    'evidence-bp-player-controller': 'f2',
    'evidence-bp-player': 'f3',
    'evidence-imc-gamepad': 'f4',
  },
  inspected: {
    'evidence-imc-default': 'i1',
    'evidence-bp-player-controller': 'i2',
    'evidence-bp-player': 'i3',
    'evidence-imc-gamepad': 'i4',
  },
  result: {
    'evidence-imc-default': 'r1',
    'evidence-bp-player-controller': 'r2',
    'evidence-bp-player': 'r3',
    'evidence-imc-gamepad': 'r4',
  },
} as unknown as InspectorDataAdapterInput['mockEvidenceTexts'];

const MOCK_CHANGE_TEXTS = {
  summary: {
    'change-stage-before': ['s1'],
    'change-stage-preview': ['s2a', 's2b'],
    'change-stage-sandbox-applied': ['s3a', 's3b'],
    'change-stage-promoted': ['s4a', 's4b'],
  },
} as unknown as InspectorDataAdapterInput['mockChangeTexts'];

const MOCK_LOG_TEXTS = {
  message: {
    'log-001': 'm1', 'log-002': 'm2', 'log-003': 'm3', 'log-004': 'm4', 'log-005': 'm5',
    'log-006': 'm6', 'log-007': 'm7', 'log-008': 'm8', 'log-009': 'm9', 'log-010': 'm10',
  },
} as unknown as InspectorDataAdapterInput['mockLogTexts'];

function makeProjectContext(): ProjectContext {
  return {
    projectName: 'TestProject',
    projectPath: 'C:/Projects/TestProject',
    uprojectFile: 'C:/Projects/TestProject/TestProject.uproject',
    engineVersion: '5.7.0',
    editorStatus: 'idle',
  };
}

function makeRuntimeStatus(): EditorRuntimeStatus {
  return { isPieRunning: false, isSimulating: false };
}

function makeCompile(overrides?: Partial<CompileStatus>): CompileStatus {
  return {
    isCompiling: false,
    lastCompileResult: 'unknown',
    errorCount: 0,
    warningCount: 0,
    lastErrors: [],
    ...overrides,
  };
}

function makeSnapshot(overrides?: Partial<OmueContextSnapshot>): OmueContextSnapshot {
  return {
    snapshotId: 'snap-1',
    capturedAt: FIXTURE_TS,
    bridgeVersion: 'test-1.0',
    project: makeProjectContext(),
    openAssets: [],
    recentLogs: [],
    compileStatus: makeCompile(),
    runtimeStatus: makeRuntimeStatus(),
    ...overrides,
  };
}

function makeBlueprintSummary(overrides?: Partial<BlueprintAssetSummary>): BlueprintAssetSummary {
  return {
    assetPath: '/Game/BP_Player',
    displayName: 'BP_Player',
    assetClass: 'Blueprint',
    eligibility: 'eligible_scratch_or_test',
    dirtyState: 'Clean',
    source: 'real_readonly_bridge',
    ...overrides,
  };
}

function makeAssetSession(
  overrides?: Partial<AgentAssetSessionRecord>,
): AgentAssetSessionRecord {
  return {
    schemaVersion: REPAIR_SESSION_SCHEMA_VERSION,
    sessionId: 'asset-1',
    scope: 'asset',
    userIntent: 'Repair BP',
    targetAssetPath: '/Game/BP_Player',
    createdAt: FIXTURE_TS,
    updatedAt: FIXTURE_TS,
    currentState: 'draft',
    retryCount: 0,
    maxRetries: 3,
    proposals: [],
    ...overrides,
  };
}

function makeProjectSession(
  overrides?: Partial<AgentProjectSessionRecord>,
): AgentProjectSessionRecord {
  return {
    schemaVersion: REPAIR_SESSION_SCHEMA_VERSION,
    sessionId: 'project-1',
    scope: 'project',
    userIntent: 'Find failures',
    createdAt: FIXTURE_TS,
    updatedAt: FIXTURE_TS,
    currentState: 'draft',
    retryCount: 0,
    maxRetries: 3,
    proposals: [],
    ...overrides,
  };
}

function baseInput(overrides?: Partial<InspectorDataAdapterInput>): InspectorDataAdapterInput {
  return {
    selectedSession: null,
    selectedEvents: [],
    snapshot: null,
    isMockClient: false,
    bridgeError: null,
    mockEvidenceTexts: MOCK_EVIDENCE_TEXTS,
    mockChangeTexts: MOCK_CHANGE_TEXTS,
    mockLogTexts: MOCK_LOG_TEXTS,
    ...overrides,
  };
}

// ── adaptEvidenceItems ──────────────────────────────────────────────

test('adaptEvidenceItems: real mode, no session, no snapshot → unavailable', () => {
  const result = adaptEvidenceItems(baseInput());
  assert.equal(result.items.length, 0);
  assert.equal(result.source, 'unavailable');
  assert.equal(result.updatedAt, null);
});

test('adaptEvidenceItems: real mode, session with compile errors → live evidence items', () => {
  const compileIssue: CompileIssue = {
    code: 'CS1000',
    message: 'Missing function',
    severity: 'error',
  };
  const session = makeAssetSession({
    currentState: 'diagnosing',
    contextSnapshot: {
      compileIssues: [compileIssue],
      blueprintSummary: makeBlueprintSummary({ dirtyState: 'Dirty' }),
      collectedAt: FIXTURE_TS,
    },
  });
  const result = adaptEvidenceItems(baseInput({ selectedSession: session }));
  assert.equal(result.source, 'live');
  assert.ok(result.items.length > 0, 'should have evidence items from compile errors');
  const errorItem = result.items.find(i => i.status === 'error');
  assert.ok(errorItem, 'should have an error-status evidence item');
  assert.equal(errorItem!.assetName, 'BP_Player');
});

test('adaptEvidenceItems: real mode, session with errors → live evidence', () => {
  const errorRecord: AgentSessionErrorStoredRecord = {
    errorId: 'err-1',
    sessionId: 'asset-1',
    scope: 'asset',
    errorCode: 'context_snapshot_unavailable',
    message: 'Context unavailable',
    recoverable: true,
    createdAt: FIXTURE_TS,
  };
  const session = makeAssetSession({
    currentState: 'escalated_done',
    errors: [errorRecord],
  });
  const result = adaptEvidenceItems(baseInput({ selectedSession: session }));
  assert.equal(result.source, 'live');
  const errorItem = result.items.find(i => i.status === 'error');
  assert.ok(errorItem, 'should have error evidence from session errors');
  assert.ok(errorItem!.finding.includes('Context unavailable'));
});

test('adaptEvidenceItems: real mode, snapshot compile errors → live evidence', () => {
  const snapshot = makeSnapshot({
    compileStatus: makeCompile({
      lastCompileResult: 'failed',
      errorCount: 1,
      warningCount: 1,
      lastErrors: [
        { code: 'CS1000', message: 'Compile error', severity: 'error' },
      ],
    }),
  });
  const result = adaptEvidenceItems(baseInput({ snapshot }));
  assert.equal(result.source, 'live');
  assert.ok(result.items.length > 0, 'should have evidence from snapshot compile errors');
});

test('adaptEvidenceItems: mock mode → mock items', () => {
  const result = adaptEvidenceItems(baseInput({ isMockClient: true }));
  assert.equal(result.source, 'mock');
  assert.ok(result.items.length > 0, 'mock mode should produce mock items');
  assert.equal(result.items[0].assetName, 'IMC_Default');
});

test('adaptEvidenceItems: real mode, bridge error, no data → unavailable', () => {
  const result = adaptEvidenceItems(baseInput({
    bridgeError: 'Bridge unreachable',
    snapshot: null,
    selectedSession: null,
  }));
  assert.equal(result.source, 'unavailable');
  assert.equal(result.items.length, 0);
});

test('adaptEvidenceItems: real mode NEVER falls back to mock', () => {
  const result = adaptEvidenceItems(baseInput({
    isMockClient: false,
    selectedSession: null,
    snapshot: null,
  }));
  assert.notEqual(result.source, 'mock');
  assert.equal(result.items.length, 0);
});

test('adaptEvidenceItems: real mode, bridge error WITH data → cache, items retained', () => {
  const session = makeAssetSession({
    currentState: 'done',
    errors: [{ errorId: 'e1', sessionId: 'asset-1', scope: 'asset', errorCode: 'test', message: 'err', recoverable: true, createdAt: FIXTURE_TS }],
  });
  const result = adaptEvidenceItems(baseInput({
    selectedSession: session,
    bridgeError: 'Bridge unreachable',
  }));
  assert.equal(result.source, 'cache');
  assert.ok(result.items.length > 0, 'items retained in cache');
  assert.equal(result.updatedAt, FIXTURE_TS);
});

// ── adaptChangeItems ────────────────────────────────────────────────

test('adaptChangeItems: real mode, no session → unavailable', () => {
  const result = adaptChangeItems(baseInput());
  assert.equal(result.items.length, 0);
  assert.equal(result.source, 'unavailable');
});

test('adaptChangeItems: real mode, project session → live but empty items', () => {
  const session = makeProjectSession({ currentState: 'diagnosing' });
  const result = adaptChangeItems(baseInput({ selectedSession: session }));
  assert.equal(result.source, 'live');
  assert.equal(result.items.length, 0);
});

test('adaptChangeItems: real mode, asset session with promote → live promoted change item', () => {
  const session = makeAssetSession({
    currentState: 'done',
    promote: {
      applyResultJson: '{"ok":true}',
      promotedAt: FIXTURE_TS,
    },
  });
  const result = adaptChangeItems(baseInput({ selectedSession: session }));
  assert.equal(result.source, 'live');
  const promoted = result.items.find(i => i.stage === 'promoted');
  assert.ok(promoted, 'should have a promoted change item');
  assert.equal(promoted!.status, 'applied');
  assert.equal(promoted!.appliedAt, FIXTURE_TS);
});

test('adaptChangeItems: real mode, asset session with sandbox → sandbox-applied change item', () => {
  const session = makeAssetSession({
    currentState: 'sandbox_compiling',
    sandbox: {
      copyAssetPath: '/Game/Scratch/BP_Player_Sandbox',
      duplicatedAt: FIXTURE_TS,
      applyResultJson: '{"ok":true}',
    },
  });
  const result = adaptChangeItems(baseInput({ selectedSession: session }));
  assert.equal(result.source, 'live');
  const sandbox = result.items.find(i => i.stage === 'sandbox-applied');
  assert.ok(sandbox, 'should have a sandbox-applied change item');
});

test('adaptChangeItems: mock mode → mock items', () => {
  const result = adaptChangeItems(baseInput({ isMockClient: true }));
  assert.equal(result.source, 'mock');
  assert.ok(result.items.length > 0);
});

test('adaptChangeItems: real mode, bridge error no data → unavailable', () => {
  const result = adaptChangeItems(baseInput({ bridgeError: 'Bridge unreachable' }));
  assert.equal(result.source, 'unavailable');
  assert.equal(result.items.length, 0);
});

test('adaptChangeItems: real mode, bridge error WITH data → cache', () => {
  const session = makeAssetSession({
    currentState: 'done',
    promote: {
      applyResultJson: '{"ok":true}',
      promotedAt: FIXTURE_TS,
    },
  });
  const result = adaptChangeItems(baseInput({ selectedSession: session, bridgeError: 'Bridge unreachable' }));
  assert.equal(result.source, 'cache');
  assert.ok(result.items.length > 0, 'items retained in cache');
});

test('adaptChangeItems: real mode NEVER falls back to mock', () => {
  const result = adaptChangeItems(baseInput({
    isMockClient: false,
    selectedSession: null,
  }));
  assert.notEqual(result.source, 'mock');
  assert.equal(result.items.length, 0);
});

// ── adaptLogEntries ─────────────────────────────────────────────────

test('adaptLogEntries: real mode, no session, no snapshot → unavailable', () => {
  const result = adaptLogEntries(baseInput());
  assert.equal(result.entries.length, 0);
  assert.equal(result.source, 'unavailable');
});

test('adaptLogEntries: real mode, snapshot recentLogs → live log entries', () => {
  const logEntry: LogEntry = {
    timestamp: FIXTURE_TS,
    category: 'LogBlueprint',
    verbosity: 'error',
    message: 'Compile failed for BP_Player',
  };
  const snapshot = makeSnapshot({ recentLogs: [logEntry] });
  const result = adaptLogEntries(baseInput({ snapshot }));
  assert.equal(result.source, 'live');
  assert.ok(result.entries.length > 0, 'should have log entries from snapshot');
  const entry = result.entries.find(e => e.level === 'error');
  assert.ok(entry, 'should have an error-level log entry');
  assert.ok(entry!.message.includes('Compile failed'));
});

test('adaptLogEntries: real mode, session events → live log entries from events', () => {
  const session = makeAssetSession({ currentState: 'diagnosing' });
  const events = [
    {
      id: 'state-1',
      kind: 'state',
      sessionId: 'asset-1',
      createdAt: FIXTURE_TS,
      currentState: 'diagnosing',
      retryCount: 0,
    } as const,
    {
      id: 'error-1',
      kind: 'error',
      sessionId: 'asset-1',
      createdAt: FIXTURE_TS,
      errorId: 'err-1',
      errorCode: 'context_unavailable',
      message: 'Context unavailable',
      scope: 'asset',
      recoverable: true,
    } as const,
  ];
  const result = adaptLogEntries(baseInput({ selectedSession: session, selectedEvents: events }));
  assert.equal(result.source, 'live');
  assert.ok(result.entries.length > 0, 'should have log entries from events');
  const stateLog = result.entries.find(e => e.source === 'agent-state');
  assert.ok(stateLog, 'should have agent-state log from state event');
  const errorLog = result.entries.find(e => e.level === 'error');
  assert.ok(errorLog, 'should have error log from error event');
});

test('adaptLogEntries: mock mode → mock entries', () => {
  const result = adaptLogEntries(baseInput({ isMockClient: true }));
  assert.equal(result.source, 'mock');
  assert.ok(result.entries.length > 0);
});

test('adaptLogEntries: real mode, bridge error no data → unavailable', () => {
  const result = adaptLogEntries(baseInput({ bridgeError: 'Bridge unreachable' }));
  assert.equal(result.source, 'unavailable');
  assert.equal(result.entries.length, 0);
});

test('adaptLogEntries: real mode, bridge error WITH data → cache, entries retained', () => {
  const logEntry: LogEntry = {
    timestamp: FIXTURE_TS,
    category: 'LogBlueprint',
    verbosity: 'error',
    message: 'Test',
  };
  const snapshot = makeSnapshot({ recentLogs: [logEntry] });
  const result = adaptLogEntries(baseInput({ snapshot, bridgeError: 'Bridge unreachable' }));
  assert.equal(result.source, 'cache');
  assert.ok(result.entries.length > 0, 'entries retained in cache');
  assert.equal(result.updatedAt, FIXTURE_TS);
});

test('adaptLogEntries: real mode NEVER falls back to mock', () => {
  const result = adaptLogEntries(baseInput({
    isMockClient: false,
    selectedSession: null,
    snapshot: null,
  }));
  assert.notEqual(result.source, 'mock');
  assert.equal(result.entries.length, 0);
});

// ── buildInspectorData (integration) ────────────────────────────────

test('buildInspectorData: real mode idle → all panels unavailable', () => {
  const data = buildInspectorData(baseInput());
  assert.equal(data.evidence.source, 'unavailable');
  assert.equal(data.changes.source, 'unavailable');
  assert.equal(data.logs.source, 'unavailable');
  assert.equal(data.evidence.items.length, 0);
  assert.equal(data.changes.items.length, 0);
  assert.equal(data.logs.entries.length, 0);
});

test('buildInspectorData: mock mode → all panels mock', () => {
  const data = buildInspectorData(baseInput({ isMockClient: true }));
  assert.equal(data.evidence.source, 'mock');
  assert.equal(data.changes.source, 'mock');
  assert.equal(data.logs.source, 'mock');
  assert.ok(data.evidence.items.length > 0);
  assert.ok(data.changes.items.length > 0);
  assert.ok(data.logs.entries.length > 0);
});

test('buildInspectorData: bridge error no data → all panels unavailable', () => {
  const data = buildInspectorData(baseInput({ bridgeError: 'Bridge unreachable' }));
  assert.equal(data.evidence.source, 'unavailable');
  assert.equal(data.changes.source, 'unavailable');
  assert.equal(data.logs.source, 'unavailable');
});

test('buildInspectorData: bridge error WITH data → all panels cache', () => {
  const session = makeAssetSession({
    currentState: 'done',
    promote: {
      applyResultJson: '{"ok":true}',
      promotedAt: FIXTURE_TS,
    },
  });
  const snapshot = makeSnapshot({
    recentLogs: [
      { timestamp: FIXTURE_TS, category: 'LogBlueprint', verbosity: 'log', message: 'Ok' },
    ],
  });
  const data = buildInspectorData(baseInput({
    selectedSession: session,
    snapshot,
    bridgeError: 'Bridge unreachable',
  }));
  assert.equal(data.evidence.source, 'cache');
  assert.equal(data.changes.source, 'cache');
  assert.equal(data.logs.source, 'cache');
});

test('buildInspectorData: real mode with session and snapshot → live data', () => {
  const session = makeAssetSession({
    currentState: 'done',
    promote: {
      applyResultJson: '{"ok":true}',
      promotedAt: FIXTURE_TS,
    },
  });
  const snapshot = makeSnapshot({
    recentLogs: [
      { timestamp: FIXTURE_TS, category: 'LogBlueprint', verbosity: 'log', message: 'Done' },
    ],
  });
  const data = buildInspectorData(baseInput({ selectedSession: session, snapshot }));
  assert.equal(data.evidence.source, 'live');
  assert.equal(data.changes.source, 'live');
  assert.equal(data.logs.source, 'live');
});

test('buildInspectorData: AUI-P1-01 regression — real mode no session does NOT show mock', () => {
  const data = buildInspectorData(baseInput({
    isMockClient: false,
    selectedSession: null,
    snapshot: null,
  }));
  assert.notEqual(data.evidence.source, 'mock');
  assert.equal(data.evidence.items.length, 0);
  assert.notEqual(data.changes.source, 'mock');
  assert.equal(data.changes.items.length, 0);
  assert.notEqual(data.logs.source, 'mock');
  assert.equal(data.logs.entries.length, 0);
});

// ── UpdatedAt timestamp tests ────────────────────────────────────────

test('updatedAt: live mode has timestamp from available sources', () => {
  const session = makeAssetSession({ updatedAt: FIXTURE_TS });
  const result = adaptEvidenceItems(baseInput({ selectedSession: session }));
  assert.equal(result.source, 'live');
  assert.equal(result.updatedAt, FIXTURE_TS);
});

test('updatedAt: mock mode has null timestamp', () => {
  const data = buildInspectorData(baseInput({ isMockClient: true }));
  assert.equal(data.evidence.updatedAt, null);
  assert.equal(data.changes.updatedAt, null);
  assert.equal(data.logs.updatedAt, null);
});

test('updatedAt: unavailable mode has null timestamp', () => {
  const data = buildInspectorData(baseInput());
  assert.equal(data.evidence.updatedAt, null);
  assert.equal(data.changes.updatedAt, null);
  assert.equal(data.logs.updatedAt, null);
});
