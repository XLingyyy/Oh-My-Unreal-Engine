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
import { InvestigationSessionPanel } from '../InvestigationSessionPanel';
import { InvestigationQueuePanel } from '../InvestigationQueuePanel';
import { InvestigationQuestionMatrixPanel } from '../InvestigationQuestionMatrixPanel';
import { InvestigationHandoffPanel } from '../InvestigationHandoffPanel';
import { InfrastructureClosurePanel } from '../InfrastructureClosurePanel';
import ChangePlanPackageWorkspace from '../ChangePlanPackageWorkspace';
import BlueprintChangeWorkspacePanel from '../BlueprintChangeWorkspacePanel';
import { MOCK_BB_DIAGNOSTIC_SUMMARY } from '../BehaviorTreeBlackboardDiagnosticPanel';
import { buildHandoffSourceModel } from './handoffSourceAdapter';
import {
  DrawerSourceStatus,
  DrawerUnavailableState,
} from './DrawerSourceStatus';
import type {
  DrawerFactualSourceModel,
  DrawerPageAuthority,
} from './drawerFactualSourceAdapter';

type WorkbenchState = ReturnType<typeof useAgentWorkbenchState>;

interface DrawerPanelProps {
  state: WorkbenchState;
  isMockClient: boolean;
  isCommandPaletteOpen: boolean;
  sourceModel: DrawerFactualSourceModel;
}

export function DrawerPanel({
  state,
  isMockClient,
  isCommandPaletteOpen,
  sourceModel,
}: DrawerPanelProps) {
  const { copy } = useDesktopCopy();
  const snapshot = state.bridge.snapshot;
  const drawer = state.drawer;
  const investigation = state.investigation;
  const context = state.context;
  const sourceBoundary = copy.ueAgentUi.drawer.sourceBoundary;
  const handoffSourceModel = buildHandoffSourceModel({
    isMockClient,
    snapshot,
    bridgeError: state.bridge.error,
    selectedSession: state.agent.selectedSession,
    pendingApproval: state.agent.selectedApproval ?? null,
    graphDetail: context.graphDetail,
    queueItemCount: investigation.queueItems.length,
    btBlackboardSummary: isMockClient ? MOCK_BB_DIAGNOSTIC_SUMMARY : null,
  });
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
        tabRefs.current[drawer.activeDrawerItem]?.focus();
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
  ]);

  useEffect(() => {
    if (!drawer.isDrawerOpen) return;
    const frame = window.requestAnimationFrame(() => {
      tabRefs.current[drawer.activeDrawerItem]?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [drawer.activeDrawerItem, drawer.isDrawerOpen]);

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

  const sourceAuthorityForItem = (
    item: DrawerItem,
  ): DrawerPageAuthority | null => {
    if (item === 'questions') return sourceModel.pages.questions;
    if (item === 'closure') return sourceModel.pages.closure;
    if (item === 'change-plan') return sourceModel.pages.changePlan;
    if (item === 'bp-change-workspace') {
      return sourceModel.pages.blueprintChangeWorkspace;
    }
    return null;
  };

  const renderQuestionsContent = () => {
    const authority = sourceModel.pages.questions;
    return (
      <section className="wb-drawer-factual-page">
        <DrawerSourceStatus authority={authority} copy={sourceBoundary} />
        {authority.kind === 'unavailable' ? (
          <DrawerUnavailableState
            title={sourceBoundary.questionsNoLiveData}
            detail={sourceBoundary.reasons[authority.reason]}
          />
        ) : (
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
            includeMockBtBlackboardQuestions={authority.kind === 'mock'}
            noQuestionsText={
              authority.kind === 'mock'
                ? undefined
                : sourceBoundary.questionsNoLiveData
            }
            onEntryUpdate={investigation.handleQuestionMatrixUpdate}
            onReset={investigation.handleQuestionMatrixReset}
          />
        )}
      </section>
    );
  };

  const closureAuthority = sourceModel.pages.closure;
  const renderClosureContent = () => (
    <section className="wb-drawer-factual-page">
      <DrawerSourceStatus authority={closureAuthority} copy={sourceBoundary} />
      {closureAuthority.kind === 'mock' && snapshot ? (
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
      ) : closureAuthority.kind === 'persisted-real' && sourceModel.persistedClosure ? (
        <div className="wb-drawer-persisted-facts">
          <h3>{sourceBoundary.persistedClosureTitle}</h3>
          <dl className="wb-drawer-fact-list">
            <div><dt>{sourceBoundary.sessionIdLabel}</dt><dd>{sourceModel.persistedClosure.sessionId}</dd></div>
            <div><dt>{sourceBoundary.scopeLabel}</dt><dd>{sourceModel.persistedClosure.scope}</dd></div>
            <div><dt>{sourceBoundary.stateLabel}</dt><dd>{sourceModel.persistedClosure.currentState}</dd></div>
            <div><dt>{sourceBoundary.updatedAtLabel}</dt><dd>{sourceModel.persistedClosure.updatedAt}</dd></div>
            <div><dt>{sourceBoundary.closedAtLabel}</dt><dd>{sourceModel.persistedClosure.closedAt ?? sourceBoundary.notRecordedLabel}</dd></div>
            <div><dt>{sourceBoundary.closeReasonLabel}</dt><dd>{sourceModel.persistedClosure.closeReason ?? sourceBoundary.notRecordedLabel}</dd></div>
            <div><dt>{sourceBoundary.targetAssetLabel}</dt><dd>{sourceModel.persistedClosure.targetAssetPath ?? sourceBoundary.notRecordedLabel}</dd></div>
            <div><dt>{sourceBoundary.proposalCountLabel}</dt><dd>{sourceModel.persistedClosure.proposalCount}</dd></div>
            <div><dt>{sourceBoundary.sandboxLabel}</dt><dd>{sourceModel.persistedClosure.hasSandbox ? sourceBoundary.yesLabel : sourceBoundary.noLabel}</dd></div>
            <div><dt>{sourceBoundary.approvalLabel}</dt><dd>{sourceModel.persistedClosure.hasApproval ? sourceBoundary.yesLabel : sourceBoundary.noLabel}</dd></div>
            <div><dt>{sourceBoundary.promoteLabel}</dt><dd>{sourceModel.persistedClosure.hasPromote ? sourceBoundary.yesLabel : sourceBoundary.noLabel}</dd></div>
          </dl>
        </div>
      ) : (
        <DrawerUnavailableState
          title={sourceBoundary.closureUnavailableTitle}
          detail={
            closureAuthority.kind === 'mock'
              ? copy.ueAgentUi.drawer.noContextDetail
              : sourceBoundary.closureUnavailableDetail
          }
        />
      )}
    </section>
  );

  const changePlanAuthority = sourceModel.pages.changePlan;
  const renderChangePlanContent = () => (
    <section className="wb-drawer-factual-page">
      <DrawerSourceStatus authority={changePlanAuthority} copy={sourceBoundary} />
      {changePlanAuthority.kind === 'mock' ? (
        <ChangePlanPackageWorkspace />
      ) : changePlanAuthority.kind === 'persisted-real' ? (
        <div className="wb-drawer-persisted-facts">
          <h3>{sourceBoundary.persistedPlansTitle}</h3>
          <div className="wb-drawer-proposal-list">
            {sourceModel.persistedPlans.map(plan => (
              <article
                key={plan.proposalId}
                className="wb-drawer-proposal"
                data-proposal-id={plan.proposalId}
              >
                <dl className="wb-drawer-fact-list">
                  <div><dt>{sourceBoundary.proposalIdLabel}</dt><dd>{plan.proposalId}</dd></div>
                  <div><dt>{sourceBoundary.proposedAtLabel}</dt><dd>{plan.proposedAt}</dd></div>
                  <div><dt>{sourceBoundary.kindLabel}</dt><dd>{plan.kind}</dd></div>
                  <div><dt>{sourceBoundary.summaryLabel}</dt><dd>{plan.summary ?? sourceBoundary.notRecordedLabel}</dd></div>
                  <div><dt>{sourceBoundary.diagnosisSummaryLabel}</dt><dd>{plan.diagnosisSummary ?? sourceBoundary.notRecordedLabel}</dd></div>
                  <div><dt>{sourceBoundary.confidenceLabel}</dt><dd>{plan.confidence ?? sourceBoundary.notRecordedLabel}</dd></div>
                  <div><dt>{sourceBoundary.riskLabel}</dt><dd>{plan.risk ?? sourceBoundary.notRecordedLabel}</dd></div>
                  <div><dt>{sourceBoundary.operationKindLabel}</dt><dd>{plan.operationKind ?? sourceBoundary.notRecordedLabel}</dd></div>
                  <div><dt>{sourceBoundary.escalationReasonLabel}</dt><dd>{plan.escalationReason ?? sourceBoundary.notRecordedLabel}</dd></div>
                  <div><dt>{sourceBoundary.suggestedHumanActionLabel}</dt><dd>{plan.suggestedHumanAction ?? sourceBoundary.notRecordedLabel}</dd></div>
                </dl>
              </article>
            ))}
          </div>
        </div>
      ) : (
        <DrawerUnavailableState
          title={sourceBoundary.changePlanUnavailableTitle}
          detail={sourceBoundary.changePlanUnavailableDetail}
        />
      )}
    </section>
  );

  const blueprintWorkspaceAuthority =
    sourceModel.pages.blueprintChangeWorkspace;
  const renderBlueprintWorkspaceContent = () => (
    <section className="wb-drawer-factual-page">
      <DrawerSourceStatus
        authority={blueprintWorkspaceAuthority}
        copy={sourceBoundary}
      />
      {blueprintWorkspaceAuthority.kind === 'mock' ? (
        <BlueprintChangeWorkspacePanel />
      ) : (
        <DrawerUnavailableState
          title={sourceBoundary.blueprintWorkspaceUnavailableTitle}
          detail={sourceBoundary.blueprintWorkspaceUnavailableDetail}
        />
      )}
    </section>
  );

  const content =
    drawer.activeDrawerItem === 'questions' ? (
      renderQuestionsContent()
    ) : drawer.activeDrawerItem === 'closure' ? (
      renderClosureContent()
    ) : drawer.activeDrawerItem === 'change-plan' ? (
      renderChangePlanContent()
    ) : drawer.activeDrawerItem === 'bp-change-workspace' ? (
      renderBlueprintWorkspaceContent()
    ) : !snapshot ? (
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
      sourceModel={handoffSourceModel}
    />
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
          <div
            className="wb-drawer-tabs"
            role="tablist"
            aria-label={copy.ueAgentUi.drawer.dialogLabel}
          >
            {DRAWER_ITEM_IDS.map(id => {
              const authority = sourceAuthorityForItem(id);
              return (
                <button
                  key={id}
                  ref={element => {
                    tabRefs.current[id] = element;
                  }}
                  id={`workbench-drawer-tab-${id}`}
                  type="button"
                  role="tab"
                  data-drawer-item={id}
                  data-drawer-source-kind={authority?.kind}
                  className={drawer.activeDrawerItem === id ? 'wb-drawer-tab wb-drawer-tab-active' : 'wb-drawer-tab'}
                  tabIndex={drawer.activeDrawerItem === id ? 0 : -1}
                  aria-selected={drawer.activeDrawerItem === id}
                  aria-controls="workbench-drawer-content"
                  onKeyDown={event => handleTabKeyDown(event, id)}
                  onClick={() => activateDrawerItem(id)}
                >
                  <span>{copy.ueAgentUi.drawer.items[id]}</span>
                  {authority && (
                    <span
                      className={`wb-drawer-tab-source wb-drawer-source-badge-${authority.kind}`}
                      aria-label={sourceBoundary.tabSourceAria(
                        copy.ueAgentUi.drawer.items[id],
                        sourceBoundary.kinds[authority.kind],
                      )}
                    >
                      {sourceBoundary.kinds[authority.kind]}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
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
          role="tabpanel"
          aria-labelledby={`workbench-drawer-tab-${drawer.activeDrawerItem}`}
        >
          {content}
        </div>
      </aside>
    </div>
  );
}
