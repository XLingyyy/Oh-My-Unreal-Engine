import { useState, useEffect } from 'react';
import type { AgentUiLogEntry } from '@omue/shared-protocol';
import { useDesktopCopy } from '../../i18n';
import { AdvancedInspector } from './AdvancedInspector';
import { InspectorSourceStatus } from './InspectorSourceStatus';
import type { InspectorSourceKind } from './inspectorDataAdapter';

export interface LogsPanelProps {
  entries: AgentUiLogEntry[];
  source: InspectorSourceKind;
  updatedAt: string | null;
  developerMode?: boolean;
  onDeveloperModeChange?: (value: boolean) => void;
}

type LevelKey = 'levelInfo' | 'levelWarn' | 'levelError' | 'levelDebug';

function levelKey(level: AgentUiLogEntry['level']): LevelKey {
  if (level === 'warn') return 'levelWarn';
  if (level === 'error') return 'levelError';
  if (level === 'debug') return 'levelDebug';
  return 'levelInfo';
}

function sourceKey(source: AgentUiLogEntry['source']): 'sourceToolCall' | 'sourceCompile' | 'sourcePie' | 'sourceAgentState' | 'sourceBridge' {
  if (source === 'tool-call') return 'sourceToolCall';
  if (source === 'compile') return 'sourceCompile';
  if (source === 'pie') return 'sourcePie';
  if (source === 'agent-state') return 'sourceAgentState';
  return 'sourceBridge';
}

export function LogsPanel({
  entries,
  source,
  updatedAt,
  developerMode = false,
  onDeveloperModeChange,
}: LogsPanelProps) {
  const { copy } = useDesktopCopy();
  const t = copy.ueAgentUi.rightInspector.logs;
  const [openPayload, setOpenPayload] = useState<Set<string>>(() => new Set());

  const showDevControls = source === 'mock' && typeof onDeveloperModeChange === 'function';

  useEffect(() => {
    if (source !== 'mock' && typeof onDeveloperModeChange === 'function') {
      onDeveloperModeChange(false);
    }
  }, [source, onDeveloperModeChange]);

  const togglePayload = (id: string) => {
    setOpenPayload((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="ue-inspector-pane">
      <InspectorSourceStatus source={source} updatedAt={updatedAt} />
      {showDevControls && (
        <div className="ue-inspector-dev-toggle-row">
          <label className="ue-inspector-dev-toggle">
            <input
              type="checkbox"
              checked={developerMode}
              onChange={(event) => onDeveloperModeChange!(event.target.checked)}
            />
            <span data-inspector-mock-dev="true">{t.developerModeLabel}</span>
          </label>
          <span className="ue-inspector-mock-only-note" data-inspector-mock-dev="true">
            {copy.ueAgentUi.rightInspector.mockOnlyDevNotice}
          </span>
        </div>
      )}
      {showDevControls && developerMode && <AdvancedInspector />}
      {entries.length === 0 ? (
        <div className="ue-inspector-empty">
          <p className="ue-inspector-empty-title">{copy.ueAgentUi.rightInspector.emptyTitle}</p>
          <p className="ue-inspector-empty-body">
            {source === 'unavailable' ? t.emptyBodyUnavailable :
             source === 'mock' ? t.emptyBodyMock :
             t.emptyBodyLiveCache}
          </p>
        </div>
      ) : (
        <>
          <header className="ue-inspector-pane-header">
            <h3 className="ue-inspector-pane-title">{t.title}</h3>
            <p className="ue-inspector-pane-subtitle">{t.subtitle(entries.length)}</p>
          </header>
          <ol className="ue-inspector-log-list">
            {entries.map((entry) => {
              const payloadOpen = openPayload.has(entry.id);
              const hasPayload = typeof entry.payload === 'string' && entry.payload.length > 0;
              return (
                <li
                  key={entry.id}
                  className={`ue-inspector-log-entry ue-inspector-log-${entry.level}`}
                >
                  <div className="ue-inspector-log-row">
                    <span className={`ue-inspector-log-level ue-inspector-log-level-${entry.level}`}>
                      {t[levelKey(entry.level)]}
                    </span>
                    <span className="ue-inspector-log-source">
                      {t[sourceKey(entry.source)]}
                    </span>
                    <span className="ue-inspector-log-timestamp">{entry.timestamp}</span>
                  </div>
                  <p className="ue-inspector-log-message">{entry.message}</p>
                  {hasPayload && (
                    <button
                      type="button"
                      className="ue-inspector-log-toggle"
                      aria-expanded={payloadOpen}
                      aria-controls={`ue-inspector-log-payload-${entry.id}`}
                      aria-label={t.ariaTogglePayload(entry.id, payloadOpen)}
                      onClick={() => togglePayload(entry.id)}
                    >
                      {payloadOpen ? t.collapsePayload : t.expandPayload}
                    </button>
                  )}
                  {hasPayload && payloadOpen && (
                    <pre
                      id={`ue-inspector-log-payload-${entry.id}`}
                      className="ue-inspector-log-payload"
                    >
                      <code>{entry.payload}</code>
                    </pre>
                  )}
                </li>
              );
            })}
          </ol>
        </>
      )}
    </div>
  );
}
