import type { AgentLoopState, CompileStatus, RepairSessionRecord } from '@omue/shared-protocol';
import type { BridgeHealth } from '../../services/bridge-client';
import type { ComposerState } from './targetScopeState';
import type { ProviderReadiness } from '../../../main/settings/provider-authority';

export type BridgeStatus = 'connecting' | 'connected' | 'degraded' | 'disconnected';

export type ProviderStatus = 'ready' | 'required' | 'invalid';

export type SessionStatus =
  | 'idle'
  | 'running'
  | 'awaiting-approval'
  | 'done'
  | 'escalated'
  | 'failed'
  | 'interrupted';

export type ScopeStatus = 'none' | 'project' | 'asset';

export type SandboxIndicator =
  | 'hidden'
  | 'preparing'
  | 'validating'
  | 'awaiting-approval'
  | 'promoting';

export type UeConnectionHealthStatus =
  | 'connected'
  | 'degraded'
  | 'disconnected'
  | 'connecting'
  | 'mock';

export interface UeConnectionView {
  endpoint: string;
  healthStatus: UeConnectionHealthStatus;
  lastCheckedAt: string | null;
  canReconnect: boolean;
  canTest: boolean;
  reconnectLabel: 'unavailable' | 'reconnect';
  testLabel: 'unavailable' | 'test';
  isMock: boolean;
}

export type BadgeVariant = 'success' | 'info' | 'warning' | 'danger' | 'muted';

export interface TopBarAgentBadge {
  variant: BadgeVariant;
  label: string;
}

export interface BpBadge {
  variant: BadgeVariant;
  label: string;
}

export interface TopBarBadgeCopy {
  agentReady: string;
  agentScanning: string;
  agentWorking: string;
  agentNeedApproval: string;
  agentVerifying: string;
  agentFailed: string;
  agentEscalated: string;
  agentProviderRequired: string;
  agentInterrupted: string;
}

export interface BpBadgeCopy {
  bpClean: string;
  bpErrors: (count: number) => string;
  bpWarnings: (count: number) => string;
  bpUnknown: string;
}

export interface WorkbenchStatusInputs {
  health: BridgeHealth | null;
  bridgeError: string | null;
  isInitialLoading: boolean;
  isRefreshing: boolean;
  hasSnapshot: boolean;
  compileStatus: CompileStatus | null;
  providerReadiness: ProviderReadiness;
  selectedSession: RepairSessionRecord | null;
  composerState: ComposerState;
  isMockClient: boolean;
  bridgeBaseUrl?: string;
}

export interface WorkbenchStatusViewModel {
  bridgeStatus: BridgeStatus;
  providerStatus: ProviderStatus;
  sessionStatus: SessionStatus;
  scope: ScopeStatus;
  sandboxIndicator: SandboxIndicator;
  topBarAgentBadge: TopBarAgentBadge;
  bpBadge: BpBadge;
  ueConnection: UeConnectionView;
  showSandboxMode: boolean;
}

const RUNNING_STATES: ReadonlySet<AgentLoopState> = new Set([
  'draft',
  'diagnosing',
  'proposing',
  'payload_validating',
  'preflighting',
  'sandbox_duplicating',
  'sandbox_applying',
  'sandbox_compiling',
  'promoting',
]);

const SANDBOX_PREPARING_STATES: ReadonlySet<AgentLoopState> = new Set([
  'proposing',
  'sandbox_duplicating',
  'sandbox_applying',
]);

const SANDBOX_VALIDATING_STATES: ReadonlySet<AgentLoopState> = new Set([
  'payload_validating',
  'preflighting',
  'sandbox_compiling',
]);

const WORKING_STATES: ReadonlySet<AgentLoopState> = new Set([
  'proposing',
  'payload_validating',
  'preflighting',
  'sandbox_duplicating',
  'sandbox_applying',
]);

const VERIFYING_STATES: ReadonlySet<AgentLoopState> = new Set([
  'sandbox_compiling',
  'promoting',
]);

export function computeBridgeStatus(input: {
  health: BridgeHealth | null;
  bridgeError: string | null;
  isInitialLoading: boolean;
  isRefreshing: boolean;
  hasSnapshot: boolean;
}): BridgeStatus {
  if (input.isInitialLoading && !input.hasSnapshot) {
    return 'connecting';
  }

  if (input.bridgeError) {
    return input.hasSnapshot ? 'degraded' : 'disconnected';
  }

  if (input.health) {
    if (input.health.connectionStatus === 'connected') {
      if (input.hasSnapshot || input.isRefreshing) {
        return 'connected';
      }
      return 'connecting';
    }
    return input.hasSnapshot ? 'degraded' : 'disconnected';
  }

  return input.hasSnapshot ? 'connected' : 'disconnected';
}

export function computeProviderStatus(
  readiness: ProviderReadiness,
): ProviderStatus {
  switch (readiness.status) {
    case 'ready':
      return 'ready';
    case 'invalid_config':
      return 'invalid';
    case 'missing_provider':
    case 'missing_key':
    case 'vault_unavailable':
    case 'vault_corrupt':
      return 'required';
    default:
      return 'required';
  }
}

export function computeSessionStatus(
  session: RepairSessionRecord | null,
): SessionStatus {
  if (!session) {
    return 'idle';
  }

  const state = session.currentState;

  if (state === 'interrupted') {
    return 'interrupted';
  }

  if (state === 'awaiting_approval') {
    return 'awaiting-approval';
  }

  if (state === 'done') {
    return 'done';
  }

  if (state === 'escalated_done') {
    return 'escalated';
  }

  if (state === 'closed') {
    if (session.closeReason === 'rejected') {
      return 'failed';
    }
    return 'done';
  }

  if (RUNNING_STATES.has(state)) {
    return 'running';
  }

  return 'running';
}

export function computeScopeStatus(composer: ComposerState): ScopeStatus {
  if (composer.mode === 'project') return 'project';
  if (composer.mode === 'asset') return 'asset';
  return 'none';
}

export function computeSandboxIndicator(
  session: RepairSessionRecord | null,
  scope: ScopeStatus,
): SandboxIndicator {
  if (scope !== 'asset') {
    return 'hidden';
  }

  if (!session) {
    return 'hidden';
  }

  const state = session.currentState;

  if (state === 'awaiting_approval') return 'awaiting-approval';
  if (state === 'promoting') return 'promoting';
  if (SANDBOX_PREPARING_STATES.has(state)) return 'preparing';
  if (SANDBOX_VALIDATING_STATES.has(state)) return 'validating';

  return 'hidden';
}

export function computeTopBarAgentBadge(
  sessionStatus: SessionStatus,
  providerStatus: ProviderStatus,
  copy: TopBarBadgeCopy,
  agentState?: AgentLoopState | null,
): TopBarAgentBadge {
  if (providerStatus === 'required') {
    return { variant: 'warning', label: copy.agentProviderRequired };
  }

  if (providerStatus === 'invalid') {
    return { variant: 'danger', label: copy.agentProviderRequired };
  }

  switch (sessionStatus) {
    case 'idle':
      return { variant: 'success', label: copy.agentReady };
    case 'running':
      if (agentState && WORKING_STATES.has(agentState)) {
        return { variant: 'info', label: copy.agentWorking };
      }
      if (agentState && VERIFYING_STATES.has(agentState)) {
        return { variant: 'info', label: copy.agentVerifying };
      }
      return { variant: 'info', label: copy.agentScanning };
    case 'awaiting-approval':
      return { variant: 'warning', label: copy.agentNeedApproval };
    case 'done':
      return { variant: 'success', label: copy.agentReady };
    case 'escalated':
      return { variant: 'warning', label: copy.agentEscalated };
    case 'failed':
      return { variant: 'danger', label: copy.agentFailed };
    case 'interrupted':
      return { variant: 'warning', label: copy.agentInterrupted };
    default:
      return { variant: 'success', label: copy.agentReady };
  }
}

export function computeBpBadge(
  compileStatus: CompileStatus | null,
  copy: BpBadgeCopy,
): BpBadge {
  if (!compileStatus || compileStatus.lastCompileResult === 'unknown') {
    return { variant: 'muted', label: copy.bpUnknown };
  }

  if (compileStatus.errorCount > 0) {
    return { variant: 'danger', label: copy.bpErrors(compileStatus.errorCount) };
  }

  if (compileStatus.warningCount > 0) {
    return { variant: 'warning', label: copy.bpWarnings(compileStatus.warningCount) };
  }

  return { variant: 'success', label: copy.bpClean };
}

export function computeUeConnectionView(input: {
  bridgeStatus: BridgeStatus;
  health: BridgeHealth | null;
  bridgeBaseUrl: string;
  isMockClient: boolean;
}): UeConnectionView {
  const endpoint = input.bridgeBaseUrl;
  const lastCheckedAt = input.health?.checkedAt ?? null;

  if (input.isMockClient) {
    return {
      endpoint,
      healthStatus: 'mock',
      lastCheckedAt,
      canReconnect: false,
      canTest: false,
      reconnectLabel: 'unavailable',
      testLabel: 'unavailable',
      isMock: true,
    };
  }

  const healthStatusMap: Record<BridgeStatus, UeConnectionHealthStatus> = {
    connected: 'connected',
    degraded: 'degraded',
    disconnected: 'disconnected',
    connecting: 'connecting',
  };

  return {
    endpoint,
    healthStatus: healthStatusMap[input.bridgeStatus],
    lastCheckedAt,
    canReconnect: false,
    canTest: false,
    reconnectLabel: 'unavailable',
    testLabel: 'unavailable',
    isMock: false,
  };
}

export function computeWorkbenchStatus(
  inputs: WorkbenchStatusInputs,
): WorkbenchStatusViewModel {
  const bridgeStatus = computeBridgeStatus({
    health: inputs.health,
    bridgeError: inputs.bridgeError,
    isInitialLoading: inputs.isInitialLoading,
    isRefreshing: inputs.isRefreshing,
    hasSnapshot: inputs.hasSnapshot,
  });

  const providerStatus = computeProviderStatus(inputs.providerReadiness);
  const sessionStatus = computeSessionStatus(inputs.selectedSession);
  const scope = computeScopeStatus(inputs.composerState);
  const sandboxIndicator = computeSandboxIndicator(inputs.selectedSession, scope);

  const topBarAgentBadge = computeTopBarAgentBadge(
    sessionStatus,
    providerStatus,
    {
      agentReady: 'Agent Ready',
      agentScanning: 'Agent Scanning',
      agentWorking: 'Agent Working',
      agentNeedApproval: 'Need Approval',
      agentVerifying: 'Agent Verifying',
      agentFailed: 'Agent Failed',
      agentEscalated: 'Agent Escalated',
      agentProviderRequired: 'Provider Required',
      agentInterrupted: 'Agent Interrupted',
    },
    inputs.selectedSession?.currentState ?? null,
  );

  const bpBadge = computeBpBadge(inputs.compileStatus, {
    bpClean: 'BP Clean',
    bpErrors: (n: number) => `BP Errors ${n}`,
    bpWarnings: (n: number) => `BP Warnings ${n}`,
    bpUnknown: 'BP Unknown',
  });

  const ueConnection = computeUeConnectionView({
    bridgeStatus,
    health: inputs.health,
    bridgeBaseUrl: inputs.bridgeBaseUrl ?? 'http://127.0.0.1:21805',
    isMockClient: inputs.isMockClient,
  });

  return {
    bridgeStatus,
    providerStatus,
    sessionStatus,
    scope,
    sandboxIndicator,
    topBarAgentBadge,
    bpBadge,
    ueConnection,
    showSandboxMode: sandboxIndicator !== 'hidden',
  };
}
