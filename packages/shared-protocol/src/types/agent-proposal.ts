import type { BlueprintAssetSummary } from './blueprint-change-plan.js';
import type { CompileIssue } from './compile-status.js';
import type { TypedFixPayload } from './typed-fix-payload.js';

export type AgentSessionScope = 'asset' | 'project';

export type ConfidenceLevel = 'low' | 'medium' | 'high';
export type RiskLevel = 'low' | 'medium' | 'high';

export interface AgentCandidateAsset {
  assetPath: string;
  assetName?: string;
  assetType?: string;
  reason: string;
  confidence: ConfidenceLevel;
}

export const AGENT_PROPOSAL_SUMMARY_MAX = 4000;
export const AGENT_PROPOSAL_DIAGNOSIS_SUMMARY_MAX = 4000;
export const AGENT_PROPOSAL_EVIDENCE_SUMMARY_MAX = 8000;
export const AGENT_PROPOSAL_INHERITED_EVIDENCE_SUMMARY_MAX = 8000;
export const AGENT_PROPOSAL_CANDIDATE_MAX = 10;
export const AGENT_USER_INTENT_MAX = 2000;

export type AgentProposal =
  | {
      kind: 'diagnosis';
      summary: string;
      evidenceSummary: string;
      confidence: ConfidenceLevel;
      risk: RiskLevel;
      candidateAssets: AgentCandidateAsset[];
      suggestedNextSteps: string[];
    }
  | {
      kind: 'fix';
      summary: string;
      diagnosisSummary: string;
      evidenceSummary: string;
      confidence: ConfidenceLevel;
      risk: RiskLevel;
      typedPayload: TypedFixPayload;
    }
  | {
      kind: 'escalation';
      reason: string;
      suggestedHumanAction?: string;
    };

export interface AgentProposalRequest {
  scope: AgentSessionScope;
  userIntent: string;
  parentSessionId?: string;
  inheritedEvidenceSummary?: string;
  compileIssueIds?: string[];

  targetAssetPath?: string;
  compileIssues?: CompileIssue[];
  blueprintSummary?: BlueprintAssetSummary;
  graphDetailJson?: string;
  messageLogJson?: string;
  previousAttempts?: Array<{
    proposalId: string;
    feedback: string;
  }>;
  feedback?: string;
}

export type AgentProposalResult =
  | { ok: true; proposal: AgentProposal; rawResponseRef?: string }
  | { ok: false; errorCode: AgentProposalErrorCode; message: string };

export type AgentProposalErrorCode =
  | 'no_provider_config'
  | 'invalid_request'
  | 'llm_call_failed'
  | 'llm_output_not_json'
  | 'llm_output_schema_invalid'
  | 'llm_output_operation_not_supported'
  | 'llm_output_target_mismatch'
  | 'scope_execution_forbidden'
  | 'legacy_proposal_parse_failed'
  | 'timeout';
