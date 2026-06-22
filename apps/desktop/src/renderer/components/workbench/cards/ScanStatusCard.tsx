import { useState } from 'react';
import type {
  AgentLoopState,
  ScanStatusData,
  AgentCardAction,
  AgentCardBase,
} from '@omue/shared-protocol';
import { useDesktopCopy } from '../../../i18n';

export interface ScanStatusCardProps {
  card: AgentCardBase & { data: ScanStatusData };
  onAction?: (action: AgentCardAction) => void;
}

export function ScanStatusCard({ card }: ScanStatusCardProps) {
  const { copy } = useDesktopCopy();
  const t = copy.ueAgentUi.cards.scanStatus;
  const cards = copy.ueAgentUi.cards;
  const title = card.title === 'Asset repair progress'
    ? t.assetTitle
    : t.projectTitle;
  const durationSec = card.data.durationMs
    ? (card.data.durationMs / 1000).toFixed(1)
    : null;
  const [collapsed, setCollapsed] = useState(Boolean(card.collapsed));
  const stateLabels: Record<AgentLoopState, string> = copy.agentTransition.state;
  const terminalLabels: Record<string, string> = {
    done: t.done,
    escalated: t.escalated,
    rejected: t.rejected,
    cancelled: t.cancelled,
    failed: t.failed,
    interrupted: t.interrupted,
  };
  const stepLabel = (label: string) =>
    terminalLabels[label] ?? stateLabels[label as AgentLoopState] ?? label;

  return (
    <article className="ue-card ue-card-scan" aria-label={title}>
      <header className="ue-card-header">
        <h3 className="ue-card-title">{title}</h3>
        <span className="ue-card-meta">
          {card.data.scannedResources > 0
            ? t.scannedResources(card.data.scannedResources)
            : t.progressRecorded}
          {durationSec !== null && t.durationSuffix(durationSec)}
        </span>
        <button
          type="button"
          className="ue-card-toggle"
          aria-expanded={!collapsed}
          aria-label={collapsed ? cards.expandAria : cards.collapseAria}
          onClick={() => setCollapsed((prev) => !prev)}
        >
          {collapsed ? cards.expandAria : cards.collapseAria}
        </button>
      </header>
      {!collapsed && (
        <ol className="ue-card-steps">
          {card.data.steps.map((step, index) => (
            <li
              key={`${step.label}-${index}`}
              className={`ue-card-step ue-card-step-${step.state}`}
            >
              <span className="ue-card-step-dot" aria-hidden="true" />
              <span className="ue-card-step-label">{stepLabel(step.label)}</span>
            </li>
          ))}
        </ol>
      )}
    </article>
  );
}
