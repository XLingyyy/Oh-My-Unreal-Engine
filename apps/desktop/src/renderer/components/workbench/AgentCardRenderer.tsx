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
  AgentCardFrame,
  type AgentCardPresentationSettings,
} from './AgentCardFrame';
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
  presentation: AgentCardPresentationSettings;
}

export function AgentCardRenderer({
  card,
  actionContext,
  onAction,
  loadingActionId = null,
  disabled = false,
  failureRecovery,
  presentation,
}: AgentCardRendererProps) {
  const policyContext: AgentCardActionContext = {
    ...actionContext,
    cardId: card.id,
    cardKind: card.kind,
  };
  const guardedOnAction = createAgentCardActionHandler(policyContext, onAction);
  const isActionEnabled = (actionId: AgentCardActionId) =>
    isAgentCardActionEnabled(policyContext, actionId);
  let cardContent;
  switch (card.kind) {
    case 'user-intent':
      cardContent = <UserIntentCard card={card} />;
      break;
    case 'scan-status':
      cardContent = <ScanStatusCard card={card} onAction={guardedOnAction} />;
      break;
    case 'diagnosis':
      cardContent = (
        <DiagnosisCard
          card={card}
          onAction={guardedOnAction}
          isActionEnabled={isActionEnabled}
        />
      );
      break;
    case 'fix-plan':
      cardContent = (
        <FixPlanCard
          card={card}
          onAction={guardedOnAction}
          isActionEnabled={isActionEnabled}
        />
      );
      break;
    case 'change-preview':
      cardContent = (
        <ChangePreviewCard
          card={card}
          onAction={guardedOnAction}
          loadingActionId={loadingActionId}
          disabled={disabled}
          isActionEnabled={isActionEnabled}
        />
      );
      break;
    case 'validation-result':
      cardContent = (
        <ValidationResultCard
          card={card}
          onAction={guardedOnAction}
          loadingActionId={loadingActionId}
          disabled={disabled}
          isActionEnabled={isActionEnabled}
        />
      );
      break;
    case 'project-candidates':
      cardContent = (
        <ProjectCandidatesCard
          card={card}
          onAction={guardedOnAction}
          disabled={disabled}
          isActionEnabled={isActionEnabled}
        />
      );
      break;
    case 'failure':
      cardContent = <FailureCard card={card} recoveryAction={failureRecovery} />;
      break;
    case 'completion':
      cardContent = <CompletionCard card={card} />;
      break;
    default: {
      const exhaustive: never = card;
      throw new Error(`Unknown AgentCard kind: ${JSON.stringify(exhaustive)}`);
    }
  }

  const hasCriticalActions = card.kind === 'change-preview'
    || card.kind === 'validation-result'
    || (
      card.kind === 'failure'
      && failureRecovery !== undefined
      && failureRecovery.mode !== 'none'
    );

  return (
    <AgentCardFrame
      card={card}
      presentation={presentation}
      hasCriticalActions={hasCriticalActions}
    >
      {cardContent}
    </AgentCardFrame>
  );
}
