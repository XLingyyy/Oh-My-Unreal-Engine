import { useState, useMemo, useCallback } from 'react';
import type { OmueContextSnapshot, EvidenceChain, BlueprintGraphDetailData } from '@omue/shared-protocol';
import type { NodeEvidenceSummary } from './GraphDetailPanel';
import type { QueueItem } from './InvestigationQueuePanel';
import type { InvestigationReviewState } from './InvestigationSessionPanel';
import { useDesktopCopy } from '../i18n';

// ── Renderer-local types ──

export type QuestionCategory = 'context' | 'compile' | 'runtime' | 'logs' | 'evidence' | 'graph' | 'queue' | 'session' | 'handoff' | 'bt-blackboard';
export type QuestionPriority = 'high' | 'normal' | 'low';
export type QuestionStatus = 'open' | 'verifying' | 'answered' | 'blocked' | 'deferred';

export interface QuestionMatrixItem {
  id: string;
  category: QuestionCategory;
  priority: QuestionPriority;
  source: string;
  question: string;
  why: string;
  suggestedVerification: string;
  relatedRef?: string;
  deterministicReason: string;
}

export interface QuestionReviewEntry {
  status: QuestionStatus;
  note: string;
}

export interface QuestionMatrixState {
  entries: Record<string, QuestionReviewEntry>;
  updatedAt: string | null;
}

export const defaultQuestionMatrixState: QuestionMatrixState = {
  entries: {},
  updatedAt: null,
};

// ── Props ──

interface Props {
  snapshot: OmueContextSnapshot | null;
  evidenceChains: EvidenceChain[];
  graphDetail: BlueprintGraphDetailData | null;
  nodeEvidenceMap?: Record<string, NodeEvidenceSummary[]>;
  queueItems: QueueItem[];
  queueSessionNotes: string;
  investigationReview: InvestigationReviewState;
  lastUpdatedAt: string | null;
  questionMatrixState: QuestionMatrixState;
  onEntryUpdate: (entryId: string, entry: QuestionReviewEntry) => void;
  onReset: () => void;
}

// ── Input data interface for question generation (used by panel and handoff) ──

export interface QuestionGenerationInputs {
  snapshot: OmueContextSnapshot | null;
  evidenceChains: EvidenceChain[];
  graphDetail: BlueprintGraphDetailData | null;
  nodeEvidenceMap?: Record<string, NodeEvidenceSummary[]>;
  queueItems: QueueItem[];
  investigationReview: InvestigationReviewState;
}

// ── Deterministic question generation ──

export function generateQuestions(inputs: QuestionGenerationInputs): QuestionMatrixItem[] {
  const { snapshot, evidenceChains, graphDetail, nodeEvidenceMap, queueItems, investigationReview } = inputs;
  const result: QuestionMatrixItem[] = [];

  // Helper to avoid duplicate IDs
  let seq = 0;
  const nid = (prefix: string) => `${prefix}-${String(++seq).padStart(3, '0')}`;

  // 1. Context / Current asset
  const asset = snapshot?.currentAsset;
  const hasAsset = !!asset?.assetPath;

  if (!hasAsset) {
    result.push({
      id: nid('ctx'),
      category: 'context',
      priority: 'high',
      source: 'Current Asset',
      question: 'Which Blueprint asset is under investigation?',
      why: 'No current asset is selected or available in the context snapshot.',
      suggestedVerification: 'Open a Blueprint asset in UE Editor and capture a new context snapshot.',
      deterministicReason: 'snapshot.currentAsset is null or missing assetPath.',
    });
  }

  if (asset?.isDirty) {
    result.push({
      id: nid('ctx'),
      category: 'context',
      priority: 'normal',
      source: 'Current Asset',
      question: 'Does the open investigation relate to unsaved changes?',
      why: 'Current Blueprint asset has unsaved (dirty) modifications that may affect investigation conclusions.',
      suggestedVerification: 'Review unsaved changes and confirm whether they are relevant to the current investigation.',
      deterministicReason: 'currentAsset.isDirty is true.',
    });
  }

  // 2. Compile
  const cs = snapshot?.compileStatus;
  if (cs?.isCompiling) {
    result.push({
      id: nid('cpl'),
      category: 'compile',
      priority: 'high',
      source: 'Compile Status',
      question: 'Is the current investigation affected by an ongoing compile?',
      why: 'The Blueprint compiler is currently running, which may cause stale or incomplete data.',
      suggestedVerification: 'Wait for compile to finish, then refresh the context snapshot.',
      deterministicReason: 'compileStatus.isCompiling is true.',
    });
  }

  if (cs && (cs.lastCompileResult === 'failed' || (cs.errorCount ?? 0) > 0)) {
    result.push({
      id: nid('cpl'),
      category: 'compile',
      priority: 'high',
      source: 'Compile Status',
      question: `What compile error${(cs.errorCount ?? 0) > 1 ? 's' : ''} needs investigation?`,
      why: `Compile failed with ${cs.errorCount ?? 0} error(s) and ${cs.warningCount ?? 0} warning(s).`,
      suggestedVerification: 'Review compile error messages and determine if they are related to the current issue.',
      deterministicReason: `compileStatus.lastCompileResult is "${cs.lastCompileResult}", errorCount=${cs.errorCount ?? 0}.`,
    });
  }

  if (cs && (cs.warningCount ?? 0) > 0 && (cs.errorCount ?? 0) === 0 && cs.lastCompileResult !== 'failed') {
    result.push({
      id: nid('cpl'),
      category: 'compile',
      priority: 'normal',
      source: 'Compile Status',
      question: `What compile warning${(cs.warningCount ?? 0) > 1 ? 's' : ''} should be reviewed?`,
      why: `Compile succeeded with ${cs.warningCount} warning(s).`,
      suggestedVerification: 'Review warnings and assess if any indicate potential runtime issues.',
      deterministicReason: `compileStatus.warningCount=${cs.warningCount}, lastCompileResult="${cs.lastCompileResult}".`,
    });
  }

  // 3. Runtime
  const rs = snapshot?.runtimeStatus;
  if (rs?.isSimulating || rs?.isPieRunning) {
    result.push({
      id: nid('rt'),
      category: 'runtime',
      priority: 'normal',
      source: 'Runtime Status',
      question: 'Is the current snapshot affected by active PIE/simulation state?',
      why: `Runtime is ${rs.isSimulating ? 'simulating' : 'running in PIE'}. Snapshot data may differ from editor-time state.`,
      suggestedVerification: 'Stop PIE/simulation, re-capture snapshot and compare results.',
      deterministicReason: `runtimeStatus.isSimulating=${!!rs.isSimulating}, isPieRunning=${!!rs.isPieRunning}.`,
    });
  }

  // 4. Recent logs
  const logs = snapshot?.recentLogs ?? [];
  const errorLogs = logs.filter(l => l.verbosity === 'error' || l.verbosity === 'fatal');
  const warnLogs = logs.filter(l => l.verbosity === 'warning');

  if (errorLogs.length > 0) {
    result.push({
      id: nid('log'),
      category: 'logs',
      priority: 'high',
      source: 'Recent Logs',
      question: `What caused ${errorLogs.length} recent log error${errorLogs.length > 1 ? 's' : ''}?`,
      why: `${errorLogs.length} error/fatal log message(s) detected in recent logs.`,
      suggestedVerification: `Review the ${errorLogs.length} error log entries and correlate with current investigation.`,
      relatedRef: errorLogs.map(l => l.message).join('; ').slice(0, 200),
      deterministicReason: `recentLogs contains ${errorLogs.length} entries with verbosity "error" or "fatal".`,
    });
  }

  if (warnLogs.length > 0 && errorLogs.length === 0) {
    result.push({
      id: nid('log'),
      category: 'logs',
      priority: 'normal',
      source: 'Recent Logs',
      question: `Do ${warnLogs.length} recent warning(s) require attention?`,
      why: `${warnLogs.length} warning log message(s) detected but no errors.`,
      suggestedVerification: `Review the ${warnLogs.length} warning entries for relevant context.`,
      deterministicReason: `recentLogs contains ${warnLogs.length} entries with verbosity "warning" and no errors/fatals.`,
    });
  }

  // 5. Evidence
  if (evidenceChains.length === 0) {
    result.push({
      id: nid('ev'),
      category: 'evidence',
      priority: 'high',
      source: 'Evidence Chains',
      question: 'Why is there no evidence data?',
      why: 'No evidence chains were generated. This may indicate missing context or insufficient data.',
      suggestedVerification: 'Ensure context snapshot is captured and graph detail is loaded.',
      deterministicReason: 'evidenceChains array is empty.',
    });
  } else {
    const unresolvedCount = evidenceChains.reduce(
      (sum, c) => sum + c.items.filter(i => i.confidence.level === 'unresolved').length, 0,
    );
    if (unresolvedCount > 0) {
      result.push({
        id: nid('ev'),
        category: 'evidence',
        priority: 'high',
        source: 'Evidence Chains',
        question: `What do ${unresolvedCount} unresolved evidence item(s) indicate?`,
        why: `${unresolvedCount} evidence item(s) have unresolved confidence across ${evidenceChains.length} chain(s).`,
        suggestedVerification: 'Review unresolved evidence items and manually assess their relevance.',
        deterministicReason: `evidenceChains contain ${unresolvedCount} items with confidence.level "unresolved".`,
      });
    }

    const highConfChains = evidenceChains.filter(
      c => c.items.some(i => i.confidence.level === 'high'),
    );
    if (highConfChains.length > 0) {
      result.push({
        id: nid('ev'),
        category: 'evidence',
        priority: 'normal',
        source: 'Evidence Chains',
        question: `Are the findings from ${highConfChains.length} high-confidence evidence chain(s) confirmed?`,
        why: `${highConfChains.length} chain(s) contain high-confidence items that may provide strong signals.`,
        suggestedVerification: 'Manually verify the high-confidence evidence and update review state accordingly.',
        deterministicReason: `${highConfChains.length} chain(s) have items with confidence.level "high".`,
      });
    }
  }

  // 6. Graph detail
  const graphNodes = graphDetail?.selectedBlueprint?.graph?.detail?.nodes;
  const graphTruncation = graphDetail?.selectedBlueprint?.graph?.detail?.truncation;

  if (!graphNodes) {
    result.push({
      id: nid('gr'),
      category: 'graph',
      priority: 'high',
      source: 'Graph Detail',
      question: 'Is the graph detail loaded for the current asset?',
      why: 'No graph detail is loaded, which limits node-level inspection.',
      suggestedVerification: 'Load graph detail via the context summary panel.',
      deterministicReason: 'graphDetail is null or graph detail nodes are undefined.',
    });
  } else {
    if (graphTruncation?.truncated) {
      result.push({
        id: nid('gr'),
        category: 'graph',
        priority: 'high',
        source: 'Graph Detail',
        question: 'Does graph truncation hide relevant nodes?',
        why: 'Graph is truncated, which may hide relevant nodes or connections.',
        suggestedVerification: `Review truncation warnings: ${(graphTruncation.warnings ?? []).join(', ') || 'none provided'}. Consider loading a smaller sub-graph.`,
        relatedRef: graphTruncation.warnings.join('; '),
        deterministicReason: 'graph detail truncation.truncated is true.',
      });
    }

    const nodeStatusCues: string[] = [];
    if (graphNodes.some(n => n.nodeType === 'unknown')) {
      nodeStatusCues.push('unknown');
    }
    if (nodeStatusCues.length > 0) {
      result.push({
        id: nid('gr'),
        category: 'graph',
        priority: 'normal',
        source: 'Graph Detail',
        question: `Do ${nodeStatusCues.join(' or ')} indicate incomplete data?`,
        why: `Graph contains nodes with flags: ${nodeStatusCues.join(', ')}.`,
        suggestedVerification: `Inspect nodes flagged as ${nodeStatusCues.join(', ')} and verify their connections.`,
        deterministicReason: `Graph nodes contain types: ${nodeStatusCues.join(', ')}.`,
      });
    }
  }

  // 7. Node evidence map
  if (graphNodes && graphNodes.length > 0) {
    const mapKeys = nodeEvidenceMap ? Object.keys(nodeEvidenceMap) : [];
    if (mapKeys.length === 0) {
      result.push({
        id: nid('nem'),
        category: 'graph',
        priority: 'normal',
        source: 'Node Evidence Map',
        question: 'Which nodes should be inspected for evidence?',
        why: 'Graph is loaded but no node-to-evidence mapping is available for the current graph.',
        suggestedVerification: 'Check if evidence chains reference nodes in this graph. Manually inspect key nodes.',
        deterministicReason: 'graph is loaded but nodeEvidenceMap is empty or undefined.',
      });
    } else {
      // Rank nodes by evidence count to suggest inspection priority
      const nodeEntries = mapKeys
        .map(nodeId => ({ nodeId, count: nodeEvidenceMap![nodeId].length }))
        .sort((a, b) => b.count - a.count);
      const topNode = nodeEntries[0];
      result.push({
        id: nid('nem'),
        category: 'evidence',
        priority: 'normal',
        source: 'Node Evidence Map',
        question: `Should node "${topNode.nodeId.slice(0, 40)}" be inspected first?`,
        why: `This node has ${topNode.count} evidence item(s), the most among ${mapKeys.length} mapped node(s).`,
        suggestedVerification: `Inspect node ${topNode.nodeId} and review its ${topNode.count} evidence items.`,
        relatedRef: `Node ID: ${topNode.nodeId}`,
        deterministicReason: `nodeEvidenceMap has ${mapKeys.length} entries; "${topNode.nodeId}" has ${topNode.count} items (highest count).`,
      });
    }
  }

  // 8. Queue
  const todoItems = queueItems.filter(qi => qi.investigationStatus === 'todo');
  const highTodoItems = todoItems.filter(qi => qi.priority === 'high');
  const deferredItems = queueItems.filter(qi => qi.investigationStatus === 'deferred');

  if (highTodoItems.length > 0) {
    result.push({
      id: nid('qu'),
      category: 'queue',
      priority: 'high',
      source: 'Queue',
      question: `What action is needed for ${highTodoItems.length} high-priority queue item(s)?`,
      why: `${highTodoItems.length} high-priority item(s) remain in todo status.`,
      suggestedVerification: `Review and address ${highTodoItems.length} high-priority item(s) in the queue.`,
      deterministicReason: `${highTodoItems.length} queue items have priority "high" and investigationStatus "todo".`,
    });
  }

  if (todoItems.length > 0 && highTodoItems.length === 0) {
    result.push({
      id: nid('qu'),
      category: 'queue',
      priority: 'normal',
      source: 'Queue',
      question: `Do ${todoItems.length} pending queue item(s) need attention?`,
      why: `${todoItems.length} normal-priority item(s) remain in todo status.`,
      suggestedVerification: `Review and triage ${todoItems.length} pending queue item(s).`,
      deterministicReason: `${todoItems.length} queue items have investigationStatus "todo" and none are high priority.`,
    });
  }

  if (deferredItems.length > 0) {
    result.push({
      id: nid('qu'),
      category: 'queue',
      priority: 'low',
      source: 'Queue',
      question: `Should ${deferredItems.length} deferred queue item(s) be revisited?`,
      why: `${deferredItems.length} item(s) are deferred and may need follow-up.`,
      suggestedVerification: `Review ${deferredItems.length} deferred items and determine if conditions have changed.`,
      deterministicReason: `${deferredItems.length} queue items have investigationStatus "deferred".`,
    });
  }

  // 9. Session review (E54)
  const review = investigationReview;
  const hasReviewContent = review.currentQuestion.trim().length > 0
    || review.workingTheory.trim().length > 0
    || review.confirmedFacts.trim().length > 0;

  if (review.reviewStatus === 'blocked') {
    result.push({
      id: nid('sr'),
      category: 'session',
      priority: 'high',
      source: 'Session Review',
      question: 'What is blocking the session review?',
      why: 'Session review status is set to "blocked".',
      suggestedVerification: 'Identify and resolve blocker, or update review status if no longer blocked.',
      deterministicReason: 'investigationReview.reviewStatus is "blocked".',
    });
  }

  if (hasReviewContent && review.reviewStatus !== 'ready') {
    const undoneItems = Object.entries(review.checklist).filter(([, v]) => !v).length;
    if (undoneItems > 0) {
      result.push({
        id: nid('sr'),
        category: 'session',
        priority: 'normal',
        source: 'Session Review',
        question: `Can ${undoneItems} incomplete checklist item(s) be resolved before handoff?`,
        why: `Review checklist has ${undoneItems} incomplete item(s) with status "${review.reviewStatus}".`,
        suggestedVerification: `Complete ${undoneItems} remaining checklist item(s) or document why they are deferred.`,
        deterministicReason: `investigationReview.checklist has ${undoneItems} false entries, reviewStatus="${review.reviewStatus}".`,
      });
    }
  }

  if (review.openQuestions.trim().length > 0) {
    const lines = review.openQuestions.split('\n').filter(l => l.trim().length > 0);
    result.push({
      id: nid('sr'),
      category: 'session',
      priority: 'normal',
      source: 'Session Review',
      question: `Are ${lines.length} open question(s) in the review covered by evidence?`,
      why: `Session review lists ${lines.length} open question(s) that may need evidence mapping.`,
      suggestedVerification: `Map each open question to available evidence or mark as requiring further investigation.`,
      relatedRef: lines.slice(0, 3).join('; '),
      deterministicReason: `investigationReview.openQuestions has ${lines.length} non-empty line(s).`,
    });
  }

  if (review.verificationPlan.trim().length === 0 && hasReviewContent && hasAsset) {
    result.push({
      id: nid('sr'),
      category: 'session',
      priority: 'low',
      source: 'Session Review',
      question: 'Should a verification plan be documented?',
      why: 'Session review has content but no verification plan.',
      suggestedVerification: 'Add verification steps to the session review for any hypotheses or findings.',
      deterministicReason: 'investigationReview.verificationPlan is empty while review has content and asset is available.',
    });
  }

  // 11. BT/BB Mock Diagnostic — future yellow-zone verification (E59)
  result.push({
    id: nid('btbb'),
    category: 'bt-blackboard',
    priority: 'low',
    source: 'BT/BB Mock Fixture',
    question: 'UE 5.7.4 AIModule headers verified for BT/BB collector?',
    why: 'Yellow-zone BT/BB UE collector requires UE 5.7.4 AIModule headers. Desktop mock fixture has no real UE bridge.',
    suggestedVerification: 'Check UE 5.7.4 source headers in Engine/Source/Runtime/AIModule. Verify BT/BB API compatibility.',
    relatedRef: 'Mock-only fixture; no real UE bridge data',
    deterministicReason: 'Desktop mock fixture has no real UE bridge data; yellow-zone collector will need AIModule headers.',
  });

  result.push({
    id: nid('btbb'),
    category: 'bt-blackboard',
    priority: 'low',
    source: 'BT/BB Mock Fixture',
    question: 'Does read-only BT traversal avoid asset dirty side effects in UE?',
    why: 'UE Behavior Tree asset traversal may mark assets as dirty if accessed via non-const operations. Must verify read-only path.',
    suggestedVerification: 'Confirm collector uses const-correct traversal. Test in PIE with a modified BT to verify no dirty flag is set after read-only access.',
    deterministicReason: 'The design review identified a potential dirty-asset side effect during Behavior Tree traversal.',
  });

  result.push({
    id: nid('btbb'),
    category: 'bt-blackboard',
    priority: 'low',
    source: 'BT/BB Mock Fixture',
    question: 'Is Blackboard runtime value access out of scope unless PIE is running and user confirms?',
    why: 'Blackboard runtime values only exist during PIE. Static extraction from asset only yields key schema, not runtime values.',
    suggestedVerification: 'Clarify scope: mock fixture covers key schema and references only. Runtime value access requires PIE + user consent.',
    deterministicReason: 'Desktop mock fixture only covers Blackboard key schema (name, type, scope, defaults). Runtime values are PIE-only.',
  });

  result.push({
    id: nid('btbb'),
    category: 'bt-blackboard',
    priority: 'low',
    source: 'BT/BB Mock Fixture',
    question: 'Does Desktop fixture cover expected decorator/service/task/key reference shapes?',
    why: 'Fixture coverage determines whether the Desktop UI correctly renders BT/BB data when a real UE collector becomes available.',
    suggestedVerification: 'Compare fixture against real BT_CombatGuard in UE 5.7.4. Verify node types, abort modes, service intervals, and BB key references match.',
    deterministicReason: 'Fixture was hand-authored to match common UE BT patterns. Real-UE comparison is needed for schema validation.',
  });

  // 10. Handoff readiness
  const allChecklistDone = Object.values(review.checklist).every(Boolean);
  if (hasReviewContent && allChecklistDone && review.reviewStatus === 'ready') {
    result.push({
      id: nid('ho'),
      category: 'handoff',
      priority: 'normal',
      source: 'Review → Handoff',
      question: 'Is the investigation ready for handoff?',
      why: 'Session review is complete and ready, and checklist is fully done.',
      suggestedVerification: 'Review handoff package for completeness and generate the handoff.',
      deterministicReason: 'investigationReview.reviewStatus is "ready" and all checklist items are true.',
    });
  }

  return result;
}

// ── Component ──

export function InvestigationQuestionMatrixPanel(props: Props) {
  const {
    snapshot, evidenceChains, graphDetail, nodeEvidenceMap,
    queueItems, queueSessionNotes, investigationReview, lastUpdatedAt,
    questionMatrixState, onEntryUpdate, onReset,
  } = props;
  const { copy } = useDesktopCopy();
  const qmc = copy.questionMatrix;
  const common = copy.common;

  // Filters
  const [categoryFilter, setCategoryFilter] = useState<QuestionCategory | 'all'>('all');
  const [priorityFilter, setPriorityFilter] = useState<QuestionPriority | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<QuestionStatus | 'all'>('all');
  const [searchText, setSearchText] = useState('');
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'success' | 'failed'>('idle');

  // Generate questions deterministically
  const allQuestions = useMemo(() => generateQuestions({
    snapshot, evidenceChains, graphDetail, nodeEvidenceMap,
    queueItems, investigationReview,
  }), [
    snapshot, evidenceChains, graphDetail, nodeEvidenceMap,
    queueItems, investigationReview,
  ]);

  // Apply filters
  const filteredQuestions = useMemo(() => {
    return allQuestions.filter(q => {
      if (categoryFilter !== 'all' && q.category !== categoryFilter) return false;
      if (priorityFilter !== 'all' && q.priority !== priorityFilter) return false;
      if (statusFilter !== 'all') {
        const entry = questionMatrixState.entries[q.id];
        if ((entry?.status ?? 'open') !== statusFilter) return false;
      }
      if (searchText.trim()) {
        const t = searchText.toLowerCase();
        if (!q.question.toLowerCase().includes(t) &&
            !q.why.toLowerCase().includes(t) &&
            !q.source.toLowerCase().includes(t)) return false;
      }
      return true;
    });
  }, [allQuestions, categoryFilter, priorityFilter, statusFilter, searchText, questionMatrixState.entries]);

  // Summary counts
  const summary = useMemo(() => {
    const total = allQuestions.length;
    let open = 0, blocked = 0, answered = 0, high = 0, missingContext = 0;
    for (const q of allQuestions) {
      const entry = questionMatrixState.entries[q.id];
      const st = entry?.status ?? 'open';
      if (st === 'open') open++;
      if (st === 'blocked') blocked++;
      if (st === 'answered') answered++;
      if (q.priority === 'high') high++;
      if (q.category === 'context' && q.priority === 'high') missingContext++;
    }
    return { total, open, blocked, answered, high, missingContext };
  }, [allQuestions, questionMatrixState.entries]);

  // Build markdown (memoized, shared for preview and copy)
  const markdown = useMemo(() => {
    const lines: string[] = [];
    lines.push(qmc.mdTitle);
    lines.push('');
    lines.push(qmc.mdSafetyNote);
    lines.push('');

    // Summary
    if (allQuestions.length > 0) {
      lines.push(qmc.mdSummary);
      lines.push(qmc.mdItemSummaryLine(
        summary.total, summary.open, summary.blocked,
        summary.answered, summary.high,
      ));
      lines.push('');

      // Open / Blocked
      const openBlocked = allQuestions.filter(q => {
        const st = questionMatrixState.entries[q.id]?.status ?? 'open';
        return st === 'open' || st === 'blocked';
      });
      if (openBlocked.length > 0) {
        const catLabels: Record<string, string> = {
          context: qmc.categoryContext, compile: qmc.categoryCompile,
          runtime: qmc.categoryRuntime, logs: qmc.categoryLogs,
          evidence: qmc.categoryEvidence, graph: qmc.categoryGraph,
          queue: qmc.categoryQueue, session: qmc.categorySession,
          handoff: qmc.categoryHandoff,
        };
        lines.push(qmc.mdOpenBlocked);
        for (const q of openBlocked.slice(0, 15)) {
          const st = questionMatrixState.entries[q.id]?.status ?? 'open';
          const stLabel = st === 'open' ? qmc.statusOpen : qmc.statusBlocked;
          const catLabel = catLabels[q.category] ?? q.category;
          const priLabel = q.priority === 'high' ? common.high : q.priority === 'normal' ? common.normal : common.low;
          lines.push(qmc.mdItemEntry(q.question, stLabel, catLabel, priLabel));
        }
        if (openBlocked.length > 15) {
          lines.push(`- *... and ${openBlocked.length - 15} more*`);
        }
        lines.push('');
      }

      // Verification plan
      const openItems = allQuestions.filter(q => {
        const st = questionMatrixState.entries[q.id]?.status ?? 'open';
        return st === 'open' || st === 'verifying';
      });
      if (openItems.length > 0) {
        lines.push(qmc.mdVerificationPlan);
        for (const q of openItems.slice(0, 10)) {
          lines.push(qmc.mdItemVerificationStep(q.question, q.suggestedVerification));
        }
        if (openItems.length > 10) {
          lines.push(`- *... and ${openItems.length - 10} more verification steps*`);
        }
        lines.push('');
      }

      // Answered notes
      const answeredItems = allQuestions.filter(q => {
        const st = questionMatrixState.entries[q.id]?.status;
        return st === 'answered';
      });
      if (answeredItems.length > 0) {
        lines.push(qmc.mdAnsweredNotes);
        for (const q of answeredItems.slice(0, 10)) {
          const note = questionMatrixState.entries[q.id]?.note ?? '';
          lines.push(qmc.mdItemAnsweredNote(q.question, note));
        }
        lines.push('');
      }
    } else {
      lines.push(qmc.mdNoQuestions);
      lines.push('');
    }

    return lines.join('\n');
  }, [allQuestions, summary, questionMatrixState.entries, qmc, common]);

  // Handlers
  const handleReset = useCallback(() => {
    if (!confirmingReset) {
      setConfirmingReset(true);
      return;
    }
    onReset();
    setConfirmingReset(false);
  }, [confirmingReset, onReset]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(markdown);
      setCopyStatus('success');
    } catch {
      setCopyStatus('failed');
    }
    setTimeout(() => setCopyStatus('idle'), 2000);
  }, [markdown]);

  // Status detail for a question
  const getEntryStatus = (id: string): QuestionStatus => {
    return questionMatrixState.entries[id]?.status ?? 'open';
  };

  const getEntryNote = (id: string): string => {
    return questionMatrixState.entries[id]?.note ?? '';
  };

  // ── Render ──

  const noSnapshot = !snapshot;

  return (
    <section className="iqm-panel">
      {/* Title */}
      <h3 className="iqm-title">{qmc.title}</h3>

      {/* Summary strip */}
      {!noSnapshot && allQuestions.length > 0 && (
        <div className="iqm-summary-strip">
          <span className="iqm-summary-item">{qmc.summaryTotal}: <strong>{summary.total}</strong></span>
          {summary.open > 0 && <span className="iqm-summary-item iqm-summary-open">{qmc.summaryOpen}: <strong>{summary.open}</strong></span>}
          {summary.blocked > 0 && <span className="iqm-summary-item iqm-summary-blocked">{qmc.summaryBlocked}: <strong>{summary.blocked}</strong></span>}
          {summary.answered > 0 && <span className="iqm-summary-item iqm-summary-answered">{qmc.summaryAnswered}: <strong>{summary.answered}</strong></span>}
          {summary.high > 0 && <span className="iqm-summary-item iqm-summary-high">{qmc.summaryHighPriority}: <strong>{summary.high}</strong></span>}
          {summary.missingContext > 0 && <span className="iqm-summary-item iqm-summary-missing">{qmc.summaryMissingContext}: <strong>{summary.missingContext}</strong></span>}
        </div>
      )}

      {/* Empty: no snapshot */}
      {noSnapshot && (
        <div className="iqm-empty">
          <p>{qmc.noSnapshot}</p>
        </div>
      )}

      {/* Empty: no questions */}
      {!noSnapshot && allQuestions.length === 0 && (
        <div className="iqm-empty">
          <p>{qmc.noQuestions}</p>
        </div>
      )}

      {/* Controls and content */}
      {!noSnapshot && allQuestions.length > 0 && (
        <>
          {/* Filters */}
          <div className="iqm-filters">
            <div className="iqm-filter-group">
              <label className="iqm-filter-label">{qmc.filterCategory}</label>
              <select
                className="iqm-filter-select"
                value={categoryFilter}
                onChange={e => setCategoryFilter(e.target.value as QuestionCategory | 'all')}
              >
                <option value="all">{common.all}</option>
                <option value="context">{qmc.categoryContext}</option>
                <option value="compile">{qmc.categoryCompile}</option>
                <option value="runtime">{qmc.categoryRuntime}</option>
                <option value="logs">{qmc.categoryLogs}</option>
                <option value="evidence">{qmc.categoryEvidence}</option>
                <option value="graph">{qmc.categoryGraph}</option>
                <option value="queue">{qmc.categoryQueue}</option>
                <option value="session">{qmc.categorySession}</option>
                <option value="handoff">{qmc.categoryHandoff}</option>
                <option value="bt-blackboard">{qmc.categoryBtBlackboard}</option>
              </select>
            </div>
            <div className="iqm-filter-group">
              <label className="iqm-filter-label">{qmc.filterPriority}</label>
              <select
                className="iqm-filter-select"
                value={priorityFilter}
                onChange={e => setPriorityFilter(e.target.value as QuestionPriority | 'all')}
              >
                <option value="all">{common.all}</option>
                <option value="high">{common.high}</option>
                <option value="normal">{common.normal}</option>
                <option value="low">{common.low}</option>
              </select>
            </div>
            <div className="iqm-filter-group">
              <label className="iqm-filter-label">{qmc.filterStatus}</label>
              <select
                className="iqm-filter-select"
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value as QuestionStatus | 'all')}
              >
                <option value="all">{common.all}</option>
                <option value="open">{qmc.statusOpen}</option>
                <option value="verifying">{qmc.statusVerifying}</option>
                <option value="answered">{qmc.statusAnswered}</option>
                <option value="blocked">{qmc.statusBlocked}</option>
                <option value="deferred">{qmc.statusDeferred}</option>
              </select>
            </div>
            <div className="iqm-filter-group">
              <label className="iqm-filter-label">{common.search}</label>
              <input
                className="iqm-filter-input"
                type="text"
                placeholder={qmc.filterSearchPlaceholder}
                value={searchText}
                onChange={e => setSearchText(e.target.value)}
              />
            </div>
            <div className="iqm-filter-actions">
              <button
                className={`iqm-reset-btn${confirmingReset ? ' iqm-confirming' : ''}`}
                onClick={handleReset}
                onBlur={() => setConfirmingReset(false)}
                type="button"
              >
                {confirmingReset ? qmc.confirmReset : qmc.resetButton}
              </button>
            </div>
          </div>

          {/* Matrix rows */}
          <div className="iqm-rows">
            {filteredQuestions.length === 0 && (
              <div className="iqm-empty">
                <p>{common.noData}</p>
              </div>
            )}
            {filteredQuestions.map(q => {
              const currentStatus = getEntryStatus(q.id);
              const currentNote = getEntryNote(q.id);
              const catLabel = ({
                context: qmc.categoryContext, compile: qmc.categoryCompile,
                runtime: qmc.categoryRuntime, logs: qmc.categoryLogs,
                evidence: qmc.categoryEvidence, graph: qmc.categoryGraph,
                queue: qmc.categoryQueue, session: qmc.categorySession,
                handoff: qmc.categoryHandoff,
              } as Record<string, string>)[q.category] ?? q.category;

              return (
                <div key={q.id} className={`iqm-row iqm-row-${currentStatus}`}>
                  <div className="iqm-row-header">
                    <span className="iqm-row-question">{q.question}</span>
                    <div className="iqm-row-badges">
                      <span className="iqm-badge iqm-badge-category">{catLabel}</span>
                      <span className={`iqm-badge iqm-badge-${q.priority}`}>
                        {q.priority === 'high' ? common.high : q.priority === 'normal' ? common.normal : common.low}
                      </span>
                      <span className="iqm-badge iqm-badge-source">{q.source}</span>
                    </div>
                  </div>
                  <div className="iqm-row-detail">
                    <div className="field">
                      <span className="field-label">{qmc.mdFieldWhy}</span>
                      <span className="field-value">{q.why}</span>
                    </div>
                    <div className="field">
                      <span className="field-label">{qmc.mdFieldVerification}</span>
                      <span className="field-value">{q.suggestedVerification}</span>
                    </div>
                    <div className="field">
                      <span className="field-label">{qmc.mdFieldReason}</span>
                      <span className="field-value">{q.deterministicReason}</span>
                    </div>
                    {q.relatedRef && (
                      <div className="field">
                        <span className="field-label">{qmc.mdFieldRef}</span>
                        <span className="field-value">{q.relatedRef}</span>
                      </div>
                    )}
                  </div>
                  <div className="iqm-row-controls">
                    <div className="iqm-status-selector">
                      <label className="field-label">{qmc.mdFieldStatus}</label>
                      <select
                        className="iqm-status-select"
                        value={currentStatus}
                        onChange={e => onEntryUpdate(q.id, { status: e.target.value as QuestionStatus, note: currentNote })}
                      >
                        <option value="open">{qmc.statusOpen}</option>
                        <option value="verifying">{qmc.statusVerifying}</option>
                        <option value="answered">{qmc.statusAnswered}</option>
                        <option value="blocked">{qmc.statusBlocked}</option>
                        <option value="deferred">{qmc.statusDeferred}</option>
                      </select>
                    </div>
                    <div className="iqm-note-field">
                      <label className="field-label">{qmc.mdFieldNote}</label>
                      <textarea
                        className="iqm-note-textarea"
                        placeholder={qmc.notePlaceholder}
                        value={currentNote}
                        onChange={e => onEntryUpdate(q.id, { status: currentStatus, note: e.target.value })}
                        rows={2}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Markdown Preview + Copy */}
          <div className="iqm-preview-section">
            <div className="iqm-preview-toolbar">
              <span className="iqm-preview-label">{qmc.previewTitle}</span>
              <button
                className={`iqm-copy-btn${copyStatus === 'success' ? ' iqm-copy-success' : ''}${copyStatus === 'failed' ? ' iqm-copy-failed' : ''}`}
                onClick={handleCopy}
                type="button"
              >
                {copyStatus === 'success' ? qmc.copySuccess : copyStatus === 'failed' ? qmc.copyFailed : qmc.copyButton}
              </button>
            </div>
            <pre className="iqm-markdown-pre">{markdown}</pre>
          </div>
        </>
      )}
    </section>
  );
}
