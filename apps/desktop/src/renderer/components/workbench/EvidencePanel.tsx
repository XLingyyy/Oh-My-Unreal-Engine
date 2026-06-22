import { useState } from 'react';
import type { EvidenceItem } from '@omue/shared-protocol';
import { useDesktopCopy } from '../../i18n';
import type { InspectorPanelMode } from './inspectorDataAdapter';

export interface EvidencePanelProps {
  items: EvidenceItem[];
  mode: InspectorPanelMode;
}

function statusLabelKey(status: EvidenceItem['status']): 'statusNormal' | 'statusWarning' | 'statusError' {
  if (status === 'warning') return 'statusWarning';
  if (status === 'error') return 'statusError';
  return 'statusNormal';
}

export function EvidencePanel({ items, mode }: EvidencePanelProps) {
  const { copy } = useDesktopCopy();
  const t = copy.ueAgentUi.rightInspector;
  const evidence = t.evidence;
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  if (mode === 'degraded') {
    return (
      <div className="ue-inspector-empty ue-inspector-degraded">
        <p className="ue-inspector-empty-title">{t.degradedTitle}</p>
        <p className="ue-inspector-empty-body">{t.degradedBody}</p>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="ue-inspector-empty">
        <p className="ue-inspector-empty-title">{t.emptyTitle}</p>
        <p className="ue-inspector-empty-body">{evidence.emptyBody}</p>
      </div>
    );
  }

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="ue-inspector-pane">
      <header className="ue-inspector-pane-header">
        <h3 className="ue-inspector-pane-title">{evidence.title}</h3>
        <p className="ue-inspector-pane-subtitle">{evidence.subtitle(items.length)}</p>
      </header>
      <ul className="ue-inspector-evidence-list">
        {items.map((item) => {
          const isOpen = expanded.has(item.id);
          const statusKey = statusLabelKey(item.status);
          const hasDetails = !!item.details;
          return (
            <li
              key={item.id}
              className={`ue-inspector-evidence-item ue-inspector-evidence-${item.status}`}
            >
              <div className="ue-inspector-evidence-summary">
                <div className="ue-inspector-evidence-name-row">
                  <span className="ue-inspector-evidence-name">{item.assetName}</span>
                  <span className={`ue-inspector-evidence-status ue-inspector-evidence-status-${item.status}`}>
                    {evidence[statusKey]}
                  </span>
                </div>
                <p className="ue-inspector-evidence-path">{item.assetPath}</p>
                <p className="ue-inspector-evidence-finding">{item.finding}</p>
                {hasDetails && (
                  <button
                    type="button"
                    className="ue-inspector-evidence-toggle"
                    aria-expanded={isOpen}
                    aria-controls={`ue-inspector-evidence-details-${item.id}`}
                    aria-label={evidence.ariaToggleDetails(item.assetName, isOpen)}
                    onClick={() => toggle(item.id)}
                  >
                    {isOpen ? evidence.collapseDetails : evidence.expandDetails}
                  </button>
                )}
              </div>
              {hasDetails && isOpen && item.details && (
                <dl
                  id={`ue-inspector-evidence-details-${item.id}`}
                  className="ue-inspector-evidence-details"
                >
                  <div>
                    <dt>{evidence.inspected}</dt>
                    <dd>{item.details.inspected}</dd>
                  </div>
                  <div>
                    <dt>{evidence.result}</dt>
                    <dd>{item.details.result}</dd>
                  </div>
                  {item.details.relatedPath && (
                    <div>
                      <dt>{evidence.relatedPath}</dt>
                      <dd>{item.details.relatedPath}</dd>
                    </div>
                  )}
                  <div>
                    <dt>{evidence.anomaly}</dt>
                    <dd>{item.details.isAnomaly ? evidence.anomalyYes : evidence.anomalyNo}</dd>
                  </div>
                </dl>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
