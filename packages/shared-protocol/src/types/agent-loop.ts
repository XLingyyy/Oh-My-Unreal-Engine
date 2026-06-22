import type { BlueprintAssetSummary } from './blueprint-change-plan.js';
import type {
  AgentCandidateAsset,
  AgentProposalErrorCode,
  AgentSessionScope,
} from './agent-proposal.js';
import type { CompileIssue } from './compile-status.js';
import type { TypedFixPayload } from './typed-fix-payload.js';

export type AgentLoopState =
  | 'draft'
  | 'diagnosing'
  | 'proposing'
  | 'payload_validating'
  | 'preflighting'
  | 'sandbox_duplicating'
  | 'sandbox_applying'
  | 'sandbox_compiling'
  | 'awaiting_approval'
  | 'promoting'
  | 'done'
  | 'escalated_done'
  | 'closed'
  | 'interrupted';

export type AgentLoopTerminalState = 'done' | 'escalated_done' | 'closed';

export type AgentLoopCloseReason =
  | 'done'
  | 'escalated'
  | 'cancelled'
  | 'rejected'
  | 'interrupted';

export const REPAIR_SESSION_SCHEMA_VERSION = 'omue.repairSession.v1';

export const AGENT_PROPOSAL_PROPOSAL_KINDS = ['diagnosis', 'fix', 'escalation'] as const;
export type AgentProposalStoredKind = (typeof AGENT_PROPOSAL_PROPOSAL_KINDS)[number];

export interface AgentProposalStoredRecord {
  proposalId: string;
  proposedAt: string;
  kind: AgentProposalStoredKind;
  summary?: string;
  diagnosisSummary?: string;
  evidenceSummary?: string;
  confidence?: 'low' | 'medium' | 'high';
  risk?: 'low' | 'medium' | 'high';
  candidateAssets?: AgentCandidateAsset[];
  suggestedNextSteps?: string[];
  typedPayload: TypedFixPayload | null;
  escalationReason?: string;
  suggestedHumanAction?: string;
  feedback?: {
    kind: 'validation_failed' | 'preflight_failed' | 'compile_failed';
    reason: string;
    compileIssues?: CompileIssue[];
  };
}

export interface RepairSessionRecordBase {
  schemaVersion: typeof REPAIR_SESSION_SCHEMA_VERSION;
  sessionId: string;
  userIntent: string;
  createdAt: string;
  updatedAt: string;
  currentState: AgentLoopState;
  retryCount: number;
  maxRetries: number;

  contextSnapshot?: {
    compileIssues: CompileIssue[];
    blueprintSummary: BlueprintAssetSummary;
    graphDetailJson?: string;
    messageLogJson?: string;
    collectedAt: string;
  };

  proposals: AgentProposalStoredRecord[];

  failureReason?: string;
  closedAt?: string;
  closeReason?: AgentLoopCloseReason;

  errors?: AgentSessionErrorStoredRecord[];

  lastProposalFailure?: {
    errorCode: AgentProposalErrorCode | string;
    message: string;
    rawLlmOutput?: string;
  };
}

export interface AgentAssetSessionRecord extends RepairSessionRecordBase {
  scope: 'asset';
  targetAssetPath: string;
  parentSessionId?: string;
  inheritedEvidenceSummary?: string;

  sandbox?: {
    copyAssetPath: string;
    duplicatedAt: string;
    snapshotId?: string;
    applyResultJson?: string;
    compileResultJson?: string;
    cleanable?: boolean;
  };

  approval?: {
    requestedAt: string;
    approvalId?: string;
    approvedAt?: string;
    decision?: 'approved' | 'rejected';
    note?: string;
  };

  promote?: {
    applyResultJson: string;
    promotedAt: string;
  };
}

export interface AgentProjectSessionRecord extends RepairSessionRecordBase {
  scope: 'project';
  parentSessionId?: string;
}

export type RepairSessionRecord =
  | AgentAssetSessionRecord
  | AgentProjectSessionRecord;

export type StartSessionRequest =
  | {
      scope: 'asset';
      userIntent: string;
      targetAssetPath: string;
      parentSessionId?: string;
      inheritedEvidenceSummary?: string;
      compileIssueIds?: string[];
    }
  | {
      scope: 'project';
      userIntent: string;
      compileIssueIds?: string[];
    };

export type StartSessionResult =
  | { ok: true; sessionId: string }
  | {
      ok: false;
      errorCode: StartSessionErrorCode;
      message: string;
      existingSessionId?: string;
    };

export type StartSessionErrorCode =
  | 'invalid_request'
  | 'asset_locked'
  | 'store_error';

export interface CancelSessionRequest {
  sessionId: string;
}

export type CancelSessionResult =
  | { ok: true; sessionId: string }
  | {
      ok: false;
      errorCode: 'invalid_request' | 'not_found' | 'store_error';
      message: string;
    };

export interface ApprovePromoteRequest {
  sessionId: string;
  approvalId: string;
  note?: string;
}

export type ApprovePromoteResult =
  | { ok: true; sessionId: string }
  | {
      ok: false;
      errorCode:
        | 'invalid_request'
        | 'not_found'
        | 'not_awaiting_approval'
        | 'scope_execution_forbidden'
        | 'store_error';
      message: string;
    };

export interface RejectPromoteRequest {
  sessionId: string;
  reason?: string;
}

export type RejectPromoteResult = CancelSessionResult;

export type ListSessionsResult =
  | { ok: true; sessions: RepairSessionRecord[] }
  | { ok: false; errorCode: 'store_error'; message: string };

export interface ResumeSessionRequest {
  sessionId: string;
}

export type ResumeSessionResult =
  | { ok: true; sessionId: string; currentState: AgentLoopState }
  | {
      ok: false;
      errorCode:
        | 'invalid_request'
        | 'not_found'
        | 'asset_locked'
        | 'terminal_state'
        | 'store_error';
      message: string;
      existingSessionId?: string;
    };

export interface DiscardSessionRequest {
  sessionId: string;
}

export type DiscardSessionResult = CancelSessionResult;

export interface SubscribeResult {
  ok: true;
  message: string;
}

export interface AgentProgressEvent {
  sessionId: string;
  currentState: AgentLoopState;
  updatedAt: string;
  retryCount: number;
}

export interface AgentProposalEvent {
  sessionId: string;
  proposalId: string;
  proposedAt: string;
  kind?: AgentProposalStoredKind;
  proposal?: import('./agent-proposal.js').AgentProposal;
  typedPayloadJson?: string;
  escalationReason?: string;
}

export interface AgentSandboxCompileResultEvent {
  sessionId: string;
  compileResultId: string;
  completedAt: string;
  success: boolean;
  errorsJson?: string;
}

export interface AgentApprovalRequestedEvent {
  sessionId: string;
  approvalId: string;
  requestedAt: string;
  sandboxCompileResultJson?: string;
  diffPreviewJson?: string;
}

export interface AgentSessionErrorRecord {
  errorId: string;
  sessionId: string;
  scope: AgentSessionScope;
  errorCode: string;
  message: string;
  recoverable: boolean;
  createdAt: string;
  details?: unknown;
}

export interface AgentSessionErrorStoredRecord extends AgentSessionErrorRecord {
  context?: {
    state?: AgentLoopState;
    phase?: string;
  };
}

export interface AgentSessionErrorEvent {
  sessionId: string;
  errorId: string;
  errorCode: string;
  message: string;
  scope: AgentSessionScope;
  recoverable: boolean;
  createdAt: string;
  details?: unknown;
}

export interface AgentSessionClosedEvent {
  sessionId: string;
  closeReason: AgentLoopCloseReason;
  closedAt: string;
}

export function isAssetSession(
  record: RepairSessionRecord,
): record is AgentAssetSessionRecord {
  return record.scope === 'asset';
}

export function isProjectSession(
  record: RepairSessionRecord,
): record is AgentProjectSessionRecord {
  return record.scope === 'project';
}
