import type {
  OmueContextSnapshot,
  RepairSessionRecord,
} from '@omue/shared-protocol';

export type DrawerSourceKind =
  | 'live'
  | 'persisted-real'
  | 'cache'
  | 'mock'
  | 'unavailable';

export type DrawerSourceReason =
  | 'bridge-live'
  | 'bridge-cache'
  | 'persisted-agent-session'
  | 'mock-fixture'
  | 'no-live-question-data'
  | 'no-persisted-closure'
  | 'no-persisted-change-plan'
  | 'no-real-blueprint-workspace';

export interface DrawerPageAuthority {
  kind: DrawerSourceKind;
  reason: DrawerSourceReason;
  updatedAt: string | null;
  available: boolean;
}

export interface DrawerPersistedClosureFact {
  sessionId: string;
  scope: RepairSessionRecord['scope'];
  currentState: RepairSessionRecord['currentState'];
  updatedAt: string;
  closedAt: string | null;
  closeReason: string | null;
  targetAssetPath: string | null;
  proposalCount: number;
  hasSandbox: boolean;
  hasApproval: boolean;
  hasPromote: boolean;
}

export interface DrawerPersistedPlanFact {
  proposalId: string;
  proposedAt: string;
  kind: string;
  summary: string | null;
  diagnosisSummary: string | null;
  confidence: string | null;
  risk: string | null;
  operationKind: string | null;
  escalationReason: string | null;
  suggestedHumanAction: string | null;
}

export interface DrawerFactualSourceInput {
  isMockClient: boolean;
  snapshot: OmueContextSnapshot | null;
  bridgeError: string | null;
  selectedSession: RepairSessionRecord | null;
}

export interface DrawerFactualSourceModel {
  pages: {
    questions: DrawerPageAuthority;
    closure: DrawerPageAuthority;
    changePlan: DrawerPageAuthority;
    blueprintChangeWorkspace: DrawerPageAuthority;
  };
  persistedClosure: DrawerPersistedClosureFact | null;
  persistedPlans: DrawerPersistedPlanFact[];
}

const TERMINAL_STATES = new Set<RepairSessionRecord['currentState']>([
  'done',
  'escalated_done',
  'closed',
]);

function authority(
  kind: DrawerSourceKind,
  reason: DrawerSourceReason,
  updatedAt: string | null,
): DrawerPageAuthority {
  return {
    kind,
    reason,
    updatedAt,
    available: kind !== 'unavailable',
  };
}

function buildQuestionsAuthority(
  input: DrawerFactualSourceInput,
): DrawerPageAuthority {
  if (input.isMockClient) {
    return authority(
      'mock',
      'mock-fixture',
      input.snapshot?.capturedAt ?? null,
    );
  }
  if (input.snapshot && input.bridgeError) {
    return authority('cache', 'bridge-cache', input.snapshot.capturedAt);
  }
  if (input.snapshot) {
    return authority('live', 'bridge-live', input.snapshot.capturedAt);
  }
  return authority('unavailable', 'no-live-question-data', null);
}

function buildPersistedClosure(
  selectedSession: RepairSessionRecord | null,
): DrawerPersistedClosureFact | null {
  if (!selectedSession || !TERMINAL_STATES.has(selectedSession.currentState)) {
    return null;
  }

  const isAsset = selectedSession.scope === 'asset';
  return {
    sessionId: selectedSession.sessionId,
    scope: selectedSession.scope,
    currentState: selectedSession.currentState,
    updatedAt: selectedSession.updatedAt,
    closedAt: selectedSession.closedAt ?? null,
    closeReason: selectedSession.closeReason ?? null,
    targetAssetPath: isAsset ? selectedSession.targetAssetPath : null,
    proposalCount: selectedSession.proposals.length,
    hasSandbox: isAsset && selectedSession.sandbox !== undefined,
    hasApproval: isAsset && selectedSession.approval !== undefined,
    hasPromote: isAsset && selectedSession.promote !== undefined,
  };
}

function buildPersistedPlans(
  selectedSession: RepairSessionRecord | null,
): DrawerPersistedPlanFact[] {
  return selectedSession?.proposals.map(proposal => ({
    proposalId: proposal.proposalId,
    proposedAt: proposal.proposedAt,
    kind: proposal.kind,
    summary: proposal.summary ?? null,
    diagnosisSummary: proposal.diagnosisSummary ?? null,
    confidence: proposal.confidence ?? null,
    risk: proposal.risk ?? null,
    operationKind: proposal.typedPayload?.payload.operationKind ?? null,
    escalationReason: proposal.escalationReason ?? null,
    suggestedHumanAction: proposal.suggestedHumanAction ?? null,
  })) ?? [];
}

export function buildDrawerFactualSourceModel(
  input: DrawerFactualSourceInput,
): DrawerFactualSourceModel {
  const persistedClosure = buildPersistedClosure(input.selectedSession);
  const persistedPlans = buildPersistedPlans(input.selectedSession);

  return {
    pages: {
      questions: buildQuestionsAuthority(input),
      closure: input.isMockClient
        ? authority(
            'mock',
            'mock-fixture',
            input.snapshot?.capturedAt ?? null,
          )
        : persistedClosure
          ? authority(
              'persisted-real',
              'persisted-agent-session',
              persistedClosure.closedAt ?? persistedClosure.updatedAt,
            )
          : authority('unavailable', 'no-persisted-closure', null),
      changePlan: input.isMockClient
        ? authority(
            'mock',
            'mock-fixture',
            input.snapshot?.capturedAt ?? null,
          )
        : persistedPlans.length > 0 && input.selectedSession
          ? authority(
              'persisted-real',
              'persisted-agent-session',
              input.selectedSession.updatedAt,
            )
          : authority('unavailable', 'no-persisted-change-plan', null),
      blueprintChangeWorkspace: input.isMockClient
        ? authority(
            'mock',
            'mock-fixture',
            input.snapshot?.capturedAt ?? null,
          )
        : authority('unavailable', 'no-real-blueprint-workspace', null),
    },
    persistedClosure,
    persistedPlans,
  };
}
