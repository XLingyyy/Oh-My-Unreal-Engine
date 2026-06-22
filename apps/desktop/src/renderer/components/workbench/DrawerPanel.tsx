import {
  useCallback,
  useEffect,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import type { useAgentWorkbenchState } from '../../hooks/useAgentWorkbenchState';
import {
  DRAWER_ITEM_IDS,
  type DrawerItem,
} from '../../hooks/drawerNavigation';
import { useDesktopCopy } from '../../i18n';
import type { BridgeClient } from '../../services';
import { InvestigationSessionPanel } from '../InvestigationSessionPanel';
import { InvestigationQueuePanel } from '../InvestigationQueuePanel';
import { InvestigationQuestionMatrixPanel } from '../InvestigationQuestionMatrixPanel';
import { InvestigationHandoffPanel } from '../InvestigationHandoffPanel';
import { InfrastructureClosurePanel } from '../InfrastructureClosurePanel';
import ChangePlanPackageWorkspace from '../ChangePlanPackageWorkspace';
import BlueprintChangeWorkspacePanel from '../BlueprintChangeWorkspacePanel';
import { MOCK_BB_DIAGNOSTIC_SUMMARY } from '../BehaviorTreeBlackboardDiagnosticPanel';

type WorkbenchState = ReturnType<typeof useAgentWorkbenchState>;

interface DrawerPanelProps {
  state: WorkbenchState;
  client: BridgeClient;
  isCommandPaletteOpen: boolean;
}

export function DrawerPanel({ state, isCommandPaletteOpen }: DrawerPanelProps) {
  const { copy } = useDesktopCopy();
  const snapshot = state.bridge.snapshot;
  const drawer = state.drawer;
  const investigation = state.investigation;
  const context = state.context;
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const wasOpenRef = useRef(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const tabRefs = useRef<Partial<Record<DrawerItem, HTMLButtonElement | null>>>({});

  const closeDrawer = useCallback(() => {
    drawer.closeDrawer();
  }, [drawer.closeDrawer]);

  useEffect(() => {
    if (drawer.isDrawerOpen) {
      if (wasOpenRef.current) return;
      wasOpenRef.current = true;
      const frame = window.requestAnimationFrame(() => {
        previousFocusRef.current =
          document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null;
        if (snapshot) {
          tabRefs.current[drawer.activeDrawerItem]?.focus();
        } else {
          closeButtonRef.current?.focus();
        }
      });
      return () => window.cancelAnimationFrame(frame);
    }

    if (!wasOpenRef.current) return;
    wasOpenRef.current = false;
    const previousFocus = previousFocusRef.current;
    previousFocusRef.current = null;
    if (previousFocus?.isConnected) {
      previousFocus.focus();
      return;
    }
    document
      .querySelector<HTMLElement>('[data-workbench-chat-input], .workbench-root')
      ?.focus();
  }, [
    drawer.activeDrawerItem,
    drawer.isDrawerOpen,
    snapshot,
  ]);

  useEffect(() => {
    if (!drawer.isDrawerOpen || !snapshot) return;
    const frame = window.requestAnimationFrame(() => {
      tabRefs.current[drawer.activeDrawerItem]?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [drawer.activeDrawerItem, drawer.isDrawerOpen, snapshot]);

  useEffect(() => {
    if (!drawer.isDrawerOpen || isCommandPaletteOpen) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        closeDrawer();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [closeDrawer, drawer.isDrawerOpen, isCommandPaletteOpen]);

  const activateDrawerItem = useCallback((item: DrawerItem) => {
    drawer.setActiveDrawerItem(item);
    window.requestAnimationFrame(() => tabRefs.current[item]?.focus());
  }, [drawer.setActiveDrawerItem]);

  const handleTabKeyDown = useCallback((
    event: ReactKeyboardEvent<HTMLButtonElement>,
    item: DrawerItem,
  ) => {
    const currentIndex = DRAWER_ITEM_IDS.indexOf(item);
    let nextIndex: number | null = null;

    if (event.key === 'ArrowLeft') {
      nextIndex = (currentIndex - 1 + DRAWER_ITEM_IDS.length) % DRAWER_ITEM_IDS.length;
    } else if (event.key === 'ArrowRight') {
      nextIndex = (currentIndex + 1) % DRAWER_ITEM_IDS.length;
    } else if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = DRAWER_ITEM_IDS.length - 1;
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      activateDrawerItem(item);
      return;
    }

    if (nextIndex === null) return;
    event.preventDefault();
    const nextItem = DRAWER_ITEM_IDS[nextIndex];
    if (nextItem) activateDrawerItem(nextItem);
  }, [activateDrawerItem]);

  if (!drawer.isDrawerOpen) return null;

  const content = !snapshot ? (
    <div className="wb-drawer-no-context">
      <strong>{copy.ueAgentUi.drawer.noContextTitle}</strong>
      <p>{copy.ueAgentUi.drawer.noContextDetail}</p>
    </div>
  ) : drawer.activeDrawerItem === 'session-notes' ? (
    <InvestigationSessionPanel
      snapshot={snapshot}
      evidenceChains={investigation.evidenceChains}
      graphDetail={context.graphDetail}
      nodeEvidenceMap={investigation.nodeEvidenceMap}
      queueItems={investigation.queueItems}
      queueSessionNotes={investigation.sessionNotes}
      selectedGraphId={context.selectedGraphId}
      lastUpdatedAt={state.bridge.lastUpdatedAt}
      onOpenPanel={(panel) => {
        if (panel === 'queue') drawer.setActiveDrawerItem('queue');
        if (panel === 'handoff') drawer.setActiveDrawerItem('handoff');
      }}
      investigationReview={investigation.investigationReview}
      onReviewChange={investigation.handleReviewChange}
      onClearReview={investigation.handleClearReview}
    />
  ) : drawer.activeDrawerItem === 'queue' ? (
    <InvestigationQueuePanel
      items={investigation.queueItems}
      sessionNotes={investigation.sessionNotes}
      onSessionNotesChange={investigation.setSessionNotes}
      onUpdateItem={investigation.handleUpdateQueueItem}
      onRemoveItem={investigation.handleRemoveQueueItem}
      onClearAll={investigation.handleClearQueue}
      capturedAt={snapshot.capturedAt}
      currentAssetSummary={investigation.currentAssetSummary}
    />
  ) : drawer.activeDrawerItem === 'questions' ? (
    <InvestigationQuestionMatrixPanel
      snapshot={snapshot}
      evidenceChains={investigation.evidenceChains}
      graphDetail={context.graphDetail}
      nodeEvidenceMap={investigation.nodeEvidenceMap}
      queueItems={investigation.queueItems}
      queueSessionNotes={investigation.sessionNotes}
      investigationReview={investigation.investigationReview}
      lastUpdatedAt={state.bridge.lastUpdatedAt}
      questionMatrixState={investigation.questionMatrixState}
      onEntryUpdate={investigation.handleQuestionMatrixUpdate}
      onReset={investigation.handleQuestionMatrixReset}
    />
  ) : drawer.activeDrawerItem === 'handoff' ? (
    <InvestigationHandoffPanel
      snapshot={snapshot}
      evidenceChains={investigation.evidenceChains}
      graphDetail={context.graphDetail}
      nodeEvidenceMap={investigation.nodeEvidenceMap}
      queueItems={investigation.queueItems}
      queueSessionNotes={investigation.sessionNotes}
      currentAssetSummary={investigation.currentAssetSummary}
      lastUpdatedAt={state.bridge.lastUpdatedAt}
      selectedGraphId={context.selectedGraphId}
      deltaBaselineCapturedAt={investigation.deltaBaseline?.capturedAt ?? null}
      investigationReview={investigation.investigationReview}
      questionMatrixState={investigation.questionMatrixState}
      closureState={investigation.closureState}
      btBbDiagnosticSummary={MOCK_BB_DIAGNOSTIC_SUMMARY}
    />
  ) : drawer.activeDrawerItem === 'closure' ? (
    <InfrastructureClosurePanel
      snapshot={snapshot}
      evidenceChains={investigation.evidenceChains}
      graphDetail={context.graphDetail}
      nodeEvidenceMap={investigation.nodeEvidenceMap}
      queueItems={investigation.queueItems}
      investigationReview={investigation.investigationReview}
      questionMatrixState={investigation.questionMatrixState}
      lastUpdatedAt={state.bridge.lastUpdatedAt}
      closureState={investigation.closureState}
      onClosureChange={investigation.handleClosureChange}
      onReset={investigation.handleClosureReset}
    />
  ) : drawer.activeDrawerItem === 'change-plan' ? (
    <ChangePlanPackageWorkspace />
  ) : drawer.activeDrawerItem === 'bp-change-workspace' ? (
    <BlueprintChangeWorkspacePanel />
  ) : (
    <div className="wb-empty">{copy.ueAgentUi.drawer.noContextDetail}</div>
  );

  return (
    <div className="wb-drawer-layer">
      <button
        type="button"
        className="wb-drawer-scrim"
        aria-label={copy.ueAgentUi.drawer.closeAria}
        onClick={closeDrawer}
      />
      <aside
        className="wb-drawer-panel"
        role="dialog"
        aria-modal="true"
        aria-label={copy.ueAgentUi.drawer.dialogLabel}
        data-active-drawer-item={drawer.activeDrawerItem}
      >
        <div className="wb-drawer-header">
          {snapshot ? (
            <div
              className="wb-drawer-tabs"
              role="tablist"
              aria-label={copy.ueAgentUi.drawer.dialogLabel}
            >
              {DRAWER_ITEM_IDS.map(id => (
                <button
                  key={id}
                  ref={element => {
                    tabRefs.current[id] = element;
                  }}
                  id={`workbench-drawer-tab-${id}`}
                  type="button"
                  role="tab"
                  data-drawer-item={id}
                  className={drawer.activeDrawerItem === id ? 'wb-drawer-tab wb-drawer-tab-active' : 'wb-drawer-tab'}
                  tabIndex={drawer.activeDrawerItem === id ? 0 : -1}
                  aria-selected={drawer.activeDrawerItem === id}
                  aria-controls="workbench-drawer-content"
                  onKeyDown={event => handleTabKeyDown(event, id)}
                  onClick={() => activateDrawerItem(id)}
                >
                  {copy.ueAgentUi.drawer.items[id]}
                </button>
              ))}
            </div>
          ) : (
            <div className="wb-drawer-header-spacer" />
          )}
          <button
            ref={closeButtonRef}
            type="button"
            className="wb-title-button"
            aria-label={copy.ueAgentUi.drawer.closeAria}
            onClick={closeDrawer}
          >
            ×
          </button>
        </div>
        <div
          id="workbench-drawer-content"
          className="wb-drawer-content"
          role={snapshot ? 'tabpanel' : undefined}
          aria-labelledby={
            snapshot
              ? `workbench-drawer-tab-${drawer.activeDrawerItem}`
              : undefined
          }
        >
          {content}
        </div>
      </aside>
    </div>
  );
}
