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
  buildDrawerFactualSourceModel,
  type DrawerFactualSourceInput,
} from '../renderer/components/workbench/drawerFactualSourceAdapter';
import { en } from '../renderer/i18n/dict-en';
import { zhCN as zh } from '../renderer/i18n/dict-zh';

const FIXTURE_TS = '2026-06-23T10:00:00.000Z';
const FIXTURE_TS_NEWER = '2026-06-23T11:00:00.000Z';

function makeSnapshot(
  overrides?: Partial<OmueContextSnapshot>,
): OmueContextSnapshot {
  return {
    snapshotId: 'snapshot-drawer',
    capturedAt: FIXTURE_TS,
    bridgeVersion: '1.0.0',
    project: {
      projectName: 'DrawerTest',
      projectPath: 'C:/DrawerTest',
      uprojectFile: 'C:/DrawerTest/DrawerTest.uproject',
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
      targetAssetPath: '/Game/Scratch/BP_Drawer',
      targetAssetKind: 'blueprint_scratch_fixture',
      allowlistPrefixes: ['/Game/Scratch/'],
      beforeState: { kind: 'missing_or_absent_allowed' },
      afterState: {
        kind: 'metadata_key_value',
        key: 'OMUE_Drawer',
        value: 'verified',
      },
      requireApproval: true,
      requireSnapshot: true,
      display: {
        summary: 'Persisted typed drawer proposal',
      },
    },
  };
}

function makeSession(
  overrides?: Partial<AgentAssetSessionRecord>,
): AgentAssetSessionRecord {
  return {
    schemaVersion: REPAIR_SESSION_SCHEMA_VERSION,
    sessionId: 'session-drawer-real',
    scope: 'asset',
    userIntent: 'Repair the selected Blueprint',
    targetAssetPath: '/Game/Scratch/BP_Drawer',
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
  overrides?: Partial<DrawerFactualSourceInput>,
): DrawerFactualSourceInput {
  return {
    isMockClient: false,
    snapshot: null,
    bridgeError: null,
    selectedSession: null,
    ...overrides,
  };
}

function readRendererSource(relativePath: string): string {
  return readFileSync(resolve(__dirname, '../../src/renderer', relativePath), 'utf8');
}

test('all four Drawer pages follow the complete source precedence matrix', () => {
  const live = buildDrawerFactualSourceModel(
    baseInput({ snapshot: makeSnapshot() }),
  );
  const cache = buildDrawerFactualSourceModel(
    baseInput({
      snapshot: makeSnapshot(),
      bridgeError: 'Loopback fixture temporarily unavailable',
    }),
  );
  const mock = buildDrawerFactualSourceModel(
    baseInput({ isMockClient: true, snapshot: makeSnapshot() }),
  );
  const unavailable = buildDrawerFactualSourceModel(baseInput());
  const terminal = buildDrawerFactualSourceModel(
    baseInput({
      selectedSession: makeSession({
        currentState: 'closed',
        closedAt: FIXTURE_TS_NEWER,
        closeReason: 'cancelled',
      }),
    }),
  );
  const withProposal = buildDrawerFactualSourceModel(
    baseInput({
      selectedSession: makeSession({
        proposals: [
          {
            proposalId: 'proposal-real-42',
            proposedAt: FIXTURE_TS,
            kind: 'fix',
            typedPayload: makeTypedPayload(),
          },
        ],
      }),
    }),
  );

  assert.equal(live.pages.questions.kind, 'live');
  assert.equal(cache.pages.questions.kind, 'cache');
  assert.equal(mock.pages.questions.kind, 'mock');
  assert.equal(unavailable.pages.questions.kind, 'unavailable');

  assert.equal(mock.pages.closure.kind, 'mock');
  assert.equal(terminal.pages.closure.kind, 'persisted-real');
  assert.equal(live.pages.closure.kind, 'unavailable');

  assert.equal(mock.pages.changePlan.kind, 'mock');
  assert.equal(withProposal.pages.changePlan.kind, 'persisted-real');
  assert.equal(live.pages.changePlan.kind, 'unavailable');

  assert.equal(mock.pages.blueprintChangeWorkspace.kind, 'mock');
  assert.equal(live.pages.blueprintChangeWorkspace.kind, 'unavailable');
});

test('terminal persisted closure uses actual session facts without synthetic claims', () => {
  const model = buildDrawerFactualSourceModel(
    baseInput({
      selectedSession: makeSession({
        currentState: 'escalated_done',
        closedAt: FIXTURE_TS_NEWER,
        closeReason: 'escalated',
        proposals: [
          {
            proposalId: 'proposal-real-closure',
            proposedAt: FIXTURE_TS,
            kind: 'escalation',
            typedPayload: null,
          },
        ],
        sandbox: {
          copyAssetPath: '/Game/Scratch/BP_Drawer_Copy',
          duplicatedAt: FIXTURE_TS,
        },
        approval: {
          requestedAt: FIXTURE_TS,
          approvalId: 'approval-real-closure',
        },
        promote: {
          applyResultJson: '{"ok":true}',
          promotedAt: FIXTURE_TS_NEWER,
        },
      }),
    }),
  );

  assert.deepEqual(model.persistedClosure, {
    sessionId: 'session-drawer-real',
    scope: 'asset',
    currentState: 'escalated_done',
    updatedAt: FIXTURE_TS_NEWER,
    closedAt: FIXTURE_TS_NEWER,
    closeReason: 'escalated',
    targetAssetPath: '/Game/Scratch/BP_Drawer',
    proposalCount: 1,
    hasSandbox: true,
    hasApproval: true,
    hasPromote: true,
  });
});

test('persisted plans preserve actual proposal IDs and optional facts', () => {
  const model = buildDrawerFactualSourceModel(
    baseInput({
      selectedSession: makeSession({
        proposals: [
          {
            proposalId: 'proposal-real-99',
            proposedAt: FIXTURE_TS,
            kind: 'fix',
            summary: 'Use the actual persisted proposal',
            diagnosisSummary: 'Persisted diagnosis',
            confidence: 'high',
            risk: 'medium',
            typedPayload: makeTypedPayload(),
            escalationReason: 'Human review remains required',
            suggestedHumanAction: 'Review the persisted operation',
          },
        ],
      }),
    }),
  );

  assert.equal(model.persistedPlans.length, 1);
  assert.deepEqual(model.persistedPlans[0], {
    proposalId: 'proposal-real-99',
    proposedAt: FIXTURE_TS,
    kind: 'fix',
    summary: 'Use the actual persisted proposal',
    diagnosisSummary: 'Persisted diagnosis',
    confidence: 'high',
    risk: 'medium',
    operationKind: 'set_blueprint_metadata_marker',
    escalationReason: 'Human review remains required',
    suggestedHumanAction: 'Review the persisted operation',
  });
  assert.equal(
    model.persistedPlans.some(plan => /^plan-00[123]$/.test(plan.proposalId)),
    false,
  );
});

test('real Questions filter every BT/BB fixture while mock Questions retain it', () => {
  const source = readRendererSource('components/InvestigationQuestionMatrixPanel.tsx');
  assert.match(source, /includeMockBtBlackboardQuestions:\s*boolean/);
  assert.match(
    source,
    /includeMockBtBlackboardQuestions[\s\S]*question\.category !== 'bt-blackboard'/,
  );
  const drawer = readRendererSource('components/workbench/DrawerPanel.tsx');
  assert.match(
    drawer,
    /includeMockBtBlackboardQuestions=\{[\s\S]*authority\.kind === 'mock'/,
  );
});

test('real Drawer branches do not mount mock-only components', () => {
  const source = readRendererSource('components/workbench/DrawerPanel.tsx');

  assert.match(
    source,
    /closureAuthority\.kind === 'mock'[\s\S]*<InfrastructureClosurePanel/,
  );
  assert.match(
    source,
    /changePlanAuthority\.kind === 'mock'[\s\S]*<ChangePlanPackageWorkspace/,
  );
  assert.match(
    source,
    /blueprintWorkspaceAuthority\.kind === 'mock'[\s\S]*<BlueprintChangeWorkspacePanel/,
  );
  assert.match(source, /persistedClosure/);
  assert.match(source, /persistedPlans/);
});

test('Shell builds one Drawer source model for commands and Drawer content', () => {
  const shell = readRendererSource('components/workbench/AgentWorkbenchShell.tsx');
  const drawer = readRendererSource('components/workbench/DrawerPanel.tsx');

  assert.equal(
    (shell.match(/buildDrawerFactualSourceModel\(\{/g) ?? []).length,
    1,
  );
  assert.match(
    shell,
    /const drawerSourceModel = useMemo\([\s\S]*buildDrawerFactualSourceModel/,
  );
  assert.match(shell, /<DrawerPanel[\s\S]*sourceModel=\{drawerSourceModel\}/);
  assert.doesNotMatch(drawer, /buildDrawerFactualSourceModel\(/);
});

test('four factual Drawer tabs render source badges and semantic authority', () => {
  const drawer = readRendererSource('components/workbench/DrawerPanel.tsx');

  assert.match(drawer, /data-drawer-source-kind=/);
  assert.match(drawer, /tabSourceAria/);
  assert.match(drawer, /DrawerSourceStatus/);
  for (const id of [
    'questions',
    'closure',
    'change-plan',
    'bp-change-workspace',
  ]) {
    assert.match(drawer, new RegExp(`['"]${id}['"]`));
  }
});

test('factual page constrains wide mock workspaces so source status stays visible', () => {
  const css = readRendererSource('components/workbench/workbench.css');
  const block = css.match(
    /\.wb-drawer-factual-page\s*\{([^}]*)\}/,
  )?.[1] ?? '';
  assert.match(block, /min-width:\s*0;/);
  assert.match(block, /width:\s*100%;/);
  assert.match(block, /overflow-x:\s*hidden;/);
  assert.match(
    css,
    /\.wb-drawer-factual-page\s*>\s*\.cpp-workspace,[\s\S]*?\.wb-drawer-factual-page\s*>\s*\.bcw-panel,[\s\S]*?\.wb-drawer-factual-page\s*>\s*\.icp-panel\s*\{[^}]*overflow-x:\s*auto;/,
  );
});

test('unavailable factual Drawer commands use typed bilingual disabled reasons', () => {
  const shell = readRendererSource('components/workbench/AgentWorkbenchShell.tsx');

  assert.match(shell, /commandUnavailableQuestions/);
  assert.match(shell, /commandUnavailableClosure/);
  assert.match(shell, /commandUnavailableChangePlan/);
  assert.match(shell, /commandUnavailableBlueprintWorkspace/);
  assert.match(shell, /drawerSourceModel\.pages/);
});

test('English Drawer source boundary maps exact kinds and reasons', () => {
  const source = en.ueAgentUi.drawer.sourceBoundary;
  assert.deepEqual(source.kinds, {
    live: 'Live',
    'persisted-real': 'Persisted real',
    cache: 'Cache',
    mock: 'Mock',
    unavailable: 'Unavailable',
  });
  assert.deepEqual(source.reasons, {
    'bridge-live': 'Current bridge snapshot',
    'bridge-cache': 'Cached bridge snapshot retained after a bridge error',
    'persisted-agent-session': 'Current persisted Agent session',
    'mock-fixture': 'Desktop mock fixture',
    'no-live-question-data': 'No live question data is available',
    'no-persisted-closure': 'No terminal persisted Agent session is selected',
    'no-persisted-change-plan': 'No persisted proposals are available',
    'no-real-blueprint-workspace': 'No real Blueprint change workspace exists',
  });
  assert.equal(source.questionsNoLiveData, 'No live questions are available.');
  assert.equal(source.commandUnavailableClosure, 'No terminal persisted closure is available.');
});

test('Chinese Drawer source boundary maps exact kinds and reasons', () => {
  const source = zh.ueAgentUi.drawer.sourceBoundary;
  assert.deepEqual(source.kinds, {
    live: '实时',
    'persisted-real': '持久化真实数据',
    cache: '缓存',
    mock: '模拟数据',
    unavailable: '不可用',
  });
  assert.deepEqual(source.reasons, {
    'bridge-live': '当前 Bridge 快照',
    'bridge-cache': 'Bridge 出错后保留的缓存快照',
    'persisted-agent-session': '当前持久化 Agent 会话',
    'mock-fixture': 'Desktop 模拟 fixture',
    'no-live-question-data': '没有可用的实时问题数据',
    'no-persisted-closure': '未选择已终结的持久化 Agent 会话',
    'no-persisted-change-plan': '没有可用的持久化提案',
    'no-real-blueprint-workspace': '当前不存在真实 Blueprint 变更工作区',
  });
  assert.equal(source.questionsNoLiveData, '当前没有可用的实时问题。');
  assert.equal(source.commandUnavailableClosure, '当前没有可用的终结会话收尾记录。');
});

test('real production branching contains no fixed mock plan or gate identifiers', () => {
  const drawer = readRendererSource('components/workbench/DrawerPanel.tsx');
  const adapter = readRendererSource('components/workbench/drawerFactualSourceAdapter.ts');
  const combined = `${drawer}\n${adapter}`;

  for (const forbidden of [
    'plan-001',
    'plan-002',
    'plan-003',
    '3 local mock',
    'mock-plan-gate',
  ]) {
    assert.equal(combined.includes(forbidden), false, `mock leak: ${forbidden}`);
  }
});
