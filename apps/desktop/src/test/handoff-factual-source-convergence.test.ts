import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type {
  AgentAssetSessionRecord,
  OmueContextSnapshot,
  TypedFixPayload,
} from '@omue/shared-protocol';
import {
  REPAIR_SESSION_SCHEMA_VERSION,
  SAFE_SCRATCH_BLUEPRINT_MUTATION_SCHEMA_VERSION,
} from '@omue/shared-protocol';
import {
  buildHandoffSourceModel,
  type HandoffSourceInput,
} from '../renderer/components/workbench/handoffSourceAdapter';
import { en } from '../renderer/i18n/dict-en';
import { zhCN as zh } from '../renderer/i18n/dict-zh';

const FIXTURE_TS = '2026-06-23T10:00:00.000Z';
const FIXTURE_TS_NEWER = '2026-06-23T11:00:00.000Z';

function makeSnapshot(
  overrides?: Partial<OmueContextSnapshot>,
): OmueContextSnapshot {
  return {
    snapshotId: 'snapshot-handoff',
    capturedAt: FIXTURE_TS,
    bridgeVersion: '1.0.0',
    project: {
      projectName: 'HandoffTest',
      projectPath: 'C:/HandoffTest',
      uprojectFile: 'C:/HandoffTest/HandoffTest.uproject',
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
    runtimeStatus: {
      isPieRunning: false,
      isSimulating: false,
    },
    ...overrides,
  } as OmueContextSnapshot;
}

function makeTypedPayload(): TypedFixPayload {
  return {
    schemaVersion: SAFE_SCRATCH_BLUEPRINT_MUTATION_SCHEMA_VERSION,
    payload: {
      schemaVersion: SAFE_SCRATCH_BLUEPRINT_MUTATION_SCHEMA_VERSION,
      operationKind: 'set_blueprint_metadata_marker',
      targetAssetPath: '/Game/Scratch/BP_Handoff',
      targetAssetKind: 'blueprint_scratch_fixture',
      allowlistPrefixes: ['/Game/Scratch/'],
      beforeState: { kind: 'missing_or_absent_allowed' },
      afterState: {
        kind: 'metadata_key_value',
        key: 'OMUE_Handoff',
        value: 'verified',
      },
      requireApproval: true,
      requireSnapshot: true,
      display: {
        summary: 'Persisted typed proposal',
      },
    },
  };
}

function makeSession(
  overrides?: Partial<AgentAssetSessionRecord>,
): AgentAssetSessionRecord {
  return {
    schemaVersion: REPAIR_SESSION_SCHEMA_VERSION,
    sessionId: 'session-handoff',
    scope: 'asset',
    userIntent: 'Repair the selected Blueprint',
    targetAssetPath: '/Game/Scratch/BP_Handoff',
    createdAt: FIXTURE_TS,
    updatedAt: FIXTURE_TS_NEWER,
    currentState: 'awaiting_approval',
    retryCount: 0,
    maxRetries: 3,
    proposals: [],
    ...overrides,
  };
}

function baseInput(
  overrides?: Partial<HandoffSourceInput>,
): HandoffSourceInput {
  return {
    isMockClient: false,
    snapshot: null,
    bridgeError: null,
    selectedSession: null,
    pendingApproval: null,
    graphDetail: null,
    queueItemCount: 0,
    btBlackboardSummary: null,
    ...overrides,
  };
}

const MOCK_BT_BB = {
  source: 'Desktop mock fixture',
  assetName: 'BT_CombatGuard',
  assetPath: '/Game/AI/BT_CombatGuard',
  nodeCount: 8,
  bbKeyCount: 4,
  refCount: 3,
  decoratorCount: 2,
  serviceCount: 1,
  taskCount: 5,
  hasSelectedNode: false,
  selectedNodeName: null,
  readinessLabels: ['Mock fixture only'],
  isMockOnly: true,
};

test('bridge-backed Handoff sections use live/cache/mock/unavailable precedence', () => {
  const live = buildHandoffSourceModel(
    baseInput({ snapshot: makeSnapshot() }),
  );
  const cache = buildHandoffSourceModel(
    baseInput({
      snapshot: makeSnapshot(),
      bridgeError: 'Loopback fixture temporarily unavailable',
    }),
  );
  const mock = buildHandoffSourceModel(
    baseInput({ isMockClient: true, snapshot: makeSnapshot() }),
  );
  const unavailable = buildHandoffSourceModel(baseInput());

  assert.equal(live.sections.overview.kind, 'live');
  assert.equal(cache.sections.overview.kind, 'cache');
  assert.equal(mock.sections.overview.kind, 'mock');
  assert.equal(unavailable.sections.overview.kind, 'unavailable');
  assert.equal(live.sections.evidence.kind, 'live');
  assert.equal(cache.sections.recentLogs.kind, 'cache');
  assert.equal(unavailable.sections.graphDetail.kind, 'unavailable');
  assert.equal(unavailable.sections.graphDetail.reason, 'not-loaded');
});

test('real mode keeps all special Handoff sections unavailable without actual facts', () => {
  const model = buildHandoffSourceModel(
    baseInput({ snapshot: makeSnapshot() }),
  );

  assert.equal(model.sections.btBlackboard.kind, 'unavailable');
  assert.equal(model.sections.manifests.kind, 'unavailable');
  assert.equal(model.sections.approvalGates.kind, 'unavailable');
  assert.equal(model.sections.repairSession.kind, 'unavailable');
  assert.equal(model.btBlackboardSummary, null);
  assert.deepEqual(model.manifestFacts, []);
  assert.deepEqual(model.approvalFacts, []);
  assert.equal(model.repairSessionFact, null);
});

test('mock mode preserves BT/BB, manifest, and approval fixtures with explicit mock source', () => {
  const model = buildHandoffSourceModel(
    baseInput({
      isMockClient: true,
      snapshot: makeSnapshot(),
      btBlackboardSummary: MOCK_BT_BB,
    }),
  );

  assert.equal(model.sections.btBlackboard.kind, 'mock');
  assert.equal(model.sections.manifests.kind, 'mock');
  assert.equal(model.sections.approvalGates.kind, 'mock');
  assert.equal(model.sections.repairSession.kind, 'unavailable');
  assert.equal(model.btBlackboardSummary?.assetName, 'BT_CombatGuard');
  assert.equal(model.manifestFacts.length, 3);
  assert.equal(model.approvalFacts.length, 3);
});

test('persisted typed payload produces persisted-real manifest facts without synthetic IDs', () => {
  const session = makeSession({
    proposals: [
      {
        proposalId: 'proposal-real-42',
        proposedAt: FIXTURE_TS,
        kind: 'fix',
        summary: 'Use the persisted proposal',
        typedPayload: makeTypedPayload(),
      },
    ],
  });
  const model = buildHandoffSourceModel(
    baseInput({ snapshot: makeSnapshot(), selectedSession: session }),
  );

  assert.equal(model.sections.manifests.kind, 'persisted-real');
  assert.equal(model.sections.manifests.updatedAt, FIXTURE_TS_NEWER);
  assert.equal(model.manifestFacts.length, 1);
  assert.equal(model.manifestFacts[0]?.proposalId, 'proposal-real-42');
  assert.equal(
    model.manifestFacts[0]?.operationKind,
    'set_blueprint_metadata_marker',
  );
});

test('live pending approval takes precedence over persisted approval', () => {
  const session = makeSession({
    approval: {
      requestedAt: FIXTURE_TS,
      approvalId: 'approval-persisted',
      approvedAt: FIXTURE_TS_NEWER,
      decision: 'approved',
    },
  });
  const model = buildHandoffSourceModel(
    baseInput({
      snapshot: makeSnapshot(),
      selectedSession: session,
      pendingApproval: {
        approvalId: 'approval-live',
        requestedAt: FIXTURE_TS_NEWER,
      },
    }),
  );

  assert.equal(model.sections.approvalGates.kind, 'live');
  assert.equal(model.approvalFacts.length, 1);
  assert.equal(model.approvalFacts[0]?.approvalId, 'approval-live');
  assert.equal(model.approvalFacts[0]?.decision, 'pending');
});

test('persisted approval and selected session remain persisted-real facts', () => {
  const session = makeSession({
    approval: {
      requestedAt: FIXTURE_TS,
      approvalId: 'approval-persisted',
      decision: 'rejected',
    },
    sandbox: {
      copyAssetPath: '/Game/Scratch/BP_Handoff_Copy',
      duplicatedAt: FIXTURE_TS,
    },
    promote: {
      applyResultJson: '{"ok":true}',
      promotedAt: FIXTURE_TS_NEWER,
    },
  });
  const model = buildHandoffSourceModel(
    baseInput({ snapshot: makeSnapshot(), selectedSession: session }),
  );

  assert.equal(model.sections.approvalGates.kind, 'persisted-real');
  assert.equal(model.approvalFacts[0]?.approvalId, 'approval-persisted');
  assert.equal(model.approvalFacts[0]?.decision, 'rejected');
  assert.equal(model.sections.repairSession.kind, 'persisted-real');
  assert.equal(model.repairSessionFact?.sessionId, 'session-handoff');
  assert.equal(model.repairSessionFact?.hasSandbox, true);
  assert.equal(model.repairSessionFact?.hasApproval, true);
  assert.equal(model.repairSessionFact?.hasPromote, true);
});

function readRendererSource(relativePath: string): string {
  return readFileSync(resolve(__dirname, '../../src/renderer', relativePath), 'utf8');
}

test('Handoff production path no longer reads the legacy repair-session store or generator', () => {
  const source = readRendererSource('components/InvestigationHandoffPanel.tsx');

  for (const forbidden of [
    'getSelectedSession',
    'getExecutionResult',
    'getRollbackResult',
    'generatePostFixReport',
    "services/repair-session-store",
    "services/post-fix-report-generator",
  ]) {
    assert.equal(source.includes(forbidden), false, `forbidden legacy read: ${forbidden}`);
  }
});

test('real Handoff production path contains no fixed mock manifest IDs or counts', () => {
  const source = readRendererSource('components/InvestigationHandoffPanel.tsx');

  for (const forbidden of [
    'Ready (local mock fixture)',
    '3 local mock',
    'plan-001',
    'plan-002',
    'plan-003',
  ]) {
    assert.equal(source.includes(forbidden), false, `fixed mock output leaked: ${forbidden}`);
  }
});

test('real Handoff filters mock-only BT/BB questions from the embedded question matrix', () => {
  const source = readRendererSource('components/InvestigationHandoffPanel.tsx');

  assert.match(
    source,
    /generateQuestions\(qmInputs\)\.filter\([\s\S]*question\.category !== 'bt-blackboard'[\s\S]*sourceModel\.sections\.btBlackboard\.kind === 'mock'/,
  );
});

test('Drawer gates BT/BB fixture by mode and passes actual Agent authority into the adapter', () => {
  const shell = readRendererSource('components/workbench/AgentWorkbenchShell.tsx');
  const drawer = readRendererSource('components/workbench/DrawerPanel.tsx');

  assert.match(shell, /<DrawerPanel[\s\S]*isMockClient=\{isMockClient\}/);
  assert.match(drawer, /buildHandoffSourceModel\(\{/);
  assert.match(drawer, /selectedSession:\s*state\.agent\.selectedSession/);
  assert.match(
    drawer,
    /pendingApproval:\s*state\.agent\.selectedApproval\s*\?\?\s*null/,
  );
  assert.match(
    drawer,
    /btBlackboardSummary:\s*isMockClient\s*\?\s*MOCK_BB_DIAGNOSTIC_SUMMARY\s*:\s*null/,
  );
});

test('all ten source-authoritative Handoff sections append a source line immediately after their title', () => {
  const source = readRendererSource('components/InvestigationHandoffPanel.tsx');
  const expectedPairs = [
    ['copy.handoff.mdCurrentAsset', 'sourceModel.sections.overview'],
    ['copy.handoff.mdQueueSummary', 'sourceModel.sections.queue'],
    ['copy.handoff.mdEvidenceSummary', 'sourceModel.sections.evidence'],
    ['copy.handoff.mdGraphDetail', 'sourceModel.sections.graphDetail'],
    ['copy.handoff.mdRecentLogs', 'sourceModel.sections.recentLogs'],
    ['copy.handoff.mdSafetyBoundary', 'sourceModel.sections.safety'],
    ['sourceBoundary.btBlackboardTitle', 'sourceModel.sections.btBlackboard'],
    ['sourceBoundary.manifestsTitle', 'sourceModel.sections.manifests'],
    ['sourceBoundary.approvalGatesTitle', 'sourceModel.sections.approvalGates'],
    ['sourceBoundary.repairSessionTitle', 'sourceModel.sections.repairSession'],
  ] as const;

  for (const [title, sourceFact] of expectedPairs) {
    const pattern = new RegExp(
      `lines\\.push\\(${title.replaceAll('.', '\\.')}\\);\\s*appendSourceLine\\(lines, ${sourceFact.replaceAll('.', '\\.')}, sourceBoundary\\);`,
    );
    assert.match(source, pattern, `${title} must be followed by ${sourceFact}`);
  }
});

test('Handoff source boundary vocabulary keys are present in i18n types interface', () => {
  const types = readRendererSource('i18n/types.ts');
  const requiredKeys = [
    'sourceBoundary',
    'sourceLabel',
    'updatedAtLabel',
    'reasonLabel',
    'kinds',
    'reasons',
    'noBtBlackboardLiveData',
    'noManifestLiveData',
    'noApprovalLiveData',
    'noRepairSessionData',
    'btBlackboardTitle',
    'manifestsTitle',
    'approvalGatesTitle',
    'repairSessionTitle',
    'proposalIdLabel',
    'approvalIdLabel',
    'sessionIdLabel',
  ];
  for (const key of requiredKeys) {
    assert.match(types, new RegExp(`\\b${key}\\b`), `types missing ${key}`);
  }
});

test('English kinds map exact keys to exact values', () => {
  const kinds = en.handoff.sourceBoundary.kinds;
  assert.equal(kinds.live, 'Live');
  assert.equal(kinds['persisted-real'], 'Persisted real');
  assert.equal(kinds.cache, 'Cache');
  assert.equal(kinds.mock, 'Mock');
  assert.equal(kinds.unavailable, 'Unavailable');
  assert.equal(Object.keys(kinds).length, 5, 'exactly 5 kind keys');
});

test('Chinese kinds map exact keys to exact values', () => {
  const kinds = zh.handoff.sourceBoundary.kinds;
  assert.equal(kinds.live, '实时');
  assert.equal(kinds['persisted-real'], '持久化真实数据');
  assert.equal(kinds.cache, '缓存');
  assert.equal(kinds.mock, '模拟数据');
  assert.equal(kinds.unavailable, '不可用');
  assert.equal(Object.keys(kinds).length, 5, 'exactly 5 kind keys');
});

test('English reasons map exact keys to exact values', () => {
  const reasons = en.handoff.sourceBoundary.reasons;
  assert.equal(reasons['bridge-live'], 'Current bridge snapshot');
  assert.equal(reasons['bridge-cache'], 'Cached bridge snapshot retained after a bridge error');
  assert.equal(reasons['renderer-live'], 'Current Renderer state');
  assert.equal(reasons['persisted-agent-session'], 'Current persisted Agent session');
  assert.equal(reasons['live-pending-approval'], 'Current pending approval');
  assert.equal(reasons['mock-fixture'], 'Desktop mock fixture');
  assert.equal(reasons['no-live-data'], 'No live or persisted data is available');
  assert.equal(reasons['not-loaded'], 'Not loaded; no request was made');
  assert.equal(Object.keys(reasons).length, 8, 'exactly 8 reason keys');
});

test('Chinese reasons map exact keys to exact values', () => {
  const reasons = zh.handoff.sourceBoundary.reasons;
  assert.equal(reasons['bridge-live'], '当前 Bridge 快照');
  assert.equal(reasons['bridge-cache'], 'Bridge 出错后保留的缓存快照');
  assert.equal(reasons['renderer-live'], '当前 Renderer 状态');
  assert.equal(reasons['persisted-agent-session'], '当前持久化 Agent 会话');
  assert.equal(reasons['live-pending-approval'], '当前待处理审批');
  assert.equal(reasons['mock-fixture'], 'Desktop 模拟 fixture');
  assert.equal(reasons['no-live-data'], '没有可用的实时或持久化数据');
  assert.equal(reasons['not-loaded'], '尚未加载，且未发起请求');
  assert.equal(Object.keys(reasons).length, 8, 'exactly 8 reason keys');
});

test('kinds and reasons keys match between English and Chinese', () => {
  const enKindKeys = Object.keys(en.handoff.sourceBoundary.kinds).sort();
  const zhKindKeys = Object.keys(zh.handoff.sourceBoundary.kinds).sort();
  assert.deepEqual(zhKindKeys, enKindKeys, 'kind keys must match en/zh');

  const enReasonKeys = Object.keys(en.handoff.sourceBoundary.reasons).sort();
  const zhReasonKeys = Object.keys(zh.handoff.sourceBoundary.reasons).sort();
  assert.deepEqual(zhReasonKeys, enReasonKeys, 'reason keys must match en/zh');
});
