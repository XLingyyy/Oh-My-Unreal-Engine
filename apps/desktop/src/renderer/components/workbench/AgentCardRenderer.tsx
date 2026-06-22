import type { AgentCard, AgentCardAction, AgentCardActionId } from '@omue/shared-protocol';
import { ScanStatusCard } from './cards/ScanStatusCard';
import { DiagnosisCard } from './cards/DiagnosisCard';
import { FixPlanCard } from './cards/FixPlanCard';
import { ChangePreviewCard } from './cards/ChangePreviewCard';
import { ValidationResultCard } from './cards/ValidationResultCard';
import { FailureCard } from './cards/FailureCard';
import { CompletionCard } from './cards/CompletionCard';
import { ProjectCandidatesCard } from './cards/ProjectCandidatesCard';
import { UserIntentCard } from './cards/UserIntentCard';
import type { FailureRecoveryAction } from './cards/FailureCard';
import {
  createAgentCardActionHandler,
  isAgentCardActionEnabled,
  type AgentCardActionContext,
} from './agentCardMapper';

export interface AgentCardRendererProps {
  card: AgentCard;
  actionContext: Omit<AgentCardActionContext, 'cardId' | 'cardKind'>;
  onAction?: (action: AgentCardAction) => void;
  loadingActionId?: AgentCardActionId | null;
  disabled?: boolean;
  failureRecovery?: FailureRecoveryAction;
}

export function AgentCardRenderer({
  card,
  actionContext,
  onAction,
  loadingActionId = null,
  disabled = false,
  failureRecovery,
}: AgentCardRendererProps) {
  const policyContext: AgentCardActionContext = {
    ...actionContext,
    cardId: card.id,
    cardKind: card.kind,
  };
  const guardedOnAction = createAgentCardActionHandler(policyContext, onAction);
  const isActionEnabled = (actionId: AgentCardActionId) =>
    isAgentCardActionEnabled(policyContext, actionId);
  switch (card.kind) {
    case 'user-intent':
      return <UserIntentCard card={card} />;
    case 'scan-status':
      return <ScanStatusCard card={card} onAction={guardedOnAction} />;
    case 'diagnosis':
      return (
        <DiagnosisCard
          card={card}
          onAction={guardedOnAction}
          isActionEnabled={isActionEnabled}
        />
      );
    case 'fix-plan':
      return (
        <FixPlanCard
          card={card}
          onAction={guardedOnAction}
          isActionEnabled={isActionEnabled}
        />
      );
    case 'change-preview':
      return (
        <ChangePreviewCard
          card={card}
          onAction={guardedOnAction}
          loadingActionId={loadingActionId}
          disabled={disabled}
          isActionEnabled={isActionEnabled}
        />
      );
    case 'validation-result':
      return (
        <ValidationResultCard
          card={card}
          onAction={guardedOnAction}
          loadingActionId={loadingActionId}
          disabled={disabled}
          isActionEnabled={isActionEnabled}
        />
      );
    case 'project-candidates':
      return (
        <ProjectCandidatesCard
          card={card}
          onAction={guardedOnAction}
          disabled={disabled}
          isActionEnabled={isActionEnabled}
        />
      );
    case 'failure':
      return <FailureCard card={card} recoveryAction={failureRecovery} />;
    case 'completion':
      return <CompletionCard card={card} />;
    default: {
      const exhaustive: never = card;
      throw new Error(`Unknown AgentCard kind: ${JSON.stringify(exhaustive)}`);
    }
  }
}
