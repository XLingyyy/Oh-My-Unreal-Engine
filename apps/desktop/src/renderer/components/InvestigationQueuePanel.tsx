import { useState, useRef, useCallback } from 'react';
import { useDesktopCopy } from '../i18n';

// ── Local Queue Types (Desktop only, not in shared-protocol) ──

export type InvestigationStatus = 'todo' | 'reviewed' | 'deferred';
export type InvestigationPriority = 'high' | 'normal' | 'low';

interface QueueItemBase {
  id: string;
  kind: 'evidence' | 'graph_node';
  title: string;
  sourceSummary: string;
  addedAt: string;
  investigationStatus: InvestigationStatus;
  priority: InvestigationPriority;
  userNote: string;
}

export interface EvidenceQueueItem extends QueueItemBase {
  kind: 'evidence';
  evidenceId: string;
  chainTitle: string;
  severity: string;
  confidence: string;
  sourceKind: string;
  summary: string;
  suggestedNextInspection: string;
  graphId?: string;
  nodeId?: string;
  nodeTitle?: string;
}

export interface GraphNodeQueueItem extends QueueItemBase {
  kind: 'graph_node';
  graphId: string;
  graphName: string;
  graphKind: string;
  nodeId: string;
  nodeTitle: string;
  nodeType: string;
  nodeStatus: string;
  errorMessage?: string;
  evidenceCount: number;
  pinSummary: string;
  linkSummary: string;
}

export type QueueItem = EvidenceQueueItem | GraphNodeQueueItem;

// ── Component ──

interface Props {
  items: QueueItem[];
  sessionNotes: string;
  onSessionNotesChange: (notes: string) => void;
  onUpdateItem: (id: string, update: Partial<QueueItem>) => void;
  onRemoveItem: (id: string) => void;
  onClearAll: () => void;
  capturedAt?: string | null;
  currentAssetSummary?: string | null;
}

type KindFilter = 'all' | 'evidence' | 'graph_node';
type StatusFilter = 'all' | 'todo' | 'reviewed' | 'deferred';
type PriorityFilter = 'all' | 'high' | 'normal' | 'low';

export function InvestigationQueuePanel({
  items,
  sessionNotes,
  onSessionNotesChange,
  onUpdateItem,
  onRemoveItem,
  onClearAll,
  capturedAt,
  currentAssetSummary,
}: Props) {
  const { copy } = useDesktopCopy();
  const [kindFilter, setKindFilter] = useState<KindFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('all');
  const [clearConfirm, setClearConfirm] = useState(false);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const filtered = items.filter(item => {
    if (kindFilter !== 'all' && item.kind !== kindFilter) return false;
    if (statusFilter !== 'all' && item.investigationStatus !== statusFilter) return false;
    if (priorityFilter !== 'all' && item.priority !== priorityFilter) return false;
    return true;
  });

  const hasFilters = kindFilter !== 'all' || statusFilter !== 'all' || priorityFilter !== 'all';

  const evidenceCount = items.filter(i => i.kind === 'evidence').length;
  const nodeCount = items.filter(i => i.kind === 'graph_node').length;
  const todoCount = items.filter(i => i.investigationStatus === 'todo').length;
  const reviewedCount = items.filter(i => i.investigationStatus === 'reviewed').length;
  const deferredCount = items.filter(i => i.investigationStatus === 'deferred').length;
  const highCount = items.filter(i => i.priority === 'high').length;
  const normalCount = items.filter(i => i.priority === 'normal').length;
  const lowCount = items.filter(i => i.priority === 'low').length;

  const buildPackageMarkdown = useCallback((): string => {
    const lines: string[] = [];
    lines.push(copy.queue.mdTitle);
    lines.push('');
    lines.push(`${copy.queue.mdGenerated} ${new Date().toISOString()}`);
    if (capturedAt) {
      lines.push(`${copy.queue.mdCaptured} ${capturedAt}`);
    } else {
      lines.push(copy.queue.mdCapturedUnavailable);
    }

    if (items.length > 0) {
      const addedTimes = items.map(i => new Date(i.addedAt).getTime());
      lines.push(`${copy.queue.mdFirstAdded} ${new Date(Math.min(...addedTimes)).toISOString()}`);
    }
    lines.push('');

    lines.push(copy.queue.mdCurrentAsset);
    lines.push('');
    if (currentAssetSummary) {
      lines.push(currentAssetSummary);
    } else {
      lines.push(copy.queue.mdCurrentAssetUnavailable);
    }
    lines.push('');

    lines.push(copy.queue.mdQueueSummary);
    lines.push('');
    lines.push(`- **${copy.common.totalItems}:** ${items.length}`);
    lines.push(`- **${copy.common.evidenceItems}:** ${evidenceCount}`);
    lines.push(`- **${copy.common.graphNodeItems}:** ${nodeCount}`);
    lines.push(`- **${copy.common.priority}:** ${copy.queue.mdPrioritySummary(highCount, normalCount, lowCount)}`);
    lines.push(`- **${copy.common.status}:** ${copy.queue.mdStatusSummary(todoCount, reviewedCount, deferredCount)}`);
    lines.push('');

    if (items.length > 0) {
      lines.push(copy.queue.mdQueuedItems);
      lines.push('');
      for (const item of items) {
        const kindLabel = item.kind === 'evidence' ? copy.queue.evidenceKind : copy.queue.graphNodeKind;
        lines.push(`### [${kindLabel}] ${item.title}`);
        lines.push('');
        lines.push(`- **${copy.common.status}:** ${copy.queue.statusValue(item.investigationStatus)}`);
        lines.push(`- **${copy.common.priority}:** ${copy.queue.priorityValue(item.priority)}`);
        lines.push(`- **${copy.common.source}:** ${item.sourceSummary}`);
        lines.push(`- **${copy.common.added}:** ${item.addedAt}`);

        if (item.kind === 'evidence') {
          const ev = item as EvidenceQueueItem;
          lines.push(`- **${copy.common.chains}:** ${ev.chainTitle}`);
          lines.push(`- **${copy.common.severity}:** ${ev.severity}`);
          lines.push(`- **${copy.common.confidence}:** ${ev.confidence}`);
          lines.push(`- **${copy.common.sourceKind}:** ${ev.sourceKind}`);
          lines.push(`- **${copy.common.summary}:** ${ev.summary}`);
          lines.push(`- **${copy.common.next}:** ${ev.suggestedNextInspection}`);
          if (ev.nodeTitle) {
            lines.push(`- **${copy.common.nodes}:** ${ev.nodeTitle} (\`${ev.nodeId}\`)`);
          }
          if (ev.graphId && !ev.nodeId) {
            lines.push(`- **${copy.common.graphs}:** \`${ev.graphId}\``);
          }
        } else {
          const gn = item as GraphNodeQueueItem;
          lines.push(`- **${copy.common.graphs}:** ${gn.graphName} (${gn.graphKind}, \`${gn.graphId}\`)`);
          lines.push(`- **${copy.common.nodeId}:** \`${gn.nodeId}\``);
          lines.push(`- **${copy.common.nodeType}:** ${gn.nodeType}`);
          lines.push(`- **${copy.common.nodeStatus}:** ${gn.nodeStatus}`);
          if (gn.errorMessage) {
            lines.push(`- **${copy.common.error}:** ${gn.errorMessage}`);
          }
          lines.push(`- **${copy.common.evidence}:** ${gn.evidenceCount}`);
          lines.push(`- **${copy.common.pins}:** ${gn.pinSummary}`);
          lines.push(`- **${copy.common.links}:** ${gn.linkSummary}`);
        }

        if (item.userNote) {
          lines.push(`- **${copy.common.note}:** ${item.userNote}`);
        }
        lines.push('');
      }
    }

    if (sessionNotes.trim()) {
      lines.push(copy.queue.mdSessionNotes);
      lines.push('');
      lines.push(sessionNotes);
      lines.push('');
    }

    lines.push('---');
    lines.push('');
    lines.push(copy.queue.mdSafetyNote);

    return lines.join('\n');
  }, [copy, items, evidenceCount, nodeCount, todoCount, reviewedCount, deferredCount, highCount, normalCount, lowCount, sessionNotes, capturedAt, currentAssetSummary]);

  const handleCopy = useCallback(async () => {
    if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    try {
      await navigator.clipboard.writeText(buildPackageMarkdown());
      setCopyState('copied');
    } catch {
      setCopyState('error');
    }
    copyTimeoutRef.current = setTimeout(() => setCopyState('idle'), 3000);
  }, [buildPackageMarkdown]);

  const handleClear = useCallback(() => {
    if (clearConfirm) {
      onClearAll();
      setClearConfirm(false);
    } else {
      setClearConfirm(true);
      const t = setTimeout(() => setClearConfirm(false), 4000);
      return () => clearTimeout(t);
    }
  }, [clearConfirm, onClearAll]);

  const markdown = buildPackageMarkdown();

  return (
    <section className="iq-panel">
      <div className="iq-toolbar">
        <h2 className="section-title" style={{ marginBottom: 0 }}>{copy.queue.title}</h2>
        <div className="iq-toolbar-actions">
          {copyState === 'copied' && (
            <span className="iq-copy-status iq-copy-ok">{copy.queue.copied}</span>
          )}
          {copyState === 'error' && (
            <span className="iq-copy-status iq-copy-error">{copy.queue.copyFailed}</span>
          )}
          <button className="refresh-button iq-copy-btn" onClick={handleCopy}>
            {copy.queue.copyPackage}
          </button>
        </div>
      </div>

      <div className="iq-summary">
        <span className="iq-summary-item">{copy.queue.total} <strong>{items.length}</strong></span>
        <span className="iq-summary-item">{copy.queue.evidence} <strong>{evidenceCount}</strong></span>
        <span className="iq-summary-item">{copy.queue.nodes} <strong>{nodeCount}</strong></span>
        <span className="iq-summary-item">{copy.queue.todo} <strong>{todoCount}</strong></span>
        <span className="iq-summary-item">{copy.queue.reviewed} <strong>{reviewedCount}</strong></span>
        <span className="iq-summary-item">{copy.queue.deferred} <strong>{deferredCount}</strong></span>
        <span className="iq-summary-item">{copy.queue.high} <strong>{highCount}</strong></span>
        <span className="iq-summary-item">{copy.queue.normal} <strong>{normalCount}</strong></span>
        <span className="iq-summary-item">{copy.queue.low} <strong>{lowCount}</strong></span>
      </div>

      <div className="iq-filters">
        <label className="iq-filter-label">
          <span>{copy.queue.kindFilter}</span>
          <select className="iq-filter-select" value={kindFilter} onChange={e => setKindFilter(e.target.value as KindFilter)}>
            <option value="all">{copy.queue.all}</option>
            <option value="evidence">{copy.queue.evidenceKind}</option>
            <option value="graph_node">{copy.queue.graphNodeKind}</option>
          </select>
        </label>
        <label className="iq-filter-label">
          <span>{copy.queue.statusFilter}</span>
          <select className="iq-filter-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value as StatusFilter)}>
            <option value="all">{copy.queue.all}</option>
            <option value="todo">{copy.queue.todoStatus}</option>
            <option value="reviewed">{copy.queue.reviewedStatus}</option>
            <option value="deferred">{copy.queue.deferredStatus}</option>
          </select>
        </label>
        <label className="iq-filter-label">
          <span>{copy.queue.priorityFilter}</span>
          <select className="iq-filter-select" value={priorityFilter} onChange={e => setPriorityFilter(e.target.value as PriorityFilter)}>
            <option value="all">{copy.queue.all}</option>
            <option value="high">{copy.queue.highPriority}</option>
            <option value="normal">{copy.queue.normalPriority}</option>
            <option value="low">{copy.queue.lowPriority}</option>
          </select>
        </label>
        {hasFilters && (
          <button className="iq-filter-reset" onClick={() => { setKindFilter('all'); setStatusFilter('all'); setPriorityFilter('all'); }}>
            {copy.queue.reset}
          </button>
        )}
      </div>

      <div className="iq-items">
        {items.length === 0 ? (
          <div className="empty-state">{copy.queue.noItems}</div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">{copy.queue.noMatchFilter}</div>
        ) : (
          filtered.map(item => (
            <div key={item.id} className={`iq-item iq-item-${item.kind}`}>
              <div className="iq-item-header">
                <span className={`iq-item-kind iq-kind-${item.kind}`}>
                  {item.kind === 'evidence' ? copy.queue.evidenceBadge : copy.queue.graphNodeBadge}
                </span>
                <span className="iq-item-title">{item.title}</span>
                <button className="iq-item-remove" onClick={() => onRemoveItem(item.id)} aria-label={copy.queue.removeItem}>✕</button>
              </div>
              <div className="iq-item-source">{item.sourceSummary}</div>

              {item.kind === 'evidence' && (item as EvidenceQueueItem).nodeTitle && (
                <div className="iq-item-field">
                  <span className="iq-label">{copy.queue.nodeLabel}</span>
                  <span className="iq-mono">{(item as EvidenceQueueItem).nodeTitle}</span>
                </div>
              )}
              {item.kind === 'graph_node' && (
                <>
                  <div className="iq-item-field">
                    <span className="iq-label">{copy.queue.typeLabel}</span>
                    <span className="iq-mono">{(item as GraphNodeQueueItem).nodeType}</span>
                  </div>
                  {(item as GraphNodeQueueItem).errorMessage && (
                    <div className="iq-item-field iq-item-error">
                      <span className="iq-label">{(item as GraphNodeQueueItem).nodeStatus === 'error' ? copy.queue.errorLabel : copy.queue.warningLabel}:</span>
                      <span className="iq-mono">{(item as GraphNodeQueueItem).errorMessage}</span>
                    </div>
                  )}
                  <div className="iq-item-field">
                    <span className="iq-label">{copy.queue.pinsLabel}</span>
                    <span>{(item as GraphNodeQueueItem).pinSummary}</span>
                  </div>
                  <div className="iq-item-field">
                    <span className="iq-label">{copy.queue.linksLabel}</span>
                    <span>{(item as GraphNodeQueueItem).linkSummary}</span>
                  </div>
                </>
              )}

              <div className="iq-item-controls">
                <label className="iq-control">
                  <span>{copy.queue.statusControl}</span>
                  <select
                    className="iq-select"
                    value={item.investigationStatus}
                    onChange={e => onUpdateItem(item.id, { investigationStatus: e.target.value as InvestigationStatus })}
                  >
                    <option value="todo">{copy.queue.todoStatus}</option>
                    <option value="reviewed">{copy.queue.reviewedStatus}</option>
                    <option value="deferred">{copy.queue.deferredStatus}</option>
                  </select>
                </label>
                <label className="iq-control">
                  <span>{copy.queue.priorityControl}</span>
                  <select
                    className="iq-select"
                    value={item.priority}
                    onChange={e => onUpdateItem(item.id, { priority: e.target.value as InvestigationPriority })}
                  >
                    <option value="high">{copy.queue.highPriority}</option>
                    <option value="normal">{copy.queue.normalPriority}</option>
                    <option value="low">{copy.queue.lowPriority}</option>
                  </select>
                </label>
              </div>
              <div className="iq-item-note">
                <input
                  className="iq-note-input"
                  type="text"
                  placeholder={copy.queue.itemNotePlaceholder}
                  value={item.userNote}
                  onChange={e => onUpdateItem(item.id, { userNote: e.target.value })}
                />
              </div>
            </div>
          ))
        )}
      </div>

      <div className="iq-session-notes">
        <label className="iq-label" style={{ marginBottom: 4, display: 'block' }}>{copy.queue.sessionNotes}</label>
        <textarea
          className="iq-notes-area"
          placeholder={copy.queue.sessionNotesPlaceholder}
          value={sessionNotes}
          onChange={e => onSessionNotesChange(e.target.value)}
          rows={4}
        />
      </div>

      <div className="iq-actions">
        {items.length > 0 && (
          <button
            className={`iq-clear-btn${clearConfirm ? ' iq-clear-confirm' : ''}`}
            onClick={handleClear}
          >
            {clearConfirm ? copy.queue.confirmClear : copy.queue.clearQueue}
          </button>
        )}
      </div>

      <div className="iq-preview-section">
        <div className="iq-preview-label">{copy.queue.markdownPreview}</div>
        <pre className="iq-preview-pre">{markdown}</pre>
      </div>
    </section>
  );
}
