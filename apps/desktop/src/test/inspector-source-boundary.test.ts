import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import type {
  AgentAssetSessionRecord,
  AgentUiLogEntry,
  AgentSessionErrorStoredRecord,
  ChangeItem,
  CompileIssue,
  EvidenceItem,
  LogEntry,
  OmueContextSnapshot,
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

// ── Helpers ──────────────────────────────────────────────────────────

const FIXTURE_TS = '2026-06-23T10:00:00.000Z';
const FIXTURE_TS_OLDER = '2026-06-23T09:00:00.000Z';
const FIXTURE_TS_NEWER = '2026-06-23T11:00:00.000Z';

const MOCK_TEXTS = {
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

function baseInput(
  overrides?: Partial<InspectorDataAdapterInput>,
): InspectorDataAdapterInput {
  return {
    selectedSession: null,
    selectedEvents: [],
    snapshot: null,
    isMockClient: false,
    bridgeError: null,
    mockEvidenceTexts: MOCK_TEXTS,
    mockChangeTexts: MOCK_CHANGE_TEXTS,
    mockLogTexts: MOCK_LOG_TEXTS,
    ...overrides,
  };
}

function makeAssetSession(
  overrides?: Partial<AgentAssetSessionRecord>,
): AgentAssetSessionRecord {
  return {
    schemaVersion: REPAIR_SESSION_SCHEMA_VERSION,
    sessionId: 'session-1',
    scope: 'asset',
    userIntent: 'Test',
    targetAssetPath: '/Game/Test/BP_Test',
    createdAt: FIXTURE_TS,
    updatedAt: FIXTURE_TS,
    currentState: 'draft',
    retryCount: 0,
    maxRetries: 3,
    proposals: [],
    ...overrides,
  };
}

function makeSnapshot(overrides?: Partial<OmueContextSnapshot>): OmueContextSnapshot {
  return {
    snapshotId: 'snap-1',
    capturedAt: FIXTURE_TS,
    bridgeVersion: '1.0',
    project: {
      projectName: 'Test',
      projectPath: 'C:/Test',
      uprojectFile: 'C:/Test/Test.uproject',
      engineVersion: '5.7',
      editorStatus: 'idle',
    },
    openAssets: [],
    recentLogs: [],
    compileStatus: {
      isCompiling: false,
      lastCompileResult: 'unknown',
      errorCount: 0,
      warningCount: 0,
      lastErrors: [],
    },
    runtimeStatus: { isPieRunning: false, isSimulating: false },
    ...overrides,
  } as OmueContextSnapshot;
}

// ── Source authority tests ───────────────────────────────────────────

test('source: mock client → source = mock, updatedAt = null', () => {
  const result = adaptEvidenceItems(baseInput({ isMockClient: true }));
  assert.equal(result.source, 'mock');
  assert.equal(result.updatedAt, null);
});

test('source: real data + no bridge error → source = live', () => {
  const session = makeAssetSession({ currentState: 'diagnosing' });
  const result = adaptEvidenceItems(baseInput({ selectedSession: session }));
  assert.equal(result.source, 'live');
});

test('source: real data + bridge error → source = cache, items retained', () => {
  const compileIssue: CompileIssue = {
    code: 'CS1000',
    message: 'Test',
    severity: 'error',
  };
  const session = makeAssetSession({
    currentState: 'diagnosing',
    contextSnapshot: {
      compileIssues: [compileIssue],
      blueprintSummary: {
        assetPath: '/Game/Test/BP_Test',
        displayName: 'BP_Test',
        assetClass: 'Blueprint',
        eligibility: 'eligible_scratch_or_test',
        dirtyState: 'Clean',
        source: 'real_readonly_bridge',
      },
      collectedAt: FIXTURE_TS,
    },
  });
  const result = adaptEvidenceItems(
    baseInput({ selectedSession: session, bridgeError: 'Bridge down' }),
  );
  assert.equal(result.source, 'cache');
  assert.ok(result.items.length > 0, 'items retained in cache');
  // evidence item assetName preserved
  assert.equal(result.items[0].assetName, 'BP_Test');
});

test('source: no real data, no bridge error → source = unavailable', () => {
  const result = adaptEvidenceItems(baseInput());
  assert.equal(result.source, 'unavailable');
  assert.equal(result.items.length, 0);
});

test('source: no real data + bridge error → source = unavailable', () => {
  const result = adaptEvidenceItems(
    baseInput({ bridgeError: 'Bridge down' }),
  );
  assert.equal(result.source, 'unavailable');
  assert.equal(result.items.length, 0);
});

test('source: bridge error without data does NOT become cache', () => {
  const result = adaptEvidenceItems(
    baseInput({ bridgeError: 'Bridge down' }),
  );
  assert.notEqual(result.source, 'cache');
  assert.notEqual(result.source, 'live');
  assert.equal(result.source, 'unavailable');
});

test('source: mock overrides everything', () => {
  const input = baseInput({
    isMockClient: true,
    selectedSession: makeAssetSession(),
    snapshot: makeSnapshot(),
    bridgeError: null,
  });
  const evidence = adaptEvidenceItems(input);
  const changes = adaptChangeItems(input);
  const logs = adaptLogEntries(input);
  assert.equal(evidence.source, 'mock');
  assert.equal(changes.source, 'mock');
  assert.equal(logs.source, 'mock');
});

// ── Timestamp tests ──────────────────────────────────────────────────

test('updatedAt: live → newest valid existing timestamp', () => {
  const session = makeAssetSession({ updatedAt: FIXTURE_TS_NEWER });
  const snapshot = makeSnapshot({ capturedAt: FIXTURE_TS_OLDER });
  const result = adaptEvidenceItems(
    baseInput({ selectedSession: session, snapshot }),
  );
  assert.equal(result.source, 'live');
  assert.equal(result.updatedAt, FIXTURE_TS_NEWER);
});

test('updatedAt: live → snapshot timestamp when no session', () => {
  const snapshot = makeSnapshot({ capturedAt: FIXTURE_TS });
  const result = adaptEvidenceItems(baseInput({ snapshot }));
  assert.equal(result.source, 'live');
  assert.equal(result.updatedAt, FIXTURE_TS);
});

test('updatedAt: cache → retains data timestamp, not Date.now()', () => {
  const session = makeAssetSession({ updatedAt: FIXTURE_TS });
  const snapshot = makeSnapshot({ capturedAt: FIXTURE_TS });
  const result = adaptEvidenceItems(
    baseInput({
      selectedSession: session,
      snapshot,
      bridgeError: 'Bridge down',
    }),
  );
  assert.equal(result.source, 'cache');
  assert.equal(result.updatedAt, FIXTURE_TS);
  // Must NOT be "now"
  assert.notEqual(result.updatedAt, new Date().toISOString().slice(0, 20));
});

test('updatedAt: mock → null', () => {
  const result = adaptEvidenceItems(baseInput({ isMockClient: true }));
  assert.equal(result.updatedAt, null);
});

test('updatedAt: unavailable → null', () => {
  const result = adaptEvidenceItems(baseInput());
  assert.equal(result.updatedAt, null);
});

test('updatedAt: logs panel uses log entry timestamps', () => {
  const logEntry: LogEntry = {
    timestamp: FIXTURE_TS_NEWER,
    category: 'LogBP',
    verbosity: 'error',
    message: 'Test',
  };
  const snapshot = makeSnapshot({
    recentLogs: [logEntry],
    capturedAt: FIXTURE_TS_OLDER,
  });
  const result = adaptLogEntries(baseInput({ snapshot }));
  assert.equal(result.source, 'live');
  assert.equal(result.updatedAt, FIXTURE_TS_NEWER);
});

// ── Changes panel source tests ───────────────────────────────────────

test('changes: real session with promote → live', () => {
  const session = makeAssetSession({
    currentState: 'done',
    promote: {
      applyResultJson: '{"ok":true}',
      promotedAt: FIXTURE_TS,
    },
  });
  const result = adaptChangeItems(baseInput({ selectedSession: session }));
  assert.equal(result.source, 'live');
});

test('changes: real session + bridge error → cache, items retained', () => {
  const session = makeAssetSession({
    currentState: 'done',
    promote: {
      applyResultJson: '{"ok":true}',
      promotedAt: FIXTURE_TS,
    },
  });
  const result = adaptChangeItems(
    baseInput({ selectedSession: session, bridgeError: 'Bridge down' }),
  );
  assert.equal(result.source, 'cache');
  assert.ok(result.items.length > 0, 'items retained');
});

// ── Logs panel source tests ──────────────────────────────────────────

test('logs: session events + snapshot logs → live', () => {
  const session = makeAssetSession({ currentState: 'diagnosing' });
  const events = [
    {
      id: 'ev-1',
      kind: 'state',
      sessionId: 'session-1',
      createdAt: FIXTURE_TS,
      currentState: 'diagnosing',
      retryCount: 0,
    } as const,
  ];
  const result = adaptLogEntries(
    baseInput({ selectedSession: session, selectedEvents: events }),
  );
  assert.equal(result.source, 'live');
});

test('logs: real data + bridge error → cache, entries retained', () => {
  const logEntry: LogEntry = {
    timestamp: FIXTURE_TS,
    category: 'LogBP',
    verbosity: 'error',
    message: 'Test',
  };
  const snapshot = makeSnapshot({ recentLogs: [logEntry] });
  const result = adaptLogEntries(
    baseInput({ snapshot, bridgeError: 'Bridge down' }),
  );
  assert.equal(result.source, 'cache');
  assert.ok(result.entries.length > 0, 'entries retained');
});

// ── buildInspectorData integration tests ─────────────────────────────

test('buildInspectorData: all panels share source authority', () => {
  const data = buildInspectorData(baseInput({ isMockClient: true }));
  assert.equal(data.evidence.source, 'mock');
  assert.equal(data.changes.source, 'mock');
  assert.equal(data.logs.source, 'mock');
});

test('buildInspectorData: unavailable → all panels unavailable', () => {
  const data = buildInspectorData(baseInput());
  assert.equal(data.evidence.source, 'unavailable');
  assert.equal(data.changes.source, 'unavailable');
  assert.equal(data.logs.source, 'unavailable');
});

test('buildInspectorData: live data → all panels live', () => {
  const session = makeAssetSession({
    currentState: 'done',
    promote: {
      applyResultJson: '{"ok":true}',
      promotedAt: FIXTURE_TS,
    },
  });
  const snapshot = makeSnapshot({
    recentLogs: [
      { timestamp: FIXTURE_TS, category: 'LogBP', verbosity: 'log', message: 'Ok' },
    ],
  });
  const data = buildInspectorData(
    baseInput({ selectedSession: session, snapshot }),
  );
  assert.equal(data.evidence.source, 'live');
  assert.equal(data.changes.source, 'live');
  assert.equal(data.logs.source, 'live');
});

test('buildInspectorData: cache → all panels cache', () => {
  const session = makeAssetSession({
    currentState: 'done',
    promote: {
      applyResultJson: '{"ok":true}',
      promotedAt: FIXTURE_TS,
    },
  });
  const snapshot = makeSnapshot({
    recentLogs: [
      { timestamp: FIXTURE_TS, category: 'LogBP', verbosity: 'log', message: 'Ok' },
    ],
  });
  const data = buildInspectorData(
    baseInput({
      selectedSession: session,
      snapshot,
      bridgeError: 'Bridge down',
    }),
  );
  assert.equal(data.evidence.source, 'cache');
  assert.equal(data.changes.source, 'cache');
  assert.equal(data.logs.source, 'cache');
});

// ── InspectorData now uses source not mode ───────────────────────────

test('InspectorPanelData has source and updatedAt, not mode', () => {
  const data = buildInspectorData(baseInput());
  // new fields exist
  assert.equal(typeof data.evidence.source, 'string');
  assert.equal(data.evidence.updatedAt, null);
  // old mode field must NOT exist
  assert.ok(!('mode' in data.evidence) || (data.evidence as Record<string, unknown>).mode === undefined);
});

// ── Panel-specific updatedAt tests ────────────────────────────────────

const FIXTURE_FUTURE = '2099-01-01T00:00:00.000Z';
const FIXTURE_INVALID = 'not-a-date';
const FIXTURE_MID = '2026-06-23T10:30:00.000Z';

test('updatedAt: Evidence does NOT use recent log timestamp', () => {
  // A future recent log should not change Evidence updatedAt
  const session = makeAssetSession({ updatedAt: FIXTURE_TS });
  const snapshot = makeSnapshot({
    capturedAt: FIXTURE_TS_OLDER,
    recentLogs: [
      { timestamp: FIXTURE_FUTURE, category: 'LogBP', verbosity: 'log', message: 'Future message' },
    ],
  });
  const result = adaptEvidenceItems(
    baseInput({ selectedSession: session, snapshot }),
  );
  assert.equal(result.source, 'live');
  // Evidence should use session.updatedAt or snapshot.capturedAt, NOT the future log
  assert.notEqual(result.updatedAt, FIXTURE_FUTURE,
    'Evidence updatedAt must not be polluted by future recent log timestamp');
  assert.equal(result.updatedAt, FIXTURE_TS);
});

test('updatedAt: Evidence does NOT use selected event timestamp', () => {
  const session = makeAssetSession({ updatedAt: FIXTURE_TS_OLDER });
  const events = [
    {
      id: 'ev-1',
      kind: 'state',
      sessionId: 'session-1',
      createdAt: FIXTURE_FUTURE,
      currentState: 'diagnosing',
      retryCount: 0,
    } as const,
  ];
  const result = adaptEvidenceItems(
    baseInput({ selectedSession: session, selectedEvents: events }),
  );
  assert.equal(result.source, 'live');
  assert.notEqual(result.updatedAt, FIXTURE_FUTURE,
    'Evidence updatedAt must not come from selected event timestamp');
  assert.equal(result.updatedAt, FIXTURE_TS_OLDER);
});

test('updatedAt: Changes does NOT use recent log timestamp', () => {
  const session = makeAssetSession({
    updatedAt: FIXTURE_TS,
    currentState: 'done',
    promote: {
      applyResultJson: '{"ok":true}',
      promotedAt: FIXTURE_TS,
    },
  });
  const snapshot = makeSnapshot({
    recentLogs: [
      { timestamp: FIXTURE_FUTURE, category: 'LogBP', verbosity: 'log', message: 'Future' },
    ],
  });
  const result = adaptChangeItems(
    baseInput({ selectedSession: session, snapshot }),
  );
  assert.equal(result.source, 'live');
  assert.ok(result.items.length > 0, 'should have change items');
  assert.notEqual(result.updatedAt, FIXTURE_FUTURE,
    'Changes updatedAt must not be polluted by future recent log');
  assert.equal(result.updatedAt, FIXTURE_TS);
});

test('updatedAt: Changes does NOT use snapshot capturedAt', () => {
  const session = makeAssetSession({
    updatedAt: FIXTURE_TS,
    currentState: 'done',
    promote: {
      applyResultJson: '{"ok":true}',
      promotedAt: FIXTURE_TS,
    },
  });
  const snapshot = makeSnapshot({ capturedAt: FIXTURE_FUTURE });
  const result = adaptChangeItems(
    baseInput({ selectedSession: session, snapshot }),
  );
  assert.notEqual(result.updatedAt, FIXTURE_FUTURE,
    'Changes updatedAt must not come from snapshot capturedAt');
  assert.equal(result.updatedAt, FIXTURE_TS);
});

test('updatedAt: Evidence uses snapshot capturedAt when no session', () => {
  const snapshot = makeSnapshot({
    capturedAt: FIXTURE_TS,
    compileStatus: {
      isCompiling: false,
      lastCompileResult: 'failed',
      errorCount: 1,
      warningCount: 0,
      lastErrors: [
        { code: 'CS1000', message: 'Compile error', severity: 'error' },
      ],
    },
  });
  const result = adaptEvidenceItems(baseInput({ snapshot }));
  assert.equal(result.source, 'live');
  assert.equal(result.updatedAt, FIXTURE_TS);
});

test('updatedAt: Logs uses latest entry timestamp, not session updatedAt', () => {
  const session = makeAssetSession({ updatedAt: FIXTURE_FUTURE });
  const logEntry: LogEntry = {
    timestamp: FIXTURE_TS,
    category: 'LogBP',
    verbosity: 'error',
    message: 'Test',
  };
  const snapshot = makeSnapshot({ recentLogs: [logEntry] });
  const result = adaptLogEntries(
    baseInput({ selectedSession: session, snapshot }),
  );
  assert.equal(result.source, 'live');
  assert.ok(result.entries.length > 0, 'should have entries');
  // Logs should use the actual entry timestamp, not the session's future timestamp
  assert.equal(result.updatedAt, FIXTURE_TS,
    'Logs updatedAt must come from actual entry timestamp, not session');
});

test('updatedAt: Logs does NOT use session updatedAt when entries exist', () => {
  const session = makeAssetSession({ updatedAt: FIXTURE_TS });
  const events = [
    {
      id: 'ev-1',
      kind: 'state',
      sessionId: 'session-1',
      createdAt: FIXTURE_TS_NEWER,
      currentState: 'diagnosing',
      retryCount: 0,
    } as const,
  ];
  const result = adaptLogEntries(
    baseInput({ selectedSession: session, selectedEvents: events }),
  );
  assert.equal(result.source, 'live');
  assert.ok(result.entries.length > 0, 'should have entries');
  // Should use the event's createdAt, not session.updatedAt
  assert.equal(result.updatedAt, FIXTURE_TS_NEWER);
});

test('updatedAt: Logs with no entries has null, even with session', () => {
  const session = makeAssetSession({ updatedAt: FIXTURE_TS });
  const result = adaptLogEntries(baseInput({ selectedSession: session }));
  assert.ok(result.entries.length === 0, 'no log entries');
  assert.equal(result.updatedAt, null,
    'Logs updatedAt must be null when no entries, even with session present');
});

test('updatedAt: Evidence empty with session source still uses session updatedAt', () => {
  const session = makeAssetSession({ updatedAt: FIXTURE_TS });
  const result = adaptEvidenceItems(baseInput({ selectedSession: session }));
  assert.equal(result.source, 'live');
  assert.equal(result.updatedAt, FIXTURE_TS,
    'Evidence uses session updatedAt even when items are empty (source exists)');
});

test('updatedAt: invalid timestamp strings are excluded', () => {
  // A snapshot with an invalid timestamp should not win over valid ones
  const session = makeAssetSession({ updatedAt: FIXTURE_TS });
  const result = adaptEvidenceItems(
    baseInput({
      selectedSession: session,
      snapshot: makeSnapshot({ capturedAt: FIXTURE_INVALID as unknown as string }),
    }),
  );
  assert.equal(result.source, 'live');
  assert.equal(result.updatedAt, FIXTURE_TS);
});

test('updatedAt: invalid timestamp in log entries is excluded', () => {
  const logEntry: LogEntry = {
    timestamp: FIXTURE_INVALID,
    category: 'LogBP',
    verbosity: 'error',
    message: 'Test',
  };
  const snapshot = makeSnapshot({
    recentLogs: [logEntry],
  });
  const result = adaptLogEntries(baseInput({ snapshot }));
  assert.equal(result.updatedAt, null,
    'Invalid timestamp in log entries must not become updatedAt');
});

test('updatedAt: Changes empty state uses session updatedAt', () => {
  const session = makeAssetSession({ updatedAt: FIXTURE_TS });
  const result = adaptChangeItems(baseInput({ selectedSession: session }));
  // Project session with no proposals -> empty items
  assert.ok(result.items.length === 0, 'no change items for project session');
  assert.equal(result.source, 'live');
  assert.equal(result.updatedAt, FIXTURE_TS);
});

test('updatedAt: Evidence empty uses snapshot capturedAt when no session', () => {
  const snapshot = makeSnapshot({ capturedAt: FIXTURE_TS });
  const result = adaptEvidenceItems(baseInput({ snapshot }));
  assert.equal(result.source, 'live');
  assert.equal(result.updatedAt, FIXTURE_TS);
});

// ── Evidence provenance: timestamp bound to actual contributing source ─

test('provenance: session Evidence items → session updatedAt (snapshot does NOT override)', () => {
  const session = makeAssetSession({
    updatedAt: FIXTURE_TS_OLDER,
    currentState: 'diagnosing',
    errors: [
      { errorId: 'e1', sessionId: 'session-1', scope: 'asset' as const,
        errorCode: 'test', message: 'err', recoverable: true, createdAt: FIXTURE_TS_OLDER },
    ],
  });
  const snapshot = makeSnapshot({ capturedAt: FIXTURE_TS_NEWER });
  const result = adaptEvidenceItems(baseInput({ selectedSession: session, snapshot }));
  assert.equal(result.source, 'live');
  assert.ok(result.items.length > 0, 'session contributed items');
  assert.equal(result.updatedAt, FIXTURE_TS_OLDER,
    'session Evidence uses session updatedAt, not later snapshot capturedAt');
});

test('provenance: session has items + snapshot has later time → session time wins', () => {
  const session = makeAssetSession({
    updatedAt: FIXTURE_TS_OLDER,
    currentState: 'diagnosing',
    contextSnapshot: {
      compileIssues: [{ code: 'CS1000', message: 'Test', severity: 'error' as const }],
      blueprintSummary: {
        assetPath: '/Game/Test/BP_Test',
        displayName: 'BP_Test',
        assetClass: 'Blueprint' as const,
        eligibility: 'eligible_scratch_or_test' as const,
        dirtyState: 'Dirty' as const,
        source: 'real_readonly_bridge' as const,
      },
      collectedAt: FIXTURE_TS_OLDER,
    },
  });
  const snapshot = makeSnapshot({ capturedAt: FIXTURE_TS_NEWER });
  const result = adaptEvidenceItems(baseInput({ selectedSession: session, snapshot }));
  assert.equal(result.source, 'live');
  assert.ok(result.items.length > 0, 'session contributed compile + dirty items');
  assert.equal(result.updatedAt, FIXTURE_TS_OLDER,
    'session Evidence must not be overwritten by later snapshot capturedAt');
});

test('provenance: session no items + snapshot has items → snapshot time (session later time does NOT win)', () => {
  const session = makeAssetSession({ updatedAt: FIXTURE_TS_NEWER });
  const issue: CompileIssue = { code: 'CS2000', message: 'Snapshot only', severity: 'error' as const };
  const snapshot = makeSnapshot({
    capturedAt: FIXTURE_TS_OLDER,
    compileStatus: {
      isCompiling: false,
      lastCompileResult: 'failed',
      errorCount: 1,
      warningCount: 0,
      lastErrors: [issue],
    },
  });
  const result = adaptEvidenceItems(baseInput({ selectedSession: session, snapshot }));
  assert.equal(result.source, 'live');
  assert.ok(result.items.length > 0, 'snapshot contributed items');
  assert.equal(result.updatedAt, FIXTURE_TS_OLDER,
    'snapshot Evidence uses snapshot capturedAt, not later session updatedAt');
});

test('provenance: session no items + snapshot dirty → snapshot time (session does NOT win)', () => {
  const session = makeAssetSession({ updatedAt: FIXTURE_TS_NEWER });
  const snapshot = makeSnapshot({
    capturedAt: FIXTURE_TS_OLDER,
    currentAsset: {
      assetName: 'BP_Test',
      assetPath: '/Game/Test/BP_Test',
      assetClass: 'Blueprint' as const,
      packagePath: '/Game/Test/BP_Test',
      isDirty: true,
      isSelected: true,
      isOpenInEditor: true,
      lastModified: FIXTURE_TS_OLDER,
    },
  });
  const result = adaptEvidenceItems(baseInput({ selectedSession: session, snapshot }));
  assert.equal(result.source, 'live');
  assert.ok(result.items.length > 0, 'snapshot contributed dirty item');
  assert.equal(result.updatedAt, FIXTURE_TS_OLDER,
    'snapshot dirty Evidence uses snapshot capturedAt, not later session updatedAt');
});

test('provenance: no items from either → fallback to latest valid source freshness', () => {
  const session = makeAssetSession({ updatedAt: FIXTURE_TS_OLDER });
  const snapshot = makeSnapshot({ capturedAt: FIXTURE_TS_NEWER });
  const result = adaptEvidenceItems(baseInput({ selectedSession: session, snapshot }));
  assert.equal(result.source, 'live');
  assert.equal(result.items.length, 0, 'no items contributed');
  assert.equal(result.updatedAt, FIXTURE_TS_NEWER,
    'when neither contributes, fallback to latest valid source freshness');
});

test('provenance: session has items but updatedAt invalid → null (no fallback to snapshot)', () => {
  const session = makeAssetSession({
    updatedAt: FIXTURE_INVALID,
    currentState: 'diagnosing',
    errors: [
      { errorId: 'e1', sessionId: 'session-1', scope: 'asset' as const,
        errorCode: 'test', message: 'err', recoverable: true, createdAt: FIXTURE_TS },
    ],
  });
  const snapshot = makeSnapshot({ capturedAt: FIXTURE_TS_NEWER });
  const result = adaptEvidenceItems(baseInput({ selectedSession: session, snapshot }));
  assert.equal(result.source, 'live');
  assert.ok(result.items.length > 0, 'session contributed items');
  assert.equal(result.updatedAt, null,
    'invalid session updatedAt → null, must NOT fall back to non-contributing snapshot');
});

test('provenance: snapshot has items but capturedAt invalid → null (no fallback to session)', () => {
  const session = makeAssetSession({ updatedAt: FIXTURE_TS_NEWER });
  const issue: CompileIssue = { code: 'CS2000', message: 'Snapshot only', severity: 'error' as const };
  const snapshot = makeSnapshot({
    capturedAt: FIXTURE_INVALID as unknown as string,
    compileStatus: {
      isCompiling: false,
      lastCompileResult: 'failed',
      errorCount: 1,
      warningCount: 0,
      lastErrors: [issue],
    },
  });
  const result = adaptEvidenceItems(baseInput({ selectedSession: session, snapshot }));
  assert.equal(result.source, 'live');
  assert.ok(result.items.length > 0, 'snapshot contributed items');
  assert.equal(result.updatedAt, null,
    'invalid snapshot capturedAt → null, must NOT fall back to non-contributing session');
});

test('provenance: cache retains provenance-base timestamp from contributing source', () => {
  const session = makeAssetSession({
    updatedAt: FIXTURE_TS_OLDER,
    currentState: 'diagnosing',
    errors: [
      { errorId: 'e1', sessionId: 'session-1', scope: 'asset' as const,
        errorCode: 'test', message: 'err', recoverable: true, createdAt: FIXTURE_TS_OLDER },
    ],
  });
  const snapshot = makeSnapshot({ capturedAt: FIXTURE_TS_NEWER });
  const result = adaptEvidenceItems(baseInput({
    selectedSession: session,
    snapshot,
    bridgeError: 'Bridge down',
  }));
  assert.equal(result.source, 'cache');
  assert.ok(result.items.length > 0, 'session items retained in cache');
  assert.equal(result.updatedAt, FIXTURE_TS_OLDER,
    'cache provenance must use session time, not later snapshot time');
});

// ── CSS token contract tests ────────────────────────────────────────

const WORKBENCH_CSS_PATH = path.resolve(__dirname, '../../src/renderer/components/workbench/workbench.css');
const WORKBENCH_CSS = readFileSync(WORKBENCH_CSS_PATH, 'utf-8');

function extractSourceStatusBlock(css: string): string | null {
  const start = css.indexOf('.ue-inspector-source-status {');
  if (start === -1) return null;
  const brace = css.indexOf('{', start);
  if (brace === -1) return null;
  let depth = 1;
  let pos = brace + 1;
  while (depth > 0 && pos < css.length) {
    if (css[pos] === '{') depth++;
    else if (css[pos] === '}') depth--;
    pos++;
  }
  let end = pos;
  while (end < css.length && css[end] !== '}' && css[end] !== '.') {
    end++;
  }
  if (end > pos) {
    while (end < css.length) {
      if (css[end] === '{') depth++;
      else if (css[end] === '}') depth--;
      if (depth === 0) break;
      end++;
    }
  }
  const lastBrace = css.lastIndexOf('}', css.indexOf('.ue-inspector-mock-only-note', start) + 150);
  const blockEnd = css.indexOf('.ue-inspector-dev-toggle-row', start);
  const effectiveEnd = blockEnd !== -1 ? blockEnd : lastBrace + 100;
  return css.slice(start, effectiveEnd);
}

function extractSourceBadgeRules(css: string): Record<string, { background: string; color: string }> {
  const rules: Record<string, { background: string; color: string }> = {};
  const kinds = ['live', 'cache', 'mock', 'unavailable'];
  for (const kind of kinds) {
    const blockStart = css.indexOf(`.ue-inspector-source-badge-${kind} {`);
    if (blockStart === -1) continue;
    const braceIdx = css.indexOf('{', blockStart);
    const endIdx = css.indexOf('}', braceIdx);
    const block = css.slice(braceIdx + 1, endIdx);
    const bgMatch = block.match(/background:\s*(.+?);/s);
    const colorMatch = block.match(/color:\s*(.+?);/s);
    rules[kind] = {
      background: bgMatch ? bgMatch[1].trim() : '',
      color: colorMatch ? colorMatch[1].trim() : '',
    };
  }
  return rules;
}

const SOURCE_BLOCK = extractSourceStatusBlock(WORKBENCH_CSS);
const BADGE_RULES = extractSourceBadgeRules(WORKBENCH_CSS);
const HEX_PATTERN = /#[0-9a-fA-F]{3,8}\b/;
const RGB_PATTERN = /\brgba?\s*\(/;
const HSL_PATTERN = /\bhsla?\s*\(/;

const CACHE_NOTE_CSS = (() => {
  const start = WORKBENCH_CSS.indexOf('.ue-inspector-source-cache-note {');
  if (start === -1) return '';
  const brace = WORKBENCH_CSS.indexOf('{', start);
  const end = WORKBENCH_CSS.indexOf('}', brace);
  return WORKBENCH_CSS.slice(brace + 1, end);
})();

const MOCK_ONLY_NOTE_CSS = (() => {
  const start = WORKBENCH_CSS.indexOf('.ue-inspector-mock-only-note {');
  if (start === -1) return '';
  const brace = WORKBENCH_CSS.indexOf('{', start);
  const end = WORKBENCH_CSS.indexOf('}', brace);
  return WORKBENCH_CSS.slice(brace + 1, end);
})();

test('CSS: source status block exists', () => {
  assert.ok(SOURCE_BLOCK, 'source status block must exist in workbench.css');
});

test('CSS: live badge uses --accent-success (no fallback, no hex)', () => {
  assert.ok(BADGE_RULES.live, 'live badge rule must exist');
  assert.ok(BADGE_RULES.live.background.includes('var(--accent-success)'), 'background uses --accent-success');
  assert.ok(BADGE_RULES.live.color.includes('var(--accent-success)'), 'color uses --accent-success');
  assert.ok(!HEX_PATTERN.test(BADGE_RULES.live.background), 'background has no hex color');
  assert.ok(!HEX_PATTERN.test(BADGE_RULES.live.color), 'color has no hex color');
  assert.ok(!BADGE_RULES.live.background.includes('--success,'), 'background has no fallback');
  assert.ok(!BADGE_RULES.live.color.includes('--success,'), 'color has no fallback');
});

test('CSS: cache badge uses --accent-warning (no fallback, no hex)', () => {
  assert.ok(BADGE_RULES.cache, 'cache badge rule must exist');
  assert.ok(BADGE_RULES.cache.background.includes('var(--accent-warning)'), 'background uses --accent-warning');
  assert.ok(BADGE_RULES.cache.color.includes('var(--accent-warning)'), 'color uses --accent-warning');
  assert.ok(!HEX_PATTERN.test(BADGE_RULES.cache.background), 'background has no hex color');
  assert.ok(!HEX_PATTERN.test(BADGE_RULES.cache.color), 'color has no hex color');
  assert.ok(!BADGE_RULES.cache.background.includes('--accent-warning,'), 'background has no fallback');
  assert.ok(!BADGE_RULES.cache.color.includes('--accent-warning,'), 'color has no fallback');
});

test('CSS: mock badge uses --accent-agent (no fallback, no hex)', () => {
  assert.ok(BADGE_RULES.mock, 'mock badge rule must exist');
  assert.ok(BADGE_RULES.mock.background.includes('var(--accent-agent)'), 'background uses --accent-agent');
  assert.ok(BADGE_RULES.mock.color.includes('var(--accent-agent)'), 'color uses --accent-agent');
  assert.ok(!HEX_PATTERN.test(BADGE_RULES.mock.background), 'background has no hex color');
  assert.ok(!HEX_PATTERN.test(BADGE_RULES.mock.color), 'color has no hex color');
  assert.ok(!BADGE_RULES.mock.background.includes('--accent-purple'), 'mock background must not use --accent-purple');
  assert.ok(!BADGE_RULES.mock.color.includes('--accent-purple'), 'mock color must not use --accent-purple');
});

test('CSS: unavailable badge uses --text-muted (no fallback, no hex)', () => {
  assert.ok(BADGE_RULES.unavailable, 'unavailable badge rule must exist');
  assert.ok(BADGE_RULES.unavailable.background.includes('var(--text-muted)'), 'background uses --text-muted');
  assert.ok(BADGE_RULES.unavailable.color.includes('var(--text-muted)'), 'color uses --text-muted');
  assert.ok(!HEX_PATTERN.test(BADGE_RULES.unavailable.background), 'background has no hex color');
  assert.ok(!HEX_PATTERN.test(BADGE_RULES.unavailable.color), 'color has no hex color');
  assert.ok(!BADGE_RULES.unavailable.background.includes('--text-muted,'), 'background has no fallback');
  assert.ok(!BADGE_RULES.unavailable.color.includes('--text-muted,'), 'color has no fallback');
});

test('CSS: cache-note uses --accent-warning (no fallback, no hex)', () => {
  assert.ok(CACHE_NOTE_CSS.includes('var(--accent-warning)'), 'cache note uses --accent-warning');
  assert.ok(!CACHE_NOTE_CSS.includes('--accent-warning,'), 'cache note has no fallback');
  assert.ok(!HEX_PATTERN.test(CACHE_NOTE_CSS), 'cache note has no hex color');
});

test('CSS: mock-only-note uses --accent-agent (no fallback, no hex)', () => {
  assert.ok(MOCK_ONLY_NOTE_CSS.includes('var(--accent-agent)'), 'mock note uses --accent-agent');
  assert.ok(!MOCK_ONLY_NOTE_CSS.includes('--accent-purple'), 'mock note must not use --accent-purple');
  assert.ok(!HEX_PATTERN.test(MOCK_ONLY_NOTE_CSS), 'mock note has no hex color');
});

test('CSS: source block has no --accent-purple anywhere', () => {
  assert.ok(!SOURCE_BLOCK!.includes('--accent-purple'), 'source block must not contain --accent-purple');
});

test('CSS: no hex hardcoded colors in source badge blocks', () => {
  for (const [kind, rule] of Object.entries(BADGE_RULES)) {
    assert.ok(!HEX_PATTERN.test(rule.background), `${kind} background has no hex`);
    assert.ok(!HEX_PATTERN.test(rule.color), `${kind} color has no hex`);
  }
});

test('CSS: no rgb/rgba/hsl/hsla hardcoded colors in source badge blocks', () => {
  for (const [kind, rule] of Object.entries(BADGE_RULES)) {
    assert.ok(!RGB_PATTERN.test(rule.background), `${kind} background has no rgb/rgba`);
    assert.ok(!RGB_PATTERN.test(rule.color), `${kind} color has no rgb/rgba`);
    assert.ok(!HSL_PATTERN.test(rule.background), `${kind} background has no hsl/hsla`);
    assert.ok(!HSL_PATTERN.test(rule.color), `${kind} color has no hsl/hsla`);
  }
});

// ── i18n contract tests ──────────────────────────────────────────────

const EN_DICT_PATH = path.resolve(__dirname, '../../src/renderer/i18n/dict-en.ts');
const ZH_DICT_PATH = path.resolve(__dirname, '../../src/renderer/i18n/dict-zh.ts');
const EN_DICT = readFileSync(EN_DICT_PATH, 'utf-8');
const ZH_DICT = readFileSync(ZH_DICT_PATH, 'utf-8');

/** Extract text between an opening brace at startPos and the matching close brace. */
function extractBoundedSection(text: string, keyStart: number): string {
  const openBrace = text.indexOf('{', keyStart);
  if (openBrace === -1) return '';
  let depth = 1;
  let pos = openBrace + 1;
  while (depth > 0 && pos < text.length) {
    if (text[pos] === '{') depth++;
    else if (text[pos] === '}') depth--;
    pos++;
  }
  return text.slice(openBrace + 1, pos - 1);
}

function findNestedSection(text: string, parentStart: number, key: string): number {
  const searchFrom = parentStart > -1 ? parentStart : 0;
  const pattern = `${key}: {`;
  // scan forward from parentStart until we find the key followed by ": {"
  let pos = text.indexOf(pattern, searchFrom);
  while (pos !== -1) {
    // make sure the preceding character is whitespace/newline/indent (not part of another key)
    const before = text[pos - 1];
    if (before === ' ' || before === '\n' || before === '\t' || before === '\r' || pos === searchFrom) {
      return pos;
    }
    pos = text.indexOf(pattern, pos + 1);
  }
  return -1;
}

// ── en dict bounded rightInspector section ──

const RI_EN_KEY = 'rightInspector:';
const RI_EN_IDX = EN_DICT.indexOf(RI_EN_KEY);
const RI_EN_SECTION = extractBoundedSection(EN_DICT, RI_EN_IDX);

// ── en dict bounded evidence/changes/logs subsections ──

const EN_EVIDENCE_KEY_IDX = findNestedSection(EN_DICT, RI_EN_IDX, 'evidence');
const EN_EVIDENCE_SECTION = extractBoundedSection(EN_DICT, EN_EVIDENCE_KEY_IDX);
const EN_EVIDENCE_END = EN_EVIDENCE_KEY_IDX + 'evidence: {'.length + EN_EVIDENCE_SECTION.length + 1;

const EN_CHANGES_KEY_IDX = findNestedSection(EN_DICT, EN_EVIDENCE_END, 'changes');
const EN_CHANGES_SECTION = extractBoundedSection(EN_DICT, EN_CHANGES_KEY_IDX);
const EN_CHANGES_END = EN_CHANGES_KEY_IDX + 'changes: {'.length + EN_CHANGES_SECTION.length + 1;

const EN_LOGS_KEY_IDX = findNestedSection(EN_DICT, EN_CHANGES_END, 'logs');
const EN_LOGS_SECTION = extractBoundedSection(EN_DICT, EN_LOGS_KEY_IDX);

// ── zh dict bounded rightInspector section ──

const RI_ZH_IDX = ZH_DICT.indexOf(RI_EN_KEY); // same key name 'rightInspector:'
const RI_ZH_SECTION = extractBoundedSection(ZH_DICT, RI_ZH_IDX);

const ZH_EVIDENCE_KEY_IDX = findNestedSection(ZH_DICT, RI_ZH_IDX, 'evidence');
const ZH_EVIDENCE_SECTION = extractBoundedSection(ZH_DICT, ZH_EVIDENCE_KEY_IDX);
const ZH_EVIDENCE_END = ZH_EVIDENCE_KEY_IDX + 'evidence: {'.length + ZH_EVIDENCE_SECTION.length + 1;

const ZH_CHANGES_KEY_IDX = findNestedSection(ZH_DICT, ZH_EVIDENCE_END, 'changes');
const ZH_CHANGES_SECTION = extractBoundedSection(ZH_DICT, ZH_CHANGES_KEY_IDX);
const ZH_CHANGES_END = ZH_CHANGES_KEY_IDX + 'changes: {'.length + ZH_CHANGES_SECTION.length + 1;

const ZH_LOGS_KEY_IDX = findNestedSection(ZH_DICT, ZH_CHANGES_END, 'logs');
const ZH_LOGS_SECTION = extractBoundedSection(ZH_DICT, ZH_LOGS_KEY_IDX);

// ── Source label/detail bounded checks ──

test('i18n: en rightInspector bounded section has source label keys', () => {
  assert.ok(RI_EN_SECTION.includes('sourceLabelLive'), 'sourceLabelLive');
  assert.ok(RI_EN_SECTION.includes('sourceLabelCache'), 'sourceLabelCache');
  assert.ok(RI_EN_SECTION.includes('sourceLabelMock'), 'sourceLabelMock');
  assert.ok(RI_EN_SECTION.includes('sourceLabelUnavailable'), 'sourceLabelUnavailable');
});

test('i18n: en rightInspector bounded section has source detail keys', () => {
  assert.ok(RI_EN_SECTION.includes('sourceDetailLive'), 'sourceDetailLive');
  assert.ok(RI_EN_SECTION.includes('sourceDetailCache'), 'sourceDetailCache');
  assert.ok(RI_EN_SECTION.includes('sourceDetailMock'), 'sourceDetailMock');
  assert.ok(RI_EN_SECTION.includes('sourceDetailUnavailable'), 'sourceDetailUnavailable');
});

test('i18n: en rightInspector bounded section has timestamp keys', () => {
  assert.ok(RI_EN_SECTION.includes('updatedAtLabel'), 'updatedAtLabel');
  assert.ok(RI_EN_SECTION.includes('noLiveUpdateTime'), 'noLiveUpdateTime');
  assert.ok(RI_EN_SECTION.includes('cacheStaleNotice'), 'cacheStaleNotice');
  assert.ok(RI_EN_SECTION.includes('mockOnlyDevNotice'), 'mockOnlyDevNotice');
});

test('i18n: en evidence bounded section has all 3 empty body keys', () => {
  assert.ok(EN_EVIDENCE_SECTION.includes('emptyBodyUnavailable'),
    'evidence section: emptyBodyUnavailable');
  assert.ok(EN_EVIDENCE_SECTION.includes('emptyBodyMock'),
    'evidence section: emptyBodyMock');
  assert.ok(EN_EVIDENCE_SECTION.includes('emptyBodyLiveCache'),
    'evidence section: emptyBodyLiveCache');
});

test('i18n: en changes bounded section has all 3 empty body keys', () => {
  assert.ok(EN_CHANGES_SECTION.includes('emptyBodyUnavailable'),
    'changes section: emptyBodyUnavailable');
  assert.ok(EN_CHANGES_SECTION.includes('emptyBodyMock'),
    'changes section: emptyBodyMock');
  assert.ok(EN_CHANGES_SECTION.includes('emptyBodyLiveCache'),
    'changes section: emptyBodyLiveCache');
});

test('i18n: en logs bounded section has all 3 empty body keys', () => {
  assert.ok(EN_LOGS_SECTION.includes('emptyBodyUnavailable'),
    'logs section: emptyBodyUnavailable');
  assert.ok(EN_LOGS_SECTION.includes('emptyBodyMock'),
    'logs section: emptyBodyMock');
  assert.ok(EN_LOGS_SECTION.includes('emptyBodyLiveCache'),
    'logs section: emptyBodyLiveCache');
});

// ── zh dict bounded checks ──

test('i18n: zh rightInspector bounded section mirrors en source label keys', () => {
  assert.ok(RI_ZH_SECTION.includes('sourceLabelLive'), 'sourceLabelLive');
  assert.ok(RI_ZH_SECTION.includes('sourceLabelCache'), 'sourceLabelCache');
  assert.ok(RI_ZH_SECTION.includes('sourceLabelMock'), 'sourceLabelMock');
  assert.ok(RI_ZH_SECTION.includes('sourceLabelUnavailable'), 'sourceLabelUnavailable');
});

test('i18n: zh rightInspector bounded section mirrors en source detail keys', () => {
  assert.ok(RI_ZH_SECTION.includes('sourceDetailLive'), 'sourceDetailLive');
  assert.ok(RI_ZH_SECTION.includes('sourceDetailCache'), 'sourceDetailCache');
  assert.ok(RI_ZH_SECTION.includes('sourceDetailMock'), 'sourceDetailMock');
  assert.ok(RI_ZH_SECTION.includes('sourceDetailUnavailable'), 'sourceDetailUnavailable');
});

test('i18n: zh rightInspector bounded section mirrors en timestamp keys', () => {
  assert.ok(RI_ZH_SECTION.includes('updatedAtLabel'), 'updatedAtLabel');
  assert.ok(RI_ZH_SECTION.includes('noLiveUpdateTime'), 'noLiveUpdateTime');
  assert.ok(RI_ZH_SECTION.includes('cacheStaleNotice'), 'cacheStaleNotice');
  assert.ok(RI_ZH_SECTION.includes('mockOnlyDevNotice'), 'mockOnlyDevNotice');
});

test('i18n: zh evidence bounded section has all 3 empty body keys', () => {
  assert.ok(ZH_EVIDENCE_SECTION.includes('emptyBodyUnavailable'),
    'zh evidence: emptyBodyUnavailable');
  assert.ok(ZH_EVIDENCE_SECTION.includes('emptyBodyMock'),
    'zh evidence: emptyBodyMock');
  assert.ok(ZH_EVIDENCE_SECTION.includes('emptyBodyLiveCache'),
    'zh evidence: emptyBodyLiveCache');
});

test('i18n: zh changes bounded section has all 3 empty body keys', () => {
  assert.ok(ZH_CHANGES_SECTION.includes('emptyBodyUnavailable'),
    'zh changes: emptyBodyUnavailable');
  assert.ok(ZH_CHANGES_SECTION.includes('emptyBodyMock'),
    'zh changes: emptyBodyMock');
  assert.ok(ZH_CHANGES_SECTION.includes('emptyBodyLiveCache'),
    'zh changes: emptyBodyLiveCache');
});

test('i18n: zh logs bounded section has all 3 empty body keys', () => {
  assert.ok(ZH_LOGS_SECTION.includes('emptyBodyUnavailable'),
    'zh logs: emptyBodyUnavailable');
  assert.ok(ZH_LOGS_SECTION.includes('emptyBodyMock'),
    'zh logs: emptyBodyMock');
  assert.ok(ZH_LOGS_SECTION.includes('emptyBodyLiveCache'),
    'zh logs: emptyBodyLiveCache');
});

// ── Cross-panel isolation: no panel leaks into sibling section ──

test('i18n: en evidence section ends before changes section', () => {
  assert.ok(EN_EVIDENCE_END < EN_CHANGES_KEY_IDX,
    `evidence ends at ${EN_EVIDENCE_END}, changes starts at ${EN_CHANGES_KEY_IDX}`);
});

test('i18n: en changes section ends before logs section', () => {
  assert.ok(EN_CHANGES_END < EN_LOGS_KEY_IDX,
    `changes ends at ${EN_CHANGES_END}, logs starts at ${EN_LOGS_KEY_IDX}`);
});

test('i18n: zh evidence section ends before changes section', () => {
  assert.ok(ZH_EVIDENCE_END < ZH_CHANGES_KEY_IDX,
    `zh evidence ends at ${ZH_EVIDENCE_END}, changes starts at ${ZH_CHANGES_KEY_IDX}`);
});

test('i18n: zh changes section ends before logs section', () => {
  assert.ok(ZH_CHANGES_END < ZH_LOGS_KEY_IDX,
    `zh changes ends at ${ZH_CHANGES_END}, logs starts at ${ZH_LOGS_KEY_IDX}`);
});

// ── Source file structure tests ──────────────────────────────────────

const INSPECTOR_SOURCE_STATUS_PATH = path.resolve(__dirname, '../../src/renderer/components/workbench/InspectorSourceStatus.tsx');
const EVIDENCE_PANEL_PATH = path.resolve(__dirname, '../../src/renderer/components/workbench/EvidencePanel.tsx');
const CHANGES_PANEL_PATH = path.resolve(__dirname, '../../src/renderer/components/workbench/ChangesPanel.tsx');
const LOGS_PANEL_PATH = path.resolve(__dirname, '../../src/renderer/components/workbench/LogsPanel.tsx');
const RIGHT_INSPECTOR_PATH = path.resolve(__dirname, '../../src/renderer/components/workbench/RightInspector.tsx');
const SHELL_PATH = path.resolve(__dirname, '../../src/renderer/components/workbench/AgentWorkbenchShell.tsx');

const ISS_SRC = readFileSync(INSPECTOR_SOURCE_STATUS_PATH, 'utf-8');
const EVIDENCE_SRC = readFileSync(EVIDENCE_PANEL_PATH, 'utf-8');
const CHANGES_SRC = readFileSync(CHANGES_PANEL_PATH, 'utf-8');
const LOGS_SRC = readFileSync(LOGS_PANEL_PATH, 'utf-8');
const RI_SRC = readFileSync(RIGHT_INSPECTOR_PATH, 'utf-8');
const SHELL_SRC = readFileSync(SHELL_PATH, 'utf-8');

test('component: InspectorSourceStatus outputs data-inspector-source attr', () => {
  assert.ok(ISS_SRC.includes('data-inspector-source={source}'), 'has data-inspector-source');
});

test('component: InspectorSourceStatus outputs data-inspector-updated-at attr', () => {
  assert.ok(ISS_SRC.includes('data-inspector-updated-at={updatedAt ?? \'\'}'), 'has data-inspector-updated-at');
});

test('component: InspectorSourceStatus has dynamic badge CSS class template', () => {
  assert.ok(ISS_SRC.includes('ue-inspector-source-badge ue-inspector-source-badge-${') || ISS_SRC.includes('ue-inspector-source-badge ue-inspector-source-badge-${source}'), 'has dynamic badge class template');
  assert.ok(ISS_SRC.includes("'live'") || ISS_SRC.includes('"live"'), 'references live');
  assert.ok(ISS_SRC.includes("'cache'") || ISS_SRC.includes('"cache"'), 'references cache');
  assert.ok(ISS_SRC.includes("'mock'") || ISS_SRC.includes('"mock"'), 'references mock');
  assert.ok(ISS_SRC.includes("'unavailable'") || ISS_SRC.includes('"unavailable"'), 'references unavailable');
});

test('component: EvidencePanel imports and renders InspectorSourceStatus', () => {
  assert.ok(EVIDENCE_SRC.includes('InspectorSourceStatus'), 'imports InspectorSourceStatus');
  assert.ok(EVIDENCE_SRC.includes('<InspectorSourceStatus'), 'renders InspectorSourceStatus');
  assert.ok(EVIDENCE_SRC.includes('emptyBodyUnavailable'), 'has emptyBodyUnavailable');
  assert.ok(EVIDENCE_SRC.includes('emptyBodyMock'), 'has emptyBodyMock');
  assert.ok(EVIDENCE_SRC.includes('emptyBodyLiveCache'), 'has emptyBodyLiveCache');
});

test('component: ChangesPanel imports and renders InspectorSourceStatus', () => {
  assert.ok(CHANGES_SRC.includes('InspectorSourceStatus'), 'imports InspectorSourceStatus');
  assert.ok(CHANGES_SRC.includes('<InspectorSourceStatus'), 'renders InspectorSourceStatus');
  assert.ok(CHANGES_SRC.includes('emptyBodyUnavailable'), 'has emptyBodyUnavailable');
  assert.ok(CHANGES_SRC.includes('emptyBodyMock'), 'has emptyBodyMock');
  assert.ok(CHANGES_SRC.includes('emptyBodyLiveCache'), 'has emptyBodyLiveCache');
});

test('component: LogsPanel imports and renders InspectorSourceStatus', () => {
  assert.ok(LOGS_SRC.includes('InspectorSourceStatus'), 'imports InspectorSourceStatus');
  assert.ok(LOGS_SRC.includes('<InspectorSourceStatus'), 'renders InspectorSourceStatus');
  assert.ok(LOGS_SRC.includes('emptyBodyUnavailable'), 'has emptyBodyUnavailable');
  assert.ok(LOGS_SRC.includes('emptyBodyMock'), 'has emptyBodyMock');
  assert.ok(LOGS_SRC.includes('emptyBodyLiveCache'), 'has emptyBodyLiveCache');
});

test('component: LogsPanel showDevControls gated by source === mock', () => {
  assert.ok(LOGS_SRC.includes('showDevControls = source === \'mock\''), 'showDevControls gate');
});

test('component: LogsPanel resets developerMode when source !== mock', () => {
  assert.ok(LOGS_SRC.includes('source !== \'mock\''), 'source !== mock check');
  assert.ok(LOGS_SRC.includes('onDeveloperModeChange(false)'), 'dev mode reset call');
});

test('component: LogsPanel Advanced Inspector gated by showDevControls && developerMode', () => {
  assert.ok(LOGS_SRC.includes('showDevControls && developerMode'), 'Advanced Inspector gate');
  assert.ok(LOGS_SRC.includes('<AdvancedInspector />'), 'renders AdvancedInspector');
});

test('component: RightInspector receives complete evidence/changes/logs objects', () => {
  assert.ok(RI_SRC.includes('items={evidence.items}'), 'evidence items prop');
  assert.ok(RI_SRC.includes('source={evidence.source}'), 'evidence source prop');
  assert.ok(RI_SRC.includes('updatedAt={evidence.updatedAt}'), 'evidence updatedAt prop');
  assert.ok(RI_SRC.includes('items={changes.items}'), 'changes items prop');
  assert.ok(RI_SRC.includes('source={changes.source}'), 'changes source prop');
  assert.ok(RI_SRC.includes('updatedAt={changes.updatedAt}'), 'changes updatedAt prop');
  assert.ok(RI_SRC.includes('entries={logs.entries}'), 'logs entries prop');
  assert.ok(RI_SRC.includes('source={logs.source}'), 'logs source prop');
  assert.ok(RI_SRC.includes('updatedAt={logs.updatedAt}'), 'logs updatedAt prop');
});

test('component: RightInspector has no legacy *Mode props', () => {
  assert.ok(!RI_SRC.includes('Inspector' + 'PanelMode'), 'no legacy Inspector/PanelMode import');
  assert.ok(!RI_SRC.includes('evidenceMode'), 'no evidenceMode prop');
  assert.ok(!RI_SRC.includes('changesMode'), 'no changesMode prop');
  assert.ok(!RI_SRC.includes('logsMode'), 'no logsMode prop');
});

test('component: AgentWorkbenchShell passes state.inspector.* to RightInspector', () => {
  assert.ok(SHELL_SRC.includes('state.inspector.evidence'), 'passes inspector.evidence');
  assert.ok(SHELL_SRC.includes('state.inspector.changes'), 'passes inspector.changes');
  assert.ok(SHELL_SRC.includes('state.inspector.logs'), 'passes inspector.logs');
});

// ── Source kind coverage ─────────────────────────────────────────────

test('source: all 4 source kinds used in adapter', () => {
  const ADAPTER_PATH = path.resolve(__dirname, '../../src/renderer/components/workbench/inspectorDataAdapter.ts');
  const ADAPTER_SRC = readFileSync(ADAPTER_PATH, 'utf-8');
  assert.ok(ADAPTER_SRC.includes("'live'"), 'live kind');
  assert.ok(ADAPTER_SRC.includes("'cache'"), 'cache kind');
  assert.ok(ADAPTER_SRC.includes("'mock'"), 'mock kind');
  assert.ok(ADAPTER_SRC.includes("'unavailable'"), 'unavailable kind');
});

test('source: InspectorSourceKind type exported from adapter', () => {
  const ADAPTER_PATH = path.resolve(__dirname, '../../src/renderer/components/workbench/inspectorDataAdapter.ts');
  const ADAPTER_SRC = readFileSync(ADAPTER_PATH, 'utf-8');
  assert.ok(ADAPTER_SRC.includes('export type InspectorSourceKind'), 'InspectorSourceKind is exported');
});

// ── i18n types.ts contract tests ─────────────────────────────────────

const I18N_TYPES_PATH = path.resolve(__dirname, '../../src/renderer/i18n/types.ts');
const I18N_TYPES_SRC = readFileSync(I18N_TYPES_PATH, 'utf-8');
const RI_TYPE_IDX = I18N_TYPES_SRC.indexOf('rightInspector: {');
assert.ok(RI_TYPE_IDX > -1, 'rightInspector type section must exist');
const RI_TYPE_SECTION = extractBoundedSection(I18N_TYPES_SRC, RI_TYPE_IDX);

const TYPES_EVI_IDX = findNestedSection(I18N_TYPES_SRC, RI_TYPE_IDX, 'evidence');
assert.ok(TYPES_EVI_IDX > -1, 'evidence type section must exist');
const TYPES_EVI_SECTION = extractBoundedSection(I18N_TYPES_SRC, TYPES_EVI_IDX);
const TYPES_EVI_END = TYPES_EVI_IDX + 'evidence: {'.length + TYPES_EVI_SECTION.length + 1;

const TYPES_CHG_IDX = findNestedSection(I18N_TYPES_SRC, TYPES_EVI_END, 'changes');
assert.ok(TYPES_CHG_IDX > -1, 'changes type section must exist');
const TYPES_CHG_SECTION = extractBoundedSection(I18N_TYPES_SRC, TYPES_CHG_IDX);

const TYPES_LOG_IDX = findNestedSection(I18N_TYPES_SRC, TYPES_CHG_IDX + TYPES_CHG_SECTION.length, 'logs');
assert.ok(TYPES_LOG_IDX > -1, 'logs type section must exist');
const TYPES_LOG_SECTION = extractBoundedSection(I18N_TYPES_SRC, TYPES_LOG_IDX);

test('i18n/types: rightInspector has source label typed keys', () => {
  const src = RI_TYPE_SECTION;
  assert.ok(src.includes('sourceLabelLive:'), 'sourceLabelLive typed');
  assert.ok(src.includes('sourceLabelCache:'), 'sourceLabelCache typed');
  assert.ok(src.includes('sourceLabelMock:'), 'sourceLabelMock typed');
  assert.ok(src.includes('sourceLabelUnavailable:'), 'sourceLabelUnavailable typed');
});

test('i18n/types: rightInspector has source detail typed keys', () => {
  const src = RI_TYPE_SECTION;
  assert.ok(src.includes('sourceDetailLive:'), 'sourceDetailLive typed');
  assert.ok(src.includes('sourceDetailCache:'), 'sourceDetailCache typed');
  assert.ok(src.includes('sourceDetailMock:'), 'sourceDetailMock typed');
  assert.ok(src.includes('sourceDetailUnavailable:'), 'sourceDetailUnavailable typed');
});

test('i18n/types: rightInspector has timestamp and notice keys', () => {
  const src = RI_TYPE_SECTION;
  assert.ok(src.includes('updatedAtLabel:'), 'updatedAtLabel typed');
  assert.ok(src.includes('noLiveUpdateTime:'), 'noLiveUpdateTime typed');
  assert.ok(src.includes('cacheStaleNotice:'), 'cacheStaleNotice typed');
  assert.ok(src.includes('mockOnlyDevNotice:'), 'mockOnlyDevNotice typed');
});

test('i18n/types: evidence section has 3 empty body typed keys', () => {
  const src = TYPES_EVI_SECTION;
  assert.ok(src.includes('emptyBodyUnavailable:'), 'evidence emptyBodyUnavailable typed');
  assert.ok(src.includes('emptyBodyMock:'), 'evidence emptyBodyMock typed');
  assert.ok(src.includes('emptyBodyLiveCache:'), 'evidence emptyBodyLiveCache typed');
});

test('i18n/types: changes section has 3 empty body typed keys', () => {
  const src = TYPES_CHG_SECTION;
  assert.ok(src.includes('emptyBodyUnavailable:'), 'changes emptyBodyUnavailable typed');
  assert.ok(src.includes('emptyBodyMock:'), 'changes emptyBodyMock typed');
  assert.ok(src.includes('emptyBodyLiveCache:'), 'changes emptyBodyLiveCache typed');
});

test('i18n/types: logs section has 3 empty body typed keys', () => {
  const src = TYPES_LOG_SECTION;
  assert.ok(src.includes('emptyBodyUnavailable:'), 'logs emptyBodyUnavailable typed');
  assert.ok(src.includes('emptyBodyMock:'), 'logs emptyBodyMock typed');
  assert.ok(src.includes('emptyBodyLiveCache:'), 'logs emptyBodyLiveCache typed');
});

// ── Source-to-label/detail precise mapping contract ────────────────────

function extractNamedStringFunctionBody(source: string, functionName: string): string {
  const headerPattern = new RegExp(
    `function\\s+${functionName}\\s*\\([\\s\\S]*?\\)\\s*:\\s*string\\s*\\{`,
  );
  const match = headerPattern.exec(source);
  if (!match) {
    throw new Error(`function ${functionName} must exist`);
  }
  const bodyOpen = match.index + match[0].lastIndexOf('{');
  return extractBoundedSection(source, bodyOpen);
}

function assertCaseToReturnMapping(
  functionBody: string,
  expected: Record<InspectorSourceKind, string>,
): void {
  const actual = Array.from(
    functionBody.matchAll(
      /case\s+['"](live|cache|mock|unavailable)['"]\s*:\s*return\s+t\.([A-Za-z0-9_]+)\s*;/g,
    ),
    ([, source, returnKey]) => [source, returnKey],
  ).sort(([left], [right]) => left.localeCompare(right));
  const expectedEntries = Object.entries(expected)
    .sort(([left], [right]) => left.localeCompare(right));

  assert.equal(actual.length, 4, 'expected exactly four source case-to-return mappings');
  assert.deepEqual(actual, expectedEntries, 'case-to-return mapping mismatch');
}

function swapReturnKeys(functionBody: string, firstKey: string, secondKey: string): string {
  const placeholder = 't.__OMUE_SOURCE_MAPPING_SWAP__';
  return functionBody
    .replaceAll(`t.${firstKey}`, placeholder)
    .replaceAll(`t.${secondKey}`, `t.${firstKey}`)
    .replaceAll(placeholder, `t.${secondKey}`);
}

test('mapping: InspectorSourceStatus sourceLabel selects correct key per source kind', () => {
  const functionBody = extractNamedStringFunctionBody(ISS_SRC, 'sourceLabel');
  const expected: Record<InspectorSourceKind, string> = {
    live: 'sourceLabelLive',
    cache: 'sourceLabelCache',
    mock: 'sourceLabelMock',
    unavailable: 'sourceLabelUnavailable',
  };

  assertCaseToReturnMapping(functionBody, expected);

  const swappedLiveCache = swapReturnKeys(
    functionBody,
    'sourceLabelLive',
    'sourceLabelCache',
  );
  assert.notEqual(swappedLiveCache, functionBody, 'live/cache mutation must change the fixture');
  assert.throws(
    () => assertCaseToReturnMapping(swappedLiveCache, expected),
    /case-to-return mapping mismatch/,
  );
});

test('mapping: InspectorSourceStatus sourceDetail selects correct key per source kind', () => {
  const functionBody = extractNamedStringFunctionBody(ISS_SRC, 'sourceDetail');
  const expected: Record<InspectorSourceKind, string> = {
    live: 'sourceDetailLive',
    cache: 'sourceDetailCache',
    mock: 'sourceDetailMock',
    unavailable: 'sourceDetailUnavailable',
  };

  assertCaseToReturnMapping(functionBody, expected);

  const swappedMockUnavailable = swapReturnKeys(
    functionBody,
    'sourceDetailMock',
    'sourceDetailUnavailable',
  );
  assert.notEqual(
    swappedMockUnavailable,
    functionBody,
    'mock/unavailable mutation must change the fixture',
  );
  assert.throws(
    () => assertCaseToReturnMapping(swappedMockUnavailable, expected),
    /case-to-return mapping mismatch/,
  );
});

// ── Full CSS source block negative contract ───────────────────────────

const FULL_BLOCK_HEX_PATTERN = /#[0-9a-fA-F]{3,8}\b/;
const FULL_BLOCK_COLOR_FN = /\b(rgba?|hsla?)\s*\(/gi;
const FALLBACK_VAR_PATTERN = /\bvar\(\s*--(?:accent-|text-|bg-|border-)[\w-]+\s*,[^)]*\)/;

test('CSS: full source status block has no hex hardcoded colors', () => {
  assert.ok(SOURCE_BLOCK, 'source block exists');
  assert.ok(!FULL_BLOCK_HEX_PATTERN.test(SOURCE_BLOCK!),
    'full source block must contain no hex colors');
});

test('CSS: full source status block has no rgb/rgba/hsl/hsla colors', () => {
  assert.ok(SOURCE_BLOCK, 'source block exists');
  assert.ok(!FULL_BLOCK_COLOR_FN.test(SOURCE_BLOCK!.replace(/color-mix\([^)]*\)/g, '')),
    'full source block must contain no rgb/rgba/hsl/hsla (excluding color-mix args)');
});

test('CSS: full source status block has no --accent-purple', () => {
  assert.ok(SOURCE_BLOCK, 'source block exists');
  assert.ok(!SOURCE_BLOCK!.includes('--accent-purple'),
    'full source block must not contain --accent-purple');
});

test('CSS: full source status block has no CSS variable fallback', () => {
  assert.ok(SOURCE_BLOCK, 'source block exists');
  // Strip color-mix() args before checking — those contain semantic commas not fallback commas
  const stripped = SOURCE_BLOCK!.replace(/color-mix\([^)]*\)/g, '');
  assert.ok(!FALLBACK_VAR_PATTERN.test(stripped),
    'full source block must contain no var(--token, fallback) patterns');
});

test('CSS: full source status block contains all 4 canonical accent tokens', () => {
  assert.ok(SOURCE_BLOCK, 'source block exists');
  assert.ok(SOURCE_BLOCK!.includes('var(--accent-success)'), '--accent-success used');
  assert.ok(SOURCE_BLOCK!.includes('var(--accent-warning)'), '--accent-warning used');
  assert.ok(SOURCE_BLOCK!.includes('var(--accent-agent)'), '--accent-agent used');
  assert.ok(SOURCE_BLOCK!.includes('var(--text-muted)'), '--text-muted used');
});
