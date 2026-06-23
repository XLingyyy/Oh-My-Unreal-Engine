import type {
  BlueprintGraphDetailData,
  OmueContextSnapshot,
  RepairSessionRecord,
} from '@omue/shared-protocol';

export type HandoffSourceKind =
  | 'live'
  | 'persisted-real'
  | 'cache'
  | 'mock'
  | 'unavailable';

export type HandoffSourceReason =
  | 'bridge-live'
  | 'bridge-cache'
  | 'renderer-live'
  | 'persisted-agent-session'
  | 'live-pending-approval'
  | 'mock-fixture'
  | 'no-live-data'
  | 'not-loaded';

export interface HandoffSourceFact {
  kind: HandoffSourceKind;
  updatedAt: string | null;
  reason: HandoffSourceReason;
}

export interface HandoffManifestFact {
  proposalId: string;
  proposedAt: string | null;
  proposalKind: string;
  summary: string | null;
  operationKind: string;
}

export type HandoffApprovalDecision =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'draft'
  | 'ready-for-review'
  | 'unknown';

export interface HandoffApprovalFact {
  approvalId: string | null;
  requestedAt: string | null;
  decidedAt: string | null;
  decision: HandoffApprovalDecision;
  note: string | null;
}

export interface HandoffRepairSessionFact {
  sessionId: string;
  scope: RepairSessionRecord['scope'];
  currentState: RepairSessionRecord['currentState'];
  updatedAt: string;
  targetAssetPath: string | null;
  proposalCount: number;
  hasSandbox: boolean;
  hasApproval: boolean;
  hasPromote: boolean;
}

export interface HandoffPendingApproval {
  approvalId: string;
  requestedAt: string;
}

export interface HandoffBtBlackboardSummary {
  source: string;
  assetName: string;
  assetPath: string;
  nodeCount: number;
  bbKeyCount: number;
  refCount: number;
  decoratorCount: number;
  serviceCount: number;
  taskCount: number;
  hasSelectedNode: boolean;
  selectedNodeName: string | null;
  readinessLabels: string[];
  isMockOnly: boolean;
}

export interface HandoffSourceInput {
  isMockClient: boolean;
  snapshot: OmueContextSnapshot | null;
  bridgeError: string | null;
  selectedSession: RepairSessionRecord | null;
  pendingApproval: HandoffPendingApproval | null;
  graphDetail: BlueprintGraphDetailData | null;
  queueItemCount: number;
  btBlackboardSummary: HandoffBtBlackboardSummary | null;
}

export interface HandoffSourceModel {
  sections: {
    overview: HandoffSourceFact;
    queue: HandoffSourceFact;
    evidence: HandoffSourceFact;
    graphDetail: HandoffSourceFact;
    recentLogs: HandoffSourceFact;
    safety: HandoffSourceFact;
    btBlackboard: HandoffSourceFact;
    manifests: HandoffSourceFact;
    approvalGates: HandoffSourceFact;
    repairSession: HandoffSourceFact;
  };
  btBlackboardSummary: HandoffBtBlackboardSummary | null;
  manifestFacts: HandoffManifestFact[];
  approvalFacts: HandoffApprovalFact[];
  repairSessionFact: HandoffRepairSessionFact | null;
}

const MOCK_MANIFEST_FACTS: HandoffManifestFact[] = [
  {
    proposalId: 'plan-001',
    proposedAt: null,
    proposalKind: 'fix',
    summary: null,
    operationKind: 'set_blueprint_metadata_marker',
  },
  {
    proposalId: 'plan-002',
    proposedAt: null,
    proposalKind: 'fix',
    summary: null,
    operationKind: 'set_blueprint_variable_default',
  },
  {
    proposalId: 'plan-003',
    proposedAt: null,
    proposalKind: 'escalation',
    summary: null,
    operationKind: 'manual-review',
  },
];

const MOCK_APPROVAL_FACTS: HandoffApprovalFact[] = [
  {
    approvalId: 'mock-plan-gate',
    requestedAt: null,
    decidedAt: null,
    decision: 'draft',
    note: null,
  },
  {
    approvalId: 'mock-manifest-gate',
    requestedAt: null,
    decidedAt: null,
    decision: 'ready-for-review',
    note: null,
  },
  {
    approvalId: 'mock-approval-gate',
    requestedAt: null,
    decidedAt: null,
    decision: 'draft',
    note: null,
  },
];

function fact(
  kind: HandoffSourceKind,
  updatedAt: string | null,
  reason: HandoffSourceReason,
): HandoffSourceFact {
  return { kind, updatedAt, reason };
}

function bridgeSource(input: HandoffSourceInput): HandoffSourceFact {
  if (input.isMockClient) {
    return fact('mock', input.snapshot?.capturedAt ?? null, 'mock-fixture');
  }
  if (input.snapshot && input.bridgeError) {
    return fact('cache', input.snapshot.capturedAt, 'bridge-cache');
  }
  if (input.snapshot) {
    return fact('live', input.snapshot.capturedAt, 'bridge-live');
  }
  return fact('unavailable', null, 'no-live-data');
}

function buildManifestFacts(
  input: HandoffSourceInput,
): {
  source: HandoffSourceFact;
  facts: HandoffManifestFact[];
} {
  const typedProposals = input.selectedSession?.proposals.filter(
    proposal => proposal.typedPayload !== null,
  ) ?? [];

  if (typedProposals.length > 0 && input.selectedSession) {
    return {
      source: fact(
        'persisted-real',
        input.selectedSession.updatedAt,
        'persisted-agent-session',
      ),
      facts: typedProposals.map(proposal => ({
        proposalId: proposal.proposalId,
        proposedAt: proposal.proposedAt,
        proposalKind: proposal.kind,
        summary: proposal.summary ?? proposal.diagnosisSummary ?? null,
        operationKind: proposal.typedPayload!.payload.operationKind,
      })),
    };
  }

  if (input.isMockClient) {
    return {
      source: fact(
        'mock',
        input.snapshot?.capturedAt ?? null,
        'mock-fixture',
      ),
      facts: MOCK_MANIFEST_FACTS.map(item => ({ ...item })),
    };
  }

  return {
    source: fact('unavailable', null, 'no-live-data'),
    facts: [],
  };
}

function buildApprovalFacts(
  input: HandoffSourceInput,
): {
  source: HandoffSourceFact;
  facts: HandoffApprovalFact[];
} {
  if (input.pendingApproval) {
    return {
      source: fact(
        'live',
        input.pendingApproval.requestedAt,
        'live-pending-approval',
      ),
      facts: [
        {
          approvalId: input.pendingApproval.approvalId,
          requestedAt: input.pendingApproval.requestedAt,
          decidedAt: null,
          decision: 'pending',
          note: null,
        },
      ],
    };
  }

  const persistedApproval =
    input.selectedSession?.scope === 'asset'
      ? input.selectedSession.approval
      : undefined;
  if (persistedApproval && input.selectedSession) {
    return {
      source: fact(
        'persisted-real',
        persistedApproval.approvedAt
          ?? persistedApproval.requestedAt
          ?? input.selectedSession.updatedAt,
        'persisted-agent-session',
      ),
      facts: [
        {
          approvalId: persistedApproval.approvalId ?? null,
          requestedAt: persistedApproval.requestedAt,
          decidedAt: persistedApproval.approvedAt ?? null,
          decision: persistedApproval.decision ?? 'pending',
          note: persistedApproval.note ?? null,
        },
      ],
    };
  }

  if (input.isMockClient) {
    return {
      source: fact(
        'mock',
        input.snapshot?.capturedAt ?? null,
        'mock-fixture',
      ),
      facts: MOCK_APPROVAL_FACTS.map(item => ({ ...item })),
    };
  }

  return {
    source: fact('unavailable', null, 'no-live-data'),
    facts: [],
  };
}

function buildRepairSessionFact(
  selectedSession: RepairSessionRecord | null,
): {
  source: HandoffSourceFact;
  value: HandoffRepairSessionFact | null;
} {
  if (!selectedSession) {
    return {
      source: fact('unavailable', null, 'no-live-data'),
      value: null,
    };
  }

  const isAsset = selectedSession.scope === 'asset';
  return {
    source: fact(
      'persisted-real',
      selectedSession.updatedAt,
      'persisted-agent-session',
    ),
    value: {
      sessionId: selectedSession.sessionId,
      scope: selectedSession.scope,
      currentState: selectedSession.currentState,
      updatedAt: selectedSession.updatedAt,
      targetAssetPath: isAsset ? selectedSession.targetAssetPath : null,
      proposalCount: selectedSession.proposals.length,
      hasSandbox: isAsset && selectedSession.sandbox !== undefined,
      hasApproval: isAsset && selectedSession.approval !== undefined,
      hasPromote: isAsset && selectedSession.promote !== undefined,
    },
  };
}

export function buildHandoffSourceModel(
  input: HandoffSourceInput,
): HandoffSourceModel {
  const bridge = bridgeSource(input);
  const manifests = buildManifestFacts(input);
  const approvals = buildApprovalFacts(input);
  const repairSession = buildRepairSessionFact(input.selectedSession);
  const graphDetail = input.graphDetail
    ? bridge
    : fact('unavailable', null, 'not-loaded');
  const btBlackboard =
    input.isMockClient && input.btBlackboardSummary
      ? fact(
          'mock',
          input.snapshot?.capturedAt ?? null,
          'mock-fixture',
        )
      : fact('unavailable', null, 'no-live-data');

  return {
    sections: {
      overview: bridge,
      queue: input.isMockClient
        ? fact('mock', null, 'mock-fixture')
        : fact('live', null, 'renderer-live'),
      evidence: bridge,
      graphDetail,
      recentLogs: bridge,
      safety: fact('live', null, 'renderer-live'),
      btBlackboard,
      manifests: manifests.source,
      approvalGates: approvals.source,
      repairSession: repairSession.source,
    },
    btBlackboardSummary:
      btBlackboard.kind === 'mock' ? input.btBlackboardSummary : null,
    manifestFacts: manifests.facts,
    approvalFacts: approvals.facts,
    repairSessionFact: repairSession.value,
  };
}
