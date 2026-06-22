import type { AgentProposal, AgentProposalEvent, TypedFixPayload } from '@omue/shared-protocol';

export interface NormalizeAgentProposalEventResult {
  proposal: AgentProposal | null;
  errorCode?: string;
  message?: string;
}

export function normalizeAgentProposalEvent(
  event: AgentProposalEvent,
): NormalizeAgentProposalEventResult {
  if (event.proposal) {
    return { proposal: event.proposal };
  }
  if (event.typedPayloadJson) {
    try {
      const typedPayload = JSON.parse(event.typedPayloadJson) as TypedFixPayload;
      return {
        proposal: {
          kind: 'fix',
          summary: '',
          diagnosisSummary: '',
          evidenceSummary: '',
          confidence: 'medium',
          risk: 'low',
          typedPayload,
        },
      };
    } catch {
      return {
        proposal: null,
        errorCode: 'legacy_proposal_parse_failed',
        message: 'Legacy proposal JSON parse failed.',
      };
    }
  }
  if (event.escalationReason) {
    return {
      proposal: { kind: 'escalation', reason: event.escalationReason },
    };
  }
  return { proposal: null, errorCode: 'legacy_proposal_parse_failed', message: 'Empty proposal event.' };
}
