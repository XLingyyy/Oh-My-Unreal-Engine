import { useState } from 'react';
import type {
  ValidationResultData,
  AgentCardAction,
  AgentCardBase,
  AgentCardActionId,
} from '@omue/shared-protocol';
import { useDesktopCopy } from '../../../i18n';
import type { DesktopCopy } from '../../../i18n/types';
import { ActionButton } from '../ActionButton';
import { PillTag } from '../PillTag';

export interface ValidationResultCardProps {
  card: AgentCardBase & { data: ValidationResultData };
  onAction?: (action: AgentCardAction) => void;
  loadingActionId?: AgentCardActionId | null;
  disabled?: boolean;
  isActionEnabled: (actionId: AgentCardActionId) => boolean;
}

function recommendationLabel(
  copy: DesktopCopy,
  recommendation: ValidationResultData['recommendation'],
): string {
  const t = copy.ueAgentUi.cards.validation;
  if (recommendation === 'promote') return t.recommendationPromote;
  if (recommendation === 'discard') return t.recommendationDiscard;
  return t.recommendationRegenerate;
}

export function ValidationResultCard({
  card,
  onAction,
  loadingActionId = null,
  disabled = false,
  isActionEnabled,
}: ValidationResultCardProps) {
  const { copy } = useDesktopCopy();
  const t = copy.ueAgentUi.cards.validation;
  const cards = copy.ueAgentUi.cards;
  const [collapsed, setCollapsed] = useState(Boolean(card.collapsed));
  const title = card.data.passed ? t.passedTitle : t.failedTitle;
  const pillVariant: 'success' | 'danger' = card.data.passed ? 'success' : 'danger';
  const passedCount = card.data.checks.filter(check => check.passed).length;
  const totalCount = card.data.checks.length;
  const isPromoteLoading = loadingActionId === 'promote';
  const isDiscardLoading = loadingActionId === 'discard';
  const canPromote = isActionEnabled('promote');
  const canDiscard = isActionEnabled('discard');
  const handlePromoteClick = () => {
    const action: AgentCardAction = { cardId: card.id, actionId: 'promote' };
    onAction?.(action);
  };

  return (
    <article
      className={`ue-card ue-card-validation ${card.data.passed ? 'ue-card-validation-passed' : 'ue-card-validation-failed'}`}
      aria-label={title}
    >
      <header className="ue-card-header">
        <h3 className="ue-card-title">{title}</h3>
        <PillTag
          label={recommendationLabel(copy, card.data.recommendation)}
          variant={pillVariant}
        />
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
          <section className="ue-card-section">
            <h4 className="ue-card-section-title">
              {t.checksHeading} ({passedCount}/{totalCount})
            </h4>
            <ul className="ue-card-check-list">
              {card.data.checks.map((check, index) => (
                <li
                  key={`${check.label}-${index}`}
                  className={`ue-card-check ${check.passed ? 'ue-card-check-passed' : 'ue-card-check-failed'}`}
                >
                  <span className="ue-card-check-mark" aria-hidden="true">
                    {check.passed ? '✓' : '✕'}
                  </span>
                  <span className="ue-card-check-label">{check.label}</span>
                </li>
              ))}
            </ul>
          </section>
          <p className="ue-card-summary">{t.resultSummary}: {card.data.resultSummary}</p>
          {card.data.passed && (canPromote || canDiscard) ? (
            <div className="ue-card-actions" aria-label={copy.ueAgentUi.cards.actionsLabel}>
              {canPromote && (
                <ActionButton
                  label={t.promoteRequiresConfirm}
                  variant="primary"
                  loading={isPromoteLoading}
                  disabled={disabled}
                  onClick={handlePromoteClick}
                />
              )}
              {canDiscard && (
                <ActionButton
                  label={t.discard}
                  variant="ghost"
                  loading={isDiscardLoading}
                  disabled={disabled || isPromoteLoading}
                  onClick={() => onAction?.({ cardId: card.id, actionId: 'discard' })}
                />
              )}
            </div>
          ) : !card.data.passed ? (
            <>
              <p className="ue-card-meta">{t.logsGuidance}</p>
              {canDiscard && (
                <div className="ue-card-actions" aria-label={copy.ueAgentUi.cards.actionsLabel}>
                  <ActionButton
                    label={t.discard}
                    variant="ghost"
                    loading={isDiscardLoading}
                    disabled={disabled}
                    onClick={() => onAction?.({ cardId: card.id, actionId: 'discard' })}
                  />
                </div>
              )}
            </>
          ) : null}
        </>
      ) : (
        <p className="ue-card-summary">
          {t.resultSummary}: {card.data.resultSummary}
        </p>
      )}
    </article>
  );
}
