import { test } from 'node:test';
import assert from 'node:assert/strict';
import type {
  AgentAssetSessionRecord,
  AgentProjectSessionRecord,
  AssetContext,
  RepairSessionRecord,
} from '@omue/shared-protocol';
import { REPAIR_SESSION_SCHEMA_VERSION } from '@omue/shared-protocol';
import {
  computeComposerState,
  isTargetAuthoritative,
  isStaleTarget,
  validateSendRequest,
  type AuthoritativeTargetInputs,
  type ComposerMode,
  type ComposerState,
} from '../renderer/components/workbench/targetScopeState';

// ── Fixtures ────────────────────────────────────────────────────────

const FIXTURE_TS = '2026-06-21T00:00:00.000Z';

function makeAsset(path: string, name?: string, overrides?: Partial<AssetContext>): AssetContext {
  return {
    assetName: name ?? path.split('/').pop() ?? 'Asset',
    assetPath: path,
    assetClass: 'Blueprint',
    packagePath: path.slice(0, path.lastIndexOf('/') + 1),
    isDirty: false,
    isSelected: false,
    isOpenInEditor: true,
    ...overrides,
  };
}

function makeAssetSession(
  targetAssetPath: string,
  overrides?: Partial<AgentAssetSessionRecord>,
): AgentAssetSessionRecord {
  return {
    schemaVersion: REPAIR_SESSION_SCHEMA_VERSION,
    sessionId: 'asset-session-1',
    scope: 'asset',
    userIntent: 'Repair the blueprint',
    targetAssetPath,
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
    sessionId: 'project-session-1',
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

function baseInputs(overrides?: Partial<AuthoritativeTargetInputs>): AuthoritativeTargetInputs {
  return {
    currentAsset: undefined,
    openAssets: [],
    selectedSession: null,
    userModeChoice: null,
    userTargetChoice: undefined,
    hasProjectContext: true,
    ...overrides,
  };
}

// ── computeComposerState ────────────────────────────────────────────

test('computeComposerState: current asset → asset composer with current-asset source', () => {
  const current = makeAsset('/Game/BP_Player', 'BP_Player', { isSelected: true });
  const state = computeComposerState(baseInputs({
    currentAsset: current,
    openAssets: [current],
  }));
  assert.equal(state.mode, 'asset');
  assert.equal(state.targetAssetPath, '/Game/BP_Player');
  assert.equal(state.source, 'current-asset');
});

test('computeComposerState: open asset selection → target updates to open-asset source', () => {
  const current = makeAsset('/Game/BP_Player', 'BP_Player', { isSelected: true });
  const openOther = makeAsset('/Game/BP_Enemy', 'BP_Enemy', { isOpenInEditor: true });
  const state = computeComposerState(baseInputs({
    currentAsset: current,
    openAssets: [current, openOther],
    userTargetChoice: '/Game/BP_Enemy',
    userModeChoice: 'asset',
  }));
  assert.equal(state.mode, 'asset');
  assert.equal(state.targetAssetPath, '/Game/BP_Enemy');
  assert.equal(state.source, 'open-asset');
});

test('computeComposerState: selected asset session → scope/target sync to selected-session source', () => {
  const session = makeAssetSession('/Game/BP_Player');
  const state = computeComposerState(baseInputs({
    selectedSession: session,
  }));
  assert.equal(state.mode, 'asset');
  assert.equal(state.targetAssetPath, '/Game/BP_Player');
  assert.equal(state.source, 'selected-session');
});

test('computeComposerState: selected project session → project scope', () => {
  const session = makeProjectSession();
  const state = computeComposerState(baseInputs({
    selectedSession: session,
  }));
  assert.equal(state.mode, 'project');
  assert.equal(state.targetAssetPath, undefined);
  assert.equal(state.source, 'selected-session');
});

test('computeComposerState: no assets and no session → project scope with user-cleared source', () => {
  const state = computeComposerState(baseInputs({
    currentAsset: undefined,
    openAssets: [],
    selectedSession: null,
  }));
  assert.equal(state.mode, 'project');
  assert.equal(state.targetAssetPath, undefined);
  assert.equal(state.source, 'user-cleared');
});

test('computeComposerState: no assets and no project context → null mode (empty guidance)', () => {
  const state = computeComposerState(baseInputs({
    currentAsset: undefined,
    openAssets: [],
    selectedSession: null,
    hasProjectContext: false,
  }));
  assert.equal(state.mode, null);
  assert.equal(state.targetAssetPath, undefined);
  assert.equal(state.source, 'user-cleared');
});

test('computeComposerState: user explicit project toggle overrides asset session scope', () => {
  const session = makeAssetSession('/Game/BP_Player');
  const state = computeComposerState(baseInputs({
    selectedSession: session,
    userModeChoice: 'project',
  }));
  assert.equal(state.mode, 'project');
  assert.equal(state.targetAssetPath, undefined);
  assert.equal(state.source, 'user-project');
});

test('computeComposerState: user explicit asset toggle after project session stays asset', () => {
  const session = makeProjectSession();
  const current = makeAsset('/Game/BP_Player', 'BP_Player', { isSelected: true });
  const state = computeComposerState(baseInputs({
    selectedSession: session,
    userModeChoice: 'asset',
    currentAsset: current,
    openAssets: [current],
  }));
  assert.equal(state.mode, 'asset');
  assert.equal(state.targetAssetPath, '/Game/BP_Player');
  assert.equal(state.source, 'current-asset');
});

test('computeComposerState: new session (no selected session) defaults to current asset', () => {
  const current = makeAsset('/Game/BP_Player', 'BP_Player', { isSelected: true });
  const state = computeComposerState(baseInputs({
    currentAsset: current,
    openAssets: [current],
    selectedSession: null,
    userModeChoice: null,
    userTargetChoice: undefined,
  }));
  assert.equal(state.mode, 'asset');
  assert.equal(state.targetAssetPath, '/Game/BP_Player');
  assert.equal(state.source, 'current-asset');
});

test('computeComposerState: new session with no current asset but has project context → project', () => {
  const state = computeComposerState(baseInputs({
    currentAsset: undefined,
    openAssets: [],
    selectedSession: null,
    hasProjectContext: true,
  }));
  assert.equal(state.mode, 'project');
  assert.equal(state.source, 'user-cleared');
});

test('computeComposerState: stale user target choice falls through to session', () => {
  const session = makeAssetSession('/Game/BP_Player');
  const state = computeComposerState(baseInputs({
    selectedSession: session,
    userTargetChoice: '/Game/ClosedAsset',
    userModeChoice: null,
    openAssets: [],
    currentAsset: undefined,
  }));
  assert.equal(state.mode, 'asset');
  assert.equal(state.targetAssetPath, '/Game/BP_Player');
  assert.equal(state.source, 'selected-session');
});

test('computeComposerState: asset session target does not silently drift to project', () => {
  const session = makeAssetSession('/Game/BP_Player');
  const inputs = baseInputs({ selectedSession: session });
  const first = computeComposerState(inputs);
  const second = computeComposerState(inputs);
  assert.equal(first.mode, 'asset');
  assert.equal(second.mode, 'asset');
  assert.equal(first.targetAssetPath, second.targetAssetPath);
});

// ── isTargetAuthoritative ───────────────────────────────────────────

test('isTargetAuthoritative: true when target matches current asset', () => {
  const current = makeAsset('/Game/BP_Player', 'BP_Player');
  assert.ok(isTargetAuthoritative('/Game/BP_Player', baseInputs({
    currentAsset: current,
    openAssets: [],
    selectedSession: null,
  })));
});

test('isTargetAuthoritative: true when target matches an open asset', () => {
  const open = makeAsset('/Game/BP_Enemy', 'BP_Enemy');
  assert.ok(isTargetAuthoritative('/Game/BP_Enemy', baseInputs({
    currentAsset: undefined,
    openAssets: [open],
    selectedSession: null,
  })));
});

test('isTargetAuthoritative: true when target matches selected asset session target', () => {
  const session = makeAssetSession('/Game/BP_Player');
  assert.ok(isTargetAuthoritative('/Game/BP_Player', baseInputs({
    currentAsset: undefined,
    openAssets: [],
    selectedSession: session,
  })));
});

test('isTargetAuthoritative: false when target not in any authoritative source', () => {
  assert.ok(!isTargetAuthoritative('/Game/FakeAsset', baseInputs({
    currentAsset: makeAsset('/Game/BP_Player', 'BP_Player'),
    openAssets: [makeAsset('/Game/BP_Enemy', 'BP_Enemy')],
    selectedSession: null,
  })));
});

test('isTargetAuthoritative: false when all sources are empty', () => {
  assert.ok(!isTargetAuthoritative('/Game/AnyAsset', baseInputs({
    currentAsset: undefined,
    openAssets: [],
    selectedSession: null,
  })));
});

// ── isStaleTarget ───────────────────────────────────────────────────

test('isStaleTarget: false for project mode (no target needed)', () => {
  const projectComposer: ComposerState = { mode: 'project', source: 'user-project' };
  assert.ok(!isStaleTarget(projectComposer, baseInputs()));
});

test('isStaleTarget: false for null mode', () => {
  const nullComposer: ComposerState = { mode: null, source: 'user-cleared' };
  assert.ok(!isStaleTarget(nullComposer, baseInputs()));
});

test('isStaleTarget: false when asset target is still in open assets', () => {
  const open = makeAsset('/Game/BP_Player', 'BP_Player');
  const composer: ComposerState = {
    mode: 'asset',
    targetAssetPath: '/Game/BP_Player',
    source: 'open-asset',
  };
  assert.ok(!isStaleTarget(composer, baseInputs({
    currentAsset: undefined,
    openAssets: [open],
    selectedSession: null,
  })));
});

test('isStaleTarget: true when asset target no longer in any authoritative source', () => {
  const composer: ComposerState = {
    mode: 'asset',
    targetAssetPath: '/Game/ClosedAsset',
    source: 'open-asset',
  };
  assert.ok(isStaleTarget(composer, baseInputs({
    currentAsset: makeAsset('/Game/BP_Player', 'BP_Player'),
    openAssets: [makeAsset('/Game/BP_Enemy', 'BP_Enemy')],
    selectedSession: null,
  })));
});

test('isStaleTarget: true when selected session target asset was closed in UE', () => {
  const session = makeAssetSession('/Game/ClosedAsset');
  const composer: ComposerState = {
    mode: 'asset',
    targetAssetPath: '/Game/ClosedAsset',
    source: 'selected-session',
  };
  assert.ok(isStaleTarget(composer, baseInputs({
    currentAsset: undefined,
    openAssets: [],
    selectedSession: session,
  })));
});

// ── validateSendRequest ─────────────────────────────────────────────

test('validateSendRequest: asset send with authoritative target → valid', () => {
  const open = makeAsset('/Game/BP_Player', 'BP_Player');
  const result = validateSendRequest(
    { scope: 'asset', userIntent: 'Fix it', targetAssetPath: '/Game/BP_Player' },
    baseInputs({ currentAsset: undefined, openAssets: [open], selectedSession: null }),
  );
  assert.equal(result.valid, true);
});

test('validateSendRequest: asset send with stale target → blocked with refresh reason', () => {
  const result = validateSendRequest(
    { scope: 'asset', userIntent: 'Fix it', targetAssetPath: '/Game/ClosedAsset' },
    baseInputs({
      currentAsset: makeAsset('/Game/BP_Player', 'BP_Player'),
      openAssets: [],
      selectedSession: null,
    }),
  );
  assert.equal(result.valid, false);
  assert.equal(result.reason, 'stale-target');
});

test('validateSendRequest: project send → valid regardless of assets', () => {
  const result = validateSendRequest(
    { scope: 'project', userIntent: 'Scan project' },
    baseInputs({ hasProjectContext: true }),
  );
  assert.equal(result.valid, true);
});

test('validateSendRequest: project send without project context → blocked', () => {
  const result = validateSendRequest(
    { scope: 'project', userIntent: 'Scan project' },
    baseInputs({ hasProjectContext: false }),
  );
  assert.equal(result.valid, false);
  assert.equal(result.reason, 'no-project-context');
});

test('validateSendRequest: asset send without target path → blocked', () => {
  const result = validateSendRequest(
    { scope: 'asset', userIntent: 'Fix it' },
    baseInputs(),
  );
  assert.equal(result.valid, false);
  assert.equal(result.reason, 'missing-target');
});

// ── RED: regression coverage for AUI-P0-04 and AUI-P1-03 ────────────

test('RED regression AUI-P0-04: no mock tree, no assets → null mode (empty guidance)', () => {
  const state = computeComposerState(baseInputs({
    currentAsset: undefined,
    openAssets: [],
    selectedSession: null,
    hasProjectContext: false,
  }));
  assert.equal(state.mode, null);
  assert.equal(state.targetAssetPath, undefined);
});

test('RED regression AUI-P0-04: Explorer selection sets target via open-asset source', () => {
  const open = makeAsset('/Game/BP_Player', 'BP_Player');
  const state = computeComposerState(baseInputs({
    currentAsset: undefined,
    openAssets: [open],
    userTargetChoice: '/Game/BP_Player',
    userModeChoice: 'asset',
  }));
  assert.equal(state.mode, 'asset');
  assert.equal(state.targetAssetPath, '/Game/BP_Player');
  assert.equal(state.source, 'open-asset');
});

test('RED regression AUI-P1-03: asset session selected → composer stays asset, no silent drift to project', () => {
  const session = makeAssetSession('/Game/BP_Player');
  for (let i = 0; i < 3; i++) {
    const state = computeComposerState(baseInputs({
      selectedSession: session,
      userModeChoice: null,
    }));
    assert.equal(state.mode, 'asset', `iteration ${i}: composer must stay asset, not drift to project`);
    assert.equal(state.targetAssetPath, '/Game/BP_Player');
  }
});

test('RED regression AUI-P1-03: project session selected → composer shows project', () => {
  const session = makeProjectSession();
  const state = computeComposerState(baseInputs({
    selectedSession: session,
    userModeChoice: null,
  }));
  assert.equal(state.mode, 'project');
  assert.equal(state.targetAssetPath, undefined);
});

test('RED regression: stale target at send time is blocked', () => {
  const session = makeAssetSession('/Game/ClosedAsset');
  const composer = computeComposerState(baseInputs({
    selectedSession: session,
  }));
  assert.equal(composer.mode, 'asset');
  assert.equal(composer.targetAssetPath, '/Game/ClosedAsset');
  const result = validateSendRequest(
    { scope: 'asset', userIntent: 'Continue', targetAssetPath: '/Game/ClosedAsset' },
    baseInputs({
      currentAsset: undefined,
      openAssets: [],
      selectedSession: session,
    }),
  );
  assert.equal(result.valid, false);
  assert.equal(result.reason, 'stale-target');
});
