import { useState } from 'react';
import type {
  ProjectCandidatesData,
  AgentCardAction,
  AgentCardActionId,
  AgentCardBase,
} from '@omue/shared-protocol';
import { useDesktopCopy } from '../../../i18n';
import { ActionButton } from '../ActionButton';

export interface ProjectCandidatesCardProps {
  card: AgentCardBase & { data: ProjectCandidatesData };
  onAction?: (action: AgentCardAction) => void;
  disabled?: boolean;
  isActionEnabled: (actionId: AgentCardActionId) => boolean;
}

export function ProjectCandidatesCard({
  card,
  onAction,
  disabled = false,
  isActionEnabled,
}: ProjectCandidatesCardProps) {
  const { copy } = useDesktopCopy();
  const t = copy.ueAgentUi.cards.projectCandidates;
  const cards = copy.ueAgentUi.cards;
  const [collapsed, setCollapsed] = useState(Boolean(card.collapsed));

  return (
    <article className="ue-card ue-card-project-candidates" aria-label={t.title}>
      <header className="ue-card-header">
        <h3 className="ue-card-title">{t.title}</h3>
        <span className="ue-card-meta">{t.count(card.data.candidates.length)}</span>
        <button
          type="button"
          className="ue-card-toggle"
          aria-expanded={!collapsed}
          aria-label={collapsed ? cards.expandAria : cards.collapseAria}
          onClick={() => setCollapsed(prev => !prev)}
        >
          {collapsed ? cards.expandAria : cards.collapseAria}
        </button>
      </header>
      {!collapsed && (
        <>
          <p className="ue-card-summary">{card.data.summary}</p>
          <p className="ue-card-meta">{cards.viewEvidenceDisabledHint}</p>
          {card.data.candidates.length > 0 && (
            <ul className="ue-card-bullet-list">
              {card.data.candidates.map((candidate) => (
                <li key={candidate.assetPath} className="ue-card-candidate">
                  <div className="ue-card-candidate-head">
                    <strong>{candidate.assetName ?? candidate.assetPath}</strong>
                    <span className="ue-card-meta">{candidate.confidence}</span>
                  </div>
                  <div className="ue-card-meta">{candidate.assetPath}</div>
                  <p>{candidate.reason}</p>
                  <div className="ue-card-actions" aria-label={copy.ueAgentUi.cards.actionsLabel}>
                    <ActionButton
                      label={t.viewEvidence}
                      variant="secondary"
                      disabled={disabled || !isActionEnabled('view-evidence')}
                      ariaLabel={cards.viewEvidenceDisabledHint}
                      onClick={() => onAction?.({
                        cardId: card.id,
                        actionId: 'view-evidence',
                        payload: { assetPath: candidate.assetPath },
                      })}
                    />
                    <ActionButton
                      label={t.chooseTarget}
                      variant="primary"
                      disabled={disabled || !isActionEnabled('select-target-asset')}
                      onClick={() => onAction?.({
                        cardId: card.id,
                        actionId: 'select-target-asset',
                        payload: { targetAssetPath: candidate.assetPath },
                      })}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
          {card.data.suggestedNextSteps.length > 0 && (
            <section className="ue-card-section">
              <h4 className="ue-card-section-title">{t.nextSteps}</h4>
              <ul className="ue-card-bullet-list">
                {card.data.suggestedNextSteps.map((step, index) => (
                  <li key={index}>{step}</li>
                ))}
              </ul>
              <div className="ue-card-actions" aria-label={copy.ueAgentUi.cards.actionsLabel}>
                <ActionButton
                  label={t.continueDiagnosis}
                  variant="primary"
                  disabled={disabled || !isActionEnabled('continue-diagnosis')}
                  onClick={() => onAction?.({
                    cardId: card.id,
                    actionId: 'continue-diagnosis',
                  })}
                />
              </div>
            </section>
          )}
        </>
      )}
    </article>
  );
}
