import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  AgentApprovalRequestedEvent,
  AgentLoopCloseReason,
  AgentLoopState,
  AgentProgressEvent,
  AgentProposalEvent,
  AgentSandboxCompileResultEvent,
  AgentSessionClosedEvent,
  AgentSessionErrorEvent,
  BlueprintGraphDetailData,
  EvidenceChain,
  EvidenceChainItem,
  ListSessionsResult,
  NodeInfo,
  RepairSessionRecord,
  SafeScratchBlueprintMutationAfterState,
  SafeScratchBlueprintMutationBeforeState,
} from '@omue/shared-protocol';
import { buildEvidenceChains } from '../services/evidence-engine';
import { MockBridgeClient, type BridgeClient, type MockBridgeScenario } from '../services';
import { useBridgeContext } from './use-bridge-context';
import { useDesktopCopy } from '../i18n';
import type { QueueItem, InvestigationStatus, InvestigationPriority } from '../components/InvestigationQueuePanel';
import type { NodeEvidenceSummary } from '../components/GraphDetailPanel';
import type { DeltaSummary } from '../components/InvestigationDeltaPanel';
import { defaultReviewState, type InvestigationReviewState } from '../components/InvestigationSessionPanel';
import {
  defaultQuestionMatrixState,
  type QuestionMatrixState,
  type QuestionReviewEntry,
} from '../components/InvestigationQuestionMatrixPanel';
import { defaultClosureState, type InfrastructureClosureState } from '../components/InfrastructureClosurePanel';
import {
  adaptAgentProtocolEvent,
  buildReplacementSessionRequest,
  getVisiblePendingApproval,
  reducePendingApprovals,
  type AgentRendererEvent,
} from '../components/workbench/agentCardMapper';
import {
  computeComposerState,
  validateSendRequest,
  type ComposerMode,
  type ComposerState,
  type SendRequest,
  type SendValidationResult,
} from '../components/workbench/targetScopeState';
import {
  buildInspectorData,
  type ChatStreamEventLike as AdapterChatStreamEventLike,
  type InspectorData,
} from '../components/workbench/inspectorDataAdapter';
import {
  computeWorkbenchStatus,
  type WorkbenchStatusViewModel,
} from '../components/workbench/workbenchStatusViewModel';
import { DEFAULT_BRIDGE_BASE_URL } from '../services/http-bridge-client.contract';
import type { ProviderReadiness } from '../../main/settings/provider-authority';

export type DrawerItem =
  | 'session-notes'
  | 'queue'
  | 'questions'
  | 'handoff'
  | 'closure'
  | 'change-plan'
  | 'bp-change-workspace';

export type DiffPreview = {
  mode: 'real';
  targetAssetPath: string;
  sandboxAssetPath?: string;
  operationKind: 'set_blueprint_metadata_marker' | 'set_blueprint_variable_default';
  beforeState: SafeScratchBlueprintMutationBeforeState;
  afterState: SafeScratchBlueprintMutationAfterState;
  display: { summary: string; note?: string };
};

export type PendingApproval = {
  approvalId: string;
  requestedAt: string;
  diffPreview: DiffPreview | null;
};

export type ChatStreamEvent =
  | {
      id: string;
      kind: 'state';
      sessionId: string;
      createdAt: string;
      currentState: AgentLoopState;
      retryCount: number;
    }
  | AgentRendererEvent;

export type SessionGroups = {
  active: RepairSessionRecord[];
  interrupted: RepairSessionRecord[];
  terminal: RepairSessionRecord[];
};

function sortSessionsByUpdatedAt(a: RepairSessionRecord, b: RepairSessionRecord): number {
  return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
}

export function isTerminalState(state: AgentLoopState): boolean {
  return state === 'done' || state === 'escalated_done' || state === 'closed';
}

export function isInterruptedState(state: AgentLoopState): boolean {
  return state === 'interrupted';
}

function sessionStateFromCloseReason(reason: AgentLoopCloseReason): AgentLoopState {
  switch (reason) {
    case 'done':
      return 'done';
    case 'escalated':
      return 'escalated_done';
    case 'interrupted':
      return 'interrupted';
    default:
      return 'closed';
  }
}

function mergeSessionRecord(
  previous: RepairSessionRecord[],
  incoming: RepairSessionRecord,
): RepairSessionRecord[] {
  const existingIndex = previous.findIndex(session => session.sessionId === incoming.sessionId);
  if (existingIndex === -1) {
    return [...previous, incoming].sort(sortSessionsByUpdatedAt);
  }

  const next = [...previous];
  next[existingIndex] = { ...next[existingIndex], ...incoming };
  next.sort(sortSessionsByUpdatedAt);
  return next;
}

function eventId(prefix: string, sessionId: string, discriminator: string): string {
  return `${prefix}-${sessionId}-${discriminator}`;
}

function appendEvent(
  previous: Record<string, ChatStreamEvent[]>,
  sessionId: string,
  event: ChatStreamEvent,
): Record<string, ChatStreamEvent[]> {
  return {
    ...previous,
    [sessionId]: [...(previous[sessionId] ?? []), event],
  };
}

export function useAgentWorkbenchState(
  client: BridgeClient,
  isMockClient: boolean,
  providerReadiness: ProviderReadiness,
) {
  const { copy } = useDesktopCopy();
  const bridge = useBridgeContext(client);
  const {
    snapshot,
    health,
    isInitialLoading,
    isRefreshing,
    error,
    lastUpdatedAt,
    refreshContext,
  } = bridge;

  const [scenario, setScenario] = useState<MockBridgeScenario>('normal');
  const [selectedGraphId, setSelectedGraphId] = useState<string | null>(null);
  const [graphDetail, setGraphDetail] = useState<BlueprintGraphDetailData | null>(null);
  const [isGraphDetailLoading, setIsGraphDetailLoading] = useState(false);
  const [graphDetailError, setGraphDetailError] = useState<string | null>(null);
  const [focusedNode, setFocusedNode] = useState<{ graphId: string; nodeId: string } | null>(null);

  const [queueItems, setQueueItems] = useState<QueueItem[]>([]);
  const [sessionNotes, setSessionNotes] = useState('');
  const [investigationReview, setInvestigationReview] =
    useState<InvestigationReviewState>(defaultReviewState);
  const [questionMatrixState, setQuestionMatrixState] =
    useState<QuestionMatrixState>(defaultQuestionMatrixState);
  const [closureState, setClosureState] =
    useState<InfrastructureClosureState>(defaultClosureState);
  const [deltaBaseline, setDeltaBaseline] = useState<DeltaSummary | null>(null);

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [activeDrawerItem, setActiveDrawerItem] = useState<DrawerItem>('session-notes');

  const [sessions, setSessions] = useState<RepairSessionRecord[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [eventsBySession, setEventsBySession] = useState<Record<string, ChatStreamEvent[]>>({});
  const [approvalsBySession, setApprovalsBySession] = useState<Record<string, PendingApproval>>({});
  const [errorsBySession, setErrorsBySession] = useState<Record<string, AgentSessionErrorEvent[]>>({});
  const [sessionLoadError, setSessionLoadError] = useState<string | null>(null);
  const [isSessionLoading, setIsSessionLoading] = useState(true);
  const [actionSessionId, setActionSessionId] = useState<string | null>(null);

  const [composerModeChoice, setComposerModeChoice] = useState<ComposerMode>(null);
  const [composerTargetChoice, setComposerTargetChoice] = useState<string | undefined>(undefined);

  const [isDraftSession, setIsDraftSession] = useState(false);
  const [draftFocusRequestId, setDraftFocusRequestId] = useState(0);
  const pendingStartSessionIdRef = useRef<string | null>(null);

  const handleScenarioChange = useCallback(
    (next: MockBridgeScenario) => {
      if (!isMockClient || next === scenario) return;
      setScenario(next);
      if (client instanceof MockBridgeClient) {
        client.setScenario(next);
      }
      window.setTimeout(() => refreshContext(), 0);
    },
    [client, isMockClient, refreshContext, scenario],
  );

  const openDrawer = useCallback((item?: DrawerItem) => {
    if (item) setActiveDrawerItem(item);
    setIsDrawerOpen(true);
  }, []);

  const closeDrawer = useCallback(() => setIsDrawerOpen(false), []);
  const toggleDrawer = useCallback(() => setIsDrawerOpen(current => !current), []);

  const handleSelectGraph = useCallback(
    async (graphId: string) => {
      setSelectedGraphId(graphId);
      setIsGraphDetailLoading(true);
      setGraphDetailError(null);
      setGraphDetail(null);
      setFocusedNode(prev => prev?.graphId !== graphId ? null : prev);
      try {
        const detail = await client.getBlueprintGraphDetail(graphId);
        setGraphDetail(detail);
      } catch (e) {
        setGraphDetailError(e instanceof Error ? e.message : String(e));
      } finally {
        setIsGraphDetailLoading(false);
      }
    },
    [client],
  );

  const handleClearGraphDetail = useCallback(() => {
    setSelectedGraphId(null);
    setGraphDetail(null);
    setGraphDetailError(null);
    setFocusedNode(null);
  }, []);

  const handleFocusNode = useCallback((graphId: string, nodeId: string) => {
    setFocusedNode({ graphId, nodeId });
  }, []);

  const focusedNodeId =
    focusedNode &&
    graphDetail?.selectedBlueprint?.requestedGraphId === focusedNode.graphId
      ? focusedNode.nodeId
      : undefined;

  useEffect(() => {
    if (!selectedGraphId) return;
    if (!snapshot) {
      handleClearGraphDetail();
      return;
    }
    const graphIds = snapshot.blueprintGraphs?.graphs ?? [];
    if (!graphIds.some(g => g.graphId === selectedGraphId)) {
      handleClearGraphDetail();
    }
  }, [handleClearGraphDetail, selectedGraphId, snapshot]);

  useEffect(() => {
    setQueueItems([]);
    setSessionNotes('');
  }, [snapshot?.capturedAt, snapshot?.currentAsset?.assetPath, snapshot?.currentAsset?.assetName]);

  const handleReviewChange = useCallback((update: Partial<InvestigationReviewState>) => {
    setInvestigationReview(prev => ({
      ...prev,
      ...update,
      updatedAt: update.updatedAt !== undefined ? update.updatedAt : new Date().toISOString(),
    }));
  }, []);

  const handleClearReview = useCallback(() => {
    setInvestigationReview(defaultReviewState);
  }, []);

  const handleQuestionMatrixUpdate = useCallback((entryId: string, entry: QuestionReviewEntry) => {
    setQuestionMatrixState(prev => ({
      entries: {
        ...prev.entries,
        [entryId]: entry,
      },
      updatedAt: new Date().toISOString(),
    }));
  }, []);

  const handleQuestionMatrixReset = useCallback(() => {
    setQuestionMatrixState(defaultQuestionMatrixState);
  }, []);

  const handleClosureChange = useCallback((update: Partial<InfrastructureClosureState>) => {
    setClosureState(prev => ({
      ...prev,
      ...update,
      updatedAt: update.updatedAt ?? new Date().toISOString(),
    }));
  }, []);

  const handleClosureReset = useCallback(() => {
    setClosureState(defaultClosureState);
  }, []);

  const handleQueueEvidence = useCallback((chain: EvidenceChain, item: EvidenceChainItem) => {
    const id = `ev-${item.evidenceId}`;
    setQueueItems(prev => {
      const existingIdx = prev.findIndex(qi => qi.id === id);
      const newItem: QueueItem = {
        id,
        kind: 'evidence',
        title: item.snippet.summary.length > 70 ? `${item.snippet.summary.slice(0, 70)}...` : item.snippet.summary,
        sourceSummary: `${chain.title} - ${item.snippet.source.kind}`,
        addedAt: new Date().toISOString(),
        investigationStatus: 'todo' as InvestigationStatus,
        priority: (item.confidence.level === 'high' ? 'high' : item.confidence.level === 'medium' ? 'normal' : 'low') as InvestigationPriority,
        userNote: '',
        evidenceId: item.evidenceId,
        chainTitle: chain.title,
        severity: item.snippet.severity,
        confidence: item.confidence.level,
        sourceKind: item.snippet.source.kind,
        summary: item.snippet.summary,
        suggestedNextInspection: item.suggestedNextInspection,
        graphId: item.nodeRef?.graphId ?? item.graphRef?.graphId,
        nodeId: item.nodeRef?.nodeId,
        nodeTitle: item.nodeRef?.nodeTitle,
      };
      if (existingIdx >= 0) {
        const result = [...prev];
        result[existingIdx] = { ...result[existingIdx], addedAt: newItem.addedAt } as QueueItem;
        return result;
      }
      return [...prev, newItem];
    });
  }, []);

  const handleUpdateQueueItem = useCallback((id: string, update: Partial<QueueItem>) => {
    setQueueItems(prev => prev.map(qi => qi.id === id ? ({ ...qi, ...update } as QueueItem) : qi));
  }, []);

  const handleRemoveQueueItem = useCallback((id: string) => {
    setQueueItems(prev => prev.filter(qi => qi.id !== id));
  }, []);

  const handleClearQueue = useCallback(() => {
    setQueueItems([]);
    setSessionNotes('');
  }, []);

  const evidenceChains = useMemo(
    () => (snapshot ? buildEvidenceChains({ snapshot, graphDetail }) : []),
    [snapshot, graphDetail],
  );

  const currentAssetSummary = useMemo(() => {
    if (!snapshot?.currentAsset) return null;
    const a = snapshot.currentAsset;
    return [
      `- **${copy.common.name}:** ${a.assetName}`,
      `- **${copy.common.path}:** ${a.assetPath}`,
      `- **${copy.common.type}:** ${a.assetClass}`,
      `- **${copy.common.dirty}:** ${a.isDirty ? copy.common.yes : copy.common.no}`,
      `- **${copy.common.selected}:** ${a.isSelected ? copy.common.yes : copy.common.no}`,
      `- **${copy.common.openInEditor}:** ${a.isOpenInEditor ? copy.common.yes : copy.common.no}`,
    ].join('\n');
  }, [copy.common, snapshot?.currentAsset]);

  const nodeEvidenceMap = useMemo(() => {
    const currentGraphId = graphDetail?.selectedBlueprint?.requestedGraphId;
    if (!currentGraphId) return undefined;
    const map: Record<string, NodeEvidenceSummary[]> = {};
    for (const chain of evidenceChains) {
      for (const item of chain.items) {
        if (item.nodeRef && item.nodeRef.graphId === currentGraphId) {
          const nodeId = item.nodeRef.nodeId;
          if (!map[nodeId]) map[nodeId] = [];
          map[nodeId].push({
            chainTitle: chain.title,
            severity: item.snippet.severity,
            confidence: item.confidence.level,
            sourceKind: item.snippet.source.kind,
            summary: item.snippet.summary,
            suggestedNextInspection: item.suggestedNextInspection,
          });
        }
      }
    }
    return Object.keys(map).length > 0 ? map : undefined;
  }, [evidenceChains, graphDetail]);

  const handleQueueNode = useCallback((node: NodeInfo) => {
    if (!graphDetail?.selectedBlueprint) return;
    const graph = graphDetail.selectedBlueprint.graph;
    const detail = graph.detail;
    const evidenceCount = nodeEvidenceMap?.[node.nodeId]?.length ?? 0;
    const totalPins = node.pins.length;
    const connectedPins = node.pins.filter(pin => pin.isConnected).length;
    const unconnectedPins = totalPins - connectedPins;
    const incomingLinks = detail.links.filter(link => link.targetNodeId === node.nodeId).length;
    const outgoingLinks = detail.links.filter(link => link.sourceNodeId === node.nodeId).length;

    let nodeStatus = 'none';
    if (node.errorType === 'error') nodeStatus = 'error';
    else if (node.errorType === 'warning') nodeStatus = 'warning';
    else if (node.isDisabled === true) nodeStatus = 'disabled';

    const id = `node-${detail.graphId}-${node.nodeId}`;
    setQueueItems(prev => {
      const existingIdx = prev.findIndex(qi => qi.id === id);
      const newItem: QueueItem = {
        id,
        kind: 'graph_node',
        title: node.title,
        sourceSummary: `${graph.name} (${graph.kind})`,
        addedAt: new Date().toISOString(),
        investigationStatus: 'todo' as InvestigationStatus,
        priority: (node.errorType === 'error' ? 'high' : node.errorType === 'warning' ? 'normal' : 'low') as InvestigationPriority,
        userNote: '',
        graphId: detail.graphId,
        graphName: graph.name,
        graphKind: graph.kind,
        nodeId: node.nodeId,
        nodeTitle: node.title,
        nodeType: node.nodeType,
        nodeStatus,
        errorMessage: node.errorMessage,
        evidenceCount,
        pinSummary: `${totalPins} pins (${connectedPins}c / ${unconnectedPins}u)`,
        linkSummary: `${incomingLinks} in / ${outgoingLinks} out`,
      };
      if (existingIdx >= 0) {
        const result = [...prev];
        result[existingIdx] = { ...result[existingIdx], addedAt: newItem.addedAt } as QueueItem;
        return result;
      }
      return [...prev, newItem];
    });
  }, [graphDetail, nodeEvidenceMap]);

  const refreshSessions = useCallback(async () => {
    const result = (await window.omue.agent.listSessions()) as ListSessionsResult;
    if (!result.ok) {
      setSessionLoadError(`${copy.agentTransition.loadFailed}: ${result.message}`);
      return;
    }

    setSessionLoadError(null);
    const sortedSessions = result.sessions.slice().sort(sortSessionsByUpdatedAt);
    setSessions(sortedSessions);
    setEventsBySession(previous => {
      let next = { ...previous };
      for (const session of sortedSessions) {
        if (next[session.sessionId]?.length) continue;
        next = appendEvent(next, session.sessionId, {
          id: eventId('state', session.sessionId, `${session.currentState}-${session.retryCount}-${session.updatedAt}`),
          kind: 'state',
          sessionId: session.sessionId,
          createdAt: session.updatedAt,
          currentState: session.currentState,
          retryCount: session.retryCount,
        });
      }
      return next;
    });
  }, [copy.agentTransition.loadFailed]);

  useEffect(() => {
    let disposed = false;

    const initialize = async () => {
      setIsSessionLoading(true);
      try {
        await window.omue.agent.subscribe();
        if (!disposed) {
          await refreshSessions();
        }
      } catch (e) {
        if (!disposed) {
          setSessionLoadError(`${copy.agentTransition.loadFailed}: ${e instanceof Error ? e.message : String(e)}`);
        }
      } finally {
        if (!disposed) setIsSessionLoading(false);
      }
    };

    const unsubscribeProgress = window.omue.agent.onProgress((payload: AgentProgressEvent) => {
      setSessions(previous => {
        const existing = previous.find(session => session.sessionId === payload.sessionId);
        if (!existing) return previous;
        return mergeSessionRecord(previous, {
          ...existing,
          currentState: payload.currentState,
          retryCount: payload.retryCount,
          updatedAt: payload.updatedAt,
        });
      });
      setEventsBySession(previous => appendEvent(previous, payload.sessionId, {
        id: eventId('state', payload.sessionId, `${payload.currentState}-${payload.retryCount}-${payload.updatedAt}`),
        kind: 'state',
        sessionId: payload.sessionId,
        createdAt: payload.updatedAt,
        currentState: payload.currentState,
        retryCount: payload.retryCount,
      }));
    });

    const unsubscribeProposal = window.omue.agent.onProposal((payload: AgentProposalEvent) => {
      const { event } = adaptAgentProtocolEvent({ kind: 'proposal', payload });
      setEventsBySession(previous => appendEvent(previous, payload.sessionId, event));
    });

    const unsubscribeCompile = window.omue.agent.onSandboxCompileResult(
      (payload: AgentSandboxCompileResultEvent) => {
        const { event } = adaptAgentProtocolEvent({ kind: 'compile', payload });
        setEventsBySession(previous => appendEvent(previous, payload.sessionId, event));
      },
    );

    const unsubscribeApproval = window.omue.agent.onApprovalRequested(
      (payload: AgentApprovalRequestedEvent) => {
        const adapted = adaptAgentProtocolEvent({ kind: 'approval', payload });
        const approval = adapted.approval as PendingApproval;
        if (adapted.compatibilityError) {
          setErrorsBySession(previous => ({
            ...previous,
            [payload.sessionId]: [
              ...(previous[payload.sessionId] ?? []),
              adapted.compatibilityError as AgentSessionErrorEvent,
            ],
          }));
        }
        setApprovalsBySession(previous => reducePendingApprovals(previous, {
          type: 'requested',
          sessionId: payload.sessionId,
          approval,
        }));
        setEventsBySession(previous => appendEvent(previous, payload.sessionId, adapted.event));
      },
    );

    const unsubscribeError = window.omue.agent.onSessionError((payload: AgentSessionErrorEvent) => {
      setErrorsBySession(previous => ({
        ...previous,
        [payload.sessionId]: [...(previous[payload.sessionId] ?? []), payload],
      }));
      const { event } = adaptAgentProtocolEvent({ kind: 'error', payload });
      setEventsBySession(previous => appendEvent(previous, payload.sessionId, event));
    });

    const unsubscribeClosed = window.omue.agent.onSessionClosed((payload: AgentSessionClosedEvent) => {
      const nextState = sessionStateFromCloseReason(payload.closeReason);
      const ts = payload.closedAt;
      setApprovalsBySession(previous => reducePendingApprovals(previous, {
        type: 'session-closed',
        sessionId: payload.sessionId,
      }));
      setSessions(previous => {
        const existing = previous.find(session => session.sessionId === payload.sessionId);
        if (!existing) return previous;
        return mergeSessionRecord(previous, {
          ...existing,
          currentState: nextState,
          updatedAt: ts,
          closeReason: payload.closeReason,
          closedAt: ts,
        });
      });
      const { event } = adaptAgentProtocolEvent({ kind: 'closed', payload });
      setEventsBySession(previous => appendEvent(previous, payload.sessionId, event));
    });

    void initialize();

    return () => {
      disposed = true;
      unsubscribeProgress();
      unsubscribeProposal();
      unsubscribeCompile();
      unsubscribeApproval();
      unsubscribeError();
      unsubscribeClosed();
    };
  }, [copy.agentTransition.loadFailed, refreshSessions]);

  useEffect(() => {
    if (isDraftSession) return;
    if (pendingStartSessionIdRef.current) return;

    if (selectedSessionId && sessions.some(session => session.sessionId === selectedSessionId)) {
      return;
    }

    const nextSelection =
      sessions.find(session => !isInterruptedState(session.currentState) && !isTerminalState(session.currentState))
        ?.sessionId ??
      sessions.find(session => isInterruptedState(session.currentState))?.sessionId ??
      sessions[0]?.sessionId ??
      null;

    setSelectedSessionId(nextSelection);
  }, [isDraftSession, selectedSessionId, sessions]);

  const sessionGroups = useMemo((): SessionGroups => {
    const active: RepairSessionRecord[] = [];
    const interrupted: RepairSessionRecord[] = [];
    const terminal: RepairSessionRecord[] = [];

    for (const session of sessions) {
      if (isInterruptedState(session.currentState)) {
        interrupted.push(session);
      } else if (isTerminalState(session.currentState)) {
        terminal.push(session);
      } else {
        active.push(session);
      }
    }

    return { active, interrupted, terminal };
  }, [sessions]);

  const selectedSession = useMemo(
    () => sessions.find(session => session.sessionId === selectedSessionId) ?? null,
    [selectedSessionId, sessions],
  );
  const selectedApproval = getVisiblePendingApproval(selectedSession, approvalsBySession);
  const selectedErrors = selectedSessionId ? errorsBySession[selectedSessionId] ?? [] : [];
  const selectedEvents = selectedSessionId ? eventsBySession[selectedSessionId] ?? [] : [];
  const hasRunningSession = sessions.some(
    session => !isTerminalState(session.currentState) && !isInterruptedState(session.currentState),
  );

  const currentAsset = snapshot?.currentAsset;
  const openAssets = snapshot?.openAssets ?? [];
  const hasProjectContext = Boolean(snapshot?.project);

  const composerState = useMemo<ComposerState>(
    () =>
      computeComposerState({
        currentAsset,
        openAssets,
        selectedSession,
        userModeChoice: composerModeChoice,
        userTargetChoice: composerTargetChoice,
        hasProjectContext,
      }),
    [currentAsset, openAssets, selectedSession, composerModeChoice, composerTargetChoice, hasProjectContext],
  );

  const selectAssetTarget = useCallback((assetPath: string) => {
    const trimmed = assetPath.trim();
    if (!trimmed) return;
    setComposerTargetChoice(trimmed);
    setComposerModeChoice('asset');
  }, []);

  const setComposerMode = useCallback((mode: ComposerMode) => {
    setComposerModeChoice(mode);
    if (mode === 'project') {
      setComposerTargetChoice(undefined);
    }
  }, []);

  const clearComposerChoice = useCallback(() => {
    setComposerModeChoice(null);
    setComposerTargetChoice(undefined);
  }, []);

  const handleNewSession = useCallback(() => {
    pendingStartSessionIdRef.current = null;
    setIsDraftSession(true);
    setSelectedSessionId(null);
    clearComposerChoice();
    setDraftFocusRequestId(current => current + 1);
  }, [clearComposerChoice]);

  const selectSession = useCallback((sessionId: string) => {
    pendingStartSessionIdRef.current = null;
    setIsDraftSession(false);
    setSelectedSessionId(sessionId);
  }, []);

  useEffect(() => {
    setComposerModeChoice(null);
    setComposerTargetChoice(undefined);
  }, [selectedSessionId]);

  const validateSendBeforeStart = useCallback(
    (request: SendRequest): SendValidationResult =>
      validateSendRequest(request, {
        currentAsset,
        openAssets,
        selectedSession,
        userModeChoice: composerModeChoice,
        userTargetChoice: composerTargetChoice,
        hasProjectContext,
      }),
    [currentAsset, openAssets, selectedSession, composerModeChoice, composerTargetChoice, hasProjectContext],
  );

  const startSession = useCallback(
    async (targetAssetPath: string) => {
      const trimmed = targetAssetPath.trim();
      if (!trimmed) {
        throw new Error(copy.agentTransition.section.sessionControl.targetRequired);
      }

      setActionSessionId('start-form');
      try {
        const result = await window.omue.agent.startSession({
          scope: 'asset',
          userIntent: `Repair ${trimmed}`,
          targetAssetPath: trimmed,
        });
        if (!result.ok) {
          throw new Error(result.message);
        }
        pendingStartSessionIdRef.current = result.sessionId;
        setIsDraftSession(false);
        setSelectedSessionId(result.sessionId);
        try {
          await refreshSessions();
        } finally {
          pendingStartSessionIdRef.current = null;
        }
      } finally {
        setActionSessionId(null);
      }
    },
    [copy.agentTransition.section.sessionControl.targetRequired, refreshSessions],
  );

  const startSessionWithIntent = useCallback(
    async (request: { scope: 'asset' | 'project'; userIntent: string; targetAssetPath?: string; parentSessionId?: string; inheritedEvidenceSummary?: string }) => {
      setActionSessionId('start-form');
      try {
        const body = request.scope === 'asset' && request.targetAssetPath
          ? {
              scope: 'asset' as const,
              userIntent: request.userIntent,
              targetAssetPath: request.targetAssetPath,
              ...(request.parentSessionId ? { parentSessionId: request.parentSessionId } : {}),
              ...(request.inheritedEvidenceSummary ? { inheritedEvidenceSummary: request.inheritedEvidenceSummary } : {}),
            }
          : {
              scope: 'project' as const,
              userIntent: request.userIntent,
            };
        const result = await window.omue.agent.startSession(body);
        if (!result.ok) {
          throw new Error(result.message);
        }
        pendingStartSessionIdRef.current = result.sessionId;
        setIsDraftSession(false);
        setSelectedSessionId(result.sessionId);
        try {
          await refreshSessions();
        } finally {
          pendingStartSessionIdRef.current = null;
        }
      } finally {
        setActionSessionId(null);
      }
    },
    [refreshSessions],
  );

  const startChildAssetSession = useCallback(
    async (parentSessionId: string, userIntent: string, targetAssetPath: string, inheritedEvidenceSummary: string) => {
      return startSessionWithIntent({
        scope: 'asset',
        userIntent,
        targetAssetPath,
        parentSessionId,
        inheritedEvidenceSummary,
      });
    },
    [startSessionWithIntent],
  );

  const retrySessionAsNew = useCallback(
    async (session: RepairSessionRecord) =>
      startSessionWithIntent(buildReplacementSessionRequest(session)),
    [startSessionWithIntent],
  );

  const resumeSession = useCallback(async (sessionId: string) => {
    setActionSessionId(sessionId);
    try {
      const result = await window.omue.agent.resumeSession({ sessionId });
      if (!result.ok) {
        throw new Error(result.message);
      }
      setIsDraftSession(false);
      setSelectedSessionId(sessionId);
      await refreshSessions();
    } finally {
      setActionSessionId(null);
    }
  }, [refreshSessions]);

  const cancelSession = useCallback(async (sessionId: string) => {
    if (!window.confirm(copy.agentTransition.section.sessionControl.cancelConfirm)) return;
    setActionSessionId(sessionId);
    try {
      const result = await window.omue.agent.cancelSession({ sessionId });
      if (!result.ok) {
        throw new Error(result.message);
      }
      await refreshSessions();
    } finally {
      setActionSessionId(null);
    }
  }, [copy.agentTransition.section.sessionControl.cancelConfirm, refreshSessions]);

  const discardSession = useCallback(async (sessionId: string) => {
    if (!window.confirm(copy.agentTransition.section.sessionControl.discardConfirm)) return;
    setActionSessionId(sessionId);
    try {
      const result = await window.omue.agent.discardSession({ sessionId });
      if (!result.ok) {
        throw new Error(result.message);
      }
      setSessions(previous => previous.filter(session => session.sessionId !== sessionId));
      setSelectedSessionId(previous => previous === sessionId ? null : previous);
      setApprovalsBySession(previous => {
        const next = { ...previous };
        delete next[sessionId];
        return next;
      });
      setEventsBySession(previous => {
        const next = { ...previous };
        delete next[sessionId];
        return next;
      });
      setErrorsBySession(previous => {
        const next = { ...previous };
        delete next[sessionId];
        return next;
      });
    } finally {
      setActionSessionId(null);
    }
  }, [copy.agentTransition.section.sessionControl.discardConfirm]);

  const approveSelected = useCallback(async (note?: string) => {
    if (!selectedSessionId || !selectedApproval) return;
    setActionSessionId(selectedSessionId);
    try {
      const result = await window.omue.agent.approvePromote({
        sessionId: selectedSessionId,
        approvalId: selectedApproval.approvalId,
        note: note?.trim() || undefined,
      });
      if (!result.ok) {
        throw new Error(result.message);
      }
      setApprovalsBySession(previous => reducePendingApprovals(previous, {
        type: 'approve-succeeded',
        sessionId: selectedSessionId,
      }));
      await refreshSessions();
    } finally {
      setActionSessionId(null);
    }
  }, [refreshSessions, selectedApproval, selectedSessionId]);

  const rejectSelected = useCallback(async (reason?: string) => {
    if (!selectedSessionId) return;
    setActionSessionId(selectedSessionId);
    try {
      const result = await window.omue.agent.rejectPromote({
        sessionId: selectedSessionId,
        reason: reason?.trim() || undefined,
      });
      if (!result.ok) {
        throw new Error(result.message);
      }
      setApprovalsBySession(previous => reducePendingApprovals(previous, {
        type: 'reject-succeeded',
        sessionId: selectedSessionId,
      }));
      await refreshSessions();
    } finally {
      setActionSessionId(null);
    }
  }, [refreshSessions, selectedSessionId]);

  const isLoading = isInitialLoading || isRefreshing;
  const hasSnapshot = snapshot !== null;
  const hasError = error !== null;

  const inspectorData = useMemo<InspectorData>(() => {
    const adaptedEvents: AdapterChatStreamEventLike[] = selectedEvents.map(event => {
      if (event.kind === 'state') {
        return {
          id: event.id,
          kind: 'state',
          sessionId: event.sessionId,
          createdAt: event.createdAt,
          currentState: event.currentState,
          retryCount: event.retryCount,
        };
      }
      return event as unknown as AdapterChatStreamEventLike;
    });

    return buildInspectorData({
      selectedSession,
      selectedEvents: adaptedEvents,
      snapshot,
      isMockClient,
      bridgeError: error,
      mockEvidenceTexts: copy.ueAgentUi.rightInspector.evidence.texts,
      mockChangeTexts: copy.ueAgentUi.rightInspector.changes.texts,
      mockLogTexts: copy.ueAgentUi.rightInspector.logs.texts,
    });
  }, [
    selectedSession,
    selectedEvents,
    snapshot,
    isMockClient,
    error,
    copy.ueAgentUi.rightInspector.evidence.texts,
    copy.ueAgentUi.rightInspector.changes.texts,
    copy.ueAgentUi.rightInspector.logs.texts,
  ]);

  const statusViewModel = useMemo<WorkbenchStatusViewModel>(() => {
    return computeWorkbenchStatus({
      health,
      bridgeError: error,
      isInitialLoading,
      isRefreshing,
      hasSnapshot,
      compileStatus: snapshot?.compileStatus ?? null,
      providerReadiness: providerReadiness,
      selectedSession,
      composerState,
      isMockClient,
      bridgeBaseUrl: DEFAULT_BRIDGE_BASE_URL,
    });
  }, [
    health,
    error,
    isInitialLoading,
    isRefreshing,
    hasSnapshot,
    snapshot?.compileStatus,
    providerReadiness,
    selectedSession,
    composerState,
    isMockClient,
  ]);

  return {
    bridge: {
      snapshot,
      health,
      isInitialLoading,
      isRefreshing,
      isLoading,
      hasSnapshot,
      hasError,
      error,
      lastUpdatedAt,
      refreshContext,
    },
    mock: {
      scenario,
      handleScenarioChange,
    },
    context: {
      selectedGraphId,
      graphDetail,
      isGraphDetailLoading,
      graphDetailError,
      focusedNodeId,
      handleSelectGraph,
      handleClearGraphDetail,
      handleFocusNode,
    },
    investigation: {
      evidenceChains,
      queueItems,
      sessionNotes,
      setSessionNotes,
      currentAssetSummary,
      nodeEvidenceMap,
      deltaBaseline,
      setDeltaBaseline,
      investigationReview,
      handleReviewChange,
      handleClearReview,
      questionMatrixState,
      handleQuestionMatrixUpdate,
      handleQuestionMatrixReset,
      closureState,
      handleClosureChange,
      handleClosureReset,
      handleQueueEvidence,
      handleUpdateQueueItem,
      handleRemoveQueueItem,
      handleClearQueue,
      handleQueueNode,
    },
    drawer: {
      isDrawerOpen,
      setIsDrawerOpen,
      activeDrawerItem,
      setActiveDrawerItem,
      openDrawer,
      closeDrawer,
      toggleDrawer,
    },
    agent: {
      sessions,
      sessionGroups,
      selectedSessionId,
      setSelectedSessionId,
      selectedSession,
      selectedApproval,
      selectedErrors,
      selectedEvents,
      isSessionLoading,
      sessionLoadError,
      actionSessionId,
      hasRunningSession,
      refreshSessions,
      startSession,
      startSessionWithIntent,
      startChildAssetSession,
      retrySessionAsNew,
      resumeSession,
      cancelSession,
      discardSession,
      approveSelected,
      rejectSelected,
      handleNewSession,
      isDraftSession,
      draftFocusRequestId,
      selectSession,
    },
    composer: {
      state: composerState,
      modeChoice: composerModeChoice,
      targetChoice: composerTargetChoice,
      setComposerMode,
      selectAssetTarget,
      clearComposerChoice,
      validateSendBeforeStart,
      currentAsset,
      openAssets,
      hasProjectContext,
    },
    inspector: inspectorData,
    status: statusViewModel,
  };
}
