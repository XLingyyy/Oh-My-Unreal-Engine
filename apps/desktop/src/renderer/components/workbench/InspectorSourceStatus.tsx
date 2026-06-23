import type { InspectorSourceKind } from './inspectorDataAdapter';
import { useDesktopCopy } from '../../i18n';

export interface InspectorSourceStatusProps {
  source: InspectorSourceKind;
  updatedAt: string | null;
}

export function InspectorSourceStatus({ source, updatedAt }: InspectorSourceStatusProps) {
  const { copy } = useDesktopCopy();
  const t = copy.ueAgentUi.rightInspector;

  const label = sourceLabel(t, source);
  const detail = sourceDetail(t, source);

  return (
    <div
      className="ue-inspector-source-status"
      data-inspector-source={source}
      data-inspector-updated-at={updatedAt ?? ''}
    >
      <span className={`ue-inspector-source-badge ue-inspector-source-badge-${source}`}>
        {label}
      </span>
      <span className="ue-inspector-source-detail">{detail}</span>
      {source === 'cache' && (
        <span className="ue-inspector-source-cache-note">{t.cacheStaleNotice}</span>
      )}
      {updatedAt ? (
        <span className="ue-inspector-source-updated">{t.updatedAtLabel(updatedAt)}</span>
      ) : (
        <span className="ue-inspector-source-updated">{t.noLiveUpdateTime}</span>
      )}
    </div>
  );
}

function sourceLabel(
  t: { sourceLabelLive: string; sourceLabelCache: string; sourceLabelMock: string; sourceLabelUnavailable: string },
  source: InspectorSourceKind,
): string {
  switch (source) {
    case 'live': return t.sourceLabelLive;
    case 'cache': return t.sourceLabelCache;
    case 'mock': return t.sourceLabelMock;
    case 'unavailable': return t.sourceLabelUnavailable;
  }
}

function sourceDetail(
  t: { sourceDetailLive: string; sourceDetailCache: string; sourceDetailMock: string; sourceDetailUnavailable: string },
  source: InspectorSourceKind,
): string {
  switch (source) {
    case 'live': return t.sourceDetailLive;
    case 'cache': return t.sourceDetailCache;
    case 'mock': return t.sourceDetailMock;
    case 'unavailable': return t.sourceDetailUnavailable;
  }
}
