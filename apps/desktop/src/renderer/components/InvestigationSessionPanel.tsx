import { useMemo, useCallback, useRef, useState } from 'react';
import type { OmueContextSnapshot, EvidenceChain } from '@omue/shared-protocol';
import type { BlueprintGraphDetailData } from '@omue/shared-protocol';
import type { QueueItem } from './InvestigationQueuePanel';
import type { NodeEvidenceSummary } from './GraphDetailPanel';
import { useDesktopCopy } from '../i18n';

// ── Types ──────────────────────────────────────────────────────

type StageStatus = 'Ready' | 'Attention' | 'Missing' | 'Info';
type PanelTarget = 'report' | 'review' | 'queue' | 'handoff';

// E54: Local investigation review state (memory-only, not persisted).
export interface InvestigationReviewState {
  reviewStatus: 'draft' | 'verifying' | 'ready' | 'blocked';
  currentQuestion: string;
  workingTheory: string;
  confirmedFacts: string;
  rejectedHypotheses: string;
  openQuestions: string;
  verificationPlan: string;
  finalConclusion: string;
  riskNotes: string;
  reviewer: string;
  updatedAt: string | null;
  contextSignatureAtUpdate: string | null;
  checklist: {
    contextReviewed: boolean;
    evidenceReviewed: boolean;
    graphReviewed: boolean;
    logsReviewed: boolean;
    queueTriaged: boolean;
    safetyBoundaryConfirmed: boolean;
    readyForHandoff: boolean;
  };
}

export const defaultReviewState: InvestigationReviewState = {
  reviewStatus: 'draft',
  currentQuestion: '',
  workingTheory: '',
  confirmedFacts: '',
  rejectedHypotheses: '',
  openQuestions: '',
  verificationPlan: '',
  finalConclusion: '',
  riskNotes: '',
  reviewer: '',
  updatedAt: null,
  contextSignatureAtUpdate: null,
  checklist: {
    contextReviewed: false,
    evidenceReviewed: false,
    graphReviewed: false,
    logsReviewed: false,
    queueTriaged: false,
    safetyBoundaryConfirmed: false,
    readyForHandoff: false,
  },
};

interface WorkflowStage {
  label: string;
  status: StageStatus;
  detail: string;
  targetPanel?: PanelTarget;
}

interface NextAction {
  label: string;
  detail: string;
  targetPanel?: PanelTarget;
}

type CopyState = 'idle' | 'copied' | 'error';

// ── Props ──────────────────────────────────────────────────────

interface Props {
  snapshot: OmueContextSnapshot;
  evidenceChains: EvidenceChain[];
  graphDetail: BlueprintGraphDetailData | null;
  nodeEvidenceMap?: Record<string, NodeEvidenceSummary[]>;
  queueItems: QueueItem[];
  queueSessionNotes: string;
  selectedGraphId: string | null;
  lastUpdatedAt: string | null;
  onOpenPanel: (panel: PanelTarget) => void;
  // E54: Memory-only investigation review state
  investigationReview: InvestigationReviewState;
  onReviewChange: (update: Partial<InvestigationReviewState>) => void;
  onClearReview: () => void;
}

// ── ReviewField helper ─────────────────────────────────────────

function ReviewField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="is-review-field">
      <span className="is-review-field-label">{label}</span>
      <textarea
        className="is-review-textarea"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        rows={3}
      />
    </div>
  );
}

// ── Component ──────────────────────────────────────────────────

export function InvestigationSessionPanel({
  snapshot,
  evidenceChains,
  graphDetail,
  nodeEvidenceMap,
  queueItems,
  queueSessionNotes,
  selectedGraphId,
  lastUpdatedAt,
  onOpenPanel,
  investigationReview,
  onReviewChange,
  onClearReview,
}: Props) {
  const { copy } = useDesktopCopy();
  const sc = copy.session;

  function statusBadgeClass(status: StageStatus): string {
    switch (status) {
      case copy.session.statusReady as StageStatus: return 'is-badge-ready';
      case copy.session.statusAttention as StageStatus: return 'is-badge-attention';
      case copy.session.statusMissing as StageStatus: return 'is-badge-missing';
      case copy.session.statusInfo as StageStatus: return 'is-badge-info';
      default: return '';
    }
  }

  const [copyState, setCopyState] = useState<CopyState>('idle');
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  // ── Derived counts ─────────────────────────────────────────

  const evidenceItemCount = evidenceChains.reduce((sum, c) => sum + c.items.length, 0);
  const unresolvedCount = evidenceChains.reduce((sum, c) => sum + c.unresolvedCount, 0);
  const queueTodo = queueItems.filter(i => i.investigationStatus === 'todo').length;
  const queueReviewed = queueItems.filter(i => i.investigationStatus === 'reviewed').length;
  const queueDeferred = queueItems.filter(i => i.investigationStatus === 'deferred').length;
  const queueHigh = queueItems.filter(i => i.priority === 'high').length;
  const queueNormal = queueItems.filter(i => i.priority === 'normal').length;
  const queueLow = queueItems.filter(i => i.priority === 'low').length;

  const cs = snapshot.compileStatus;
  const rs = snapshot.runtimeStatus;

  // ── Workflow readiness ─────────────────────────────────────

  const stages = useMemo((): WorkflowStage[] => {
    const result: WorkflowStage[] = [];

    // Context
    if (snapshot.currentAsset) {
      result.push({
        label: copy.session.stageContext,
        status: copy.session.statusReady as StageStatus,
        detail: `${copy.session.captured}: ${snapshot.capturedAt}`,
      });
    } else {
      result.push({
        label: copy.session.stageContext,
        status: copy.session.statusMissing as StageStatus,
        detail: copy.session.sdNoAsset,
      });
    }

    // Evidence
    if (evidenceChains.length === 0) {
      result.push({
        label: copy.session.stageEvidence,
        status: copy.session.statusInfo as StageStatus,
        detail: copy.session.sdNoEvidence,
      });
    } else if (unresolvedCount > 0) {
      result.push({
        label: copy.session.stageEvidence,
        status: copy.session.statusAttention as StageStatus,
        detail: `${evidenceChains.length} ${copy.common.chains}, ${evidenceItemCount} ${copy.common.items}, ${unresolvedCount} ${copy.common.unresolved}`,
      });
    } else {
      result.push({
        label: copy.session.stageEvidence,
        status: copy.session.statusReady as StageStatus,
        detail: `${evidenceChains.length} ${copy.common.chains}, ${evidenceItemCount} ${copy.common.items}`,
      });
    }

    // Graph Detail
    if (!graphDetail?.selectedBlueprint) {
      result.push({
        label: copy.session.stageGraphDetail,
        status: copy.session.statusInfo as StageStatus,
        detail: copy.session.sdNoGraph,
        targetPanel: 'report',
      });
    } else {
      const g = graphDetail.selectedBlueprint.graph;
      const d = g.detail;
      const errCount = d.nodes.filter(n => n.errorType === 'error').length;
      const disabledCount = d.nodes.filter(n => n.isDisabled === true).length;
      const nevNodeCount = nodeEvidenceMap ? Object.keys(nodeEvidenceMap).length : 0;
      if (errCount > 0 || disabledCount > 0) {
        result.push({
          label: copy.session.stageGraphDetail,
          status: copy.session.statusAttention as StageStatus,
          detail: `${g.name} (${g.kind}) / ${d.nodes.length} ${copy.common.nodes} ${d.links.length} ${copy.common.links} / ${errCount} ${copy.common.error} ${disabledCount} ${copy.common.disabled}${nevNodeCount > 0 ? ` / ${nevNodeCount} ${copy.common.evidence}` : ''}`,
        });
      } else {
        result.push({
          label: copy.session.stageGraphDetail,
          status: copy.session.statusReady as StageStatus,
          detail: `${g.name} (${g.kind}) / ${d.nodes.length} ${copy.common.nodes} ${d.links.length} ${copy.common.links}${nevNodeCount > 0 ? ` / ${nevNodeCount} ${copy.common.evidence}` : ''}`,
        });
      }
    }

    // Queue
    if (queueItems.length === 0) {
      result.push({
        label: copy.session.stageQueue,
        status: copy.session.statusInfo as StageStatus,
        detail: copy.session.sdNoQueue,
        targetPanel: 'queue',
      });
    } else if (queueTodo > 0 || queueHigh > 0) {
      result.push({
        label: copy.session.stageQueue,
        status: copy.session.statusAttention as StageStatus,
        detail: `${queueItems.length} ${copy.common.items} / ${copy.queue.mdStatusSummary(queueTodo, queueReviewed, queueDeferred)} / ${copy.queue.mdPrioritySummary(queueHigh, queueNormal, queueLow)}`,
        targetPanel: 'queue',
      });
    } else {
      result.push({
        label: copy.session.stageQueue,
        status: copy.session.statusReady as StageStatus,
        detail: `${queueItems.length} ${copy.common.items} / ${copy.queue.mdStatusSummary(queueTodo, queueReviewed, queueDeferred)}`,
        targetPanel: 'queue',
      });
    }

    // Review
    result.push({
      label: copy.session.stageReview,
      status: copy.session.statusInfo as StageStatus,
      detail: copy.session.sdOpenReview,
      targetPanel: 'review',
    });

    // Handoff
    result.push({
      label: copy.session.stageHandoff,
      status: copy.session.statusInfo as StageStatus,
      detail: copy.session.sdOpenHandoff,
      targetPanel: 'handoff',
    });

    // Safety
    const hasCompileIssue = cs.lastCompileResult === 'failed' || cs.errorCount > 0 || cs.isCompiling;
    const hasRuntimeIssue = rs.isPieRunning || rs.isSimulating;
    if (hasCompileIssue || hasRuntimeIssue) {
      const parts: string[] = [];
      if (hasCompileIssue) parts.push(cs.isCompiling ? copy.session.sdCompiling : copy.session.sdCompileResult(`${cs.lastCompileResult} (${cs.errorCount}e/${cs.warningCount}w)`));
      if (hasRuntimeIssue) parts.push(rs.isPieRunning ? copy.session.sdPieRunning : copy.session.sdSimulating);
      result.push({
        label: copy.session.stageSafety,
        status: copy.session.statusAttention as StageStatus,
        detail: parts.join(' / '),
      });
    } else {
      result.push({
        label: copy.session.stageSafety,
        status: copy.session.statusReady as StageStatus,
        detail: copy.session.sdSafetyOk,
      });
    }

    return result;
  }, [copy, snapshot, evidenceChains, evidenceItemCount, unresolvedCount, graphDetail, nodeEvidenceMap, queueItems, queueTodo, queueReviewed, queueDeferred, queueHigh, queueNormal, queueLow, cs, rs]);

  // ── Next actions ────────────────────────────────────────────

  const nextActions = useMemo((): NextAction[] => {
    const actions: NextAction[] = [];

    // Compile issues -> open Report
    if (cs.isCompiling || cs.lastCompileResult === 'failed' || cs.errorCount > 0) {
      actions.push({
        label: copy.session.naReviewCompile,
        detail: cs.isCompiling ? copy.session.naCompilingDetail : `${cs.errorCount} ${copy.common.errors}, ${cs.warningCount} ${copy.common.warnings}`,
        targetPanel: 'report',
      });
    }

    // Queue has todo items -> open Queue
    if (queueTodo > 0) {
      actions.push({
        label: copy.session.naTriageQueue,
        detail: copy.session.naItemsNeedReview(queueTodo),
        targetPanel: 'queue',
      });
    }

    // Graph detail with errors
    if (graphDetail?.selectedBlueprint) {
      const d = graphDetail.selectedBlueprint.graph.detail;
      const errCount = d.nodes.filter(n => n.errorType === 'error').length;
      if (errCount > 0) {
        actions.push({
          label: copy.session.naInspectGraph,
          detail: copy.session.naNodesWithErrors(errCount),
        });
      }
    }

    // Review panel
    actions.push({
      label: copy.session.naRunReview,
      detail: copy.session.naRunReviewDetail,
      targetPanel: 'review',
    });

    // Handoff
    actions.push({
      label: copy.session.naPrepareHandoff,
      detail: copy.session.naHandoffDetail,
      targetPanel: 'handoff',
    });

    return actions;
  }, [copy, cs, queueTodo, evidenceChains, queueItems, graphDetail]);

  // ── Markdown brief builder ──────────────────────────────────

  const buildBrief = useCallback((): string => {
    const lines: string[] = [];

    lines.push(copy.session.mdTitle);
    lines.push('');
    lines.push(`${copy.session.mdGenerated} ${new Date().toISOString()}`);
    lines.push(`${copy.session.mdCaptured} ${snapshot.capturedAt}`);
    if (lastUpdatedAt) {
      lines.push(`${copy.session.mdLastRefresh} ${lastUpdatedAt}`);
    }
    lines.push('');

    // Project / current asset
    lines.push(copy.session.mdProjectAsset);
    lines.push('');
    lines.push(`- **${copy.common.project}:** ${snapshot.project.projectName}`);
    lines.push(`- **${copy.common.engine}:** ${snapshot.project.engineVersion}`);
    lines.push(`- **${copy.common.bridge}:** ${snapshot.bridgeVersion}`);
    lines.push(`- **${copy.session.editor}:** ${snapshot.project.editorStatus}`);
    if (snapshot.currentAsset) {
      const a = snapshot.currentAsset;
      lines.push(`- **${copy.common.asset}:** ${a.assetName}`);
      lines.push(`- **${copy.common.path}:** ${a.assetPath}`);
      lines.push(`- **${copy.common.classLabel}:** ${a.assetClass}`);
      lines.push(`- **${copy.common.dirty}:** ${a.isDirty ? copy.common.yes : copy.common.no}`);
    } else {
      lines.push(`- **${copy.common.asset}:** ${copy.common.unavailable}`);
    }
    lines.push('');

    // Compile / runtime
    lines.push(copy.session.mdCompileRuntime);
    lines.push('');
    lines.push(`- **${copy.session.mdCompiling}:** ${cs.isCompiling ? copy.common.yes : copy.common.no}`);
    lines.push(`- **${copy.session.mdLastResult}:** ${cs.lastCompileResult}`);
    lines.push(`- **${copy.common.errors}:** ${cs.errorCount}`);
    lines.push(`- **${copy.common.warnings}:** ${cs.warningCount}`);
    lines.push(`- **${copy.common.pie}:** ${rs.isPieRunning ? copy.common.running : copy.common.stopped}`);
    lines.push(`- **${copy.common.simulating}:** ${rs.isSimulating ? copy.common.yes : copy.common.no}`);
    lines.push('');

    // Evidence
    lines.push(`## ${copy.common.evidence}`);
    lines.push('');
    lines.push(`- **${copy.common.chains}:** ${evidenceChains.length}`);
    lines.push(`- **${copy.common.totalItems}:** ${evidenceItemCount}`);
    lines.push(`- **${copy.common.unresolved}:** ${unresolvedCount}`);
    if (evidenceChains.length > 0) {
      for (const chain of evidenceChains) {
        lines.push(`  - ${chain.title}: ${copy.session.mdEvidenceChainLine(chain.items.length, chain.overallConfidence)}`);
      }
    }
    lines.push('');

    // Loaded graph detail
    lines.push(copy.session.mdLoadedGraphDetail);
    lines.push('');
    if (!graphDetail?.selectedBlueprint) {
      lines.push(copy.session.notLoadedGraph);
    } else {
      const g = graphDetail.selectedBlueprint.graph;
      const d = g.detail;
      lines.push(`- **${copy.common.graphs}:** ${g.name} (${g.kind})`);
      lines.push(`- ${copy.session.mdGraphCounts(d.nodes.length, d.links.length)}`);
      const errCount = d.nodes.filter(n => n.errorType === 'error').length;
      const warnCount = d.nodes.filter(n => n.errorType === 'warning').length;
      const disCount = d.nodes.filter(n => n.isDisabled === true).length;
      if (errCount > 0 || warnCount > 0 || disCount > 0) {
        lines.push(`- **${copy.common.status}:** ${copy.session.mdNodeStatusSummary(errCount, warnCount, disCount)}`);
      }
      if (d.truncation?.truncated) {
        lines.push(`- **${copy.common.truncated}:** ${copy.session.mdTruncatedWithReason(d.truncation.reason)}`);
      }
      if (nodeEvidenceMap) {
        const nCount = Object.keys(nodeEvidenceMap).length;
        const iCount = Object.values(nodeEvidenceMap).reduce((sum, arr) => sum + arr.length, 0);
        lines.push(`- **${copy.common.nodeEvidence}:** ${copy.session.mdNodeEvidenceSummary(nCount, iCount)}`);
      }
    }
    lines.push('');

    // Queue
    lines.push(`## ${copy.session.queue}`);
    lines.push('');
    lines.push(`- **${copy.common.total}:** ${queueItems.length}`);
    lines.push(`- **${copy.common.status}:** ${copy.session.mdQueueStatus(queueTodo, queueReviewed, queueDeferred)}`);
    lines.push(`- **${copy.common.priority}:** ${copy.session.mdQueuePriority(queueHigh, queueNormal, queueLow)}`);
    if (queueItems.length > 0) {
      lines.push('');
      for (const item of queueItems) {
        lines.push(`- [${copy.queue.priorityValue(item.priority)}] ${item.title} (${copy.queue.statusValue(item.investigationStatus)})`);
      }
    }
    lines.push('');

    // Next actions
    lines.push(`## ${copy.session.nextActions}`);
    lines.push('');
    for (const action of nextActions) {
      const target = action.targetPanel ? ` → ${action.targetPanel}` : '';
      lines.push(`- **${action.label}**${target}: ${action.detail}`);
    }
    lines.push('');

    // Safety
    lines.push(`## ${copy.common.safety}`);
    lines.push('');
    lines.push(copy.session.briefSafetyText);
    lines.push(copy.session.briefSafetyText2);
    lines.push(copy.session.briefSafetyText3);

    return lines.join('\n');
  }, [copy, snapshot, lastUpdatedAt, cs, rs, evidenceChains, evidenceItemCount, unresolvedCount, graphDetail, nodeEvidenceMap, queueItems, queueTodo, queueReviewed, queueDeferred, queueHigh, queueNormal, queueLow, nextActions]);

  const briefMarkdown = buildBrief();

  // ── Copy handler ────────────────────────────────────────────

  const handleCopy = useCallback(async () => {
    if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    try {
      await navigator.clipboard.writeText(briefMarkdown);
      setCopyState('copied');
    } catch {
      setCopyState('error');
    }
    copyTimeoutRef.current = setTimeout(() => setCopyState('idle'), 3000);
  }, [briefMarkdown]);

  // ── Review state (E54) ────────────────────────────────────

  const [reviewCopyState, setReviewCopyState] = useState<CopyState>('idle');
  const reviewCopyTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  // Derived review content checks
  const hasReviewContent = investigationReview.currentQuestion.trim().length > 0
    || investigationReview.workingTheory.trim().length > 0
    || investigationReview.confirmedFacts.trim().length > 0;

  const requiredReviewFieldsFilled = investigationReview.currentQuestion.trim().length > 0
    && investigationReview.workingTheory.trim().length > 0;

  const checklistDoneCount = Object.values(investigationReview.checklist).filter(Boolean).length;
  const checklistTotal = Object.keys(investigationReview.checklist).length;
  const allChecklistDone = checklistDoneCount === checklistTotal;

  const isReviewStale = !!(
    investigationReview.updatedAt
    && lastUpdatedAt
    && investigationReview.updatedAt < lastUpdatedAt
  );

  // ── Review readiness items (deterministic, no AI) ─────────

  const readinessItems = useMemo((): { label: string; status: string }[] => {
    const items: { label: string; status: string }[] = [];

    // Asset presence
    if (snapshot.currentAsset) {
      items.push({ label: sc.rdAssetPresent, status: 'ok' });
    } else {
      items.push({ label: copy.session.sdNoAsset, status: 'missing' });
    }

    // Evidence chains
    if (evidenceChains.length > 0) {
      items.push({ label: sc.rdEvidenceChains(evidenceChains.length), status: 'ok' });
      if (unresolvedCount > 0) {
        items.push({ label: sc.rdUnresolvedEvidence(unresolvedCount), status: 'warn' });
      }
    }

    // Graph detail
    if (graphDetail?.selectedBlueprint) {
      const g = graphDetail.selectedBlueprint.graph;
      items.push({ label: sc.rdGraphLoaded(g.name), status: 'ok' });
      const errCount = g.detail.nodes.filter(n => n.errorType === 'error').length;
      const warnCount = g.detail.nodes.filter(n => n.errorType === 'warning').length;
      if (errCount > 0) {
        items.push({ label: sc.rdGraphHasErrors(errCount), status: 'warn' });
      }
      if (warnCount > 0) {
        items.push({ label: sc.rdGraphHasWarnings(warnCount), status: 'warn' });
      }
    } else {
      items.push({ label: sc.rdGraphNotLoaded, status: 'info' });
    }

    // Queue
    if (queueTodo > 0) {
      items.push({ label: sc.rdQueueTodo(queueTodo), status: 'warn' });
    }

    // Session notes
    if (queueSessionNotes.trim().length > 0) {
      items.push({ label: sc.rdSessionNotesPresent, status: 'ok' });
    } else {
      items.push({ label: sc.rdSessionNotesEmpty, status: 'info' });
    }

    // Checklist
    items.push({ label: sc.rdChecklistDone(checklistDoneCount, checklistTotal), status: allChecklistDone ? 'ok' : 'warn' });

    // Context captured at
    if (lastUpdatedAt) {
      items.push({ label: `${sc.rdContextUpdated} ${lastUpdatedAt}`, status: 'ok' });
    }

    return items;
  }, [copy, snapshot, evidenceChains, unresolvedCount, graphDetail, queueTodo, queueSessionNotes, checklistDoneCount, checklistTotal, allChecklistDone, lastUpdatedAt]);

  // ── Review gaps ───────────────────────────────────────────

  const readinessGaps = useMemo((): string[] => {
    const gaps: string[] = [];

    // Check empty required fields
    if (!investigationReview.currentQuestion.trim()) gaps.push(sc.currentQuestionLabel);
    if (!investigationReview.workingTheory.trim()) gaps.push(sc.workingTheoryLabel);
    if (!investigationReview.confirmedFacts.trim()) gaps.push(sc.confirmedFactsLabel);

    // Check uncompleted checklist
    const checklistMap = [
      ['contextReviewed', sc.clContextReviewed] as const,
      ['evidenceReviewed', sc.clEvidenceReviewed] as const,
      ['graphReviewed', sc.clGraphReviewed] as const,
      ['logsReviewed', sc.clLogsReviewed] as const,
      ['queueTriaged', sc.clQueueTriaged] as const,
      ['safetyBoundaryConfirmed', sc.clSafetyBoundaryConfirmed] as const,
      ['readyForHandoff', sc.clReadyForHandoff] as const,
    ];
    for (const [key, label] of checklistMap) {
      if (!investigationReview.checklist[key]) {
        gaps.push(label);
      }
    }

    if (gaps.length === 0 && !hasReviewContent) {
      return [sc.reviewFieldsMissing];
    }

    return gaps;
  }, [investigationReview, copy]);

  // ── Review markdown package builder ───────────────────────

  const buildReviewPackage = useCallback((): string => {
    const lines: string[] = [];

    lines.push(sc.mdReviewPackageTitle);
    lines.push('');
    lines.push(sc.mdGeneratedAt(new Date().toISOString()));
    if (snapshot.capturedAt) {
      lines.push(`${copy.session.mdCaptured} ${snapshot.capturedAt}`);
    }
    if (investigationReview.updatedAt) {
      lines.push(sc.mdUpdatedAt);
      lines.push(`${investigationReview.updatedAt}`);
    }
    if (selectedGraphId) {
      lines.push(`- **Selected Graph ID:** ${selectedGraphId}`);
    }
    lines.push('');

    // Context / asset
    lines.push(`${sc.mdContextAsset}`);
    if (snapshot.currentAsset) {
      const a = snapshot.currentAsset;
      lines.push(`- ${a.assetName} (${a.assetClass})`);
      lines.push(`- ${a.assetPath}`);
    } else {
      lines.push(`- ${copy.common.unavailable}`);
    }
    lines.push('');

    // Review status / reviewer
    lines.push(`${sc.mdReviewStatus} ${sc[`reviewStatus${investigationReview.reviewStatus.charAt(0).toUpperCase() + investigationReview.reviewStatus.slice(1)}` as keyof typeof sc] as string}`);
    if (investigationReview.reviewer) {
      lines.push(`${sc.mdReviewer} ${investigationReview.reviewer}`);
    }
    lines.push('');

    // Stale warning
    if (isReviewStale) {
      lines.push(sc.mdStaleWarning);
      lines.push('');
    }

    // Readiness summary
    lines.push(sc.mdReadinessSummary);
    for (const item of readinessItems) {
      lines.push(`- [${item.status === 'ok' ? 'x' : ' '}] ${item.label}`);
    }
    if (readinessGaps.length > 0) {
      for (const gap of readinessGaps) {
        lines.push(`  - ⚠️ ${gap}`);
      }
    }
    lines.push('');

    // Manual review fields
    if (investigationReview.currentQuestion.trim()) {
      lines.push(sc.mdCurrentQuestion);
      lines.push(investigationReview.currentQuestion);
      lines.push('');
    }
    if (investigationReview.workingTheory.trim()) {
      lines.push(sc.mdWorkingTheory);
      lines.push(investigationReview.workingTheory);
      lines.push('');
    }
    if (investigationReview.confirmedFacts.trim()) {
      lines.push(sc.mdConfirmedFacts);
      lines.push(investigationReview.confirmedFacts);
      lines.push('');
    }
    if (investigationReview.rejectedHypotheses.trim()) {
      lines.push(sc.mdRejectedHypotheses);
      lines.push(investigationReview.rejectedHypotheses);
      lines.push('');
    }
    if (investigationReview.openQuestions.trim()) {
      lines.push(sc.mdOpenQuestions);
      lines.push(investigationReview.openQuestions);
      lines.push('');
    }
    if (investigationReview.verificationPlan.trim()) {
      lines.push(sc.mdVerificationPlan);
      lines.push(investigationReview.verificationPlan);
      lines.push('');
    }
    if (investigationReview.finalConclusion.trim()) {
      lines.push(sc.mdFinalConclusion);
      lines.push(investigationReview.finalConclusion);
      lines.push('');
    }
    if (investigationReview.riskNotes.trim()) {
      lines.push(sc.mdRiskNotes);
      lines.push(investigationReview.riskNotes);
      lines.push('');
    }

    // Checklist state
    lines.push(sc.mdChecklistState);
    const clMap: [keyof typeof investigationReview.checklist, string][] = [
      ['contextReviewed', sc.clContextReviewed],
      ['evidenceReviewed', sc.clEvidenceReviewed],
      ['graphReviewed', sc.clGraphReviewed],
      ['logsReviewed', sc.clLogsReviewed],
      ['queueTriaged', sc.clQueueTriaged],
      ['safetyBoundaryConfirmed', sc.clSafetyBoundaryConfirmed],
      ['readyForHandoff', sc.clReadyForHandoff],
    ];
    for (const [key, label] of clMap) {
      lines.push(`- [${investigationReview.checklist[key] ? 'x' : ' '}] ${label}`);
    }
    lines.push('');

    // Evidence summary
    lines.push(sc.mdEvidenceSummary);
    lines.push(`- ${sc.rdEvidenceChains(evidenceChains.length)}`);
    lines.push(`- ${sc.rdUnresolvedEvidence(unresolvedCount)}`);
    if (evidenceChains.length > 0) {
      for (const chain of evidenceChains) {
        lines.push(`  - ${chain.title}: ${copy.session.mdEvidenceChainLine(chain.items.length, chain.overallConfidence)}`);
      }
    }
    lines.push('');

    // Graph diagnostic summary
    lines.push(sc.mdGraphDiagSummary);
    if (graphDetail?.selectedBlueprint) {
      const g = graphDetail.selectedBlueprint.graph;
      const d = g.detail;
      const errCount = d.nodes.filter(n => n.errorType === 'error').length;
      const warnCount = d.nodes.filter(n => n.errorType === 'warning').length;
      const disCount = d.nodes.filter(n => n.isDisabled === true).length;
      lines.push(`- ${g.name} (${g.kind})`);
      lines.push(`- ${d.nodes.length} nodes, ${d.links.length} links`);
      if (errCount > 0) lines.push(`- ${sc.rdGraphHasErrors(errCount)}`);
      if (warnCount > 0) lines.push(`- ${sc.rdGraphHasWarnings(warnCount)}`);
      if (disCount > 0) lines.push(`- ${disCount} disabled node(s)`);
      if (nodeEvidenceMap) {
        const nCount = Object.keys(nodeEvidenceMap).length;
        const iCount = Object.values(nodeEvidenceMap).reduce((sum, arr) => sum + arr.length, 0);
        lines.push(`- ${nCount} node(s) with evidence, ${iCount} evidence item(s)`);
      }
    } else {
      lines.push(`- ${sc.rdGraphNotLoaded}`);
    }
    lines.push('');

    // Queue summary
    lines.push(sc.mdQueueSummary);
    lines.push(`- ${queueItems.length} total item(s)`);
    lines.push(`- ${copy.session.mdQueueStatus(queueTodo, queueReviewed, queueDeferred)}`);
    lines.push(`- ${copy.session.mdQueuePriority(queueHigh, queueNormal, queueLow)}`);
    lines.push('');

    // Session notes
    lines.push(sc.mdSessionNotes);
    if (queueSessionNotes.trim().length > 0) {
      lines.push(queueSessionNotes);
    } else {
      lines.push(`- ${sc.rdSessionNotesEmpty}`);
    }
    lines.push('');

    // Safety note
    lines.push(sc.mdSafetyNote);
    lines.push(`- ${sc.mdSafetyReadOnly}`);
    lines.push(`- ${sc.mdSafetyNoAI}`);
    lines.push(`- ${sc.mdSafetyNoBridge}`);
    lines.push(`- ${sc.mdSafetyNoFix}`);
    lines.push(`- ${sc.mdSafetyNoAssetWrite}`);
    lines.push(`- ${sc.mdSafetyNoCompile}`);

    return lines.join('\n');
  }, [copy, snapshot, investigationReview, selectedGraphId, isReviewStale, readinessItems, readinessGaps, evidenceChains, unresolvedCount, graphDetail, nodeEvidenceMap, queueItems, queueTodo, queueReviewed, queueDeferred, queueHigh, queueNormal, queueLow, queueSessionNotes]);

  const reviewPackageMarkdown = buildReviewPackage();

  // ── Review copy handler ────────────────────────────────────

  const handleCopyReview = useCallback(async () => {
    if (reviewCopyTimeoutRef.current) clearTimeout(reviewCopyTimeoutRef.current);
    try {
      await navigator.clipboard.writeText(reviewPackageMarkdown);
      setReviewCopyState('copied');
    } catch {
      setReviewCopyState('error');
    }
    reviewCopyTimeoutRef.current = setTimeout(() => setReviewCopyState('idle'), 3000);
  }, [reviewPackageMarkdown]);

  const handleClearReviewClick = useCallback(() => {
    if (!showClearConfirm) {
      setShowClearConfirm(true);
      setTimeout(() => setShowClearConfirm(false), 3000);
      return;
    }
    setShowClearConfirm(false);
    onClearReview();
  }, [showClearConfirm, onClearReview]);

  // ── Render ──────────────────────────────────────────────────

  return (
    <section className="is-panel">
      <div className="is-toolbar">
        <h2 className="section-title" style={{ marginBottom: 0 }}>
          {copy.session.title}
        </h2>
        <div className="is-toolbar-actions">
          {copyState === 'copied' && (
            <span className="is-copy-status is-copy-ok">{copy.session.copied}</span>
          )}
          {copyState === 'error' && (
            <span className="is-copy-status is-copy-error">
              {copy.session.copyFailed}
            </span>
          )}
          <button className="refresh-button is-copy-btn" onClick={handleCopy}>
            {copy.session.copyBrief}
          </button>
        </div>
      </div>

      {/* ── Overview Strip ─────────────────────────────────── */}
      <div className="is-overview">
        <div className="is-overview-item">
          <span className="is-overview-label">{copy.session.captured}</span>
          <span className="is-overview-value">{snapshot.capturedAt}</span>
        </div>
        {lastUpdatedAt && (
          <div className="is-overview-item">
            <span className="is-overview-label">{copy.session.refresh}</span>
            <span className="is-overview-value">{lastUpdatedAt}</span>
          </div>
        )}
        <div className="is-overview-item">
          <span className="is-overview-label">{copy.session.asset}</span>
          <span className="is-overview-value">
            {snapshot.currentAsset
              ? <>{snapshot.currentAsset.assetName}<br />{snapshot.currentAsset.assetPath}</>
              : copy.session.unavailable}
          </span>
        </div>
        <div className="is-overview-item">
          <span className="is-overview-label">{copy.session.bridge}</span>
          <span className="is-overview-value">{snapshot.bridgeVersion}</span>
        </div>
        <div className="is-overview-item">
          <span className="is-overview-label">{copy.session.editor}</span>
          <span className="is-overview-value">{snapshot.project.editorStatus}</span>
        </div>
        <div className="is-overview-item">
          <span className="is-overview-label">{copy.session.compile}</span>
          <span className={`is-overview-value${cs.isCompiling ? ' is-overview-attention' : cs.errorCount > 0 ? ' is-overview-attention' : ''}`}>
            {cs.isCompiling ? copy.session.compiling : `${cs.lastCompileResult} / ${cs.errorCount}e ${cs.warningCount}w`}
          </span>
        </div>
        <div className="is-overview-item">
          <span className="is-overview-label">{copy.session.runtime}</span>
          <span className="is-overview-value">
            {rs.isPieRunning ? copy.session.pieLabel : rs.isSimulating ? copy.session.simulatingLabel : copy.session.idleLabel}
          </span>
        </div>
        <div className="is-overview-item">
          <span className="is-overview-label">{copy.session.evidence}</span>
          <span className="is-overview-value">
            {evidenceChains.length}c/{evidenceItemCount}i{unresolvedCount > 0 ? ` (${unresolvedCount}u)` : ''}
          </span>
        </div>
        <div className="is-overview-item">
          <span className="is-overview-label">{copy.session.graph}</span>
          <span className="is-overview-value">
            {graphDetail?.selectedBlueprint
              ? `${graphDetail.selectedBlueprint.graph.name} (${graphDetail.selectedBlueprint.graph.kind}) / ${graphDetail.selectedBlueprint.graph.detail.nodes.length}n ${graphDetail.selectedBlueprint.graph.detail.links.length}l / ${graphDetail.selectedBlueprint.graph.detail.truncation?.truncated ? copy.session.truncatedGraph : copy.session.notTruncatedGraph}`
              : copy.session.notLoadedGraph}
          </span>
        </div>
        <div className="is-overview-item">
          <span className="is-overview-label">{copy.session.queue}</span>
          <span className="is-overview-value">
            {queueItems.length > 0
              ? `${queueItems.length} / ${queueTodo}t ${queueReviewed}r ${queueDeferred}d / ${queueHigh}H ${queueNormal}N ${queueLow}L`
              : `0 / 0t 0r 0d / 0H 0N 0L`}
          </span>
        </div>
      </div>

      {/* ── Workflow Readiness ──────────────────────────────── */}
      <div className="is-section">
        <h3 className="is-section-title">{copy.session.workflowReadiness}</h3>
        <div className="is-readiness">
          {stages.map((stage, i) => (
            <div key={i} className="is-readiness-row">
              <span className={`is-badge ${statusBadgeClass(stage.status)}`}>{stage.status}</span>
              <span className="is-readiness-label">{stage.label}</span>
              <span className="is-readiness-detail">{stage.detail}</span>
              {stage.targetPanel && (
                <button
                  className="is-action-btn"
                  onClick={() => onOpenPanel(stage.targetPanel!)}
                >
                  {copy.session.openBtn}
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── Next Actions ────────────────────────────────────── */}
      <div className="is-section">
        <h3 className="is-section-title">{copy.session.nextActions}</h3>
        <div className="is-actions-list">
          {nextActions.map((action, i) => (
            <div key={i} className="is-action-row">
              <div className="is-action-info">
                <span className="is-action-label">{action.label}</span>
                <span className="is-action-detail">{action.detail}</span>
              </div>
              {action.targetPanel && (
                <button
                  className="is-action-btn"
                  onClick={() => onOpenPanel(action.targetPanel!)}
                >
                  {action.targetPanel.charAt(0).toUpperCase() + action.targetPanel.slice(1)}
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── Bug Investigation Session Review (E54) ───────────── */}
      <div className="is-section is-review-section">
        <h3 className="is-section-title">{sc.reviewTitle}</h3>

        {/* Status selector + reviewer */}
        <div className="is-review-header">
          <div className="is-review-status-row">
            <span className="is-review-label">{sc.reviewStatusLabel}</span>
            <div className="is-review-status-group">
              {(['draft', 'verifying', 'ready', 'blocked'] as const).map(status => (
                <button
                  key={status}
                  className={`is-review-status-btn${investigationReview.reviewStatus === status ? ' is-review-status-btn-active' : ''}`}
                  onClick={() => onReviewChange({ reviewStatus: status })}
                  type="button"
                >
                  {sc[`reviewStatus${status.charAt(0).toUpperCase() + status.slice(1)}` as keyof typeof sc] as string}
                </button>
              ))}
            </div>
          </div>
          <div className="is-review-reviewer-row">
            <span className="is-review-label">{sc.reviewerLabel}</span>
            <input
              className="is-review-input is-review-reviewer-input"
              type="text"
              value={investigationReview.reviewer}
              onChange={e => onReviewChange({ reviewer: e.target.value })}
              placeholder={sc.phReviewer}
            />
          </div>
        </div>

        {/* Readiness / Gap Summary */}
        <div className="is-review-readiness">
          <span className="is-review-readiness-title">{sc.readinessSummary}</span>
          {readinessItems.length === 0 ? (
            <div className="is-review-readiness-empty">{sc.noReviewState}</div>
          ) : (
            <div className="is-review-readiness-list">
              {readinessItems.map((item, i) => (
                <div key={i} className={`is-review-readiness-item is-review-readiness-${item.status}`}>
                  {item.label}
                </div>
              ))}
            </div>
          )}
          {isReviewStale && (
            <div className="is-review-readiness-stale">
              {sc.contextStaleWarning}
            </div>
          )}
          {hasReviewContent && readinessGaps.length > 0 && (
            <div className="is-review-readiness-gaps">
              <span className="is-review-readiness-title">{sc.gapSummary}</span>
              <div className="is-review-readiness-list">
                {readinessGaps.map((gap, i) => (
                  <div key={i} className="is-review-readiness-item is-review-readiness-missing">
                    {gap}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Text fields */}
        <div className="is-review-fields">
          <ReviewField
            label={sc.currentQuestionLabel}
            value={investigationReview.currentQuestion}
            onChange={v => onReviewChange({ currentQuestion: v })}
            placeholder={sc.phCurrentQuestion}
          />
          <ReviewField
            label={sc.workingTheoryLabel}
            value={investigationReview.workingTheory}
            onChange={v => onReviewChange({ workingTheory: v })}
            placeholder={sc.phWorkingTheory}
          />
          <ReviewField
            label={sc.confirmedFactsLabel}
            value={investigationReview.confirmedFacts}
            onChange={v => onReviewChange({ confirmedFacts: v })}
            placeholder={sc.phConfirmedFacts}
          />
          <ReviewField
            label={sc.rejectedHypothesesLabel}
            value={investigationReview.rejectedHypotheses}
            onChange={v => onReviewChange({ rejectedHypotheses: v })}
            placeholder={sc.phRejectedHypotheses}
          />
          <ReviewField
            label={sc.openQuestionsLabel}
            value={investigationReview.openQuestions}
            onChange={v => onReviewChange({ openQuestions: v })}
            placeholder={sc.phOpenQuestions}
          />
          <ReviewField
            label={sc.verificationPlanLabel}
            value={investigationReview.verificationPlan}
            onChange={v => onReviewChange({ verificationPlan: v })}
            placeholder={sc.phVerificationPlan}
          />
          <ReviewField
            label={sc.finalConclusionLabel}
            value={investigationReview.finalConclusion}
            onChange={v => onReviewChange({ finalConclusion: v })}
            placeholder={sc.phFinalConclusion}
          />
          <ReviewField
            label={sc.riskNotesLabel}
            value={investigationReview.riskNotes}
            onChange={v => onReviewChange({ riskNotes: v })}
            placeholder={sc.phRiskNotes}
          />
        </div>

        {/* Checklist */}
        <div className="is-review-checklist">
          {([
            ['contextReviewed', sc.clContextReviewed] as const,
            ['evidenceReviewed', sc.clEvidenceReviewed] as const,
            ['graphReviewed', sc.clGraphReviewed] as const,
            ['logsReviewed', sc.clLogsReviewed] as const,
            ['queueTriaged', sc.clQueueTriaged] as const,
            ['safetyBoundaryConfirmed', sc.clSafetyBoundaryConfirmed] as const,
            ['readyForHandoff', sc.clReadyForHandoff] as const,
          ]).map(([key, label]) => (
            <label key={key} className="is-review-check-row">
              <input
                type="checkbox"
                className="is-review-checkbox"
                checked={investigationReview.checklist[key]}
                onChange={e => onReviewChange({
                  checklist: { ...investigationReview.checklist, [key]: e.target.checked },
                })}
              />
              <span className="is-review-check-label">{label}</span>
            </label>
          ))}
        </div>

        {/* Actions */}
        <div className="is-review-actions">
          <button
            className="refresh-button is-review-action-btn is-review-action-clear"
            onClick={handleClearReviewClick}
            type="button"
          >
            {sc.clearReview}
          </button>
          <button
            className="refresh-button is-review-action-btn is-review-action-copy"
            onClick={handleCopyReview}
            type="button"
          >
            {sc.copySessionReview}
          </button>
          {reviewCopyState === 'copied' && (
            <span className="is-copy-status is-copy-ok">{copy.session.copied}</span>
          )}
          {reviewCopyState === 'error' && (
            <span className="is-copy-status is-copy-error">{copy.session.copyFailed}</span>
          )}
          {showClearConfirm && (
            <span className="is-review-clear-hint">{sc.clearReviewConfirm}</span>
          )}
        </div>

        {/* Markdown Preview */}
        {hasReviewContent && (
          <div className="is-review-preview">
            <pre className="is-preview-pre">{reviewPackageMarkdown}</pre>
          </div>
        )}
      </div>

      {/* ── Markdown Preview ────────────────────────────────── */}
      <div className="is-section is-preview-section">
        <h3 className="is-section-title">{copy.session.sessionBriefPreview}</h3>
        <pre className="is-preview-pre">{briefMarkdown}</pre>
      </div>
    </section>
  );
}
