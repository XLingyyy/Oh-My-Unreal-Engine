import { useState } from 'react';
import type {
  FixPlanData,
  AgentCardAction,
  AgentCardActionId,
  AgentCardBase,
} from '@omue/shared-protocol';
import { useDesktopCopy } from '../../../i18n';
import { ActionButton } from '../ActionButton';
import { CodeSnippet } from '../CodeSnippet';

export interface FixPlanCardProps {
  card: AgentCardBase & { data: FixPlanData };
  onAction?: (action: AgentCardAction) => void;
  isActionEnabled: (actionId: AgentCardActionId) => boolean;
}

export function FixPlanCard({ card, onAction, isActionEnabled }: FixPlanCardProps) {
  const { copy } = useDesktopCopy();
  const t = copy.ueAgentUi.cards.fixPlan;
  const cards = copy.ueAgentUi.cards;
  const [collapsed, setCollapsed] = useState(Boolean(card.collapsed));

  return (
    <article className="ue-card ue-card-fix-plan" aria-label={t.title}>
      <header className="ue-card-header">
        <h3 className="ue-card-title">{t.title}</h3>
        <span className="ue-card-meta">{card.data.target}</span>
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
      {!collapsed ? (
        <>
          <p className="ue-card-summary">{card.data.summary}</p>
          <section className="ue-card-section">
            <h4 className="ue-card-section-title">{t.steps}</h4>
            <ol className="ue-card-step-list">
              {card.data.steps.map((step, index) => (
                <li key={`${step.label}-${index}`} className="ue-card-step-row">
                  <span className="ue-card-step-index">{index + 1}</span>
                  <span className="ue-card-step-text">{step.label}</span>
                  {step.code && <CodeSnippet code={step.code} />}
                </li>
              ))}
            </ol>
          </section>
          <div className="ue-card-grid">
            <section className="ue-card-section">
              <h4 className="ue-card-section-title">{t.willModify}</h4>
              <ul className="ue-card-bullet-list">
                {card.data.willModify.map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
            </section>
            <section className="ue-card-section">
              <h4 className="ue-card-section-title">{t.willNotModify}</h4>
              <ul className="ue-card-bullet-list ue-card-bullet-list-muted">
                {card.data.willNotModify.map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
            </section>
          </div>
          <section className="ue-card-section">
            <h4 className="ue-card-section-title">{t.verification}</h4>
            <ul className="ue-card-bullet-list">
              {card.data.verification.map((item, index) => (
                <li key={index}>{item}</li>
              ))}
            </ul>
          </section>
          {isActionEnabled('cancel') && (
            <div className="ue-card-actions" aria-label={copy.ueAgentUi.cards.actionsLabel}>
              <ActionButton
                label={t.cancel}
                variant="secondary"
                onClick={() => onAction?.({ cardId: card.id, actionId: 'cancel' })}
              />
            </div>
          )}
        </>
      ) : (
        <p className="ue-card-summary">{card.data.summary}</p>
      )}
    </article>
  );
}
