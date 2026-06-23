import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { AgentUiLogEntry, ChangeItem, EvidenceItem } from '@omue/shared-protocol';
import { useDesktopCopy } from '../../i18n';
import { EvidencePanel } from './EvidencePanel';
import { ChangesPanel } from './ChangesPanel';
import { LogsPanel } from './LogsPanel';
import type { InspectorSourceKind } from './inspectorDataAdapter';

type InspectorTab = 'evidence' | 'changes' | 'logs';

const TAB_ORDER: InspectorTab[] = ['evidence', 'changes', 'logs'];

const TAB_IDS: Record<InspectorTab, { tab: string; panel: string }> = {
  evidence: {
    tab: 'ue-inspector-tab-evidence',
    panel: 'ue-inspector-panel-evidence',
  },
  changes: {
    tab: 'ue-inspector-tab-changes',
    panel: 'ue-inspector-panel-changes',
  },
  logs: {
    tab: 'ue-inspector-tab-logs',
    panel: 'ue-inspector-panel-logs',
  },
};

function createEmptyScrollMap(): Record<InspectorTab, number> {
  return { evidence: 0, changes: 0, logs: 0 };
}

function createEmptyPanelMap(): Record<InspectorTab, HTMLDivElement | null> {
  return { evidence: null, changes: null, logs: null };
}

function getRelativeTab(tab: InspectorTab, direction: 1 | -1): InspectorTab {
  const idx = TAB_ORDER.indexOf(tab);
  const nextIdx = (idx + direction + TAB_ORDER.length) % TAB_ORDER.length;
  return TAB_ORDER[nextIdx];
}

export interface RightInspectorProps {
  evidence: { items: EvidenceItem[]; source: InspectorSourceKind; updatedAt: string | null };
  changes: { items: ChangeItem[]; source: InspectorSourceKind; updatedAt: string | null };
  logs: { entries: AgentUiLogEntry[]; source: InspectorSourceKind; updatedAt: string | null };
}

export function RightInspector({
  evidence,
  changes,
  logs,
}: RightInspectorProps) {
  const { copy } = useDesktopCopy();
  const inspectorCopy = copy.ueAgentUi.rightInspector;
  const [activeTab, setActiveTab] = useState<InspectorTab>('evidence');
  const tabRefs = useRef<Record<InspectorTab, HTMLButtonElement | null>>({
    evidence: null,
    changes: null,
    logs: null,
  });
  const panelRefs = useRef<Record<InspectorTab, HTMLDivElement | null>>(createEmptyPanelMap());
  const scrollPositions = useRef<Record<InspectorTab, number>>(createEmptyScrollMap());

  const [developerMode, setDeveloperMode] = useState(false);

  useEffect(() => {
    const panel = panelRefs.current[activeTab];
    if (panel) {
      panel.scrollTop = scrollPositions.current[activeTab] ?? 0;
    }
  }, [activeTab]);

  const captureScroll = useCallback((tab: InspectorTab) => {
    const panel = panelRefs.current[tab];
    if (panel) {
      scrollPositions.current[tab] = panel.scrollTop;
    }
  }, []);

  const focusTab = useCallback((tab: InspectorTab) => {
    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(() => tabRefs.current[tab]?.focus());
      return;
    }
    tabRefs.current[tab]?.focus();
  }, []);

  const selectTab = useCallback(
    (tab: InspectorTab, options: { focus?: boolean } = {}) => {
      setActiveTab(prev => {
        if (prev === tab) {
          return prev;
        }
        captureScroll(prev);
        return tab;
      });
      if (options.focus) {
        focusTab(tab);
      }
    },
    [captureScroll, focusTab],
  );

  const handleTabButtonKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>, tab: InspectorTab) => {
      let nextTab: InspectorTab | null = null;

      if (event.key === 'ArrowRight') {
        nextTab = getRelativeTab(tab, 1);
      } else if (event.key === 'ArrowLeft') {
        nextTab = getRelativeTab(tab, -1);
      } else if (event.key === 'Home') {
        nextTab = TAB_ORDER[0];
      } else if (event.key === 'End') {
        nextTab = TAB_ORDER[TAB_ORDER.length - 1];
      } else if (event.key === 'Enter' || event.key === ' ') {
        nextTab = tab;
      }

      if (nextTab) {
        event.preventDefault();
        event.stopPropagation();
        selectTab(nextTab, { focus: true });
      }
    },
    [selectTab],
  );

  const handleTabClick = useCallback(
    (tab: InspectorTab) => {
      selectTab(tab);
    },
    [selectTab],
  );

  return (
    <aside className="ue-inspector" aria-label={inspectorCopy.regionLabel}>
      <div
        className="ue-inspector-tabs"
        role="tablist"
        aria-label={inspectorCopy.tabsLabel}
      >
        {TAB_ORDER.map(tab => {
          const isActive = activeTab === tab;
          const label = getTabLabel(inspectorCopy, tab);
          const ids = TAB_IDS[tab];
          return (
            <button
              key={tab}
              ref={node => {
                tabRefs.current[tab] = node;
              }}
              type="button"
              role="tab"
              id={ids.tab}
              tabIndex={isActive ? 0 : -1}
              aria-selected={isActive}
              aria-controls={ids.panel}
              className={`ue-inspector-tab${isActive ? ' ue-inspector-tab-active' : ''}`}
              onClick={() => handleTabClick(tab)}
              onKeyDown={event => handleTabButtonKeyDown(event, tab)}
            >
              {label}
            </button>
          );
        })}
      </div>
      {TAB_ORDER.map(tab => {
        const isActive = activeTab === tab;
        const ids = TAB_IDS[tab];
        return (
          <div
            key={tab}
            ref={node => {
              panelRefs.current[tab] = node;
            }}
            role="tabpanel"
            id={ids.panel}
            aria-labelledby={ids.tab}
            hidden={!isActive}
            className="ue-inspector-content"
          >
            {tab === 'evidence' && (
              <EvidencePanel
                items={evidence.items}
                source={evidence.source}
                updatedAt={evidence.updatedAt}
              />
            )}
            {tab === 'changes' && (
              <ChangesPanel
                items={changes.items}
                source={changes.source}
                updatedAt={changes.updatedAt}
              />
            )}
            {tab === 'logs' && (
              <LogsPanel
                entries={logs.entries}
                source={logs.source}
                updatedAt={logs.updatedAt}
                developerMode={developerMode}
                onDeveloperModeChange={setDeveloperMode}
              />
            )}
          </div>
        );
      })}
    </aside>
  );
}

function getTabLabel(
  copy: { tabEvidence: string; tabChanges: string; tabLogs: string },
  tab: InspectorTab,
): string {
  if (tab === 'evidence') return copy.tabEvidence;
  if (tab === 'changes') return copy.tabChanges;
  return copy.tabLogs;
}
