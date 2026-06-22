import type { UserIntentData, AgentCardBase } from '@omue/shared-protocol';
import { useDesktopCopy } from '../../../i18n';

export interface UserIntentCardProps {
  card: AgentCardBase & { data: UserIntentData };
}

export function UserIntentCard({ card }: UserIntentCardProps) {
  const { copy } = useDesktopCopy();
  const t = copy.ueAgentUi.cards;
  return (
    <article className="ue-card ue-card-user-intent" aria-label={t.userIntent.title}>
      <header className="ue-card-header">
        <h3 className="ue-card-title">{t.userIntent.title}</h3>
        <span className="ue-card-meta">
          {card.data.scope === 'asset' ? t.userIntent.scopeAsset : t.userIntent.scopeProject}
        </span>
      </header>
      <p className="ue-card-summary">{card.data.userIntent}</p>
      {card.data.targetAssetPath && (
        <p className="ue-card-meta">{card.data.targetAssetPath}</p>
      )}
      {card.data.inheritedEvidenceSummary && (
        <p className="ue-card-meta">{t.userIntent.inheritedEvidenceLabel}</p>
      )}
    </article>
  );
}
