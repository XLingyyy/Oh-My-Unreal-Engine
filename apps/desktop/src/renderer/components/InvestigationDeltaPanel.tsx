import { useState, useRef, useCallback, useMemo } from 'react';
import type { OmueContextSnapshot, EvidenceChain } from '@omue/shared-protocol';
import type { BlueprintGraphDetailData } from '@omue/shared-protocol';
import type { QueueItem } from './InvestigationQueuePanel';
import type { NodeEvidenceSummary } from './GraphDetailPanel';
import type { DeltaCopy } from '../i18n/types';
import { useDesktopCopy } from '../i18n';

// ── Types ──────────────────────────────────────────────────────

export interface DeltaSummary {
  capturedAt: string;
  lastUpdatedAt: string | null;
  snapshotId: string;
  assetName: string | null;
  assetPath: string | null;
  assetClass: string | null;
  assetDirty: boolean | null;
  assetSelected: boolean | null;
  assetOpenInEditor: boolean | null;
  isCompiling: boolean | null;
  lastCompileResult: string | null;
  compileErrorCount: number | null;
  compileWarningCount: number | null;
  compileLastErrorsCount: number | null;
  pieRunning: boolean | null;
  isSimulating: boolean | null;
  playMode: string | null;
  activeWorldName: string | null;
  logsTotal: number;
  logsError: number;
  logsWarning: number;
  evidenceChainCount: number;
  evidenceItemCount: number;
  evidenceErrorCount: number;
  evidenceWarningCount: number;
  evidenceUnresolvedCount: number;
  graphName: string | null;
  graphKind: string | null;
  graphId: string | null;
  graphNodeCount: number | null;
  graphLinkCount: number | null;
  graphTruncated: boolean | null;
  nodeEvidenceCoveredNodes: number | null;
  nodeEvidenceTotalItems: number | null;
  queueTotal: number;
  queueTodo: number;
  queueReviewed: number;
  queueDeferred: number;
  queueHigh: number;
  queueNormal: number;
  queueLow: number;
}

type ChangeStatus = 'changed' | 'same' | 'added' | 'removed';

interface DeltaRow {
  category: string;
  field: string;
  baselineValue: string;
  currentValue: string;
  status: ChangeStatus;
}

type DeltaCategory = string;
type CopyState = 'idle' | 'copied' | 'error';

interface Props {
  snapshot: OmueContextSnapshot;
  evidenceChains: EvidenceChain[];
  graphDetail: BlueprintGraphDetailData | null;
  nodeEvidenceMap?: Record<string, NodeEvidenceSummary[]>;
  queueItems: QueueItem[];
  lastUpdatedAt: string | null;
  baseline: DeltaSummary | null;
  onCaptureBaseline: (summary: DeltaSummary) => void;
  onClearBaseline: () => void;
}

function getCategories(copy: DeltaCopy): DeltaCategory[] {
  return ['all', copy.snapshot, copy.asset, copy.compile, copy.runtime, copy.logs, copy.evidence, copy.graph, copy.queue];
}

function getChangeLabels(copy: DeltaCopy): Record<ChangeStatus, string> {
  return {
    changed: copy.changed,
    same: copy.same,
    added: copy.added,
    removed: copy.removed,
  };
}

// ── Helpers ────────────────────────────────────────────────────

function fmtTime(iso: string): string {
  try {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  } catch {
    return iso;
  }
}

function fmtBool(v: boolean | null | undefined, copy: DeltaCopy): string {
  if (v === null || v === undefined) return '—';
  return v ? copy.yes : copy.no;
}

function fmtNum(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—';
  return String(v);
}

function fmtStr(v: string | null | undefined, fallback: string = '—'): string {
  if (v === null || v === undefined || v === '') return fallback;
  return v;
}

// ── Build Summary ──────────────────────────────────────────────

function buildSummary(
  snapshot: OmueContextSnapshot,
  evidenceChains: EvidenceChain[],
  graphDetail: BlueprintGraphDetailData | null,
  nodeEvidenceMap: Record<string, NodeEvidenceSummary[]> | undefined,
  queueItems: QueueItem[],
  lastUpdatedAt: string | null,
): DeltaSummary {
  const a = snapshot.currentAsset;
  const cs = snapshot.compileStatus;
  const rs = snapshot.runtimeStatus;
  const logs = snapshot.recentLogs ?? [];

  const evItems = evidenceChains.flatMap(c => c.items);
  const evError = evItems.filter(i => i.snippet.severity === 'error' || i.snippet.severity === 'fatal').length;
  const evWarning = evItems.filter(i => i.snippet.severity === 'warning').length;
  const evUnresolved = evidenceChains.reduce((sum, c) => sum + (c.unresolvedCount ?? 0), 0);

  const g = graphDetail?.selectedBlueprint;
  const d = g?.graph.detail;

  const neCovered = nodeEvidenceMap ? Object.keys(nodeEvidenceMap).length : null;
  const neTotal = nodeEvidenceMap ? Object.values(nodeEvidenceMap).reduce((s, arr) => s + arr.length, 0) : null;

  const qStatus = (status: string) => queueItems.filter(q => q.investigationStatus === status).length;
  const qPriority = (p: string) => queueItems.filter(q => q.priority === p).length;

  return {
    capturedAt: snapshot.capturedAt,
    lastUpdatedAt,
    snapshotId: snapshot.snapshotId ?? '—',
    assetName: a?.assetName ?? null,
    assetPath: a?.assetPath ?? null,
    assetClass: a?.assetClass ?? null,
    assetDirty: a?.isDirty ?? null,
    assetSelected: a?.isSelected ?? null,
    assetOpenInEditor: a?.isOpenInEditor ?? null,
    isCompiling: cs?.isCompiling ?? null,
    lastCompileResult: cs?.lastCompileResult ?? null,
    compileErrorCount: cs?.errorCount ?? null,
    compileWarningCount: cs?.warningCount ?? null,
    compileLastErrorsCount: cs?.lastErrors?.length ?? null,
    pieRunning: rs?.isPieRunning ?? null,
    isSimulating: rs?.isSimulating ?? null,
    playMode: rs?.playMode ?? null,
    activeWorldName: rs?.activeWorldName ?? null,
    logsTotal: logs.length,
    logsError: logs.filter(l => l.verbosity === 'fatal' || l.verbosity === 'error').length,
    logsWarning: logs.filter(l => l.verbosity === 'warning').length,
    evidenceChainCount: evidenceChains.length,
    evidenceItemCount: evItems.length,
    evidenceErrorCount: evError,
    evidenceWarningCount: evWarning,
    evidenceUnresolvedCount: evUnresolved,
    graphName: g?.graph.name ?? null,
    graphKind: g?.graph.kind ?? null,
    graphId: g?.graph.detail.graphId ?? null,
    graphNodeCount: d?.nodes.length ?? null,
    graphLinkCount: d?.links.length ?? null,
    graphTruncated: d?.truncation?.truncated ?? null,
    nodeEvidenceCoveredNodes: neCovered,
    nodeEvidenceTotalItems: neTotal,
    queueTotal: queueItems.length,
    queueTodo: qStatus('todo'),
    queueReviewed: qStatus('reviewed'),
    queueDeferred: qStatus('deferred'),
    queueHigh: qPriority('high'),
    queueNormal: qPriority('normal'),
    queueLow: qPriority('low'),
  };
}

// ── Build Delta Rows ───────────────────────────────────────────

function buildDeltaRows(copy: DeltaCopy, baseline: DeltaSummary, current: DeltaSummary): DeltaRow[] {
  const rows: DeltaRow[] = [];

  function add(category: string, field: string, bv: string, cv: string) {
    let status: ChangeStatus;
    if (bv === cv) {
      status = 'same';
    } else {
      status = 'changed';
    }
    rows.push({ category, field, baselineValue: bv, currentValue: cv, status });
  }

  // Snapshot
  add(copy.snapshot, copy.fieldCapturedAt, fmtTime(baseline.capturedAt), fmtTime(current.capturedAt));
  add(copy.snapshot, copy.fieldSnapshotId, baseline.snapshotId, current.snapshotId);
  add(copy.snapshot, copy.fieldLastUpdated, fmtStr(baseline.lastUpdatedAt, copy.unavailable), fmtStr(current.lastUpdatedAt, copy.unavailable));

  // Asset
  add(copy.asset, copy.fieldAssetName, fmtStr(baseline.assetName, copy.unavailable), fmtStr(current.assetName, copy.unavailable));
  add(copy.asset, copy.fieldAssetPath, fmtStr(baseline.assetPath, copy.unavailable), fmtStr(current.assetPath, copy.unavailable));
  add(copy.asset, copy.fieldAssetClass, fmtStr(baseline.assetClass, copy.unavailable), fmtStr(current.assetClass, copy.unavailable));
  add(copy.asset, copy.fieldDirty, fmtBool(baseline.assetDirty, copy), fmtBool(current.assetDirty, copy));
  add(copy.asset, copy.fieldSelected, fmtBool(baseline.assetSelected, copy), fmtBool(current.assetSelected, copy));
  add(copy.asset, copy.fieldOpenInEditor, fmtBool(baseline.assetOpenInEditor, copy), fmtBool(current.assetOpenInEditor, copy));

  // Compile
  add(copy.compile, copy.fieldIsCompiling, fmtBool(baseline.isCompiling, copy), fmtBool(current.isCompiling, copy));
  add(copy.compile, copy.fieldLastResult, fmtStr(baseline.lastCompileResult, copy.unavailable), fmtStr(current.lastCompileResult, copy.unavailable));
  add(copy.compile, copy.fieldErrorCount, fmtNum(baseline.compileErrorCount), fmtNum(current.compileErrorCount));
  add(copy.compile, copy.fieldWarningCount, fmtNum(baseline.compileWarningCount), fmtNum(current.compileWarningCount));
  add(copy.compile, copy.fieldLastErrorsCount, fmtNum(baseline.compileLastErrorsCount), fmtNum(current.compileLastErrorsCount));

  // Runtime
  add(copy.runtime, copy.fieldPieRunning, fmtBool(baseline.pieRunning, copy), fmtBool(current.pieRunning, copy));
  add(copy.runtime, copy.fieldIsSimulating, fmtBool(baseline.isSimulating, copy), fmtBool(current.isSimulating, copy));
  add(copy.runtime, copy.fieldPlayMode, fmtStr(baseline.playMode, copy.unavailable), fmtStr(current.playMode, copy.unavailable));
  add(copy.runtime, copy.fieldActiveWorld, fmtStr(baseline.activeWorldName, copy.unavailable), fmtStr(current.activeWorldName, copy.unavailable));

  // Logs
  add(copy.logs, copy.fieldTotalLogs, fmtNum(baseline.logsTotal), fmtNum(current.logsTotal));
  add(copy.logs, copy.fieldErrorLogs, fmtNum(baseline.logsError), fmtNum(current.logsError));
  add(copy.logs, copy.fieldWarningLogs, fmtNum(baseline.logsWarning), fmtNum(current.logsWarning));

  // Evidence
  add(copy.evidence, copy.fieldChainCount, fmtNum(baseline.evidenceChainCount), fmtNum(current.evidenceChainCount));
  add(copy.evidence, copy.fieldItemCount, fmtNum(baseline.evidenceItemCount), fmtNum(current.evidenceItemCount));
  add(copy.evidence, copy.fieldErrorItems, fmtNum(baseline.evidenceErrorCount), fmtNum(current.evidenceErrorCount));
  add(copy.evidence, copy.fieldWarningItems, fmtNum(baseline.evidenceWarningCount), fmtNum(current.evidenceWarningCount));
  add(copy.evidence, copy.fieldUnresolvedItems, fmtNum(baseline.evidenceUnresolvedCount), fmtNum(current.evidenceUnresolvedCount));

  // Graph
  add(copy.graph, copy.fieldGraphName, fmtStr(baseline.graphName, copy.unavailable), fmtStr(current.graphName, copy.unavailable));
  add(copy.graph, copy.fieldGraphKind, fmtStr(baseline.graphKind, copy.unavailable), fmtStr(current.graphKind, copy.unavailable));
  add(copy.graph, copy.fieldGraphId, fmtStr(baseline.graphId, copy.unavailable), fmtStr(current.graphId, copy.unavailable));
  add(copy.graph, copy.fieldNodeCount, fmtNum(baseline.graphNodeCount), fmtNum(current.graphNodeCount));
  add(copy.graph, copy.fieldLinkCount, fmtNum(baseline.graphLinkCount), fmtNum(current.graphLinkCount));
  add(copy.graph, copy.fieldTruncated, fmtBool(baseline.graphTruncated, copy), fmtBool(current.graphTruncated, copy));

  // Node Evidence
  add(copy.evidence, copy.fieldCoveredNodes, fmtNum(baseline.nodeEvidenceCoveredNodes), fmtNum(current.nodeEvidenceCoveredNodes));
  add(copy.evidence, copy.fieldNodeEvidenceItems, fmtNum(baseline.nodeEvidenceTotalItems), fmtNum(current.nodeEvidenceTotalItems));

  // Queue
  add(copy.queue, copy.fieldTotalItems, fmtNum(baseline.queueTotal), fmtNum(current.queueTotal));
  add(copy.queue, copy.fieldTodo, fmtNum(baseline.queueTodo), fmtNum(current.queueTodo));
  add(copy.queue, copy.fieldReviewed, fmtNum(baseline.queueReviewed), fmtNum(current.queueReviewed));
  add(copy.queue, copy.fieldDeferred, fmtNum(baseline.queueDeferred), fmtNum(current.queueDeferred));
  add(copy.queue, copy.fieldHighPriority, fmtNum(baseline.queueHigh), fmtNum(current.queueHigh));
  add(copy.queue, copy.fieldNormalPriority, fmtNum(baseline.queueNormal), fmtNum(current.queueNormal));
  add(copy.queue, copy.fieldLowPriority, fmtNum(baseline.queueLow), fmtNum(current.queueLow));

  return rows;
}

// ── Build Markdown ─────────────────────────────────────────────

function buildDeltaMarkdown(
  copy: DeltaCopy,
  baseline: DeltaSummary,
  current: DeltaSummary,
  rows: DeltaRow[],
  activeCategory: DeltaCategory,
  changedOnly: boolean,
): string {
  const changeLabels = getChangeLabels(copy);
  const lines: string[] = [];
  const now = fmtTime(new Date().toISOString());

  lines.push(`# ${copy.title}`);
  lines.push('');
  lines.push(`${copy.mdGenerated} ${now}`);
  lines.push('');
  lines.push(`## ${copy.baseline}`);
  lines.push(`- ${copy.mdCapturedAt} ${fmtTime(baseline.capturedAt)}`);
  lines.push(`- ${copy.mdSnapshotId} ${baseline.snapshotId}`);
  lines.push(`- ${copy.mdCurrentAsset} ${fmtStr(baseline.assetName, copy.none)}${baseline.assetPath ? ` (${baseline.assetPath})` : ''}`);
  lines.push('');
  lines.push(`## ${copy.current}`);
  lines.push(`- ${copy.mdCapturedAt} ${fmtTime(current.capturedAt)}`);
  lines.push(`- ${copy.mdSnapshotId} ${current.snapshotId}`);
  lines.push(`- ${copy.mdCurrentAsset} ${fmtStr(current.assetName, copy.none)}${current.assetPath ? ` (${current.assetPath})` : ''}`);
  lines.push('');

  lines.push(copy.mdFilters);
  lines.push(`- ${copy.categoryFilter}: ${activeCategory === 'all' ? copy.all : activeCategory}`);
  lines.push(`- ${copy.changedOnly}: ${changedOnly ? copy.yes : copy.no}`);
  lines.push('');

  const visible = rows.filter(r => {
    if (activeCategory !== 'all' && r.category !== activeCategory) return false;
    if (changedOnly && r.status === 'same') return false;
    return true;
  });

  const counts = {
    changed: visible.filter(r => r.status === 'changed').length,
    added: visible.filter(r => r.status === 'added').length,
    removed: visible.filter(r => r.status === 'removed').length,
    same: visible.filter(r => r.status === 'same').length,
  };

  lines.push(copy.mdDeltaOverview);
  lines.push(`- **${copy.changed}:** ${counts.changed}`);
  lines.push(`- **${copy.added}:** ${counts.added}`);
  lines.push(`- **${copy.removed}:** ${counts.removed}`);
  lines.push(`- **${copy.same}:** ${counts.same}`);
  lines.push(`- **${copy.mdTotal}:** ${visible.length}`);
  lines.push('');

  lines.push(copy.mdDeltaRows);
  lines.push('');
  lines.push(`| ${copy.mdTableCategory} | ${copy.mdTableField} | ${copy.mdTableBaseline} | ${copy.mdTableCurrent} | ${copy.mdTableStatus} |`);
  lines.push('|----------|-------|----------|---------|--------|');
  for (const r of visible) {
    lines.push(`| ${r.category} | ${r.field} | ${r.baselineValue} | ${r.currentValue} | ${changeLabels[r.status]} |`);
  }
  lines.push('');

  lines.push('---');
  lines.push(`*${copy.mdSafetyNote}*`);

  return lines.join('\n');
}

// ── Component ──────────────────────────────────────────────────

export function InvestigationDeltaPanel({
  snapshot,
  evidenceChains,
  graphDetail,
  nodeEvidenceMap,
  queueItems,
  lastUpdatedAt,
  baseline,
  onCaptureBaseline,
  onClearBaseline,
}: Props) {
  const { copy } = useDesktopCopy();
  const CATEGORIES = getCategories(copy.delta);
  const CHANGE_LABELS = getChangeLabels(copy.delta);
  const [categoryFilter, setCategoryFilter] = useState<DeltaCategory>('all');
  const [changedOnly, setChangedOnly] = useState(false);
  const [copyState, setCopyState] = useState<CopyState>('idle');
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const currentSummary = useMemo(
    () => buildSummary(snapshot, evidenceChains, graphDetail, nodeEvidenceMap, queueItems, lastUpdatedAt),
    [snapshot, evidenceChains, graphDetail, nodeEvidenceMap, queueItems, lastUpdatedAt],
  );

  const deltaRows = useMemo<DeltaRow[]>(() => {
    if (!baseline) return [];
    return buildDeltaRows(copy.delta, baseline, currentSummary);
  }, [copy.delta, baseline, currentSummary]);

  const displayedRows = useMemo(() => {
    return deltaRows.filter(r => {
      if (categoryFilter !== 'all' && r.category !== categoryFilter) return false;
      if (changedOnly && r.status === 'same') return false;
      return true;
    });
  }, [deltaRows, categoryFilter, changedOnly]);

  const deltaMarkdown = useMemo(() => {
    if (!baseline) return '';
    return buildDeltaMarkdown(copy.delta, baseline, currentSummary, deltaRows, categoryFilter, changedOnly);
  }, [copy.delta, baseline, currentSummary, deltaRows, categoryFilter, changedOnly]);

  const handleCapture = useCallback(() => {
    onCaptureBaseline(currentSummary);
  }, [currentSummary, onCaptureBaseline]);

  const handleCopy = useCallback(() => {
    if (!deltaMarkdown) return;
    if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);

    navigator.clipboard.writeText(deltaMarkdown).then(
      () => {
        setCopyState('copied');
        copyTimeoutRef.current = setTimeout(() => setCopyState('idle'), 2500);
      },
      () => {
        setCopyState('error');
        copyTimeoutRef.current = setTimeout(() => setCopyState('idle'), 4000);
      },
    );
  }, [deltaMarkdown]);

  const handleResetFilters = useCallback(() => {
    setCategoryFilter('all');
    setChangedOnly(false);
  }, []);

  const hasFilters = categoryFilter !== 'all' || changedOnly;

  // ── Render ──────────────────────────────────────────────────
  return (
    <div className="id-panel">
      {/* Toolbar */}
      <div className="id-toolbar">
        <span className="section-title" style={{ marginBottom: 0 }}>{copy.delta.title}</span>
        <div className="id-toolbar-actions">
          {baseline && deltaMarkdown && (
            <>
              <button className="id-copy-btn refresh-button" onClick={handleCopy}>
                {copy.delta.copyDelta}
              </button>
              {copyState === 'copied' && <span className="id-copy-ok id-copy-status">{copy.delta.copied}</span>}
              {copyState === 'error' && <span className="id-copy-error id-copy-status">{copy.delta.copyFailed}</span>}
            </>
          )}
        </div>
      </div>

      {/* Overview Strips */}
      {baseline && (
        <div className="id-overview-dual">
          <div className="id-overview">
            <div className="id-overview-title">{copy.delta.baseline}</div>
            <div className="id-overview-meta">
              {fmtTime(baseline.capturedAt)} &middot; {baseline.snapshotId}
            </div>
            <div className="id-overview-item">
              <span className="id-overview-label">{copy.delta.asset}</span>
              <span className="id-overview-value">{fmtStr(baseline.assetName, 'none')}</span>
            </div>
            <div className="id-overview-item">
              <span className="id-overview-label">{copy.delta.evidence}</span>
              <span className="id-overview-value">{baseline.evidenceChainCount}c / {baseline.evidenceItemCount}i</span>
            </div>
            <div className="id-overview-item">
              <span className="id-overview-label">{copy.delta.queue}</span>
              <span className="id-overview-value">{baseline.queueTotal} items</span>
            </div>
            <div className="id-overview-item">
              <span className="id-overview-label">{copy.delta.graph}</span>
              <span className="id-overview-value">{fmtStr(baseline.graphName, copy.delta.unavailable)}</span>
            </div>
          </div>
          <div className="id-overview">
            <div className="id-overview-title">{copy.delta.current}</div>
            <div className="id-overview-meta">
              {fmtTime(currentSummary.capturedAt)} &middot; {currentSummary.snapshotId}
            </div>
            <div className="id-overview-item">
              <span className="id-overview-label">{copy.delta.asset}</span>
              <span className="id-overview-value">{fmtStr(currentSummary.assetName, 'none')}</span>
            </div>
            <div className="id-overview-item">
              <span className="id-overview-label">{copy.delta.evidence}</span>
              <span className="id-overview-value">{currentSummary.evidenceChainCount}c / {currentSummary.evidenceItemCount}i</span>
            </div>
            <div className="id-overview-item">
              <span className="id-overview-label">{copy.delta.queue}</span>
              <span className="id-overview-value">{currentSummary.queueTotal} items</span>
            </div>
            <div className="id-overview-item">
              <span className="id-overview-label">{copy.delta.graph}</span>
              <span className="id-overview-value">{fmtStr(currentSummary.graphName, copy.delta.unavailable)}</span>
            </div>
          </div>
        </div>
      )}

      {/* No Baseline State */}
      {!baseline && (
        <div className="id-empty">
          <p>{copy.delta.noBaselineTitle}</p>
          <p className="dimmed">{copy.delta.noBaselineHint}</p>
          <button className="refresh-button" onClick={handleCapture} style={{ marginTop: 8 }}>
            {copy.delta.captureBaseline}
          </button>
        </div>
      )}

      {/* Baseline Actions */}
      {baseline && (
        <div className="id-baseline-actions">
          <button className="id-action-btn" onClick={handleCapture}>
            {copy.delta.recaptureBaseline}
          </button>
          <button className="id-action-btn id-action-clear" onClick={onClearBaseline}>
            {copy.delta.clearBaseline}
          </button>
        </div>
      )}

      {/* Filters */}
      {baseline && deltaRows.length > 0 && (
        <div className="id-filters">
          <div className="id-filter-row">
            <label className="id-filter-label">
              {copy.delta.categoryFilter}
              <select
                className="id-filter-select"
                value={categoryFilter}
                onChange={e => setCategoryFilter(e.target.value as DeltaCategory)}
              >
                {CATEGORIES.map(c => (
                  <option key={c} value={c}>{c === 'all' ? copy.delta.all : c}</option>
                ))}
              </select>
            </label>
            <label className="id-filter-check">
              <input
                type="checkbox"
                checked={changedOnly}
                onChange={e => setChangedOnly(e.target.checked)}
              />
              {copy.delta.changedOnly}
            </label>
            {hasFilters && (
              <button className="id-filter-reset" onClick={handleResetFilters}>
                {copy.delta.reset}
              </button>
            )}
          </div>
          <div className="id-filter-count">
            {copy.delta.showingFields(displayedRows.length, deltaRows.length)}
            {baseline && (
              <span>
                {' — '}
                {deltaRows.filter(r => r.status === 'changed').length} {copy.delta.changedStatus},{' '}
                {deltaRows.filter(r => r.status === 'same').length} {copy.delta.sameStatus}
              </span>
            )}
          </div>
        </div>
      )}

      {/* No Changes State */}
      {baseline && deltaRows.length > 0 && displayedRows.length === 0 && (
        <div className="id-empty">
          <p>{copy.delta.noChanges}</p>
          <p className="dimmed">{copy.delta.noChangesHint}</p>
        </div>
      )}

      {/* Delta Rows */}
      {baseline && displayedRows.length > 0 && (
        <div className="id-rows">
          {displayedRows.map((row, i) => (
            <div key={`${row.category}-${row.field}-${i}`} className={`id-row id-row-${row.status}`}>
              <span className="id-row-category">{row.category}</span>
              <span className="id-row-field">{row.field}</span>
              <span className="id-row-baseline">{row.baselineValue}</span>
              <span className="id-row-arrow">→</span>
              <span className="id-row-current">{row.currentValue}</span>
              <span className={`id-row-status id-status-${row.status}`}>{CHANGE_LABELS[row.status]}</span>
            </div>
          ))}
        </div>
      )}

      {/* Markdown Preview */}
      {baseline && deltaMarkdown && (
        <div className="id-preview-section">
          <div className="id-preview-label">{copy.delta.markdownPreview}</div>
          <pre className="id-preview-pre">{deltaMarkdown}</pre>
        </div>
      )}
    </div>
  );
}
