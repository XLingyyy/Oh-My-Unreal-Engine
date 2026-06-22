// ── Fix Candidate Package + Repair Session Model (E74) ──
//
// Typed shapes aligned with the Human-Approved UE Fix Execution Loop v1 design.
// All fields are local/planning only — no execution, write, or provider calls.

// ── Fix Candidate Source ────────────────────────────────────────

export type FixCandidateSource =
  | 'manual'
  | 'deterministic_rule'
  | 'template'
  | 'ai_provider';

// ── Fix Candidate Ranking ──────────────────────────────────────

export type FixCandidateRanking = 'high' | 'medium' | 'low' | 'unknown';

// ── Fix Candidate Confidence ───────────────────────────────────

export type FixCandidateConfidence = 'high' | 'medium' | 'low';

// ── Evidence Link ──────────────────────────────────────────────

export interface EvidenceLink {
  sourceType:
    | 'compile_error'
    | 'log_entry'
    | 'diagnosis_report'
    | 'graph_detail'
    | 'bt_diagnostic'
    | 'manual';
  sourceLabel: string;
  sourcePath?: string;
  relevantAssetPath?: string;
  confidence?: FixCandidateConfidence;
}

// ── Fix Candidate ──────────────────────────────────────────────

export interface FixCandidate {
  candidateId: string;
  source: FixCandidateSource;
  title: string;
  description: string;
  targetAssetPath: string;
  proposedChange: string;
  evidenceLinks: EvidenceLink[];
  ranking: FixCandidateRanking;
  confidence: FixCandidateConfidence;
  knownLimitations: string[];
  // Future AI provider fields — inert placeholders only
  aiProviderId?: string;
  aiModelVersion?: string;
}

// ── Repair Session Status ──────────────────────────────────────

export type RepairSessionStatus =
  | 'active'
  | 'fixing'
  | 'validating'
  | 'completed'
  | 'rolled_back'
  | 'abandoned';

// ── Repair Session ─────────────────────────────────────────────

export interface RepairSession {
  sessionId: string;
  createdAt: string;
  updatedAt: string;
  status: RepairSessionStatus;
  diagnosisCaseId?: string;
  targetAssetPath: string;
  fixCandidates: FixCandidate[];
  selectedCandidateId?: string;
  changePlanId?: string;
  fixApproval?: FixApproval;
  executionResult?: FixExecutionResult;
  validationRunId?: string;
  rollbackRecordId?: string;
  postFixReportId?: string;
  metadata?: Record<string, unknown>;
}

// ── Fix Preview ────────────────────────────────────────────────

export interface FixPreview {
  previewId: string;
  candidateId: string;
  beforeState: string;
  afterState: string;
  diffMarkdown: string;
}

// ── Fix Approval ───────────────────────────────────────────────

export interface FixApproval {
  approvalId: string;
  sessionId: string;
  candidateId: string;
  approvedAt: string;
  approvedBy: 'user';
  approvalText: string;
  warningsAccepted: string[];
  snapshotVerified: boolean;
  targetAssetVerified: boolean;
}

// ── Fix Execution Result ───────────────────────────────────────

export interface FixExecutionResult {
  requestId: string;
  success: boolean;
  outcome:
    | 'succeeded'
    | 'preflight_failed'
    | 'write_failed'
    | 'snapshot_failed'
    | 'rejected'
    | 'timeout';
  details: string;
  timestamp: string;
  requiresUserLocalValidation: boolean;
  rollbackRecommended: boolean;
}
