import { test } from 'node:test';
import assert from 'node:assert/strict';
import type {
  AssetContext,
  BlueprintGraphExport,
  BlueprintGraphsData,
  BlueprintSummary,
  BlueprintSummaryData,
  CompileIssue,
  CompileStatus,
  CurrentAssetData,
  LogEntry,
  OmueContextSnapshot,
  ProjectContext,
  RecentLogsData,
} from '@omue/shared-protocol';
import {
  buildContextSnapshot,
  COMPILE_STATUS_UNKNOWN,
  generateSnapshotId,
} from '../shared/context-snapshot-builder';
import {
  aggregateProjectSnapshot,
  collectAssetContext,
  type ContextEndpointFetcher,
  type AssetContextData,
} from '../main/agent-context-snapshot';
import { isMockContextAllowed, mockCollectContext } from '../main/agent-loop-mock-stubs';

// ── Fixtures ───────────────────────────────────────────────────────

const FIXTURE_PROJECT: ProjectContext = {
  projectName: 'SmokeProject',
  projectPath: 'C:/Projects/SmokeProject',
  uprojectFile: 'C:/Projects/SmokeProject/SmokeProject.uproject',
  engineVersion: '5.7.0',
  editorStatus: 'idle',
};

const FIXTURE_ASSET: AssetContext = {
  assetName: 'BP_Player',
  assetPath: '/Game/Blueprints/BP_Player',
  assetClass: 'Blueprint',
  packagePath: '/Game/Blueprints/',
  isDirty: true,
  isSelected: true,
  isOpenInEditor: true,
};

const FIXTURE_OPEN_ASSET: AssetContext = {
  assetName: 'BP_Enemy',
  assetPath: '/Game/Blueprints/BP_Enemy',
  assetClass: 'Blueprint',
  packagePath: '/Game/Blueprints/',
  isDirty: false,
  isSelected: false,
  isOpenInEditor: true,
};

const FIXTURE_CURRENT_ASSET: CurrentAssetData = {
  selectedAsset: FIXTURE_ASSET,
  openAssets: [FIXTURE_ASSET, FIXTURE_OPEN_ASSET],
};

const FIXTURE_COMPILE_STATUS: CompileStatus = {
  isCompiling: false,
  lastCompileResult: 'failed',
  errorCount: 2,
  warningCount: 1,
  lastErrors: [
    { code: 'CS0001', message: 'Syntax error', severity: 'error' },
    { code: 'CS0002', message: 'Type mismatch', severity: 'error' },
  ],
};

const FIXTURE_LOGS: RecentLogsData = {
  entries: [
    {
      timestamp: '2026-06-20T10:00:00.000Z',
      category: 'LogBlueprint',
      verbosity: 'error',
      message: 'Compile failed',
    },
  ],
};

const FIXTURE_BP_SUMMARY: BlueprintSummary = {
  name: 'BP_Player',
  packagePath: '/Game/Blueprints/',
  objectPath: '/Game/Blueprints/BP_Player',
  assetClass: 'Blueprint',
  parentClassName: 'Actor',
  generatedClassName: 'BP_Player_C',
  skeletonClassName: 'BP_Player_Skeleton',
  blueprintType: 'Normal',
  status: 'Dirty',
  isDataOnly: false,
  isDirty: true,
  graphCount: 3,
  graphs: [{ name: 'EventGraph', kind: 'event' }],
  variableCount: 5,
  variables: [{ name: 'Health', category: 'Default' }],
  functionCount: 2,
  functions: [{ name: 'Fire' }],
  macroCount: 0,
  macros: [],
};

const FIXTURE_BP_SUMMARY_DATA: BlueprintSummaryData = {
  selectedBlueprint: FIXTURE_BP_SUMMARY,
};

const FIXTURE_BP_GRAPH_EXPORT: BlueprintGraphExport = {
  exportMeta: {
    formatVersion: '1.0',
    exportedAt: '2026-06-20T10:00:00.000Z',
    source: 'live',
    assetPath: '/Game/Blueprints/BP_Player',
    includedGraphIds: [],
  },
  blueprint: {
    name: 'BP_Player',
    packagePath: '/Game/Blueprints/',
    objectPath: '/Game/Blueprints/BP_Player',
    assetClass: 'Blueprint',
    parentClassName: 'Actor',
    generatedClassName: 'BP_Player_C',
    skeletonClassName: 'BP_Player_Skeleton',
    blueprintType: 'Normal',
    status: 'Dirty',
    isDataOnly: false,
    isDirty: true,
    graphCount: 3,
    variableCount: 5,
    functionCount: 2,
    eventCount: 1,
    macroCount: 0,
    totalNodeCount: 42,
    totalLinkCount: 38,
  },
  graphs: [
    {
      graphId: 'event::EventGraph',
      name: 'EventGraph',
      kind: 'event',
      nodeCount: 20,
      linkCount: 18,
      isEntryGraph: true,
    },
  ],
  variables: [
    {
      name: 'Health',
      type: 'float',
      category: 'Default',
      isEditable: true,
      isExposed: true,
      isArray: false,
      defaultValue: '100.0',
    },
  ],
  functions: [
    {
      name: 'Fire',
      graphId: 'function::Fire',
      isOverride: false,
      isPure: false,
      isConst: false,
      inputParams: [],
      outputParams: [],
      nodeCount: 10,
    },
  ],
  events: [
    {
      name: 'BeginPlay',
      eventType: 'Event',
      graphId: 'event::EventGraph',
      nodeCount: 5,
    },
  ],
  macros: [],
};

const FIXTURE_BP_GRAPHS_DATA: BlueprintGraphsData = {
  selectedBlueprint: FIXTURE_BP_GRAPH_EXPORT,
};

const BRIDGE_VERSION = 'omue-bridge-1.0.0';

// ── Mock fetcher helper ───────────────────────────────────────────

interface MockFetcherConfig {
  project?: ProjectContext | Error;
  currentAsset?: CurrentAssetData | Error;
  logs?: RecentLogsData | Error;
  compileStatus?: CompileStatus | Error;
  blueprintSummary?: BlueprintSummaryData | Error;
  blueprintGraphs?: BlueprintGraphsData | Error;
}

function createMockFetcher(config: MockFetcherConfig): ContextEndpointFetcher & {
  calls: string[];
} {
  const calls: string[] = [];

  function resolveOrThrow<T>(
    key: keyof MockFetcherConfig,
    value: T | Error | undefined,
  ): Promise<T> {
    calls.push(key);
    if (value instanceof Error) {
      return Promise.reject(value);
    }
    if (value === undefined) {
      return Promise.reject(new Error(`${key}: not configured`));
    }
    return Promise.resolve(value);
  }

  return {
    calls,
    getProjectContext: () => resolveOrThrow('project', config.project),
    getCurrentAsset: () => resolveOrThrow('currentAsset', config.currentAsset),
    getRecentLogs: () => resolveOrThrow('logs', config.logs),
    getCompileStatus: () => resolveOrThrow('compileStatus', config.compileStatus),
    getBlueprintSummary: () => resolveOrThrow('blueprintSummary', config.blueprintSummary),
    getBlueprintGraphs: () => resolveOrThrow('blueprintGraphs', config.blueprintGraphs),
  };
}

// ── buildContextSnapshot tests (shared pure builder) ──────────────

test('buildContextSnapshot produces OmueContextSnapshot with all real fields', () => {
  const now = '2026-06-20T10:00:00.000Z';
  const snapshot = buildContextSnapshot({
    project: FIXTURE_PROJECT,
    currentAssetData: FIXTURE_CURRENT_ASSET,
    logsData: FIXTURE_LOGS,
    compileStatusData: FIXTURE_COMPILE_STATUS,
    blueprintSummaryData: FIXTURE_BP_SUMMARY_DATA,
    blueprintGraphsData: FIXTURE_BP_GRAPHS_DATA,
    bridgeVersion: BRIDGE_VERSION,
    now,
  });

  assert.equal(snapshot.project.projectName, 'SmokeProject');
  assert.equal(snapshot.bridgeVersion, BRIDGE_VERSION);
  assert.equal(snapshot.capturedAt, now);
  assert.equal(snapshot.currentAsset?.assetPath, '/Game/Blueprints/BP_Player');
  assert.equal(snapshot.openAssets.length, 2);
  assert.equal(snapshot.recentLogs.length, 1);
  assert.equal(snapshot.compileStatus.errorCount, 2);
  assert.ok(snapshot.blueprintSummary);
  assert.ok(snapshot.blueprintGraphs);
  assert.equal(snapshot.runtimeStatus.isPieRunning, false);
});

test('buildContextSnapshot degrades enhancement fields to safe defaults when missing', () => {
  const snapshot = buildContextSnapshot({
    project: FIXTURE_PROJECT,
    bridgeVersion: BRIDGE_VERSION,
    now: '2026-06-20T10:00:00.000Z',
  });

  assert.equal(snapshot.currentAsset, undefined);
  assert.equal(snapshot.openAssets.length, 0);
  assert.equal(snapshot.recentLogs.length, 0);
  assert.deepEqual(snapshot.compileStatus, COMPILE_STATUS_UNKNOWN);
  assert.equal(snapshot.blueprintSummary, undefined);
  assert.equal(snapshot.blueprintGraphs, undefined);
});

test('buildContextSnapshot does not call /context/snapshot or inject mock provenance', () => {
  const snapshot = buildContextSnapshot({
    project: FIXTURE_PROJECT,
    bridgeVersion: BRIDGE_VERSION,
    now: '2026-06-20T10:00:00.000Z',
  });
  const json = JSON.stringify(snapshot);
  assert.doesNotMatch(json, /\/context\/snapshot/);
  assert.doesNotMatch(json, /mock_local_fixture|mock-agent-loop/);
});

test('generateSnapshotId returns a UUID-like string or fallback', () => {
  const id = generateSnapshotId('test');
  assert.ok(id.length > 0);
  assert.ok(typeof id === 'string');
});

// ── aggregateProjectSnapshot tests (Main aggregator) ──────────────

test('aggregateProjectSnapshot does not request /context/snapshot', async () => {
  const fetcher = createMockFetcher({
    project: FIXTURE_PROJECT,
    currentAsset: FIXTURE_CURRENT_ASSET,
    logs: FIXTURE_LOGS,
    compileStatus: FIXTURE_COMPILE_STATUS,
    blueprintSummary: FIXTURE_BP_SUMMARY_DATA,
    blueprintGraphs: FIXTURE_BP_GRAPHS_DATA,
  });

  const result = await aggregateProjectSnapshot(fetcher, BRIDGE_VERSION);
  assert.equal(result.ok, true);

  // The fetcher interface has no /context/snapshot method; verify only
  // individual endpoints were called.
  assert.ok(fetcher.calls.includes('project'));
  assert.doesNotMatch(fetcher.calls.join(','), /contextSnapshot|context_snapshot/);
});

test('aggregateProjectSnapshot required project endpoint failure yields factual error', async () => {
  const fetcher = createMockFetcher({
    project: new Error('Bridge returned HTTP 404 for /context/project'),
    currentAsset: FIXTURE_CURRENT_ASSET,
    logs: FIXTURE_LOGS,
    compileStatus: FIXTURE_COMPILE_STATUS,
  });

  const result = await aggregateProjectSnapshot(fetcher, BRIDGE_VERSION);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.errorCode, 'context_project_unavailable');
    assert.ok(result.message.length > 0);
    assert.ok(result.provenance);
  }
});

test('aggregateProjectSnapshot enhancement endpoint failure degrades gracefully', async () => {
  const fetcher = createMockFetcher({
    project: FIXTURE_PROJECT,
    currentAsset: new Error('connection refused'),
    logs: new Error('timeout'),
    compileStatus: new Error('503'),
    blueprintSummary: new Error('not implemented'),
    blueprintGraphs: new Error('not implemented'),
  });

  const result = await aggregateProjectSnapshot(fetcher, BRIDGE_VERSION);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.snapshot.project.projectName, 'SmokeProject');
    assert.equal(result.snapshot.currentAsset, undefined);
    assert.equal(result.snapshot.openAssets.length, 0);
    assert.equal(result.snapshot.recentLogs.length, 0);
    assert.deepEqual(result.snapshot.compileStatus, COMPILE_STATUS_UNKNOWN);
    assert.equal(result.snapshot.blueprintSummary, undefined);
    assert.equal(result.snapshot.blueprintGraphs, undefined);
  }
});

test('aggregateProjectSnapshot produces real provenance with bridgeVersion and capturedAt', async () => {
  const fetcher = createMockFetcher({
    project: FIXTURE_PROJECT,
  });

  const result = await aggregateProjectSnapshot(fetcher, BRIDGE_VERSION);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.provenance.bridgeVersion, BRIDGE_VERSION);
    assert.ok(result.provenance.capturedAt.length > 0);
    assert.ok(result.provenance.endpointsCalled.includes('context/project'));
    assert.equal(result.snapshot.bridgeVersion, BRIDGE_VERSION);
    // No mock provenance in the snapshot
    const json = JSON.stringify(result.snapshot);
    assert.doesNotMatch(json, /mock_local_fixture|mock-agent-loop/);
  }
});

// ── collectAssetContext tests (Main asset collector) ──────────────

test('collectAssetContext target matches selected asset → real context with real_readonly_bridge source', async () => {
  const fetcher = createMockFetcher({
    project: FIXTURE_PROJECT,
    currentAsset: FIXTURE_CURRENT_ASSET,
    compileStatus: FIXTURE_COMPILE_STATUS,
    blueprintSummary: FIXTURE_BP_SUMMARY_DATA,
    blueprintGraphs: FIXTURE_BP_GRAPHS_DATA,
    logs: FIXTURE_LOGS,
  });

  const result = await collectAssetContext(
    fetcher,
    '/Game/Blueprints/BP_Player',
    BRIDGE_VERSION,
  );
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.context.blueprintSummary.source, 'real_readonly_bridge');
    assert.equal(result.context.blueprintSummary.assetPath, '/Game/Blueprints/BP_Player');
    assert.ok(result.context.compileIssues.length > 0);
    assert.ok(result.context.graphDetailJson);
    assert.ok(result.context.messageLogJson);
    // No mock provenance
    const json = JSON.stringify(result.context);
    assert.doesNotMatch(json, /mock_local_fixture|mock-agent-loop-phase-b/);
  }
});

test('collectAssetContext target matches open asset (not selected) → real context', async () => {
  const fetcher = createMockFetcher({
    project: FIXTURE_PROJECT,
    currentAsset: FIXTURE_CURRENT_ASSET,
    compileStatus: FIXTURE_COMPILE_STATUS,
    logs: FIXTURE_LOGS,
  });

  const result = await collectAssetContext(
    fetcher,
    '/Game/Blueprints/BP_Enemy',
    BRIDGE_VERSION,
  );
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.context.blueprintSummary.source, 'real_readonly_bridge');
    assert.equal(result.context.blueprintSummary.assetPath, '/Game/Blueprints/BP_Enemy');
  }
});

test('collectAssetContext target not in selected/open assets → recoverable error, no mock fallback', async () => {
  const fetcher = createMockFetcher({
    project: FIXTURE_PROJECT,
    currentAsset: FIXTURE_CURRENT_ASSET,
    compileStatus: FIXTURE_COMPILE_STATUS,
    logs: FIXTURE_LOGS,
  });

  const result = await collectAssetContext(
    fetcher,
    '/Game/Blueprints/BP_Missing',
    BRIDGE_VERSION,
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.errorCode, 'target_not_open');
    assert.equal(result.recoverable, true);
    assert.ok(result.message.length > 0);
  }
});

test('collectAssetContext no current asset data → recoverable error', async () => {
  const fetcher = createMockFetcher({
    project: FIXTURE_PROJECT,
    currentAsset: new Error('unavailable'),
    compileStatus: FIXTURE_COMPILE_STATUS,
  });

  const result = await collectAssetContext(
    fetcher,
    '/Game/Blueprints/BP_Player',
    BRIDGE_VERSION,
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.errorCode, 'target_not_open');
    assert.equal(result.recoverable, true);
  }
});

test('collectAssetContext never produces mock_local_fixture or mock-agent-loop provenance', async () => {
  const fetcher = createMockFetcher({
    project: FIXTURE_PROJECT,
    currentAsset: FIXTURE_CURRENT_ASSET,
    compileStatus: FIXTURE_COMPILE_STATUS,
    logs: FIXTURE_LOGS,
  });

  const result = await collectAssetContext(
    fetcher,
    '/Game/Blueprints/BP_Player',
    BRIDGE_VERSION,
  );
  if (result.ok) {
    const json = JSON.stringify(result.context);
    assert.doesNotMatch(json, /mock_local_fixture/);
    assert.doesNotMatch(json, /mock-agent-loop/);
  } else {
    assert.fail('collectAssetContext should succeed with matching target');
  }
});

// ── mock collector test-only gate tests ───────────────────────────

test('isMockContextAllowed returns false in production (no env var)', () => {
  const saved = process.env.OMUE_AGENT_MOCK_CONTEXT;
  delete process.env.OMUE_AGENT_MOCK_CONTEXT;
  assert.equal(isMockContextAllowed(), false);
  if (saved !== undefined) {
    process.env.OMUE_AGENT_MOCK_CONTEXT = saved;
  }
});

test('isMockContextAllowed returns true when OMUE_AGENT_MOCK_CONTEXT=1', () => {
  const saved = process.env.OMUE_AGENT_MOCK_CONTEXT;
  process.env.OMUE_AGENT_MOCK_CONTEXT = '1';
  assert.equal(isMockContextAllowed(), true);
  if (saved !== undefined) {
    process.env.OMUE_AGENT_MOCK_CONTEXT = saved;
  } else {
    delete process.env.OMUE_AGENT_MOCK_CONTEXT;
  }
});

test('mockCollectContext rejects in production mode (no mock fallback)', async () => {
  const saved = process.env.OMUE_AGENT_MOCK_CONTEXT;
  delete process.env.OMUE_AGENT_MOCK_CONTEXT;
  await assert.rejects(
    () => mockCollectContext('/Game/Test/BP_A'),
    /not allowed outside explicit test mode/,
  );
  if (saved !== undefined) {
    process.env.OMUE_AGENT_MOCK_CONTEXT = saved;
  }
});

test('mockCollectContext succeeds in explicit test mode', async () => {
  const saved = process.env.OMUE_AGENT_MOCK_CONTEXT;
  process.env.OMUE_AGENT_MOCK_CONTEXT = '1';
  const context = await mockCollectContext('/Game/Test/BP_A');
  assert.equal(context.blueprintSummary.source, 'mock_local_fixture');
  assert.match(context.graphDetailJson, /mock-agent-loop-phase-b/);
  if (saved !== undefined) {
    process.env.OMUE_AGENT_MOCK_CONTEXT = saved;
  } else {
    delete process.env.OMUE_AGENT_MOCK_CONTEXT;
  }
});
