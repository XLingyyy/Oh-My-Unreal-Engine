import { test } from 'node:test';
import assert from 'node:assert/strict';
import type {
  AgentAssetSessionRecord,
  AgentProjectSessionRecord,
  CompileStatus,
  EditorConnectionStatus,
  RepairSessionRecord,
} from '@omue/shared-protocol';
import { REPAIR_SESSION_SCHEMA_VERSION } from '@omue/shared-protocol';
import type { BridgeHealth } from '../renderer/services/bridge-client';
import type { ComposerState, ComposerMode } from '../renderer/components/workbench/targetScopeState';
import type { ProviderReadiness } from '../main/settings/provider-authority';
import {
  computeBridgeStatus,
  computeProviderStatus,
  computeSessionStatus,
  computeScopeStatus,
  computeSandboxIndicator,
  computeTopBarAgentBadge,
  computeBpBadge,
  computeUeConnectionView,
  computeWorkbenchStatus,
  type BridgeStatus,
  type ProviderStatus,
  type SessionStatus,
  type ScopeStatus,
  type SandboxIndicator,
  type WorkbenchStatusInputs,
  type TopBarAgentBadge,
  type BpBadge,
  type UeConnectionView,
} from '../renderer/components/workbench/workbenchStatusViewModel';

// ── Fixtures ────────────────────────────────────────────────────────

const FIXTURE_TS = '2026-06-21T00:00:00.000Z';

function makeHealth(overrides?: Partial<BridgeHealth>): BridgeHealth {
  return {
    connectionStatus: 'connected',
    serviceName: 'OMUE Unreal Bridge',
    version: 'omue-test-1.0',
    message: 'Bridge ok, editorStatus: idle',
    checkedAt: FIXTURE_TS,
    ...overrides,
  };
}

function makeReadyProvider(): ProviderReadiness {
  return {
    status: 'ready',
    providerId: 'test-provider',
    displayName: 'Test Provider',
    diagnosisModel: 'test-model',
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

function makeComposer(mode: ComposerMode, targetAssetPath?: string): ComposerState {
  if (mode === 'project') {
    return { mode: 'project', source: 'user-project' };
  }
  if (mode === 'asset') {
    return { mode: 'asset', ...(targetAssetPath ? { targetAssetPath } : {}), source: 'current-asset' };
  }
  return { mode: null, source: 'user-cleared' };
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

function baseInputs(overrides?: Partial<WorkbenchStatusInputs>): WorkbenchStatusInputs {
  return {
    health: null,
    bridgeError: null,
    isInitialLoading: false,
    isRefreshing: false,
    hasSnapshot: false,
    compileStatus: null,
    providerReadiness: { status: 'ready' },
    selectedSession: null,
    composerState: { mode: null, source: 'user-cleared' },
    isMockClient: false,
    ...overrides,
  };
}

// ── computeBridgeStatus ─────────────────────────────────────────────

test('computeBridgeStatus: initial loading → connecting', () => {
  assert.equal(
    computeBridgeStatus({ health: null, bridgeError: null, isInitialLoading: true, isRefreshing: false, hasSnapshot: false }),
    'connecting',
  );
});

test('computeBridgeStatus: refreshing with snapshot → connected (not connecting)', () => {
  assert.equal(
    computeBridgeStatus({ health: makeHealth(), bridgeError: null, isInitialLoading: false, isRefreshing: true, hasSnapshot: true }),
    'connected',
  );
});

test('computeBridgeStatus: bridge error and no snapshot → disconnected', () => {
  assert.equal(
    computeBridgeStatus({ health: null, bridgeError: 'Failed to reach bridge', isInitialLoading: false, isRefreshing: false, hasSnapshot: false }),
    'disconnected',
  );
});

test('computeBridgeStatus: bridge error but stale snapshot available → degraded', () => {
  assert.equal(
    computeBridgeStatus({ health: null, bridgeError: 'Failed to reach bridge', isInitialLoading: false, isRefreshing: false, hasSnapshot: true }),
    'degraded',
  );
});

test('computeBridgeStatus: health connected + snapshot → connected', () => {
  assert.equal(
    computeBridgeStatus({ health: makeHealth(), bridgeError: null, isInitialLoading: false, isRefreshing: false, hasSnapshot: true }),
    'connected',
  );
});

test('computeBridgeStatus: health degraded status + snapshot → degraded', () => {
  assert.equal(
    computeBridgeStatus({ health: makeHealth({ connectionStatus: 'error' }), bridgeError: null, isInitialLoading: false, isRefreshing: false, hasSnapshot: true }),
    'degraded',
  );
});

// ── computeProviderStatus ───────────────────────────────────────────

test('computeProviderStatus: ready → ready', () => {
  assert.equal(computeProviderStatus({ status: 'ready' }), 'ready');
});

test('computeProviderStatus: missing_provider → required', () => {
  assert.equal(computeProviderStatus({ status: 'missing_provider' }), 'required');
});

test('computeProviderStatus: missing_key → required', () => {
  assert.equal(computeProviderStatus({ status: 'missing_key' }), 'required');
});

test('computeProviderStatus: vault_unavailable → required', () => {
  assert.equal(computeProviderStatus({ status: 'vault_unavailable' }), 'required');
});

test('computeProviderStatus: vault_corrupt → required', () => {
  assert.equal(computeProviderStatus({ status: 'vault_corrupt' }), 'required');
});

test('computeProviderStatus: invalid_config → invalid', () => {
  assert.equal(computeProviderStatus({ status: 'invalid_config' }), 'invalid');
});

// ── computeSessionStatus ────────────────────────────────────────────

test('computeSessionStatus: null → idle', () => {
  assert.equal(computeSessionStatus(null), 'idle');
});

test('computeSessionStatus: draft → running', () => {
  assert.equal(computeSessionStatus(makeAssetSession({ currentState: 'draft' })), 'running');
});

test('computeSessionStatus: diagnosing → running', () => {
  assert.equal(computeSessionStatus(makeAssetSession({ currentState: 'diagnosing' })), 'running');
});

test('computeSessionStatus: awaiting_approval → awaiting-approval', () => {
  assert.equal(
    computeSessionStatus(makeAssetSession({ currentState: 'awaiting_approval' })),
    'awaiting-approval',
  );
});

test('computeSessionStatus: done → done', () => {
  assert.equal(computeSessionStatus(makeAssetSession({ currentState: 'done' })), 'done');
});

test('computeSessionStatus: escalated_done → escalated (NOT failed)', () => {
  assert.equal(
    computeSessionStatus(makeAssetSession({ currentState: 'escalated_done' })),
    'escalated',
  );
});

test('computeSessionStatus: closed → done', () => {
  assert.equal(computeSessionStatus(makeAssetSession({ currentState: 'closed' })), 'done');
});

test('computeSessionStatus: interrupted → interrupted', () => {
  assert.equal(
    computeSessionStatus(makeAssetSession({ currentState: 'interrupted' })),
    'interrupted',
  );
});

// ── computeScopeStatus ──────────────────────────────────────────────

test('computeScopeStatus: null composer → none', () => {
  assert.equal(computeScopeStatus({ mode: null, source: 'user-cleared' }), 'none');
});

test('computeScopeStatus: project composer → project', () => {
  assert.equal(computeScopeStatus({ mode: 'project', source: 'user-project' }), 'project');
});

test('computeScopeStatus: asset composer → asset', () => {
  assert.equal(
    computeScopeStatus({ mode: 'asset', targetAssetPath: '/Game/BP', source: 'current-asset' }),
    'asset',
  );
});

// ── computeSandboxIndicator ─────────────────────────────────────────

test('computeSandboxIndicator: project scope → hidden', () => {
  assert.equal(
    computeSandboxIndicator(makeProjectSession({ currentState: 'proposing' }), 'project'),
    'hidden',
  );
});

test('computeSandboxIndicator: idle asset → hidden', () => {
  assert.equal(computeSandboxIndicator(null, 'asset'), 'hidden');
});

test('computeSandboxIndicator: asset proposing → preparing', () => {
  assert.equal(
    computeSandboxIndicator(makeAssetSession({ currentState: 'proposing' }), 'asset'),
    'preparing',
  );
});

test('computeSandboxIndicator: asset payload_validating → validating', () => {
  assert.equal(
    computeSandboxIndicator(makeAssetSession({ currentState: 'payload_validating' }), 'asset'),
    'validating',
  );
});

test('computeSandboxIndicator: asset preflighting → validating', () => {
  assert.equal(
    computeSandboxIndicator(makeAssetSession({ currentState: 'preflighting' }), 'asset'),
    'validating',
  );
});

test('computeSandboxIndicator: asset sandbox_duplicating → preparing', () => {
  assert.equal(
    computeSandboxIndicator(makeAssetSession({ currentState: 'sandbox_duplicating' }), 'asset'),
    'preparing',
  );
});

test('computeSandboxIndicator: asset sandbox_applying → preparing', () => {
  assert.equal(
    computeSandboxIndicator(makeAssetSession({ currentState: 'sandbox_applying' }), 'asset'),
    'preparing',
  );
});

test('computeSandboxIndicator: asset sandbox_compiling → validating', () => {
  assert.equal(
    computeSandboxIndicator(makeAssetSession({ currentState: 'sandbox_compiling' }), 'asset'),
    'validating',
  );
});

test('computeSandboxIndicator: asset awaiting_approval → awaiting-approval', () => {
  assert.equal(
    computeSandboxIndicator(makeAssetSession({ currentState: 'awaiting_approval' }), 'asset'),
    'awaiting-approval',
  );
});

test('computeSandboxIndicator: asset promoting → promoting', () => {
  assert.equal(
    computeSandboxIndicator(makeAssetSession({ currentState: 'promoting' }), 'asset'),
    'promoting',
  );
});

test('computeSandboxIndicator: asset done → hidden', () => {
  assert.equal(
    computeSandboxIndicator(makeAssetSession({ currentState: 'done' }), 'asset'),
    'hidden',
  );
});

// ── computeTopBarAgentBadge ─────────────────────────────────────────

const BADGE_COPY = {
  agentReady: 'Agent Ready',
  agentScanning: 'Agent Scanning',
  agentWorking: 'Agent Working',
  agentNeedApproval: 'Need Approval',
  agentVerifying: 'Agent Verifying',
  agentFailed: 'Agent Failed',
  agentEscalated: 'Agent Escalated',
  agentProviderRequired: 'Provider Required',
  agentInterrupted: 'Agent Interrupted',
};

test('computeTopBarAgentBadge: provider required → provider-required badge, NOT Agent Ready', () => {
  const badge = computeTopBarAgentBadge('idle', 'required', BADGE_COPY);
  assert.equal(badge.variant, 'warning');
  assert.equal(badge.label, BADGE_COPY.agentProviderRequired);
  assert.notEqual(badge.label, BADGE_COPY.agentReady);
});

test('computeTopBarAgentBadge: provider invalid → provider-required badge', () => {
  const badge = computeTopBarAgentBadge('idle', 'invalid', BADGE_COPY);
  assert.equal(badge.variant, 'danger');
  assert.equal(badge.label, BADGE_COPY.agentProviderRequired);
});

test('computeTopBarAgentBadge: idle + ready provider → Agent Ready', () => {
  const badge = computeTopBarAgentBadge('idle', 'ready', BADGE_COPY);
  assert.equal(badge.variant, 'success');
  assert.equal(badge.label, BADGE_COPY.agentReady);
});

test('computeTopBarAgentBadge: running + ready → Agent Scanning for diagnosing', () => {
  const badge = computeTopBarAgentBadge('running', 'ready', BADGE_COPY);
  assert.equal(badge.variant, 'info');
  assert.equal(badge.label, BADGE_COPY.agentScanning);
});

test('computeTopBarAgentBadge: awaiting-approval → Need Approval', () => {
  const badge = computeTopBarAgentBadge('awaiting-approval', 'ready', BADGE_COPY);
  assert.equal(badge.variant, 'warning');
  assert.equal(badge.label, BADGE_COPY.agentNeedApproval);
});

test('computeTopBarAgentBadge: escalated → Agent Escalated (NOT Agent Failed)', () => {
  const badge = computeTopBarAgentBadge('escalated', 'ready', BADGE_COPY);
  assert.equal(badge.variant, 'warning');
  assert.equal(badge.label, BADGE_COPY.agentEscalated);
  assert.notEqual(badge.label, BADGE_COPY.agentFailed);
});

test('computeTopBarAgentBadge: failed → Agent Failed', () => {
  const badge = computeTopBarAgentBadge('failed', 'ready', BADGE_COPY);
  assert.equal(badge.variant, 'danger');
  assert.equal(badge.label, BADGE_COPY.agentFailed);
});

test('computeTopBarAgentBadge: interrupted → Agent Interrupted', () => {
  const badge = computeTopBarAgentBadge('interrupted', 'ready', BADGE_COPY);
  assert.equal(badge.variant, 'warning');
  assert.equal(badge.label, BADGE_COPY.agentInterrupted);
});

// ── computeBpBadge ──────────────────────────────────────────────────

const BP_COPY = {
  bpClean: 'BP Clean',
  bpErrors: (n: number) => `BP Errors ${n}`,
  bpWarnings: (n: number) => `BP Warnings ${n}`,
  bpUnknown: 'BP Unknown',
};

test('computeBpBadge: null compile → unknown (NOT BP Clean)', () => {
  const badge = computeBpBadge(null, BP_COPY);
  assert.equal(badge.variant, 'muted');
  assert.equal(badge.label, BP_COPY.bpUnknown);
  assert.notEqual(badge.label, BP_COPY.bpClean);
});

test('computeBpBadge: unknown compile result → unknown (NOT BP Clean)', () => {
  const badge = computeBpBadge(makeCompile({ lastCompileResult: 'unknown' }), BP_COPY);
  assert.equal(badge.variant, 'muted');
  assert.equal(badge.label, BP_COPY.bpUnknown);
  assert.notEqual(badge.label, BP_COPY.bpClean);
});

test('computeBpBadge: 0 errors 0 warnings success → BP Clean', () => {
  const badge = computeBpBadge(
    makeCompile({ lastCompileResult: 'success', errorCount: 0, warningCount: 0 }),
    BP_COPY,
  );
  assert.equal(badge.variant, 'success');
  assert.equal(badge.label, BP_COPY.bpClean);
});

test('computeBpBadge: errors > 0 → danger with count', () => {
  const badge = computeBpBadge(
    makeCompile({ lastCompileResult: 'failed', errorCount: 3, warningCount: 1 }),
    BP_COPY,
  );
  assert.equal(badge.variant, 'danger');
  assert.equal(badge.label, BP_COPY.bpErrors(3));
});

test('computeBpBadge: only warnings → warning with count', () => {
  const badge = computeBpBadge(
    makeCompile({ lastCompileResult: 'success', errorCount: 0, warningCount: 2 }),
    BP_COPY,
  );
  assert.equal(badge.variant, 'warning');
  assert.equal(badge.label, BP_COPY.bpWarnings(2));
});

// ── computeUeConnectionView ─────────────────────────────────────────

test('computeUeConnectionView: real mode connected → connected health, real endpoint, reconnect unavailable', () => {
  const view = computeUeConnectionView({
    bridgeStatus: 'connected',
    health: makeHealth(),
    bridgeBaseUrl: 'http://127.0.0.1:21805',
    isMockClient: false,
  });
  assert.equal(view.healthStatus, 'connected');
  assert.equal(view.endpoint, 'http://127.0.0.1:21805');
  assert.equal(view.canReconnect, false);
  assert.equal(view.canTest, false);
  assert.equal(view.reconnectLabel, 'unavailable');
  assert.equal(view.testLabel, 'unavailable');
});

test('computeUeConnectionView: real mode disconnected → disconnected health', () => {
  const view = computeUeConnectionView({
    bridgeStatus: 'disconnected',
    health: null,
    bridgeBaseUrl: 'http://127.0.0.1:21805',
    isMockClient: false,
  });
  assert.equal(view.healthStatus, 'disconnected');
  assert.equal(view.endpoint, 'http://127.0.0.1:21805');
  assert.equal(view.canReconnect, false);
  assert.equal(view.canTest, false);
});

test('computeUeConnectionView: degraded → degraded health', () => {
  const view = computeUeConnectionView({
    bridgeStatus: 'degraded',
    health: makeHealth({ connectionStatus: 'error' }),
    bridgeBaseUrl: 'http://127.0.0.1:21805',
    isMockClient: false,
  });
  assert.equal(view.healthStatus, 'degraded');
});

test('computeUeConnectionView: mock mode → mock indicator, no fake Connected', () => {
  const view = computeUeConnectionView({
    bridgeStatus: 'connected',
    health: makeHealth(),
    bridgeBaseUrl: 'http://127.0.0.1:21805',
    isMockClient: true,
  });
  assert.equal(view.isMock, true);
  assert.equal(view.healthStatus, 'mock');
});

test('computeUeConnectionView: never reports fake Connected when bridge is down', () => {
  const view = computeUeConnectionView({
    bridgeStatus: 'disconnected',
    health: null,
    bridgeBaseUrl: 'http://127.0.0.1:21805',
    isMockClient: false,
  });
  assert.notEqual(view.healthStatus, 'connected');
});

// ── computeWorkbenchStatus (integration matrix) ────────────────────

test('computeWorkbenchStatus: bridge connected + provider required + no session → idle/required/no scope', () => {
  const status = computeWorkbenchStatus(baseInputs({
    health: makeHealth(),
    hasSnapshot: true,
    providerReadiness: { status: 'missing_provider' },
    selectedSession: null,
    composerState: { mode: null, source: 'user-cleared' },
  }));
  assert.equal(status.bridgeStatus, 'connected');
  assert.equal(status.providerStatus, 'required');
  assert.equal(status.sessionStatus, 'idle');
  assert.equal(status.scope, 'none');
  assert.equal(status.sandboxIndicator, 'hidden');
  assert.equal(status.topBarAgentBadge.label, 'Provider Required');
});

test('computeWorkbenchStatus: project running → no sandbox indicator', () => {
  const status = computeWorkbenchStatus(baseInputs({
    health: makeHealth(),
    hasSnapshot: true,
    providerReadiness: makeReadyProvider(),
    selectedSession: makeProjectSession({ currentState: 'diagnosing' }),
    composerState: makeComposer('project'),
  }));
  assert.equal(status.sessionStatus, 'running');
  assert.equal(status.scope, 'project');
  assert.equal(status.sandboxIndicator, 'hidden');
});

test('computeWorkbenchStatus: project escalated → escalated (not failed), no sandbox', () => {
  const status = computeWorkbenchStatus(baseInputs({
    health: makeHealth(),
    hasSnapshot: true,
    providerReadiness: makeReadyProvider(),
    selectedSession: makeProjectSession({ currentState: 'escalated_done' }),
    composerState: makeComposer('project'),
  }));
  assert.equal(status.sessionStatus, 'escalated');
  assert.equal(status.scope, 'project');
  assert.equal(status.sandboxIndicator, 'hidden');
  assert.equal(status.topBarAgentBadge.label, 'Agent Escalated');
  assert.notEqual(status.topBarAgentBadge.label, 'Agent Failed');
});

test('computeWorkbenchStatus: asset awaiting approval → awaiting-approval + awaiting-approval sandbox', () => {
  const status = computeWorkbenchStatus(baseInputs({
    health: makeHealth(),
    hasSnapshot: true,
    providerReadiness: makeReadyProvider(),
    selectedSession: makeAssetSession({ currentState: 'awaiting_approval' }),
    composerState: makeComposer('asset', '/Game/BP'),
  }));
  assert.equal(status.sessionStatus, 'awaiting-approval');
  assert.equal(status.scope, 'asset');
  assert.equal(status.sandboxIndicator, 'awaiting-approval');
});

test('computeWorkbenchStatus: asset done → done + hidden sandbox', () => {
  const status = computeWorkbenchStatus(baseInputs({
    health: makeHealth(),
    hasSnapshot: true,
    providerReadiness: makeReadyProvider(),
    selectedSession: makeAssetSession({ currentState: 'done' }),
    composerState: makeComposer('asset', '/Game/BP'),
  }));
  assert.equal(status.sessionStatus, 'done');
  assert.equal(status.sandboxIndicator, 'hidden');
});

test('computeWorkbenchStatus: asset failed (interrupted) → interrupted', () => {
  const status = computeWorkbenchStatus(baseInputs({
    health: makeHealth(),
    hasSnapshot: true,
    providerReadiness: makeReadyProvider(),
    selectedSession: makeAssetSession({ currentState: 'interrupted' }),
    composerState: makeComposer('asset', '/Game/BP'),
  }));
  assert.equal(status.sessionStatus, 'interrupted');
});

test('computeWorkbenchStatus: disconnected with stale snapshot → degraded + no healthy badges', () => {
  const status = computeWorkbenchStatus(baseInputs({
    health: null,
    bridgeError: 'Bridge unreachable',
    hasSnapshot: true,
    providerReadiness: makeReadyProvider(),
    selectedSession: null,
    composerState: { mode: null, source: 'user-cleared' },
  }));
  assert.equal(status.bridgeStatus, 'degraded');
  assert.equal(status.ueConnection.healthStatus, 'degraded');
});

test('computeWorkbenchStatus: mock mode → mock ueConnection, no fake Connected in real terms', () => {
  const status = computeWorkbenchStatus(baseInputs({
    health: makeHealth(),
    hasSnapshot: true,
    providerReadiness: makeReadyProvider(),
    isMockClient: true,
  }));
  assert.equal(status.ueConnection.isMock, true);
  assert.equal(status.ueConnection.healthStatus, 'mock');
});

test('computeWorkbenchStatus: unknown compile → BP Unknown (NOT BP Clean)', () => {
  const status = computeWorkbenchStatus(baseInputs({
    health: makeHealth(),
    hasSnapshot: true,
    providerReadiness: makeReadyProvider(),
    compileStatus: makeCompile({ lastCompileResult: 'unknown' }),
  }));
  assert.equal(status.bpBadge.label, 'BP Unknown');
  assert.notEqual(status.bpBadge.label, 'BP Clean');
});

test('computeWorkbenchStatus: Chat/Inspector/TopBar consistency — provider required never shows Agent Ready', () => {
  const status = computeWorkbenchStatus(baseInputs({
    health: makeHealth(),
    hasSnapshot: true,
    providerReadiness: { status: 'missing_provider' },
    selectedSession: makeAssetSession({ currentState: 'diagnosing' }),
    composerState: makeComposer('asset', '/Game/BP'),
  }));
  assert.equal(status.providerStatus, 'required');
  assert.equal(status.topBarAgentBadge.label, 'Provider Required');
  assert.notEqual(status.topBarAgentBadge.label, 'Agent Ready');
});

test('computeWorkbenchStatus: Chat/Inspector/TopBar consistency — bridge error never shows healthy', () => {
  const status = computeWorkbenchStatus(baseInputs({
    health: null,
    bridgeError: 'Bridge unreachable',
    hasSnapshot: false,
    providerReadiness: makeReadyProvider(),
    selectedSession: null,
    compileStatus: null,
  }));
  assert.equal(status.bridgeStatus, 'disconnected');
  assert.equal(status.ueConnection.healthStatus, 'disconnected');
  assert.notEqual(status.bpBadge.label, 'BP Clean');
});
