import { useState } from 'react';
import type { DiagnosisData, AgentCardAction, AgentCardBase } from '@omue/shared-protocol';
import { useDesktopCopy } from '../../../i18n';
import type { DesktopCopy } from '../../../i18n/types';
import { PillTag } from '../PillTag';
import { ActionButton } from '../ActionButton';

export interface DiagnosisCardProps {
  card: AgentCardBase & { data: DiagnosisData };
  onAction?: (action: AgentCardAction) => void;
  isActionEnabled?: (actionId: AgentCardAction['actionId']) => boolean;
}

function confidenceLabel(copy: DesktopCopy, level: DiagnosisData['confidence']): string {
  const t = copy.ueAgentUi.cards.diagnosis;
  if (level === 'high') return t.confidenceHigh;
  if (level === 'medium') return t.confidenceMedium;
  return t.confidenceLow;
}

function riskVariant(level: DiagnosisData['risk']): 'success' | 'warning' | 'danger' {
  if (level === 'low') return 'success';
  if (level === 'medium') return 'warning';
  return 'danger';
}

function riskLabel(copy: DesktopCopy, level: DiagnosisData['risk']): string {
  const t = copy.ueAgentUi.cards.diagnosis;
  if (level === 'low') return t.riskLow;
  if (level === 'medium') return t.riskMedium;
  return t.riskHigh;
}

export function DiagnosisCard({ card, onAction, isActionEnabled }: DiagnosisCardProps) {
  const { copy } = useDesktopCopy();
  const t = copy.ueAgentUi.cards.diagnosis;
  const cards = copy.ueAgentUi.cards;
  const [collapsed, setCollapsed] = useState(Boolean(card.collapsed));

  return (
    <article className="ue-card ue-card-diagnosis" aria-label={t.title}>
      <header className="ue-card-header">
        <h3 className="ue-card-title">{t.title}</h3>
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
          <dl className="ue-card-dl">
            <div>
              <dt>{t.conclusion}</dt>
              <dd>{card.data.conclusion}</dd>
            </div>
            <div>
              <dt>{t.reason}</dt>
              <dd>{card.data.reason}</dd>
            </div>
            <div>
              <dt>{t.impact}</dt>
              <dd>{card.data.impact}</dd>
            </div>
          </dl>
          <div className="ue-card-pills">
            <PillTag label={confidenceLabel(copy, card.data.confidence)} variant="info" />
            <PillTag label={t.evidenceCount(card.data.evidenceCount)} variant="default" />
          </div>
          <div className="ue-card-actions" aria-label={copy.ueAgentUi.cards.actionsLabel}>
            <ActionButton
              label={t.viewEvidence}
              variant="secondary"
              disabled={!isActionEnabled?.('view-evidence')}
              ariaLabel={cards.viewEvidenceDisabledHint}
              onClick={() => onAction?.({ cardId: card.id, actionId: 'view-evidence' })}
            />
          </div>
        </>
      ) : (
        <p className="ue-card-summary">{card.data.conclusion}</p>
      )}
    </article>
  );
}
