import { useState, useEffect, useRef, useCallback } from 'react';
import type { OmueContextSnapshot, EvidenceChain } from '@omue/shared-protocol';
import type { BlueprintGraphDetailData } from '@omue/shared-protocol';
import type { QueueItem } from './InvestigationQueuePanel';
import type { NodeEvidenceSummary } from './GraphDetailPanel';
import { useDesktopCopy } from '../i18n';
import type { InvestigationReviewState } from './InvestigationSessionPanel';
import type { QuestionMatrixState, QuestionGenerationInputs } from './InvestigationQuestionMatrixPanel';
import { generateQuestions } from './InvestigationQuestionMatrixPanel';
import type { InfrastructureClosureState } from './InfrastructureClosurePanel';
import type { HandoffSourceBoundaryCopy } from '../i18n/types';
import type {
  HandoffSourceFact,
  HandoffSourceModel,
} from './workbench/handoffSourceAdapter';

// ── Types ──────────────────────────────────────────────────────

type SectionKey = 'overview' | 'queue' | 'evidence' | 'graphDetail' | 'recentLogs' | 'safety';

type PackagePreset = 'full' | 'reviewer' | 'queue-followup' | 'graph-evidence';

type ReadinessStatus = 'Ready' | 'Attention' | 'Missing' | 'Info';

interface ReadinessEntry {
  label: string;
  status: ReadinessStatus;
  detail: string;
}

interface ChecklistItem {
  label: string;
  checked: boolean;
}

const PRESET_SECTIONS: Record<PackagePreset, Record<SectionKey, boolean>> = {
  full: { overview: true, queue: true, evidence: true, graphDetail: true, recentLogs: true, safety: true },
  reviewer: { overview: true, queue: true, evidence: true, graphDetail: false, recentLogs: false, safety: true },
  'queue-followup': { overview: false, queue: true, evidence: false, graphDetail: false, recentLogs: false, safety: true },
  'graph-evidence': { overview: false, queue: false, evidence: true, graphDetail: true, recentLogs: false, safety: true },
};

type CopyState = 'idle' | 'copied' | 'error';

function appendSourceLine(
  lines: string[],
  source: HandoffSourceFact,
  copy: HandoffSourceBoundaryCopy,
): void {
  const updatedAt = source.updatedAt
    ? ` · **${copy.updatedAtLabel}:** ${source.updatedAt}`
    : '';
  lines.push(
    `**${copy.sourceLabel}:** ${copy.kinds[source.kind]} · **${copy.reasonLabel}:** ${copy.reasons[source.reason]}${updatedAt}`,
  );
  lines.push('');
}

// ── Props ──────────────────────────────────────────────────────

interface Props {
  snapshot: OmueContextSnapshot;
  evidenceChains: EvidenceChain[];
  graphDetail: BlueprintGraphDetailData | null;
  nodeEvidenceMap?: Record<string, NodeEvidenceSummary[]>;
  queueItems: QueueItem[];
  queueSessionNotes: string;
  currentAssetSummary?: string | null;
  lastUpdatedAt?: string | null;
  selectedGraphId?: string | null;
  deltaBaselineCapturedAt?: string | null;
  // E54: Memory-only investigation review state
  investigationReview?: InvestigationReviewState;
  // E56: Investigation Question Matrix state
  questionMatrixState?: QuestionMatrixState;
  // E57: Infrastructure Closure state
  closureState?: InfrastructureClosureState;
  sourceModel: HandoffSourceModel;
}

// ── Component ──────────────────────────────────────────────────

export function InvestigationHandoffPanel({
  snapshot,
  evidenceChains,
  graphDetail,
  nodeEvidenceMap,
  queueItems,
  queueSessionNotes,
  currentAssetSummary,
  lastUpdatedAt,
  selectedGraphId,
  deltaBaselineCapturedAt,
  investigationReview,
  questionMatrixState,
  closureState,
  sourceModel,
}: Props) {
  const { copy } = useDesktopCopy();
  const sourceBoundary = copy.handoff.sourceBoundary;

  const PRESET_LABELS: Record<PackagePreset, string> = {
    full: copy.handoff.presetFull,
    reviewer: copy.handoff.presetReviewer,
    'queue-followup': copy.handoff.presetQueue,
    'graph-evidence': copy.handoff.presetGraph,
  };

  const defaultChecklist = (): ChecklistItem[] => [
    { label: copy.handoff.clContextReviewed, checked: false },
    { label: copy.handoff.clEvidenceReviewed, checked: false },
    { label: copy.handoff.clGraphReviewed, checked: false },
    { label: copy.handoff.clQueueTriaged, checked: false },
    { label: copy.handoff.clSafetyConfirmed, checked: false },
  ];

  const [title, setTitle] = useState(copy.handoff.defaultTitle);
  const [notes, setNotes] = useState('');
  const [checklist, setChecklist] = useState<ChecklistItem[]>(defaultChecklist);
  const [sectionToggles, setSectionToggles] = useState<Record<SectionKey, boolean>>({
    overview: true,
    queue: true,
    evidence: true,
    graphDetail: true,
    recentLogs: true,
    safety: true,
  });
  const [preset, setPreset] = useState<PackagePreset>('full');
  const [copyState, setCopyState] = useState<CopyState>('idle');
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  // Reset on snapshot/current-asset identity change, not on graph detail change
  const resetKey = [
    snapshot.capturedAt,
    snapshot.currentAsset?.assetPath ?? '',
    snapshot.currentAsset?.assetName ?? '',
  ].join('|');

  useEffect(() => {
    setNotes('');
    setChecklist(defaultChecklist());
    setTitle(copy.handoff.defaultTitle);
    setPreset('full');
    setSectionToggles(PRESET_SECTIONS.full);
    setCopyState('idle');
    if (copyTimeoutRef.current) {
      clearTimeout(copyTimeoutRef.current);
      copyTimeoutRef.current = undefined;
    }
  }, [resetKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Derived counts ─────────────────────────────────────────

  const evidenceItemCount = evidenceChains.reduce((sum, c) => sum + c.items.length, 0);
  const unresolvedCount = evidenceChains.reduce((sum, c) => sum + c.unresolvedCount, 0);

  const queueEvidenceCount = queueItems.filter(i => i.kind === 'evidence').length;
  const queueNodeCount = queueItems.filter(i => i.kind === 'graph_node').length;
  const queueHighCount = queueItems.filter(i => i.priority === 'high').length;
  const queueNormalCount = queueItems.filter(i => i.priority === 'normal').length;
  const queueLowCount = queueItems.filter(i => i.priority === 'low').length;
  const queueTodoCount = queueItems.filter(i => i.investigationStatus === 'todo').length;
  const queueReviewedCount = queueItems.filter(i => i.investigationStatus === 'reviewed').length;
  const queueDeferredCount = queueItems.filter(i => i.investigationStatus === 'deferred').length;

  const logErrorCount = snapshot.recentLogs.filter(l => l.verbosity === 'error' || l.verbosity === 'fatal').length;
  const logWarningCount = snapshot.recentLogs.filter(l => l.verbosity === 'warning').length;

  const checklistDone = checklist.filter(c => c.checked).length;

  const hasCurrentAsset = snapshot.currentAsset != null;
  const hasGraphDetail = graphDetail?.selectedBlueprint != null;
  const hasNodeEvidence = nodeEvidenceMap != null;
  const hasDeltaBaseline = deltaBaselineCapturedAt != null;

  // ── Preset selection ────────────────────────────────────────

  const selectPreset = useCallback((p: PackagePreset) => {
    setPreset(p);
    setSectionToggles(PRESET_SECTIONS[p]);
  }, []);

  // ── Readiness assessment ────────────────────────────────────

  const readiness = ((): ReadinessEntry[] => {
    const entries: ReadinessEntry[] = [];

    entries.push({
      label: copy.handoff.readinessAsset,
      status: hasCurrentAsset ? copy.handoff.readinessOk as ReadinessStatus : copy.handoff.readinessMissing as ReadinessStatus,
      detail: hasCurrentAsset
        ? `${snapshot.currentAsset!.assetName} (${snapshot.currentAsset!.assetPath})`
        : copy.handoff.noAssetCaptured,
    });

    entries.push({
      label: copy.handoff.readinessEvidence,
      status: evidenceItemCount > 0 ? (unresolvedCount > 0 ? copy.handoff.readinessAttention as ReadinessStatus : copy.handoff.readinessOk as ReadinessStatus) : copy.handoff.readinessMissing as ReadinessStatus,
      detail: copy.handoff.readinessEvidenceDetail(evidenceItemCount, evidenceChains.length, unresolvedCount),
    });

    entries.push({
      label: copy.handoff.readinessGraph,
      status: hasGraphDetail ? copy.handoff.readinessOk as ReadinessStatus : copy.handoff.readinessInfo as ReadinessStatus,
      detail: hasGraphDetail
        ? copy.handoff.readinessGraphLoaded(graphDetail!.selectedBlueprint!.graph.name, graphDetail!.selectedBlueprint!.graph.kind)
        : copy.handoff.notLoaded,
    });

    entries.push({
      label: copy.handoff.readinessNodeEvidence,
      status: hasNodeEvidence ? copy.handoff.readinessOk as ReadinessStatus : (hasGraphDetail ? copy.handoff.readinessMissing as ReadinessStatus : copy.handoff.readinessInfo as ReadinessStatus),
      detail: hasNodeEvidence
        ? copy.handoff.readinessNodeEvidenceDetail(Object.keys(nodeEvidenceMap!).length)
        : (hasGraphDetail ? copy.handoff.noNodeEvidence : copy.handoff.noGraphCheck),
    });

    entries.push({
      label: copy.handoff.readinessQueue,
      status: queueItems.length > 0 ? (queueHighCount > 0 ? copy.handoff.readinessAttention as ReadinessStatus : copy.handoff.readinessOk as ReadinessStatus) : copy.handoff.readinessMissing as ReadinessStatus,
      detail: copy.handoff.readinessQueueDetail(queueItems.length, queueTodoCount, queueHighCount),
    });

    entries.push({
      label: copy.handoff.readinessDeltaBaseline,
      status: hasDeltaBaseline ? copy.handoff.readinessOk as ReadinessStatus : copy.handoff.readinessInfo as ReadinessStatus,
      detail: hasDeltaBaseline ? copy.handoff.readinessDeltaCaptured(deltaBaselineCapturedAt!) : copy.handoff.notCaptured,
    });

    entries.push({
      label: copy.handoff.readinessLastRefresh,
      status: lastUpdatedAt ? copy.handoff.readinessInfo as ReadinessStatus : copy.handoff.readinessMissing as ReadinessStatus,
      detail: lastUpdatedAt ?? copy.handoff.unknown,
    });

    entries.push({
      label: copy.handoff.readinessRecentLogs,
      status: logErrorCount > 0 ? copy.handoff.readinessAttention as ReadinessStatus : (logWarningCount > 0 ? copy.handoff.readinessAttention as ReadinessStatus : copy.handoff.readinessOk as ReadinessStatus),
      detail: copy.handoff.readinessRecentLogsDetail(snapshot.recentLogs.length, logErrorCount, logWarningCount),
    });

    entries.push({
      label: copy.handoff.readinessChecklist,
      status: checklistDone === checklist.length ? copy.handoff.readinessOk as ReadinessStatus : copy.handoff.readinessAttention as ReadinessStatus,
      detail: copy.handoff.readinessChecklistDetail(checklistDone, checklist.length),
    });

    return entries;
  })();

  // ── Suggested next actions ──────────────────────────────────

  const suggestedActions = ((): string[] => {
    const actions: string[] = [];
    if (!hasCurrentAsset) {
      actions.push(copy.handoff.saCaptureSnapshot);
    }
    if (queueTodoCount > 0) {
      actions.push(copy.handoff.saReviewQueue(queueTodoCount));
    }
    if (queueHighCount > 0) {
      actions.push(copy.handoff.saHighPriority(queueHighCount));
    }
    if (!hasGraphDetail && hasCurrentAsset) {
      actions.push(copy.handoff.saLoadGraph);
    }
    if (unresolvedCount > 0) {
      actions.push(copy.handoff.saInvestigateUnresolved(unresolvedCount));
    }
    if (logErrorCount > 0) {
      actions.push(copy.handoff.saReviewLogErrors(logErrorCount));
    }
    if (checklistDone < checklist.length) {
      actions.push(copy.handoff.saCompleteChecklist);
    }
    if (!hasDeltaBaseline) {
      actions.push(copy.handoff.saCaptureDelta);
    }
    return actions;
  })();

  // ── Included workspace map ───────────────────────────────────

  const workspaceMap = ((): { name: string; status: string; detail: string }[] => {
    const entries: { name: string; status: string; detail: string }[] = [];
    const toggles = sectionToggles;

    entries.push({
      name: copy.handoff.wmReport,
      status: toggles.overview ? copy.handoff.wmIncluded : copy.handoff.wmExcluded,
      detail: toggles.overview
        ? copy.handoff.wmReportDetail
        : copy.handoff.wmNotIncluded,
    });

    entries.push({
      name: copy.handoff.wmTriage,
      status: copy.handoff.wmAvailableOnly,
      detail: copy.handoff.wmCrossPanel,
    });

    entries.push({
      name: copy.handoff.wmDelta,
      status: copy.handoff.wmAvailableOnly,
      detail: hasDeltaBaseline ? copy.handoff.wmDeltaAvailable : copy.handoff.wmDeltaNotCaptured,
    });

    entries.push({
      name: copy.handoff.wmVerify,
      status: copy.handoff.wmAvailableOnly,
      detail: copy.handoff.wmVerifyDesc,
    });

    entries.push({
      name: copy.handoff.wmQueue,
      status: toggles.queue ? copy.handoff.wmIncluded : copy.handoff.wmExcluded,
      detail: toggles.queue
        ? `${queueItems.length} items (${queueEvidenceCount} evidence, ${queueNodeCount} nodes)`
        : copy.handoff.wmNotIncluded,
    });

    entries.push({
      name: copy.handoff.wmTimeline,
      status: toggles.recentLogs ? copy.handoff.wmIncluded : copy.handoff.wmExcluded,
      detail: toggles.recentLogs
        ? `${snapshot.recentLogs.length} log entries, ${evidenceChains.length} evidence chains`
        : copy.handoff.wmNotIncluded,
    });

    entries.push({
      name: copy.handoff.wmEvidence,
      status: toggles.evidence ? copy.handoff.wmIncluded : copy.handoff.wmExcluded,
      detail: toggles.evidence
        ? `${evidenceItemCount} items in ${evidenceChains.length} chains${unresolvedCount > 0 ? ` (${unresolvedCount} unresolved)` : ''}`
        : copy.handoff.wmNotIncluded,
    });

    entries.push({
      name: copy.handoff.wmGraphDetail,
      status: toggles.graphDetail ? copy.handoff.wmIncluded : copy.handoff.wmExcluded,
      detail: toggles.graphDetail
        ? (hasGraphDetail
            ? `${graphDetail!.selectedBlueprint!.graph.name} (${graphDetail!.selectedBlueprint!.graph.kind}), ${graphDetail!.selectedBlueprint!.graph.detail.nodes.length} nodes`
            : copy.handoff.mdNoGraphDetail)
        : copy.handoff.wmNotIncluded,
    });

    entries.push({
      name: copy.handoff.wmCase,
      status: copy.handoff.wmIncluded,
      detail: notes.trim() ? copy.handoff.wmNotesPresent : copy.handoff.wmNoNotes,
    });

    entries.push({
      name: copy.handoff.wmSafetyNote,
      status: toggles.safety ? copy.handoff.wmIncluded : copy.handoff.wmExcluded,
      detail: toggles.safety
        ? copy.handoff.wmSafetyDesc
        : copy.handoff.wmNotIncluded,
    });

    return entries;
  })();

  // ── Markdown builder ────────────────────────────────────────

  const buildMarkdown = useCallback((): string => {
    const lines: string[] = [];
    const toggles = sectionToggles;

    lines.push(`# ${title}`);
    lines.push('');
    lines.push(`${copy.handoff.mdGenerated} ${new Date().toISOString()}`);
    lines.push(`${copy.handoff.mdCaptured} ${snapshot.capturedAt}`);
    if (lastUpdatedAt) {
      lines.push(`${copy.handoff.mdLastRefresh} ${lastUpdatedAt}`);
    }
    lines.push(`${copy.handoff.mdPackagePreset} ${PRESET_LABELS[preset]}`);
    lines.push('');

    // Package Readiness Summary
    lines.push(copy.handoff.mdPackageReadiness);
    lines.push('');
    for (const entry of readiness) {
      let icon = '';
      switch (entry.status) {
        case copy.handoff.readinessOk as ReadinessStatus: icon = '✅'; break;
        case copy.handoff.readinessAttention as ReadinessStatus: icon = '⚠️'; break;
        case copy.handoff.readinessMissing as ReadinessStatus: icon = '❌'; break;
        default: icon = 'ℹ️'; break;
      }
      lines.push(`- ${icon} **${entry.label}:** ${entry.detail}`);
    }
    lines.push('');

    // Included Workspace Map
    lines.push(copy.handoff.mdIncludedWorkspaces);
    lines.push('');
    for (const ws of workspaceMap) {
      lines.push(`- **${ws.name}** (${ws.status}): ${ws.detail}`);
    }
    lines.push('');

    if (toggles.overview) {
      lines.push(copy.handoff.mdCurrentAsset);
      appendSourceLine(lines, sourceModel.sections.overview, sourceBoundary);
      if (currentAssetSummary) {
        lines.push(currentAssetSummary);
      } else if (snapshot.currentAsset) {
        const a = snapshot.currentAsset;
        lines.push(`- **${copy.common.name}:** ${a.assetName}`);
        lines.push(`- **${copy.common.path}:** ${a.assetPath}`);
        lines.push(`- **${copy.common.type}:** ${a.assetClass}`);
        lines.push(`- **${copy.common.dirty}:** ${a.isDirty ? copy.common.yes : copy.common.no}`);
        lines.push(`- **${copy.common.selected}:** ${a.isSelected ? copy.common.yes : copy.common.no}`);
        lines.push(`- **${copy.common.openInEditor}:** ${a.isOpenInEditor ? copy.common.yes : copy.common.no}`);
      } else {
        lines.push(copy.handoff.currentAssetUnavailable);
      }
      lines.push('');
    }

    if (toggles.queue) {
      lines.push(copy.handoff.mdQueueSummary);
      appendSourceLine(lines, sourceModel.sections.queue, sourceBoundary);
      lines.push(`- **${copy.common.totalItems}:** ${queueItems.length}`);
      lines.push(`- **${copy.common.evidenceItems}:** ${queueEvidenceCount}`);
      lines.push(`- **${copy.common.graphNodeItems}:** ${queueNodeCount}`);
      lines.push(`- **${copy.common.priority}:** ${copy.queue.mdPrioritySummary(queueHighCount, queueNormalCount, queueLowCount)}`);
      lines.push(`- **${copy.common.status}:** ${copy.queue.mdStatusSummary(queueTodoCount, queueReviewedCount, queueDeferredCount)}`);
      lines.push('');

      if (queueItems.length > 0) {
        lines.push(copy.handoff.mdQueuedItems);
        lines.push('');
        for (const item of queueItems) {
          const kindLabel = item.kind === 'evidence' ? copy.queue.evidenceKind : copy.queue.graphNodeKind;
          lines.push(`#### [${kindLabel}] ${item.title}`);
          lines.push('');
          lines.push(`- **${copy.common.status}:** ${copy.queue.statusValue(item.investigationStatus)}`);
          lines.push(`- **${copy.common.priority}:** ${copy.queue.priorityValue(item.priority)}`);
          lines.push(`- **${copy.common.source}:** ${item.sourceSummary}`);
          lines.push(`- **${copy.common.added}:** ${item.addedAt}`);

          if (item.kind === 'evidence') {
            lines.push(`- **${copy.common.chains}:** ${item.chainTitle}`);
            lines.push(`- **${copy.common.severity}:** ${item.severity}`);
            lines.push(`- **${copy.common.confidence}:** ${item.confidence}`);
            lines.push(`- **${copy.common.sourceKind}:** ${item.sourceKind}`);
            lines.push(`- **${copy.common.summary}:** ${item.summary}`);
            lines.push(`- **${copy.common.next}:** ${item.suggestedNextInspection}`);
            if (item.nodeTitle) {
              lines.push(`- **${copy.common.nodes}:** ${item.nodeTitle} (\`${item.nodeId}\`)`);
            }
          } else {
            lines.push(`- **${copy.common.graphs}:** ${item.graphName} (${item.graphKind})`);
            lines.push(`- **${copy.common.nodeId}:** \`${item.nodeId}\``);
            lines.push(`- **${copy.common.nodeType}:** ${item.nodeType}`);
            lines.push(`- **${copy.common.nodeStatus}:** ${item.nodeStatus}`);
            if (item.errorMessage) {
              lines.push(`- **${copy.common.error}:** ${item.errorMessage}`);
            }
            lines.push(`- **${copy.common.evidence}:** ${item.evidenceCount}`);
          }

          if (item.userNote) {
            lines.push(`- **${copy.common.note}:** ${item.userNote}`);
          }
          lines.push('');
        }
      }

      if (queueSessionNotes.trim()) {
        lines.push(copy.queue.mdSessionNotes);
        lines.push('');
        lines.push(queueSessionNotes);
        lines.push('');
      }
    }

    if (toggles.evidence) {
      lines.push(copy.handoff.mdEvidenceSummary);
      appendSourceLine(lines, sourceModel.sections.evidence, sourceBoundary);
      lines.push(`- **${copy.common.chains}:** ${evidenceChains.length}`);
      lines.push(`- **${copy.common.totalItems}:** ${evidenceItemCount}`);
      lines.push(`- **${copy.common.unresolved}:** ${unresolvedCount}`);
      lines.push('');

      if (evidenceChains.length > 0) {
        for (const chain of evidenceChains) {
          const sevCounts: Record<string, number> = {};
          for (const item of chain.items) {
            sevCounts[item.snippet.severity] = (sevCounts[item.snippet.severity] || 0) + 1;
          }
          const sevParts = Object.entries(sevCounts)
            .map(([k, v]) => `${k}:${v}`)
            .join(' ');
          lines.push(
            `- **${chain.title}**: ${copy.session.mdEvidenceChainLine(chain.items.length, chain.overallConfidence)}${sevParts ? ' / ' + sevParts : ''}`,
          );
        }
        lines.push('');
      }
    }

    if (toggles.graphDetail) {
      lines.push(copy.handoff.mdGraphDetail);
      appendSourceLine(lines, sourceModel.sections.graphDetail, sourceBoundary);
      if (!graphDetail?.selectedBlueprint) {
        lines.push(copy.handoff.mdNoGraphDetail);
      } else {
        const sb = graphDetail.selectedBlueprint;
        const g = sb.graph;
        const d = g.detail;
        lines.push(`- **${copy.common.graphs}:** ${g.name} (${g.kind})`);
        lines.push(`- **${copy.common.nodes}:** ${d.nodes.length}, **${copy.common.links}:** ${d.links.length}`);

        const disabledCount = d.nodes.filter(n => n.isDisabled).length;
        const errorCount = d.nodes.filter(n => n.errorType === 'error').length;
        const warnCount = d.nodes.filter(n => n.errorType === 'warning').length;
        const statusParts: string[] = [];
        if (disabledCount > 0) statusParts.push(`${disabledCount} ${copy.common.disabled}`);
        if (errorCount > 0) statusParts.push(`${errorCount} ${copy.common.error}`);
        if (warnCount > 0) statusParts.push(`${warnCount} ${copy.common.warning}`);
        if (statusParts.length > 0) {
          lines.push(`- **${copy.common.nodeStatus}:** ${statusParts.join(', ')}`);
        }
        if (d.truncation?.truncated) {
          lines.push(`- **${copy.common.truncated}:** ${copy.common.yes}${d.truncation.reason ? ` (${d.truncation.reason})` : ''}`);
          for (const w of d.truncation.warnings) {
            lines.push(`  - ${copy.common.warning}: ${w}`);
          }
        }
        if (nodeEvidenceMap) {
          const nevCount = Object.keys(nodeEvidenceMap).length;
          const nevItemCount = Object.values(nodeEvidenceMap).reduce((sum, arr) => sum + arr.length, 0);
          lines.push(`- **${copy.common.nodeEvidence}:** ${copy.handoff.mdNodeEvidenceSummary(nevCount, nevItemCount)}`);
        }
      }
      lines.push('');
    }

    if (toggles.recentLogs) {
      lines.push(copy.handoff.mdRecentLogs);
      appendSourceLine(lines, sourceModel.sections.recentLogs, sourceBoundary);
      const logs = snapshot.recentLogs;
      lines.push(`- **${copy.handoff.mdTotalEntries}:** ${logs.length}`);
      if (logErrorCount > 0 || logWarningCount > 0) {
        const verbCounts: Record<string, number> = {};
        for (const log of logs) {
          verbCounts[log.verbosity] = (verbCounts[log.verbosity] || 0) + 1;
        }
        const parts: string[] = [];
        if (verbCounts.fatal) parts.push(`fatal:${verbCounts.fatal}`);
        if (verbCounts.error) parts.push(`error:${verbCounts.error}`);
        if (verbCounts.warning) parts.push(`warning:${verbCounts.warning}`);
        lines.push(`- **${copy.handoff.mdBreakdown}:** ${parts.join(' ')}`);
      } else {
        lines.push(`- ${copy.handoff.mdNoRecentLogIssues}`);
      }
      lines.push('');
    }

    lines.push(copy.handoff.mdPackageNotes);
    lines.push('');
    if (notes.trim()) {
      lines.push(notes);
    } else {
      lines.push(copy.handoff.mdNoNotesMarkdown);
    }
    lines.push('');

    lines.push(copy.handoff.mdReadyChecklist);
    lines.push('');
    for (const item of checklist) {
      lines.push(`- [${item.checked ? 'x' : ' '}] ${item.label}`);
    }
    lines.push('');

    // ── Investigation Session Review (E54) ──────────────────
    if (investigationReview && (
      investigationReview.currentQuestion.trim()
      || investigationReview.workingTheory.trim()
      || investigationReview.finalConclusion.trim()
    )) {
      lines.push(copy.session.mdHandoffReviewSection);
      lines.push('');
      lines.push(`${copy.session.mdReviewStatus} ${copy.session[`reviewStatus${investigationReview.reviewStatus.charAt(0).toUpperCase() + investigationReview.reviewStatus.slice(1)}` as keyof typeof copy.session] as string}`);
      lines.push(`${copy.session.mdReviewer} ${investigationReview.reviewer || '(not set)'}`);
      lines.push(`${copy.session.mdUpdatedAt} ${investigationReview.updatedAt || '(not set)'}`);
      lines.push('');

      // Stale warning
      const isReviewStale = !!(
        investigationReview.updatedAt
        && lastUpdatedAt
        && investigationReview.updatedAt < lastUpdatedAt
      );
      if (isReviewStale) {
        lines.push(copy.session.mdStaleWarning);
        lines.push('');
      }

      // Checklist summary
      const clKeys = ['contextReviewed', 'evidenceReviewed', 'graphReviewed', 'logsReviewed', 'queueTriaged', 'safetyBoundaryConfirmed', 'readyForHandoff'] as const;
      const clLabels: Record<string, string> = {
        contextReviewed: copy.session.clContextReviewed,
        evidenceReviewed: copy.session.clEvidenceReviewed,
        graphReviewed: copy.session.clGraphReviewed,
        logsReviewed: copy.session.clLogsReviewed,
        queueTriaged: copy.session.clQueueTriaged,
        safetyBoundaryConfirmed: copy.session.clSafetyBoundaryConfirmed,
        readyForHandoff: copy.session.clReadyForHandoff,
      };
      lines.push(copy.session.mdChecklistState);
      for (const key of clKeys) {
        lines.push(`- [${investigationReview.checklist[key] ? 'x' : ' '}] ${clLabels[key]}`);
      }
      lines.push('');

      // Final conclusion / handoff summary
      if (investigationReview.finalConclusion.trim()) {
        lines.push(copy.session.mdFinalConclusion);
        lines.push(investigationReview.finalConclusion);
        lines.push('');
      }

      // Open questions
      if (investigationReview.openQuestions.trim()) {
        lines.push(copy.session.mdOpenQuestions);
        lines.push(investigationReview.openQuestions);
        lines.push('');
      }

      // Verification plan
      if (investigationReview.verificationPlan.trim()) {
        lines.push(copy.session.mdVerificationPlan);
        lines.push(investigationReview.verificationPlan);
        lines.push('');
      }
    }

    // ── Investigation Question Matrix (E56) ──────────────────
    if (questionMatrixState) {
      const qmInputs: QuestionGenerationInputs = {
        snapshot,
        evidenceChains,
        graphDetail,
        nodeEvidenceMap,
        queueItems,
        investigationReview: investigationReview ?? {
          reviewStatus: 'draft', currentQuestion: '', workingTheory: '',
          confirmedFacts: '', rejectedHypotheses: '', openQuestions: '',
          verificationPlan: '', finalConclusion: '', riskNotes: '',
          reviewer: '', updatedAt: null, contextSignatureAtUpdate: null,
          checklist: { contextReviewed: false, evidenceReviewed: false, graphReviewed: false, logsReviewed: false, queueTriaged: false, safetyBoundaryConfirmed: false, readyForHandoff: false },
        },
      };
      const allQuestions = generateQuestions(qmInputs).filter(
        question =>
          question.category !== 'bt-blackboard'
          || sourceModel.sections.btBlackboard.kind === 'mock',
      );

      if (allQuestions.length > 0) {
        const qmEntries = Object.keys(questionMatrixState.entries);
        const openBlocked = allQuestions.filter(q => {
          const st = questionMatrixState.entries[q.id]?.status ?? 'open';
          return st === 'open' || st === 'blocked';
        });
        const answered = allQuestions.filter(q => {
          const st = questionMatrixState.entries[q.id]?.status;
          return st === 'answered';
        });
        const openCount = allQuestions.filter(q => {
          const st = questionMatrixState.entries[q.id]?.status ?? 'open';
          return st === 'open';
        }).length;
        const blockedCount = openBlocked.length - openCount;
        const answeredCount = answered.length;
        const highCount = allQuestions.filter(q => q.priority === 'high').length;

        lines.push(copy.questionMatrix.hoSectionTitle);
        lines.push('');
        lines.push(`- **${copy.questionMatrix.summaryTotal}:** ${allQuestions.length}`);
        lines.push(`- **${copy.questionMatrix.summaryOpen}:** ${openCount}`);
        lines.push(`- **${copy.questionMatrix.summaryBlocked}:** ${blockedCount}`);
        lines.push(`- **${copy.questionMatrix.summaryAnswered}:** ${answeredCount}`);
        lines.push(`- **${copy.questionMatrix.summaryHighPriority}:** ${highCount}`);
        lines.push('');

        // Open / Blocked (top 10)
        if (openBlocked.length > 0) {
          lines.push(`### ${copy.questionMatrix.summaryOpen} / ${copy.questionMatrix.summaryBlocked}`);
          for (const q of openBlocked.slice(0, 10)) {
            const st = questionMatrixState.entries[q.id]?.status ?? 'open';
            const stLabel = st === 'open' ? copy.questionMatrix.statusOpen : copy.questionMatrix.statusBlocked;
            const priLabel = q.priority === 'high' ? copy.common.high : copy.common.normal;
            lines.push(`- [${stLabel}] **${q.question}** (${priLabel})`);
          }
          if (openBlocked.length > 10) {
            lines.push(`- *... and ${openBlocked.length - 10} more items*`);
          }
          lines.push('');
        }

        // Verification plan
        const verifying = allQuestions.filter(q => {
          const st = questionMatrixState.entries[q.id]?.status ?? 'open';
          return st === 'open' || st === 'verifying';
        });
        if (verifying.length > 0) {
          lines.push(`### ${copy.questionMatrix.mdVerificationPlan}`);
          for (const q of verifying.slice(0, 8)) {
            lines.push(`1. **${q.question}** — ${q.suggestedVerification}`);
          }
          lines.push('');
        }

        // Answered highlights (top 5)
        if (answered.length > 0) {
          lines.push(`### ${copy.questionMatrix.summaryAnswered}`);
          for (const q of answered.slice(0, 5)) {
            const note = questionMatrixState.entries[q.id]?.note?.trim() || '*No note*';
            lines.push(`- **${q.question}** — ${note}`);
          }
          lines.push('');
        }
      } else {
        lines.push(copy.questionMatrix.hoSectionTitle);
        lines.push('');
        lines.push(copy.questionMatrix.mdNoQuestions);
        lines.push('');
      }
    }

    // ── Infrastructure Closure (E57) ──────────────────────────
    if (closureState) {
      const cc = copy.closure;
      lines.push(cc.hoSectionTitle);
      lines.push('');
      lines.push(`${cc.hoClosureDecision} ${closureState.decision === 'draft' ? cc.decisionDraft
        : closureState.decision === 'ready_for_handoff' ? cc.decisionReadyForHandoff
        : closureState.decision === 'needs_verification' ? cc.decisionNeedsVerification
        : closureState.decision === 'blocked' ? cc.decisionBlocked
        : closureState.decision === 'closed' ? cc.decisionClosed
        : closureState.decision}`);
      if (closureState.owner.trim()) {
        lines.push(`${cc.hoOwner} ${closureState.owner}`);
      }
      if (closureState.verificationNotes.trim()) {
        lines.push(cc.hoVerificationNotes);
        lines.push(closureState.verificationNotes);
      }
      if (closureState.riskNotes.trim()) {
        lines.push(cc.hoRiskNotes);
        lines.push(closureState.riskNotes);
      }
      lines.push('');
      lines.push(cc.hoSafetyNote);
      lines.push('');
    }

    // ── Current persisted Agent repair session ───────────────
    lines.push(sourceBoundary.repairSessionTitle);
    appendSourceLine(lines, sourceModel.sections.repairSession, sourceBoundary);
    if (sourceModel.repairSessionFact) {
      const session = sourceModel.repairSessionFact;
      lines.push(`- **${sourceBoundary.sessionIdLabel}:** ${session.sessionId}`);
      lines.push(`- **${sourceBoundary.scopeLabel}:** ${session.scope}`);
      lines.push(`- **${sourceBoundary.stateLabel}:** ${session.currentState}`);
      lines.push(`- **${sourceBoundary.updatedAtLabel}:** ${session.updatedAt}`);
      if (session.targetAssetPath) {
        lines.push(`- **${sourceBoundary.targetAssetLabel}:** ${session.targetAssetPath}`);
      }
      lines.push(`- **${sourceBoundary.proposalCountLabel}:** ${session.proposalCount}`);
      lines.push(`- **${sourceBoundary.sandboxPresentLabel}:** ${session.hasSandbox ? copy.common.yes : copy.common.no}`);
      lines.push(`- **${sourceBoundary.approvalPresentLabel}:** ${session.hasApproval ? copy.common.yes : copy.common.no}`);
      lines.push(`- **${sourceBoundary.promotePresentLabel}:** ${session.hasPromote ? copy.common.yes : copy.common.no}`);
    } else {
      lines.push(sourceBoundary.noRepairSessionData);
    }
    lines.push('');

    // ── Behavior Tree / Blackboard boundary ──────────────────
    lines.push(sourceBoundary.btBlackboardTitle);
    appendSourceLine(lines, sourceModel.sections.btBlackboard, sourceBoundary);
    if (
      sourceModel.sections.btBlackboard.kind === 'mock'
      && sourceModel.btBlackboardSummary
    ) {
      const d = sourceModel.btBlackboardSummary;
      const btbb = copy.behaviorTreeBlackboard;
      lines.push(`- **${btbb.assetName}:** ${d.assetName} (${d.assetPath})`);
      lines.push(`- **${btbb.nodeCount}:** ${d.nodeCount} (${btbb.kindDecorator}: ${d.decoratorCount}, ${btbb.kindService}: ${d.serviceCount}, ${btbb.kindTask}: ${d.taskCount})`);
      lines.push(`- **${btbb.bbKeyCount}:** ${d.bbKeyCount}`);
      lines.push(`- **${btbb.refCount}:** ${d.refCount}`);
      if (d.selectedNodeName) {
        lines.push(`- **${btbb.selectedNode}:** ${d.selectedNodeName}`);
      }
      lines.push(`- **${btbb.readinessChecklist}:`);
      for (const r of d.readinessLabels) {
        lines.push(`  - ⚠ ${r}`);
      }
      lines.push('');
      lines.push(`> ${btbb.hoNoUeData}`);
    } else {
      lines.push(sourceBoundary.noBtBlackboardLiveData);
    }
    lines.push('');

    // ── Change manifests ─────────────────────────────────────
    lines.push(sourceBoundary.manifestsTitle);
    appendSourceLine(lines, sourceModel.sections.manifests, sourceBoundary);
    if (sourceModel.manifestFacts.length === 0) {
      lines.push(sourceBoundary.noManifestLiveData);
    } else {
      for (const manifest of sourceModel.manifestFacts) {
        lines.push(`### ${manifest.proposalId}`);
        lines.push(`- **${sourceBoundary.proposalIdLabel}:** ${manifest.proposalId}`);
        if (manifest.proposedAt) {
          lines.push(`- **${sourceBoundary.proposedAtLabel}:** ${manifest.proposedAt}`);
        }
        lines.push(`- **${sourceBoundary.proposalKindLabel}:** ${manifest.proposalKind}`);
        lines.push(`- **${sourceBoundary.operationKindLabel}:** ${manifest.operationKind}`);
        if (manifest.summary) {
          lines.push(`- **${sourceBoundary.summaryLabel}:** ${manifest.summary}`);
        }
        lines.push('');
      }
    }
    lines.push('');

    // ── Approval gates ───────────────────────────────────────
    lines.push(sourceBoundary.approvalGatesTitle);
    appendSourceLine(lines, sourceModel.sections.approvalGates, sourceBoundary);
    if (sourceModel.approvalFacts.length === 0) {
      lines.push(sourceBoundary.noApprovalLiveData);
    } else {
      for (const approval of sourceModel.approvalFacts) {
        const approvalHeading = approval.approvalId ?? copy.common.unavailable;
        lines.push(`### ${approvalHeading}`);
        lines.push(`- **${sourceBoundary.approvalIdLabel}:** ${approvalHeading}`);
        if (approval.requestedAt) {
          lines.push(`- **${sourceBoundary.requestedAtLabel}:** ${approval.requestedAt}`);
        }
        if (approval.decidedAt) {
          lines.push(`- **${sourceBoundary.decidedAtLabel}:** ${approval.decidedAt}`);
        }
        lines.push(`- **${sourceBoundary.decisionLabel}:** ${sourceBoundary.approvalDecisions[approval.decision]}`);
        if (approval.note) {
          lines.push(`- **${sourceBoundary.noteLabel}:** ${approval.note}`);
        }
        lines.push('');
      }
    }
    lines.push('');

    if (suggestedActions.length > 0) {
      lines.push(copy.handoff.mdSuggestedActions);
      lines.push('');
      for (const action of suggestedActions) {
        lines.push(`- ${action}`);
      }
      lines.push('');
    }

    if (toggles.safety) {
      lines.push(copy.handoff.mdSafetyBoundary);
      appendSourceLine(lines, sourceModel.sections.safety, sourceBoundary);
      lines.push(copy.handoff.mdSafetyText);
      lines.push('');
    }

    return lines.join('\n');
  }, [
    copy,
    title,
    preset,
    snapshot,
    lastUpdatedAt,
    currentAssetSummary,
    queueItems,
    queueEvidenceCount,
    queueNodeCount,
    queueHighCount,
    queueNormalCount,
    queueLowCount,
    queueTodoCount,
    queueReviewedCount,
    queueDeferredCount,
    queueSessionNotes,
    evidenceChains,
    evidenceItemCount,
    unresolvedCount,
    graphDetail,
    nodeEvidenceMap,
    logErrorCount,
    logWarningCount,
    notes,
    checklist,
    readiness,
    workspaceMap,
    suggestedActions,
    sectionToggles,
    investigationReview,
    questionMatrixState,
    closureState,
    sourceModel,
    sourceBoundary,
  ]);

  const markdown = buildMarkdown();

  const handleCopy = useCallback(async () => {
    if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    try {
      await navigator.clipboard.writeText(markdown);
      setCopyState('copied');
    } catch {
      setCopyState('error');
    }
    copyTimeoutRef.current = setTimeout(() => setCopyState('idle'), 3000);
  }, [markdown]);

  const toggleSection = (key: SectionKey) => {
    setSectionToggles(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleChecklistItem = (index: number) => {
    setChecklist(prev =>
      prev.map((item, i) => (i === index ? { ...item, checked: !item.checked } : item)),
    );
  };

  // ── Render ──────────────────────────────────────────────────

  return (
    <section className="ih-panel">
      <div className="ih-toolbar">
        <h2 className="section-title" style={{ marginBottom: 0 }}>
          {copy.handoff.title}
        </h2>
        <div className="ih-toolbar-actions">
          {copyState === 'copied' && (
            <span className="ih-copy-status ih-copy-ok">{copy.handoff.copied}</span>
          )}
          {copyState === 'error' && (
            <span className="ih-copy-status ih-copy-error">
              {copy.handoff.copyFailed}
            </span>
          )}
          <button className="refresh-button ih-copy-btn" onClick={handleCopy}>
            {copy.handoff.copyPackage}
          </button>
        </div>
      </div>

      <div className="ih-summary">
        <span className="ih-summary-item">
          {copy.handoff.captured}{' '}
          <strong>{snapshot.capturedAt}</strong>
        </span>
        <span className="ih-summary-item">
          {copy.handoff.asset}{' '}
          <strong>{snapshot.currentAsset?.assetName ?? copy.common.unavailable}</strong>
        </span>
        <span className="ih-summary-item">
          {copy.handoff.path}{' '}
          <strong>{snapshot.currentAsset?.assetPath ?? copy.common.unavailable}</strong>
        </span>
        <span className="ih-summary-item">
          {copy.handoff.queue}{' '}
          <strong>
            {queueItems.length} ({queueHighCount}H/{queueNormalCount}N/{queueLowCount}L)
          </strong>
        </span>
        <span className="ih-summary-item">
          {copy.handoff.evidence}{' '}
          <strong>
            {evidenceChains.length}c/{evidenceItemCount}i
          </strong>
        </span>
        <span className="ih-summary-item">
          {copy.handoff.graph}{' '}
          <strong>
            {graphDetail?.selectedBlueprint
              ? graphDetail.selectedBlueprint.graph.name
              : copy.handoff.notLoaded}
          </strong>
        </span>
        <span className="ih-summary-item">
          {copy.handoff.logs} <strong>{snapshot.recentLogs.length}</strong>
        </span>
        <span className="ih-summary-item">
          {copy.handoff.checklist} <strong>{checklistDone}/{checklist.length}</strong>
        </span>
        {investigationReview && (
          <span className="ih-summary-item">
            {copy.session.reviewStatusLabel} <strong>{copy.session[`reviewStatus${investigationReview.reviewStatus.charAt(0).toUpperCase() + investigationReview.reviewStatus.slice(1)}` as keyof typeof copy.session] as string}</strong>
          </span>
        )}
      </div>

      <div className="ih-content">
        <div className="ih-section">
          <h3 className="ih-section-title">{copy.handoff.packagePreset}</h3>
          <div className="ih-preset-row">
            {(Object.entries(PRESET_LABELS) as [PackagePreset, string][]).map(([key, label]) => (
              <button
                key={key}
                className={`ih-preset-btn${preset === key ? ' ih-preset-active' : ''}`}
                onClick={() => selectPreset(key)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="ih-section">
          <h3 className="ih-section-title">{copy.handoff.packageReadiness}</h3>
          <div className="ih-readiness-grid">
            {readiness.map(entry => {
              let badgeClass = '';
              switch (entry.status) {
                case copy.handoff.readinessOk as ReadinessStatus: badgeClass = 'ih-badge-ready'; break;
                case copy.handoff.readinessAttention as ReadinessStatus: badgeClass = 'ih-badge-attention'; break;
                case copy.handoff.readinessMissing as ReadinessStatus: badgeClass = 'ih-badge-missing'; break;
                default: badgeClass = 'ih-badge-info'; break;
              }
              return (
                <div key={entry.label} className="ih-readiness-row">
                  <span className={`ih-badge ${badgeClass}`}>{entry.status}</span>
                  <span className="ih-readiness-label">{entry.label}</span>
                  <span className="ih-readiness-detail">{entry.detail}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="ih-section">
          <h3 className="ih-section-title">{copy.handoff.packageOutline}</h3>
          <div className="ih-workspace-list">
            {workspaceMap.map(ws => (
              <div key={ws.name} className="ih-workspace-row">
                <span className="ih-workspace-name">{ws.name}</span>
                <span className="ih-workspace-status">{ws.status}</span>
                <span className="ih-workspace-detail">{ws.detail}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="ih-field">
          <label className="ih-field-label">{copy.handoff.packageTitle}</label>
          <input
            className="ih-title-input"
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
          />
        </div>

        <div className="ih-section">
          <h3 className="ih-section-title">{copy.handoff.sections}</h3>
          <div className="ih-toggles">
            {(
              [
                ['overview', copy.handoff.sectionOverview],
                ['queue', copy.handoff.sectionQueueItems],
                ['evidence', copy.handoff.sectionEvidenceSummary],
                ['graphDetail', copy.handoff.sectionGraphDetail],
                ['recentLogs', copy.handoff.sectionRecentLogs],
                ['safety', copy.handoff.sectionSafetyNote],
              ] as [SectionKey, string][]
            ).map(([key, label]) => (
              <label key={key} className="ih-toggle-item">
                <input
                  type="checkbox"
                  checked={sectionToggles[key]}
                  onChange={() => toggleSection(key)}
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="ih-section">
          <h3 className="ih-section-title">{copy.handoff.readyChecklist}</h3>
          <div className="ih-checklist">
            {checklist.map((item, i) => (
              <label key={i} className="ih-checklist-item">
                <input
                  type="checkbox"
                  checked={item.checked}
                  onChange={() => toggleChecklistItem(i)}
                />
                <span>{item.label}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="ih-section">
          <h3 className="ih-section-title">{copy.handoff.packageNotes}</h3>
          <textarea
            className="ih-notes"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder={copy.handoff.notesPlaceholder}
            rows={5}
          />
        </div>

        <div className="ih-section">
          <h3 className="ih-section-title">{copy.handoff.markdownPreview}</h3>
          <pre className="ih-preview-pre">{markdown}</pre>
        </div>
      </div>
    </section>
  );
}
