import type { useAgentWorkbenchState } from '../../hooks/useAgentWorkbenchState';
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
}

const DRAWER_ITEMS = [
  ['session-notes', 'Session Notes'],
  ['queue', 'Queue'],
  ['questions', 'Questions'],
  ['handoff', 'Handoff'],
  ['closure', 'Closure'],
  ['change-plan', 'Change Plan'],
  ['bp-change-workspace', 'BP Change WS'],
] as const;

export function DrawerPanel({ state }: DrawerPanelProps) {
  const snapshot = state.bridge.snapshot;
  const drawer = state.drawer;
  const investigation = state.investigation;
  const context = state.context;

  if (!drawer.isDrawerOpen) return null;

  const content = !snapshot ? (
    <p className="wb-empty">No context snapshot.</p>
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
  ) : (
    <BlueprintChangeWorkspacePanel />
  );

  return (
    <div className="wb-drawer-layer">
      <button type="button" className="wb-drawer-scrim" aria-label="Close drawer" onClick={drawer.closeDrawer} />
      <aside className="wb-drawer-panel">
        <div className="wb-drawer-header">
          <div className="wb-drawer-tabs">
            {DRAWER_ITEMS.map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={drawer.activeDrawerItem === id ? 'wb-drawer-tab wb-drawer-tab-active' : 'wb-drawer-tab'}
                onClick={() => drawer.setActiveDrawerItem(id)}
              >
                {label}
              </button>
            ))}
          </div>
          <button type="button" className="wb-title-button" onClick={drawer.closeDrawer}>
            ×
          </button>
        </div>
        <div className="wb-drawer-content">{content}</div>
      </aside>
    </div>
  );
}
