import type { ChangeItem } from '@omue/shared-protocol';
import { useDesktopCopy } from '../../i18n';
import type { InspectorPanelMode } from './inspectorDataAdapter';

export interface ChangesPanelProps {
  items: ChangeItem[];
  mode: InspectorPanelMode;
}

type StageKey = 'before' | 'preview' | 'sandbox-applied' | 'promoted';

const STAGE_ORDER: StageKey[] = ['before', 'preview', 'sandbox-applied', 'promoted'];

function statusLabelKey(status: ChangeItem['status']): 'statusPending' | 'statusApplied' | 'statusRolledBack' | 'statusFailed' {
  if (status === 'applied') return 'statusApplied';
  if (status === 'rolled-back') return 'statusRolledBack';
  if (status === 'failed') return 'statusFailed';
  return 'statusPending';
}

function changeKindKey(kind: ChangeItem['changes'][number]['kind']): 'kindAdd' | 'kindRemove' | 'kindModify' {
  if (kind === 'add') return 'kindAdd';
  if (kind === 'remove') return 'kindRemove';
  return 'kindModify';
}

export function ChangesPanel({ items, mode }: ChangesPanelProps) {
  const { copy } = useDesktopCopy();
  const t = copy.ueAgentUi.rightInspector.changes;

  if (mode === 'degraded') {
    return (
      <div className="ue-inspector-empty ue-inspector-degraded">
        <p className="ue-inspector-empty-title">{copy.ueAgentUi.rightInspector.degradedTitle}</p>
        <p className="ue-inspector-empty-body">{copy.ueAgentUi.rightInspector.degradedBody}</p>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="ue-inspector-empty">
        <p className="ue-inspector-empty-title">{copy.ueAgentUi.rightInspector.emptyTitle}</p>
        <p className="ue-inspector-empty-body">{t.emptyBody}</p>
      </div>
    );
  }

  const grouped = new Map<StageKey, ChangeItem[]>();
  for (const stage of STAGE_ORDER) grouped.set(stage, []);
  for (const item of items) {
    if (grouped.has(item.stage)) {
      grouped.get(item.stage)!.push(item);
    }
  }

  return (
    <div className="ue-inspector-pane">
      <header className="ue-inspector-pane-header">
        <h3 className="ue-inspector-pane-title">{t.title}</h3>
        <p className="ue-inspector-pane-subtitle">{t.subtitle}</p>
      </header>
      <ol className="ue-inspector-changes-stages">
        {STAGE_ORDER.map((stage) => {
          const stageItems = grouped.get(stage) ?? [];
          if (stageItems.length === 0) return null;
          return (
            <li key={stage} className={`ue-inspector-changes-stage ue-inspector-changes-stage-${stage}`}>
              <div className="ue-inspector-changes-stage-header">
                <h4 className="ue-inspector-changes-stage-title">
                  {t[`stage_${stage.replace('-', '_')}` as keyof typeof t] as string}
                </h4>
              </div>
              <ul className="ue-inspector-changes-items">
                {stageItems.map((item) => (
                  <li key={item.id} className="ue-inspector-change-item">
                    <div className="ue-inspector-change-row">
                      <span className="ue-inspector-change-target">{item.targetAsset}</span>
                      <span className={`ue-inspector-change-status ue-inspector-change-status-${item.status}`}>
                        {t[statusLabelKey(item.status)]}
                      </span>
                    </div>
                    <ul className="ue-inspector-change-list">
                      {item.changes.map((change, idx) => (
                        <li
                          key={`${item.id}-${idx}`}
                          className={`ue-inspector-change-kind ue-inspector-change-kind-${change.kind}`}
                        >
                          <span className="ue-inspector-change-kind-tag">
                            {t[changeKindKey(change.kind)]}
                          </span>
                          <span className="ue-inspector-change-summary">{change.summary}</span>
                        </li>
                      ))}
                    </ul>
                    <div className="ue-inspector-change-meta">
                      <span>
                        {t.rollbackableLabel}:{' '}
                        {item.rollbackable ? t.rollbackableYes : t.rollbackableNo}
                      </span>
                      {item.appliedAt && (
                        <span>
                          {t.appliedAtLabel}: {item.appliedAt}
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
