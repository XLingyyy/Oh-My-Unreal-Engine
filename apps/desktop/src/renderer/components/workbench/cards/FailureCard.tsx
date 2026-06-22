import type { FailureData, AgentCardBase } from '@omue/shared-protocol';
import { useDesktopCopy } from '../../../i18n';
import type { FailureRecoveryMode, SafeFailureDetails } from '../agentCardMapper';
import { ActionButton } from '../ActionButton';

export interface FailureRecoveryAction {
  mode: FailureRecoveryMode;
  onRecover: () => void;
  disabled?: boolean;
}

export interface FailureCardProps {
  card: AgentCardBase & { data: FailureData };
  recoveryAction?: FailureRecoveryAction;
}

function detailValue(value: unknown): string {
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

export function FailureCard({ card, recoveryAction }: FailureCardProps) {
  const { copy } = useDesktopCopy();
  const t = copy.ueAgentUi.cards.failure;
  const details = card.data.details as SafeFailureDetails | undefined;
  const detailEntries = details ? Object.entries(details) : [];
  const recoveryLabel = recoveryAction?.mode === 'resume'
    ? t.resume
    : t.retryAsNewSession;
  const nextStep = recoveryAction?.mode === 'resume'
    ? t.resumeNextStep
    : recoveryAction?.mode === 'retry-new'
      ? t.retryNextStep
      : card.data.recoverable
        ? t.recoverableNextStep
        : t.nonRecoverableNextStep;
  return (
    <article className="ue-card ue-card-failure" aria-label={t.failedTitle}>
      <header className="ue-card-header">
        <h3 className="ue-card-title">{t.failedTitle}</h3>
        <span className="ue-card-meta">{card.data.errorCode}</span>
      </header>
      <p className="ue-card-summary">{card.data.message}</p>
      <div className="ue-card-pills">
        <span className="ue-card-pill">{card.data.scope}</span>
        <span className="ue-card-pill">
          {card.data.recoverable ? t.recoverableYes : t.recoverableNo}
        </span>
      </div>
      {detailEntries.length > 0 && (
        <section className="ue-card-section">
          <h4 className="ue-card-section-title">{t.detailsTitle}</h4>
          <dl className="ue-card-dl ue-card-failure-details">
            {detailEntries.map(([key, value]) => (
              <div key={key}>
                <dt>{key}</dt>
                <dd>{detailValue(value)}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
      <section className="ue-card-section">
        <h4 className="ue-card-section-title">{t.nextStep}</h4>
        <p className="ue-card-summary">{nextStep}</p>
      </section>
      {recoveryAction && recoveryAction.mode !== 'none' && (
        <div className="ue-card-actions" aria-label={copy.ueAgentUi.cards.actionsLabel}>
          <ActionButton
            label={recoveryLabel}
            variant="primary"
            disabled={recoveryAction.disabled}
            onClick={recoveryAction.onRecover}
          />
        </div>
      )}
    </article>
  );
}
