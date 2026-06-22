import { useState } from 'react';
import type {
  ChangePreviewData,
  AgentCardAction,
  AgentCardBase,
  AgentCardActionId,
} from '@omue/shared-protocol';
import { useDesktopCopy } from '../../../i18n';
import type { DesktopCopy } from '../../../i18n/types';
import { ActionButton } from '../ActionButton';
import { PillTag } from '../PillTag';

export interface ChangePreviewCardProps {
  card: AgentCardBase & { data: ChangePreviewData };
  onAction?: (action: AgentCardAction) => void;
  loadingActionId?: AgentCardActionId | null;
  disabled?: boolean;
  isActionEnabled: (actionId: AgentCardActionId) => boolean;
}

function riskVariant(level: ChangePreviewData['risk']): 'success' | 'warning' | 'danger' {
  if (level === 'low') return 'success';
  if (level === 'medium') return 'warning';
  return 'danger';
}

function riskLabel(copy: DesktopCopy, level: ChangePreviewData['risk']): string {
  const t = copy.ueAgentUi.cards.changePreview;
  if (level === 'low') return t.riskLow;
  if (level === 'medium') return t.riskMedium;
  return t.riskHigh;
}

export function ChangePreviewCard({
  card,
  onAction,
  loadingActionId = null,
  disabled = false,
  isActionEnabled,
}: ChangePreviewCardProps) {
  const { copy } = useDesktopCopy();
  const t = copy.ueAgentUi.cards.changePreview;
  const cards = copy.ueAgentUi.cards;
  const [collapsed, setCollapsed] = useState(Boolean(card.collapsed));
  const isApproveLoading = loadingActionId === 'approve';
  const isRejectLoading = loadingActionId === 'reject';
  const isCancelLoading = loadingActionId === 'cancel';
  const isAnyLoading = isApproveLoading || isRejectLoading || isCancelLoading;
  const canApprove = isActionEnabled('approve');
  const canReject = isActionEnabled('reject');
  const canCancel = isActionEnabled('cancel');

  return (
    <article className="ue-card ue-card-change-preview" aria-label={t.title}>
      <header className="ue-card-header">
        <h3 className="ue-card-title">{t.title}</h3>
        <span className="ue-card-meta">{card.data.targetAsset}</span>
        <PillTag
          label={riskLabel(copy, card.data.risk)}
          variant={riskVariant(card.data.risk)}
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
          <div className="ue-card-pills">
            <PillTag
              label={card.data.rollbackable ? t.rollbackableYes : t.rollbackableNo}
              variant={card.data.rollbackable ? 'success' : 'warning'}
            />
            <PillTag
              label={
                card.data.executionLocation === 'sandbox-copy'
                  ? t.executionSandbox
                  : t.executionCanonical
              }
              variant="info"
            />
            {canApprove && (
              <PillTag label="Awaiting approval" variant="warning" />
            )}
          </div>
          <div className="ue-card-grid">
            <section className="ue-card-section">
              <h4 className="ue-card-section-title">{t.willAdd}</h4>
              <ul className="ue-card-bullet-list">
                {card.data.willAdd.map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
            </section>
            <section className="ue-card-section">
              <h4 className="ue-card-section-title">{t.willNotChange}</h4>
              <ul className="ue-card-bullet-list ue-card-bullet-list-muted">
                {card.data.willNotChange.map((item, index) => (
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
          {(canApprove || canReject || canCancel) && (
            <div className="ue-card-actions" aria-label={copy.ueAgentUi.cards.actionsLabel}>
              {canApprove && (
                <ActionButton
                  label={t.approve}
                  variant="primary"
                  loading={isApproveLoading}
                  disabled={disabled || (isAnyLoading && !isApproveLoading)}
                  onClick={() => onAction?.({ cardId: card.id, actionId: 'approve' })}
                />
              )}
              {canReject && (
                <ActionButton
                  label={t.reject}
                  variant="danger"
                  loading={isRejectLoading}
                  disabled={disabled || (isAnyLoading && !isRejectLoading)}
                  onClick={() => onAction?.({ cardId: card.id, actionId: 'reject' })}
                />
              )}
              {canCancel && (
                <ActionButton
                  label={t.cancel}
                  variant="ghost"
                  loading={isCancelLoading}
                  disabled={disabled || (isAnyLoading && !isCancelLoading)}
                  onClick={() => onAction?.({ cardId: card.id, actionId: 'cancel' })}
                />
              )}
            </div>
          )}
        </>
      ) : (
        <p className="ue-card-summary">
          {t.risk}: {riskLabel(copy, card.data.risk)}
        </p>
      )}
    </article>
  );
}
