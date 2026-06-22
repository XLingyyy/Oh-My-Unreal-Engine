import { useState, useMemo, useRef, useCallback } from 'react';
import type { OmueContextSnapshot, EvidenceChain, BlueprintGraphDetailData } from '@omue/shared-protocol';
import type { NodeEvidenceSummary } from './GraphDetailPanel';
import type { QueueItem } from './InvestigationQueuePanel';
import type { InvestigationReviewState } from './InvestigationSessionPanel';
import type { QuestionMatrixState, QuestionMatrixItem } from './InvestigationQuestionMatrixPanel';
import { generateQuestions } from './InvestigationQuestionMatrixPanel';
import { useDesktopCopy } from '../i18n';

// ── Exported types ──────────────────────────────────────────────

export type ClosureDecision =
  | 'draft'
  | 'ready_for_handoff'
  | 'needs_verification'
  | 'blocked'
  | 'closed';

export interface InfrastructureClosureState {
  decision: ClosureDecision;
  owner: string;
  decisionNotes: string;
  verificationNotes: string;
  riskNotes: string;
  updatedAt: string | null;
}

export const defaultClosureState: InfrastructureClosureState = {
  decision: 'draft',
  owner: '',
  decisionNotes: '',
  verificationNotes: '',
  riskNotes: '',
  updatedAt: null,
};

export type ClosureGateStatus = 'ready' | 'attention' | 'blocked' | 'missing' | 'info';

interface ClosureGate {
  id: string;
  label: string;
  status: ClosureGateStatus;
  source: string;
  detail: string;
  nextAction: string;
}

// ── Props ───────────────────────────────────────────────────────

interface Props {
  snapshot: OmueContextSnapshot;
  evidenceChains: EvidenceChain[];
  graphDetail: BlueprintGraphDetailData | null;
  nodeEvidenceMap?: Record<string, NodeEvidenceSummary[]>;
  queueItems: QueueItem[];
  investigationReview: InvestigationReviewState;
  questionMatrixState: QuestionMatrixState;
  lastUpdatedAt: string | null;
  closureState: InfrastructureClosureState;
  onClosureChange: (update: Partial<InfrastructureClosureState>) => void;
  onReset: () => void;
}

// ── Deterministic gate generation ───────────────────────────────

function computeGates(
  snapshot: OmueContextSnapshot,
  evidenceChains: EvidenceChain[],
  graphDetail: BlueprintGraphDetailData | null,
  nodeEvidenceMap: Record<string, NodeEvidenceSummary[]> | undefined,
  queueItems: QueueItem[],
  investigationReview: InvestigationReviewState,
  questionMatrixState: QuestionMatrixState,
): ClosureGate[] {
  const gates: ClosureGate[] = [];
  const asset = snapshot.currentAsset;
  const hasAsset = !!asset?.assetPath;

  // 1. Current context
  if (!hasAsset) {
    gates.push({
      id: 'ctx-missing',
      label: 'Current Context',
      status: 'missing',
      source: 'Snapshot',
      detail: 'No snapshot / current asset is selected or available.',
      nextAction: 'Capture a context snapshot with an asset selected in UE Editor.',
    });
  }
  if (asset?.isDirty) {
    gates.push({
      id: 'ctx-dirty',
      label: 'Asset Dirty',
      status: 'attention',
      source: 'Current Asset',
      detail: `Asset "${asset.assetName}" has unsaved changes.`,
      nextAction: 'Confirm whether unsaved changes are relevant to the investigation.',
    });
  }

  // 2. Compile / Runtime / Log
  const cs = snapshot.compileStatus;
  if (cs?.isCompiling) {
    gates.push({
      id: 'cr-compiling',
      label: 'Compile In Progress',
      status: 'blocked',
      source: 'Compile Status',
      detail: 'Blueprint compile is currently running.',
      nextAction: 'Wait for compile to finish, then refresh context.',
    });
  }
  if (cs && (cs.lastCompileResult === 'failed' || (cs.errorCount ?? 0) > 0)) {
    gates.push({
      id: 'cr-errors',
      label: 'Compile Errors',
      status: 'blocked',
      source: 'Compile Status',
      detail: `Compile failed with ${cs.errorCount ?? 0} error(s) and ${cs.warningCount ?? 0} warning(s).`,
      nextAction: 'Review compile errors before proceeding.',
    });
  }
  if (cs && (cs.warningCount ?? 0) > 0 && (cs.errorCount ?? 0) === 0 && cs.lastCompileResult !== 'failed') {
    gates.push({
      id: 'cr-warnings',
      label: 'Compile Warnings',
      status: 'attention',
      source: 'Compile Status',
      detail: `${cs.warningCount} warning(s) present.`,
      nextAction: 'Review warnings and assess impact.',
    });
  }
  const rs = snapshot.runtimeStatus;
  if (rs?.isPieRunning || rs?.isSimulating) {
    gates.push({
      id: 'cr-pie',
      label: 'PIE / Simulation Active',
      status: 'attention',
      source: 'Runtime Status',
      detail: `Runtime is ${rs.isSimulating ? 'simulating' : 'PIE running'}. Snapshot may differ from editor-time state.`,
      nextAction: 'Consider stopping PIE/simulation for a clean snapshot.',
    });
  }

  // 3. Evidence
  if (evidenceChains.length === 0) {
    gates.push({
      id: 'ev-none',
      label: 'Evidence Chains',
      status: 'missing',
      source: 'Evidence',
      detail: 'No evidence chains generated from current snapshot.',
      nextAction: 'Ensure snapshot is captured and graph detail is loaded.',
    });
  } else {
    const unresolvedCount = evidenceChains.reduce(
      (sum, c) => sum + c.items.filter(i => i.confidence.level === 'unresolved').length, 0,
    );
    if (unresolvedCount > 0) {
      gates.push({
        id: 'ev-unresolved',
        label: 'Unresolved Evidence',
        status: 'attention',
        source: 'Evidence',
        detail: `${unresolvedCount} unresolved evidence item(s) across ${evidenceChains.length} chain(s).`,
        nextAction: 'Review unresolved evidence items manually.',
      });
    }
  }

  // 4. Graph detail
  const gd = graphDetail?.selectedBlueprint?.graph?.detail;
  const hasGraphDetail = !!gd;
  if (!hasGraphDetail) {
    gates.push({
      id: 'gd-none',
      label: 'Graph Detail',
      status: 'missing',
      source: 'Graph Detail',
      detail: 'No graph detail loaded.',
      nextAction: 'Load graph detail from Context Summary.',
    });
  } else {
    if (gd.truncation?.truncated) {
      gates.push({
        id: 'gd-truncated',
        label: 'Graph Truncated',
        status: 'attention',
        source: 'Graph Detail',
        detail: `Graph data is truncated.${gd.truncation.reason ? ` Reason: ${gd.truncation.reason}` : ''}`,
        nextAction: 'Consider loading a smaller sub-graph.',
      });
    }
    const errorCount = gd.nodes.filter(n => n.errorType === 'error').length;
    const warnCount = gd.nodes.filter(n => n.errorType === 'warning').length;
    const disabledCount = gd.nodes.filter(n => n.isDisabled).length;
    const unknownCount = gd.nodes.filter(n => n.nodeType === 'unknown').length;
    const unconnExecCount = gd.nodes.filter(n =>
      n.pins.some(p => !p.isConnected && p.direction === 'output' && p.pinKind === 'execute'),
    ).length;
    const unconnDataCount = gd.nodes.filter(n =>
      n.pins.some(p => !p.isConnected && p.direction === 'input' && p.pinKind !== 'execute'),
    ).length;
    if (errorCount > 0 || warnCount > 0 || disabledCount > 0 || unknownCount > 0 || unconnExecCount > 0 || unconnDataCount > 0) {
      const summaryParts: string[] = [];
      if (errorCount > 0) summaryParts.push(`${errorCount} error`);
      if (warnCount > 0) summaryParts.push(`${warnCount} warning`);
      if (disabledCount > 0) summaryParts.push(`${disabledCount} disabled`);
      if (unknownCount > 0) summaryParts.push(`${unknownCount} unknown`);
      if (unconnExecCount > 0) summaryParts.push(`${unconnExecCount} unconn exec`);
      if (unconnDataCount > 0) summaryParts.push(`${unconnDataCount} unconn data`);
      gates.push({
        id: 'gd-nodes',
        label: 'Node Status Issues',
        status: 'attention',
        source: 'Graph Detail',
        detail: `Graph has nodes needing attention: ${summaryParts.join(', ')}.`,
        nextAction: 'Inspect flagged nodes in the Graph Detail panel.',
      });
    }
  }

  // 5. Queue
  const highTodoCount = queueItems.filter(qi => qi.priority === 'high' && qi.investigationStatus === 'todo').length;
  const todoCount = queueItems.filter(qi => qi.investigationStatus === 'todo').length;
  const reviewedDeferredCount = queueItems.filter(qi => qi.investigationStatus === 'reviewed' || qi.investigationStatus === 'deferred').length;
  if (highTodoCount > 0) {
    gates.push({
      id: 'qu-high',
      label: 'High Priority Queue Items',
      status: 'blocked',
      source: 'Queue',
      detail: `${highTodoCount} high-priority item(s) still in todo status.`,
      nextAction: `Review and triage ${highTodoCount} high-priority item(s).`,
    });
  } else if (todoCount > 0) {
    gates.push({
      id: 'qu-todo',
      label: 'Pending Queue Items',
      status: 'attention',
      source: 'Queue',
      detail: `${todoCount} item(s) pending review.`,
      nextAction: `Review ${todoCount} pending queue item(s).`,
    });
  } else if (reviewedDeferredCount > 0) {
    gates.push({
      id: 'qu-done',
      label: 'Queue Reviewed',
      status: 'ready',
      source: 'Queue',
      detail: `All ${queueItems.length} item(s) reviewed or deferred.`,
      nextAction: 'No queue action needed.',
    });
  } else {
    gates.push({
      id: 'qu-empty',
      label: 'Queue Empty',
      status: 'info',
      source: 'Queue',
      detail: 'No items in investigation queue.',
      nextAction: 'Queue evidence or nodes for investigation.',
    });
  }

  // 6. Session Review
  const review = investigationReview;
  const hasReviewContent = review.currentQuestion.trim().length > 0
    || review.workingTheory.trim().length > 0
    || review.confirmedFacts.trim().length > 0;
  const allChecklistDone = Object.values(review.checklist).every(Boolean);

  if (review.reviewStatus === 'blocked') {
    gates.push({
      id: 'sr-blocked',
      label: 'Session Review Blocked',
      status: 'blocked',
      source: 'Session Review',
      detail: 'Session review status is set to "blocked".',
      nextAction: 'Resolve blocker or update review status.',
    });
  } else if (hasReviewContent && !allChecklistDone) {
    const undone = Object.entries(review.checklist).filter(([, v]) => !v).length;
    gates.push({
      id: 'sr-checklist',
      label: 'Review Checklist Incomplete',
      status: 'attention',
      source: 'Session Review',
      detail: `${undone} checklist item(s) not yet done.`,
      nextAction: `Complete ${undone} remaining checklist item(s).`,
    });
  } else if (hasReviewContent && allChecklistDone && review.reviewStatus === 'ready') {
    gates.push({
      id: 'sr-ready',
      label: 'Session Review Ready',
      status: 'ready',
      source: 'Session Review',
      detail: 'Session review complete and checklist done.',
      nextAction: 'Proceed to handoff preparation.',
    });
  }

  // 7. Question Matrix
  const qmInputs = {
    snapshot, evidenceChains, graphDetail, nodeEvidenceMap,
    queueItems, investigationReview,
  };
  const allQuestions = generateQuestions(qmInputs);
  const qmEntries = Object.keys(questionMatrixState.entries);
  const qmOpenCount = allQuestions.filter(q => {
    const st = questionMatrixState.entries[q.id]?.status ?? 'open';
    return st === 'open';
  }).length;
  const qmBlockedCount = allQuestions.filter(q => {
    const st = questionMatrixState.entries[q.id]?.status ?? 'open';
    return st === 'blocked';
  }).length;
  const qmHighOpenBlocked = allQuestions.filter(q => {
    const st = questionMatrixState.entries[q.id]?.status ?? 'open';
    return (st === 'open' || st === 'blocked') && q.priority === 'high';
  }).length;
  const qmAnsweredCount = allQuestions.filter(q => {
    const st = questionMatrixState.entries[q.id]?.status;
    return st === 'answered';
  }).length;

  if (qmHighOpenBlocked > 0) {
    gates.push({
      id: 'qm-high',
      label: 'High Priority Open Questions',
      status: 'blocked',
      source: 'Question Matrix',
      detail: `${qmHighOpenBlocked} high-priority question(s) open or blocked.`,
      nextAction: `Address ${qmHighOpenBlocked} high-priority question(s) first.`,
    });
  } else if (qmOpenCount > 0 || qmBlockedCount > 0) {
    const total = qmOpenCount + qmBlockedCount;
    gates.push({
      id: 'qm-open',
      label: 'Open / Blocked Questions',
      status: 'attention',
      source: 'Question Matrix',
      detail: `${total} question(s) still open or blocked.`,
      nextAction: `Review ${total} question(s) in the Question Matrix panel.`,
    });
  } else if (qmAnsweredCount > 0 && qmEntries.length === allQuestions.length && allQuestions.length > 0) {
    gates.push({
      id: 'qm-done',
      label: 'Questions Reviewed',
      status: 'ready',
      source: 'Question Matrix',
      detail: `All ${allQuestions.length} question(s) reviewed.`,
      nextAction: 'No further question analysis needed.',
    });
  } else if (allQuestions.length === 0 && !hasAsset) {
    gates.push({
      id: 'qm-nosnap',
      label: 'Question Matrix Unavailable',
      status: 'info',
      source: 'Question Matrix',
      detail: 'No questions generated (no snapshot/asset).',
      nextAction: 'Load a snapshot to generate questions.',
    });
  }

  // 8. Handoff readiness (basic check from available data)
  const hasHandoffContent = hasAsset && (evidenceChains.length > 0 || queueItems.length > 0 || hasGraphDetail);
  if (!hasHandoffContent) {
    gates.push({
      id: 'ho-missing',
      label: 'Handoff Content',
      status: 'missing',
      source: 'Handoff',
      detail: 'No evidence, queue, or graph detail available for handoff.',
      nextAction: 'Load graph detail and queue investigation items.',
    });
  } else {
    // We check session review readiness as a handoff readiness proxy
    const isReviewReadyForHandoff = allChecklistDone && review.checklist.readyForHandoff && review.reviewStatus === 'ready';
    if (isReviewReadyForHandoff) {
      gates.push({
        id: 'ho-ready',
        label: 'Handoff Readiness',
        status: 'ready',
        source: 'Handoff',
        detail: 'Session review indicates readiness. Handoff package can be prepared.',
        nextAction: 'Review and generate the investigation handoff package.',
      });
    } else {
      gates.push({
        id: 'ho-attention',
        label: 'Handoff Readiness',
        status: 'attention',
        source: 'Handoff',
        detail: hasReviewContent
          ? 'Session review in progress — complete checklist and mark ready.'
          : 'No session review started. Consider documenting findings.',
        nextAction: 'Complete session review and checklist before handoff.',
      });
    }
  }

  // 9. BT/BB Mock Diagnostics (E59)
  gates.push({
    id: 'btbb-mock',
    label: 'BT/BB Mock Data Available',
    status: 'info',
    source: 'Behavior Tree / Blackboard',
    detail: 'Desktop mock fixture available for BT/BB diagnostic workbench. Data is deterministic synthetic mock data only.',
    nextAction: 'Use Desktop BT/BB panel to review mock fixture. No real UE data or endpoint available.',
  });
  gates.push({
    id: 'btbb-endpoint',
    label: 'UE Collector Not Implemented',
    status: 'missing',
    source: 'Behavior Tree / Blackboard',
    detail: 'No real UE bridge collector for BT/BB read-only diagnostics. All BT/BB data is mock fixture only.',
    nextAction: 'Yellow-zone task: implement UE collector with read-only traversal after mock validation is complete.',
  });
  gates.push({
    id: 'btbb-header',
    label: 'Header Verification Pending',
    status: 'attention',
    source: 'Behavior Tree / Blackboard',
    detail: 'UE 5.7.4 AIModule header verification is required before yellow-zone collector implementation can proceed.',
    nextAction: 'Verify UE 5.7.4 AIModule headers availability. Confirm const-correct BT traversal API.',
  });

  // 10. Controlled Change Planning Phase Completion (E64/E65/E66/E67)
  gates.push({
    id: 'architecture-review',
    label: 'Architecture Review Complete',
    status: 'ready',
    source: 'Controlled Change Planning',
    detail: 'Architecture document reviewed and approved. Scope: plan/preview/approval infrastructure only.',
    nextAction: 'Architecture review is complete.',
  });
  gates.push({
    id: 'change-plan-workspace',
    label: 'Change Plan Package Workspace',
    status: 'ready',
    source: 'Controlled Change Planning',
    detail: 'Desktop mock workspace with deterministic plan fixtures. Local memory-only state, no UE writes.',
    nextAction: 'Change-plan review workflow is ready.',
  });
  gates.push({
    id: 'patch-preview-workspace',
    label: 'Patch Preview / Manifest Workspace',
    status: 'ready',
    source: 'Controlled Change Planning',
    detail: 'Desktop mock workspace with deterministic manifest fixtures. Conceptual preview only, no execution.',
    nextAction: 'Patch preview and manifest review are ready.',
  });
  gates.push({
    id: 'approval-gate',
    label: 'Approval Gate',
    status: 'ready',
    source: 'Controlled Change Planning',
    detail: 'Desktop approval gate workspace with memory-only state transitions. Disabled future action lanes. Markdown package builder.',
    nextAction: 'Approval review workflow is ready.',
  });
  gates.push({
    id: 'user-local-validation',
    label: 'User-Local Validation',
    status: 'attention',
    source: 'Controlled Change Planning',
    detail: 'User-local validation of all green-zone workspaces is deferred to end of phase. Must be completed before red-zone work begins.',
    nextAction: 'User validation: open each workspace, verify state transitions, confirm safety boundary.',
  });

  // 12. Change Plan / Patch Preview (E65/E66)
  gates.push({
    id: 'cpp-ready',
    label: 'Change Plan Package',
    status: 'ready',
    source: 'Change Planning',
    detail: 'Desktop mock workspace ready. 3 plans: draft, ready_for_review, approved. Local memory-only state.',
    nextAction: 'Open Plans workspace to review or create change plans.',
  });
  gates.push({
    id: 'ppm-ready',
    label: 'Patch Preview / Manifest',
    status: 'ready',
    source: 'Change Planning',
    detail: 'Desktop mock manifest workspace ready. 3 manifests derived from change plans. Diff categories: asset, BP vars/nodes/wires, BT nodes, BB keys, manual steps.',
    nextAction: 'Open Patch Preview workspace to review change manifests.',
  });
  gates.push({
    id: 'cpp-execution',
    label: 'Execution Enablement',
    status: 'blocked',
    source: 'Change Planning',
    detail: 'Execution, patch application, and UE asset writes are not implemented. All plans and manifests are for review only.',
    nextAction: 'Implement the approval gate and controlled execution after Patch Preview is validated.',
  });

  // 13. Fix Execution Loop (E80)
  gates.push({
    id: 'fix-execution-code-review',
    label: 'Fix Execution Loop — Code/Review Layer Status',
    status: 'ready',
    source: 'Fix Execution Loop',
    detail: 'Desktop code-review layer: preview generated, approval recorded, execution completed, rollback available, validation run queued — all in renderer-local state. No UE Editor interaction.',
    nextAction: 'Desktop code and review layers are ready.',
  });
  gates.push({
    id: 'fix-execution-ue-validation',
    label: 'Fix Execution Loop — UE Validation Pending',
    status: 'attention',
    source: 'Fix Execution Loop',
    detail: 'All real UE writes, compile, PIE, Automation, rollback, and asset inspection require user-local validation in UE Editor. Desktop reports PASS_PENDING_USER_LOCAL_VALIDATION and cannot confirm actual UE asset state.',
    nextAction: 'User-local validation: verify write outcome in UE Editor, confirm compile/PIE/Automation results, and inspect changed asset.',
  });

  // 14. Safety (always info)
  gates.push({
    id: 'safety',
    label: 'Safety Boundary',
    status: 'info',
    source: 'Safety',
    detail: 'Local read-only assessment only. No UE compile/PIE/Automation triggered. No AI/LLM/auto-fix. All data from renderer memory.',
    nextAction: 'This is a local closure assessment only. Does not replace real project validation.',
  });

  return gates;
}

// ── Component ───────────────────────────────────────────────────

export function InfrastructureClosurePanel({
  snapshot, evidenceChains, graphDetail, nodeEvidenceMap,
  queueItems, investigationReview, questionMatrixState,
  lastUpdatedAt, closureState, onClosureChange, onReset,
}: Props) {
  const { copy } = useDesktopCopy();
  const cc = copy.closure;
  const common = copy.common;

  const [filterStatus, setFilterStatus] = useState<ClosureGateStatus | 'all'>('all');
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');
  const [confirmingReset, setConfirmingReset] = useState(false);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  // ── Compute gates ──────────────────────────────────────────
  const gates = useMemo(
    () => computeGates(snapshot, evidenceChains, graphDetail, nodeEvidenceMap, queueItems, investigationReview, questionMatrixState),
    [snapshot, evidenceChains, graphDetail, nodeEvidenceMap, queueItems, investigationReview, questionMatrixState],
  );

  // ── Gate summary counts ────────────────────────────────────
  const gateSummary = useMemo(() => {
    let ready = 0, attention = 0, blocked = 0, missing = 0, info = 0;
    for (const g of gates) {
      switch (g.status) {
        case 'ready': ready++; break;
        case 'attention': attention++; break;
        case 'blocked': blocked++; break;
        case 'missing': missing++; break;
        case 'info': info++; break;
      }
    }
    return { total: gates.length, ready, attention, blocked, missing, info };
  }, [gates]);

  // ── Filtered gates ─────────────────────────────────────────
  const filteredGates = useMemo(() => {
    if (filterStatus === 'all') return gates;
    return gates.filter(g => g.status === filterStatus);
  }, [gates, filterStatus]);

  // ── Markdown builder ───────────────────────────────────────
  const markdown = useMemo(() => {
    const lines: string[] = [];

    lines.push(cc.mdTitle);
    lines.push('');
    lines.push(`${cc.mdGenerated} ${new Date().toISOString()}`);
    lines.push(`${cc.mdClosureDecision} ${closureState.decision === 'draft' ? cc.decisionDraft
      : closureState.decision === 'ready_for_handoff' ? cc.decisionReadyForHandoff
      : closureState.decision === 'needs_verification' ? cc.decisionNeedsVerification
      : closureState.decision === 'blocked' ? cc.decisionBlocked
      : closureState.decision === 'closed' ? cc.decisionClosed
      : cc.decisionDraft}`);
    if (closureState.owner.trim()) {
      lines.push(`${cc.mdOwner} ${closureState.owner}`);
    }
    if (closureState.updatedAt) {
      lines.push(`${cc.mdUpdatedAt} ${closureState.updatedAt}`);
    }
    lines.push('');

    // Gate summary
    lines.push(cc.mdGateSummary);
    lines.push('');
    lines.push(`- ${cc.readinessReady}: ${gateSummary.ready}/${gateSummary.total}`);
    lines.push(`- ${cc.readinessAttention}: ${gateSummary.attention}`);
    lines.push(`- ${cc.readinessBlocked}: ${gateSummary.blocked}`);
    lines.push(`- ${cc.readinessMissing}: ${gateSummary.missing}`);
    lines.push(`- ${cc.readinessInfo}: ${gateSummary.info}`);
    lines.push('');

    // Decision notes
    if (closureState.decisionNotes.trim()) {
      lines.push(cc.mdDecisionNotes);
      lines.push(closureState.decisionNotes);
      lines.push('');
    }

    // Verification notes
    if (closureState.verificationNotes.trim()) {
      lines.push(cc.mdVerificationNotes);
      lines.push(closureState.verificationNotes);
      lines.push('');
    }

    // Risk notes
    if (closureState.riskNotes.trim()) {
      lines.push(cc.mdRiskNotes);
      lines.push(closureState.riskNotes);
      lines.push('');
    }

    // Blockers
    const blockers = gates.filter(g => g.status === 'blocked');
    lines.push(cc.mdBlockers);
    lines.push('');
    if (blockers.length > 0) {
      for (const g of blockers) {
        lines.push(`- **${g.label}** (${g.source}): ${g.detail}`);
      }
    } else {
      lines.push(cc.mdNoBlockers);
    }
    lines.push('');

    // Manual verification plan
    const attentionGates = gates.filter(g => g.status === 'attention');
    if (attentionGates.length > 0) {
      lines.push(cc.mdManualVerificationPlan);
      lines.push('');
      for (const g of attentionGates) {
        lines.push(`1. **${g.label}**: ${g.nextAction}`);
      }
      lines.push('');
    }

    // Question Matrix summary
    const qmHighOpen = gates.find(g => g.id === 'qm-high');
    if (qmHighOpen) {
      lines.push(cc.mdQuestionSummary);
      lines.push(qmHighOpen.detail);
      lines.push('');
    }

    // Queue summary
    const queueHigh = gates.find(g => g.id === 'qu-high');
    if (queueHigh) {
      lines.push(cc.mdQueueSummary);
      lines.push(queueHigh.detail);
      lines.push('');
    }

    // Safety
    lines.push(cc.mdSafetyNote);
    lines.push('');
    lines.push(cc.safetyNoteDetail);
    lines.push('');

    return lines.join('\n');
  }, [cc, closureState, gates, gateSummary]);

  // ── Handlers ───────────────────────────────────────────────
  const handleDecisionChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    onClosureChange({
      decision: e.target.value as ClosureDecision,
      updatedAt: new Date().toISOString(),
    });
  }, [onClosureChange]);

  const handleOwnerChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    onClosureChange({ owner: e.target.value, updatedAt: new Date().toISOString() });
  }, [onClosureChange]);

  const handleDecisionNotesChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onClosureChange({ decisionNotes: e.target.value, updatedAt: new Date().toISOString() });
  }, [onClosureChange]);

  const handleVerificationNotesChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onClosureChange({ verificationNotes: e.target.value, updatedAt: new Date().toISOString() });
  }, [onClosureChange]);

  const handleRiskNotesChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onClosureChange({ riskNotes: e.target.value, updatedAt: new Date().toISOString() });
  }, [onClosureChange]);

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

  const handleReset = useCallback(() => {
    if (!confirmingReset) {
      setConfirmingReset(true);
      return;
    }
    onReset();
    setConfirmingReset(false);
  }, [confirmingReset, onReset]);

  // ── Decision readiness labels ──────────────────────────────
  const decisionOptions: { value: ClosureDecision; label: string }[] = [
    { value: 'draft', label: cc.decisionDraft },
    { value: 'ready_for_handoff', label: cc.decisionReadyForHandoff },
    { value: 'needs_verification', label: cc.decisionNeedsVerification },
    { value: 'blocked', label: cc.decisionBlocked },
    { value: 'closed', label: cc.decisionClosed },
  ];

  // ── Readiness indicators ───────────────────────────────────
  const canHandoff = gateSummary.blocked === 0 && closureState.decision === 'ready_for_handoff';
  const needsManualVerification = gateSummary.attention > 0 || closureState.decision === 'needs_verification';
  const isBlocked = gateSummary.blocked > 0 || closureState.decision === 'blocked';

  return (
    <section className="icp-panel">
      {/* Title */}
      <h3 className="icp-title">{cc.title}</h3>

      {/* Summary strip */}
      <div className="icp-summary-strip">
        <span className="icp-summary-item">{common.total}: <strong>{gateSummary.total}</strong></span>
        <span className="icp-summary-item icp-summary-ready">{cc.gateReady}: <strong>{gateSummary.ready}</strong></span>
        {gateSummary.attention > 0 && (
          <span className="icp-summary-item icp-summary-attention">{cc.gateAttention}: <strong>{gateSummary.attention}</strong></span>
        )}
        {gateSummary.blocked > 0 && (
          <span className="icp-summary-item icp-summary-blocked">{cc.gateBlocked}: <strong>{gateSummary.blocked}</strong></span>
        )}
        {gateSummary.missing > 0 && (
          <span className="icp-summary-item icp-summary-missing">{cc.gateMissing}: <strong>{gateSummary.missing}</strong></span>
        )}
        <span className="icp-summary-item icp-summary-info">{cc.gateInfo}: <strong>{gateSummary.info}</strong></span>
        <span className={`icp-summary-item icp-summary-decision icp-decision-${closureState.decision}`}>
          {cc.decisionTitle}: <strong>{decisionOptions.find(d => d.value === closureState.decision)?.label ?? closureState.decision}</strong>
        </span>
      </div>

      {/* Closure readiness */}
      <div className="icp-readiness-bar">
        {canHandoff && <span className="icp-readiness-tag icp-readiness-ready">{cc.handoffReady}</span>}
        {needsManualVerification && <span className="icp-readiness-tag icp-readiness-attention">{cc.manualVerification}</span>}
        {isBlocked && <span className="icp-readiness-tag icp-readiness-blocked">{gateSummary.blocked > 0 ? `${cc.blockedLabel} (${gateSummary.blocked})` : cc.decisionBlocked}</span>}
        <span className="icp-readiness-safety">{cc.safetyNoteDetail}</span>
      </div>

      {/* Controls */}
      <div className="icp-controls">
        <div className="icp-control-group">
          <label className="icp-control-label">{cc.decisionTitle}</label>
          <select
            className="icp-select"
            value={closureState.decision}
            onChange={handleDecisionChange}
          >
            {decisionOptions.map(d => (
              <option key={d.value} value={d.value}>{d.label}</option>
            ))}
          </select>
        </div>
        <div className="icp-control-group">
          <label className="icp-control-label">{cc.ownerLabel}</label>
          <input
            className="icp-input"
            type="text"
            value={closureState.owner}
            onChange={handleOwnerChange}
            placeholder={cc.ownerPlaceholder}
          />
        </div>
      </div>

      {/* Notes */}
      <div className="icp-notes-grid">
        <div className="icp-field">
          <label className="icp-field-label">{cc.decisionNotesLabel}</label>
          <textarea
            className="icp-textarea"
            value={closureState.decisionNotes}
            onChange={handleDecisionNotesChange}
            placeholder={cc.decisionNotesPlaceholder}
            rows={3}
          />
        </div>
        <div className="icp-field">
          <label className="icp-field-label">{cc.verificationNotesLabel}</label>
          <textarea
            className="icp-textarea"
            value={closureState.verificationNotes}
            onChange={handleVerificationNotesChange}
            placeholder={cc.verificationNotesPlaceholder}
            rows={3}
          />
        </div>
        <div className="icp-field">
          <label className="icp-field-label">{cc.riskNotesLabel}</label>
          <textarea
            className="icp-textarea"
            value={closureState.riskNotes}
            onChange={handleRiskNotesChange}
            placeholder={cc.riskNotesPlaceholder}
            rows={3}
          />
        </div>
      </div>

      {/* Gate board */}
      <div className="icp-gate-section">
        <div className="icp-gate-header">
          <h4 className="icp-gate-title">{cc.gateTitle}</h4>
          <div className="icp-gate-filters">
            <select
              className="icp-gate-filter"
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value as ClosureGateStatus | 'all')}
            >
              <option value="all">{common.all}</option>
              <option value="ready">{cc.gateReady}</option>
              <option value="attention">{cc.gateAttention}</option>
              <option value="blocked">{cc.gateBlocked}</option>
              <option value="missing">{cc.gateMissing}</option>
              <option value="info">{cc.gateInfo}</option>
            </select>
            <button
              className={`icp-reset-btn${confirmingReset ? ' icp-confirming' : ''}`}
              onClick={handleReset}
              onBlur={() => setConfirmingReset(false)}
              type="button"
            >
              {confirmingReset ? common.confirming : common.reset}
            </button>
          </div>
        </div>
        <div className="icp-gate-board">
          {filteredGates.length === 0 && (
            <div className="icp-empty">
              {common.noData}
            </div>
          )}
          {filteredGates.map(g => {
            let badgeClass = '';
            switch (g.status) {
              case 'ready': badgeClass = 'icp-badge-ready'; break;
              case 'attention': badgeClass = 'icp-badge-attention'; break;
              case 'blocked': badgeClass = 'icp-badge-blocked'; break;
              case 'missing': badgeClass = 'icp-badge-missing'; break;
              case 'info': badgeClass = 'icp-badge-info'; break;
            }
            return (
              <div key={g.id} className={`icp-gate-row icp-gate-${g.status}`}>
                <div className="icp-gate-row-header">
                  <span className={`icp-badge ${badgeClass}`}>
                    {g.status === 'ready' ? cc.gateReady
                      : g.status === 'attention' ? cc.gateAttention
                      : g.status === 'blocked' ? cc.gateBlocked
                      : g.status === 'missing' ? cc.gateMissing
                      : cc.gateInfo}
                  </span>
                  <span className="icp-gate-row-label">{g.label}</span>
                  <span className="icp-gate-row-source">{g.source}</span>
                </div>
                <div className="icp-gate-row-detail">{g.detail}</div>
                <div className="icp-gate-row-action">
                  <span className="icp-gate-action-label">{cc.gateAction}:</span> {g.nextAction}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Markdown Preview + Copy */}
      <div className="icp-preview-section">
        <div className="icp-preview-toolbar">
          <span className="icp-preview-label">{cc.markdownPreview}</span>
          <div className="icp-preview-actions">
            {copyState === 'copied' && (
              <span className="icp-copy-status icp-copy-ok">{cc.copied}</span>
            )}
            {copyState === 'error' && (
              <span className="icp-copy-status icp-copy-error">{cc.copyFailed}</span>
            )}
            <button
              className="icp-copy-btn"
              onClick={handleCopy}
              type="button"
            >
              {cc.copyPackage}
            </button>
          </div>
        </div>
        <pre className="icp-markdown-pre">{markdown}</pre>
      </div>
    </section>
  );
}
