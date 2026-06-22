import type { CompletionData, AgentCardBase } from '@omue/shared-protocol';
import { useDesktopCopy } from '../../../i18n';

export interface CompletionCardProps {
  card: AgentCardBase & { data: CompletionData };
}

export function CompletionCard({ card }: CompletionCardProps) {
  const { copy } = useDesktopCopy();
  const t = copy.ueAgentUi.cards.completion;
  const title = card.data.closeReason === 'done'
    ? t.completedTitle
    : card.data.closeReason === 'escalated'
      ? t.escalatedTitle
      : card.data.closeReason === 'rejected'
        ? t.rejectedTitle
        : card.data.closeReason === 'cancelled'
          ? t.cancelledTitle
          : t.interruptedTitle;
  return (
    <article className={`ue-card ue-card-completion ue-card-completion-${card.data.tone}`} aria-label={title}>
      <header className="ue-card-header">
        <h3 className="ue-card-title">{title}</h3>
        <span className="ue-card-meta">{card.data.terminalState}</span>
      </header>
      <p className="ue-card-summary">{card.data.message}</p>
    </article>
  );
}
