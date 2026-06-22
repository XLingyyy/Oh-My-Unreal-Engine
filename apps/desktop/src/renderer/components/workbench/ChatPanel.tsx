import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChatHeader } from './ChatHeader';
import { ChatInputV2 } from './ChatInputV2';
import { AgentCardRenderer } from './AgentCardRenderer';
import { ConfirmModal } from './ConfirmModal';
import type { AgentCard, AgentCardAction } from '@omue/shared-protocol';
import { isProjectSession } from '@omue/shared-protocol';
import type { BridgeClient } from '../../services';
import { useAgentWorkbenchState } from '../../hooks/useAgentWorkbenchState';
import { useDesktopCopy } from '../../i18n';
import {
  buildAgentCards,
  resolveAgentCardActionIntent,
  resolveAgentCardActionTargets,
  resolveFailureRecoveryMode,
  type MapperEvent,
} from './agentCardMapper';
import type { SendRequest } from './targetScopeState';
import type { AgentCardPresentationSettings } from './AgentCardFrame';

type AgentWorkbenchState = ReturnType<typeof useAgentWorkbenchState>;

interface ChatPanelProps {
  state: AgentWorkbenchState;
  client: BridgeClient;
  isMockClient: boolean;
  providerReady: boolean;
  diagnosisModel?: string;
  onOpenSettings?: () => void;
  onBeforeStartSession?: () => Promise<unknown>;
  presentation: AgentCardPresentationSettings;
}

export function ChatPanel({
  state,
  providerReady,
  diagnosisModel,
  onOpenSettings,
  onBeforeStartSession,
  presentation,
}: ChatPanelProps) {
  const { copy } = useDesktopCopy();
  const snapshot = state.bridge.snapshot;
  const selectedSession = state.agent.selectedSession;
  const composer = state.composer;
  const hasBlockingError = state.bridge.hasError && !state.bridge.hasSnapshot;
  const showInitialLoading = state.bridge.isInitialLoading && !state.bridge.hasSnapshot;
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const [confirmPromote, setConfirmPromote] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isRecovering, setIsRecovering] = useState(false);

  const allSessions = useMemo(
    () => [...state.agent.sessionGroups.active, ...state.agent.sessionGroups.interrupted, ...state.agent.sessionGroups.terminal],
    [state.agent.sessionGroups],
  );

  const interruptedSessionId = state.agent.sessionGroups.interrupted[0]?.sessionId ?? null;

  const mapperEvents = useMemo<MapperEvent[]>(() => {
    if (!state.agent.selectedSession) return [];
    const events: MapperEvent[] = [];
    for (const ev of state.agent.selectedEvents) {
      if (ev.kind === 'state') {
        events.push({
          id: ev.id,
          kind: 'state',
          sessionId: ev.sessionId,
          createdAt: ev.createdAt,
          currentState: ev.currentState,
          retryCount: ev.retryCount,
        });
        continue;
      }
      if (ev.kind === 'proposal') {
        events.push({
          id: ev.id,
          kind: 'proposal',
          sessionId: ev.sessionId,
          createdAt: ev.createdAt,
          proposalId: ev.proposalId,
          proposalKind: ev.proposalKind,
          proposal: ev.proposal,
          typedPayloadJson: ev.typedPayloadJson,
          escalationReason: ev.escalationReason,
        });
      } else if (ev.kind === 'compile') {
        events.push({
          id: ev.id,
          kind: 'compile',
          sessionId: ev.sessionId,
          createdAt: ev.createdAt,
          compileResultId: ev.compileResultId,
          success: ev.success,
          errorsJson: ev.errorsJson,
        });
      } else if (ev.kind === 'approval') {
        events.push({
          id: ev.id,
          kind: 'approval',
          sessionId: ev.sessionId,
          createdAt: ev.createdAt,
          approvalId: ev.approval.approvalId,
          approval: ev.approval,
        });
      } else if (ev.kind === 'error') {
        events.push({
          id: ev.id,
          kind: 'error',
          sessionId: ev.sessionId,
          createdAt: ev.createdAt,
          errorId: ev.errorId,
          errorCode: ev.errorCode,
          message: ev.message,
          scope: ev.scope,
          recoverable: ev.recoverable,
          details: 'details' in ev ? ev.details : undefined,
        });
      } else if (ev.kind === 'closed') {
        events.push({
          id: ev.id,
          kind: 'closed',
          sessionId: ev.sessionId,
          createdAt: ev.createdAt,
          closeReason: ev.closeReason,
        });
      }
    }
    for (const err of state.agent.selectedErrors) {
      events.push({
        id: `error-extra-${err.errorId}`,
        kind: 'error',
        sessionId: err.sessionId,
        createdAt: err.createdAt,
        errorId: err.errorId,
        errorCode: err.errorCode,
        message: err.message,
        scope: err.scope,
        recoverable: err.recoverable,
        details: err.details,
      });
    }
    return events;
  }, [state.agent.selectedSession, state.agent.selectedEvents, state.agent.selectedErrors]);

  const cards = useMemo<AgentCard[]>(() => {
    if (!state.agent.selectedSession) return [];
    return buildAgentCards(state.agent.selectedSession, mapperEvents);
  }, [state.agent.selectedSession, mapperEvents]);

  const actionTargets = useMemo(() => {
    if (!selectedSession) return {};
    return resolveAgentCardActionTargets({
      cards,
      sessionId: selectedSession.sessionId,
      sessionScope: selectedSession.scope,
      currentState: selectedSession.currentState,
      pendingApproval: state.agent.selectedApproval,
    });
  }, [cards, selectedSession, state.agent.selectedApproval]);
  const latestFailureCardId = useMemo(
    () => cards.filter(card => card.kind === 'failure').at(-1)?.id ?? null,
    [cards],
  );

  useEffect(() => {
    setConfirmPromote(false);
    setActionFeedback(null);
    setIsRecovering(false);
  }, [state.agent.selectedSessionId]);

  const handleNewSession = useCallback(() => {
    state.agent.handleNewSession();
    setActionFeedback(null);
  }, [state.agent]);

  const handleSelectSession = useCallback((sessionId: string) => {
    state.agent.setSelectedSessionId(sessionId);
  }, [state.agent]);

  const handleResumeInterrupted = useCallback(async () => {
    if (!interruptedSessionId) return;
    try {
      await state.agent.resumeSession(interruptedSessionId);
    } catch (e) {
      setActionFeedback(e instanceof Error ? e.message : String(e));
    }
  }, [interruptedSessionId, state.agent]);

  const handleSendIntent = useCallback(
    async (request: SendRequest) => {
      if (state.agent.hasRunningSession) {
        setActionFeedback(copy.ueAgentUi.chatInput.scopeError);
        return;
      }
      const validation = composer.validateSendBeforeStart(request);
      if (!validation.valid) {
        if (validation.reason === 'stale-target') {
          setActionFeedback(copy.ueAgentUi.chatInput.staleTargetError);
        } else if (validation.reason === 'no-project-context') {
          setActionFeedback(copy.ueAgentUi.chatInput.noProjectContextError);
        } else {
          setActionFeedback(copy.ueAgentUi.chatInput.scopeError);
        }
        return;
      }
      setIsStarting(true);
      try {
        await onBeforeStartSession?.();
        await state.agent.startSessionWithIntent(request);
        setActionFeedback(null);
      } catch (e) {
        setActionFeedback(e instanceof Error ? e.message : String(e));
      } finally {
        setIsStarting(false);
      }
    },
    [state.agent, copy.ueAgentUi.chatInput.scopeError, copy.ueAgentUi.chatInput.staleTargetError, copy.ueAgentUi.chatInput.noProjectContextError, onBeforeStartSession, composer],
  );

  const handleFailureRecovery = useCallback(
    async (card: Extract<AgentCard, { kind: 'failure' }>) => {
      const session = state.agent.selectedSession;
      if (!session || session.sessionId !== card.sessionId) return;
      const mode = resolveFailureRecoveryMode(session, card.data.recoverable);
      if (mode === 'none') return;
      setIsRecovering(true);
      try {
        if (mode === 'resume') {
          await state.agent.resumeSession(session.sessionId);
        } else if (mode === 'retry-new') {
          await state.agent.retrySessionAsNew(session);
        }
        setActionFeedback(null);
      } catch (e) {
        setActionFeedback(e instanceof Error ? e.message : String(e));
      } finally {
        setIsRecovering(false);
      }
    },
    [state.agent],
  );

  const handleAction = useCallback(
    (action: AgentCardAction) => {
      if (action.actionId === 'select-target-asset' && state.agent.selectedSession?.scope === 'project') {
        const target = action.payload?.targetAssetPath;
        if (typeof target !== 'string' || target.length === 0) {
          setActionFeedback('Select target requires a targetAssetPath payload.');
          return;
        }
        const parent = state.agent.selectedSession;
        if (!isProjectSession(parent)) {
          setActionFeedback('Select target is only available on project sessions.');
          return;
        }
        const inherited = parent.proposals
          .filter(p => p.kind === 'diagnosis')
          .map(p => p.evidenceSummary ?? '')
          .filter(text => text.length > 0)
          .join('\n\n');
        state.agent.startChildAssetSession(parent.sessionId, parent.userIntent, target, inherited)
          .then(() => setActionFeedback(null))
          .catch((e: unknown) => setActionFeedback(e instanceof Error ? e.message : String(e)));
        return;
      }
      if (action.actionId === 'continue-diagnosis') {
        if (state.agent.selectedSession?.scope !== 'project') {
          setActionFeedback('Continue diagnosis is only available on project sessions.');
          return;
        }
        if (!snapshot) {
          setActionFeedback('Project context snapshot is required to continue diagnosis.');
          return;
        }
        const userIntent = `${state.agent.selectedSession.userIntent}\n\nContinue: ${snapshot.project.projectName}`;
        state.agent.startSessionWithIntent({
          scope: 'project',
          userIntent,
        })
          .then(() => setActionFeedback(null))
          .catch((e: unknown) => setActionFeedback(e instanceof Error ? e.message : String(e)));
        return;
      }
      if (resolveAgentCardActionIntent(action.actionId) === 'confirm-promote') {
        if (!state.agent.selectedApproval) {
          setActionFeedback('No matching pending approval is available.');
          return;
        }
        if (state.agent.selectedSession?.scope !== 'asset') {
          setActionFeedback('Promote is only available on asset sessions.');
          return;
        }
        if (state.agent.selectedSession.currentState !== 'awaiting_approval') {
          setActionFeedback('Session is not awaiting approval.');
          return;
        }
        setConfirmPromote(true);
        return;
      }
      if (action.actionId === 'reject') {
        if (!state.agent.selectedSessionId) {
          setActionFeedback('No session selected to reject.');
          return;
        }
        state.agent.rejectSelected('rejected from change preview')
          .then(() => setActionFeedback(null))
          .catch((e: unknown) => setActionFeedback(e instanceof Error ? e.message : String(e)));
        return;
      }
      if (action.actionId === 'cancel') {
        if (state.agent.selectedSessionId) {
          state.agent.cancelSession(state.agent.selectedSessionId)
            .then(() => setActionFeedback(null))
            .catch((e: unknown) => setActionFeedback(e instanceof Error ? e.message : String(e)));
        }
        return;
      }
      if (action.actionId === 'discard') {
        if (state.agent.selectedSessionId) {
          state.agent.discardSession(state.agent.selectedSessionId)
            .then(() => setActionFeedback(null))
            .catch((e: unknown) => setActionFeedback(e instanceof Error ? e.message : String(e)));
        }
        return;
      }
      throw new Error(`Unhandled AgentCardAction: ${action.actionId}`);
    },
    [state.agent, snapshot],
  );

  const handleConfirmPromote = useCallback(async () => {
    if (state.agent.selectedApproval) {
      try {
        await state.agent.approveSelected();
        setConfirmPromote(false);
        setActionFeedback(null);
      } catch (e) {
        setActionFeedback(e instanceof Error ? e.message : String(e));
      }
    }
  }, [state.agent]);

  return (
    <section className="ue-chat-panel">
      <ChatHeader
        sessions={allSessions}
        selectedSessionId={state.agent.selectedSessionId}
        onSelectSession={handleSelectSession}
        onNewSession={handleNewSession}
        onResumeInterrupted={handleResumeInterrupted}
        hasInterrupted={interruptedSessionId !== null}
      />
      <div className="ue-chat-scroll">
        {hasBlockingError ? (
          <BlockingError
            error={state.bridge.error}
            onRetry={state.bridge.refreshContext}
            title={copy.shell.connectionFailed}
            retryLabel={copy.shell.retry}
          />
        ) : showInitialLoading ? (
          <InitialLoading
            title={copy.shell.loading}
            detail={copy.shell.loadingDetail}
          />
        ) : selectedSession === null ? (
          <EmptyState
            title={copy.ueAgentUi.chatInput.placeholder}
            detail={actionFeedback ?? copy.ueAgentUi.chatInput.hint}
            composerMode={composer.state.mode}
            composerTarget={composer.state.targetAssetPath}
          />
        ) : (
          <>
            {state.bridge.error && (
              <div className="wb-partial-warning">{state.bridge.error}</div>
            )}
            <div className="ue-card-list">
              {cards.map(card => (
                <AgentCardRenderer
                  key={card.id}
                  card={card}
                  actionContext={{
                    sessionId: selectedSession.sessionId,
                    sessionScope: selectedSession.scope,
                    currentState: selectedSession.currentState,
                    pendingApprovalId: state.agent.selectedApproval?.approvalId,
                    actionTargets,
                  }}
                  onAction={handleAction}
                  presentation={presentation}
                  failureRecovery={
                    card.kind === 'failure'
                    && card.id === latestFailureCardId
                    && selectedSession
                      ? {
                          mode: resolveFailureRecoveryMode(
                            selectedSession,
                            card.data.recoverable,
                          ),
                          onRecover: () => { void handleFailureRecovery(card); },
                          disabled: isRecovering,
                        }
                      : undefined
                  }
                />
              ))}
              {actionFeedback && (
                <div className="ue-card-demo-feedback ue-card-workflow-feedback" role="status">
                  {actionFeedback}
                </div>
              )}
            </div>
            <ConfirmModal
              open={confirmPromote}
              title={copy.ueAgentUi.cards.confirm.firstPromoteTitle}
              message={copy.ueAgentUi.cards.confirm.firstPromoteMessage(1)}
              assetPaths={state.agent.selectedSession && state.agent.selectedSession.scope === 'asset' ? [state.agent.selectedSession.targetAssetPath] : []}
              confirmLabel={copy.ueAgentUi.cards.confirm.firstConfirmLabel}
              cancelLabel={copy.ueAgentUi.cards.confirm.firstCancelLabel}
              variant="warning"
              onConfirm={() => { void handleConfirmPromote(); }}
              onCancel={() => setConfirmPromote(false)}
            />
          </>
        )}
      </div>
      <ChatInputV2
        composerState={composer.state}
        validateSend={composer.validateSendBeforeStart}
        onSubmit={handleSendIntent}
        onModeChange={composer.setComposerMode}
        isSubmitting={isStarting}
        providerReady={providerReady}
        diagnosisModel={diagnosisModel}
        onOpenSettings={onOpenSettings}
      />
    </section>
  );
}

function EmptyState({
  title,
  detail,
  composerMode,
  composerTarget,
}: {
  title: string;
  detail: string;
  composerMode: 'project' | 'asset' | null;
  composerTarget?: string;
}) {
  const { copy } = useDesktopCopy();
  return (
    <section className="wb-center-message">
      <h2>{title}</h2>
      <p>{detail}</p>
      <p className="ue-card-meta">
        {composerMode === 'asset' && composerTarget
          ? `${copy.ueAgentUi.chatInput.targetLabel}: ${composerTarget}`
          : composerMode === 'project'
            ? copy.ueAgentUi.chatInput.modeProject
            : ''}
      </p>
    </section>
  );
}

function BlockingError({
  error,
  onRetry,
  title,
  retryLabel,
}: {
  error: string | null;
  onRetry: () => void;
  title: string;
  retryLabel: string;
}) {
  return (
    <section className="wb-center-message wb-center-message-error">
      <h2>{title}</h2>
      {error && <p>{error}</p>}
      <button
        type="button"
        className="wb-button wb-button-primary"
        onClick={onRetry}
      >
        {retryLabel}
      </button>
    </section>
  );
}

function InitialLoading({ title, detail }: { title: string; detail: string }) {
  return (
    <section className="wb-center-message">
      <h2>{title}</h2>
      <p>{detail}</p>
    </section>
  );
}
