import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import type { BlueprintGraphDetailData, NodeInfo, PinInfo, LinkInfo } from '@omue/shared-protocol';
import { useDesktopCopy } from '../i18n';
import type { DesktopCopy } from '../i18n';

export interface NodeEvidenceSummary {
  chainTitle: string;
  severity: string;
  confidence: string;
  sourceKind: string;
  summary: string;
  suggestedNextInspection: string;
}

interface Props {
  graphDetail: BlueprintGraphDetailData | null;
  isLoading: boolean;
  error: string | null;
  onRetry: () => void;
  onClose: () => void;
  focusedNodeId?: string;
  nodeEvidenceMap?: Record<string, NodeEvidenceSummary[]>;
  onQueueNode?: (node: NodeInfo) => void;
}

const MAX_VISIBLE_LINKS = 20;

const SEVERITY_RANK: Record<string, number> = { fatal: 5, error: 4, warning: 3, info: 2, unknown: 1 };

function highestEvidenceSeverity(evidence: NodeEvidenceSummary[]): string {
  let best = 'unknown';
  let bestRank = 0;
  for (const e of evidence) {
    const r = SEVERITY_RANK[e.severity] ?? 0;
    if (r > bestRank) { bestRank = r; best = e.severity; }
  }
  return best;
}

function formatSourceKind(kind: string): string {
  return kind.replace(/_/g, ' ');
}

function statusRank(node: NodeInfo): number {
  if (node.errorType === 'error') return 4;
  if (node.errorType === 'warning') return 3;
  if (node.isDisabled === true) return 2;
  return 1;
}

function nodeStatusLabel(node: NodeInfo, copy: DesktopCopy): string {
  if (node.errorType === 'error') return copy.graphDetail.nodeStatusError;
  if (node.errorType === 'warning') return copy.graphDetail.nodeStatusWarn;
  if (node.isDisabled === true) return copy.graphDetail.nodeStatusDisabled;
  return copy.graphDetail.nodeStatusNone;
}

// ── E52: Node type group classification ─────────────────────

const NODE_TYPE_GROUPS: Record<string, string> = {
  event: 'entry_event',
  custom_event: 'entry_event',
  input_action: 'entry_event',
  input_key: 'entry_event',
  function_entry: 'entry_event',
  function_result: 'entry_event',
  function_call: 'calls',
  parent_call: 'calls',
  variable_get: 'variables',
  variable_set: 'variables',
  branch: 'flow_control',
  sequence: 'flow_control',
  for_loop: 'flow_control',
  for_each: 'flow_control',
  while_loop: 'flow_control',
  delay: 'flow_control',
  timeline: 'flow_control',
  dynamic_cast: 'casts',
  class_dynamic_cast: 'casts',
  macro_instance: 'macro_tunnel',
  tunnel: 'macro_tunnel',
  literal: 'literals_data',
  make_array: 'literals_data',
  make_struct: 'literals_data',
  break_struct: 'literals_data',
  delegate: 'delegates',
  add_delegate: 'delegates',
  remove_delegate: 'delegates',
  call_delegate: 'delegates',
  spawn_actor: 'ui_actor',
  create_widget: 'ui_actor',
  get_array_item: 'literals_data',
  latent_action: 'other_unknown',
  comment: 'other_unknown',
};

function nodeTypeGroup(nodeType: string): string {
  return NODE_TYPE_GROUPS[nodeType] ?? 'other_unknown';
}

const TYPE_GROUP_ORDER = [
  'entry_event', 'calls', 'variables', 'flow_control', 'casts',
  'macro_tunnel', 'literals_data', 'delegates', 'ui_actor', 'other_unknown',
];

function typeGroupLabel(group: string, copy: DesktopCopy): string {
  const gl = copy.graphDetail.typeGroupLabels;
  switch (group) {
    case 'entry_event': return gl.entryEvent;
    case 'calls': return gl.calls;
    case 'variables': return gl.variables;
    case 'flow_control': return gl.flowControl;
    case 'casts': return gl.casts;
    case 'macro_tunnel': return gl.macroTunnel;
    case 'literals_data': return gl.literalsData;
    case 'delegates': return gl.delegates;
    case 'ui_actor': return gl.uiActor;
    default: return gl.otherUnknown;
  }
}

function countBy<T>(items: T[], keyFn: (item: T) => string): Record<string, number> {
  const map: Record<string, number> = {};
  for (const item of items) {
    const k = keyFn(item);
    map[k] = (map[k] ?? 0) + 1;
  }
  return map;
}

function percentOf(count: number, total: number): string {
  if (total === 0) return '0%';
  return `${Math.round((count / total) * 100)}%`;
}

// ── E52: Node type distribution sub-components ──────────────

interface DistItem {
  type: string;
  count: number;
  pct: string;
}

function DiagSection({ title, className, children }: { title: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={`gd-diag-section${className ? ' ' + className : ''}`}>
      <div className="gd-diag-section-title">{title}</div>
      {children}
    </div>
  );
}

function NodeTypeDistribution({ nodes, copy }: { nodes: NodeInfo[]; copy: DesktopCopy }) {
  if (nodes.length === 0) return null;
  const counts = countBy(nodes, n => n.nodeType);
  const entries = Object.entries(counts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 15);

  return (
    <DiagSection title={copy.graphDetail.nodeTypeDistTitle}>
      <div className="gd-type-dist">
        {entries.map(([type, count]) => (
          <span key={type} className={`gd-type-dist-item${type === 'unknown' ? ' gd-type-dist-unknown' : ''}`}>
            <span className="gd-type-dist-type">{type}</span>
            <span className="gd-type-dist-count">{count}</span>
            <span className="gd-type-dist-pct">({percentOf(count, nodes.length)})</span>
          </span>
        ))}
      </div>
    </DiagSection>
  );
}

function TypeGroupDistribution({ nodes, copy }: { nodes: NodeInfo[]; copy: DesktopCopy }) {
  if (nodes.length === 0) return null;
  const groupCounts = countBy(nodes, n => nodeTypeGroup(n.nodeType));

  return (
    <DiagSection title={copy.graphDetail.typeGroupDistTitle}>
      <div className="gd-group-dist">
        {TYPE_GROUP_ORDER.map(group => {
          const count = groupCounts[group] ?? 0;
          if (count === 0) return null;
          return (
            <span key={group} className="gd-group-dist-item">
              <span className="gd-group-dist-label">{typeGroupLabel(group, copy)}</span>
              <span className="gd-group-dist-count">{count}</span>
              <span className="gd-group-dist-pct">({percentOf(count, nodes.length)})</span>
            </span>
          );
        })}
      </div>
    </DiagSection>
  );
}

// ── E52: Inspection Cues ───────────────────────────────────

interface CueEntry {
  key: string;
  label: string;
  icon: string;
  count: number;
  cssClass: string;
  relatedNodes: string[];
}

function computeCues(
  nodes: NodeInfo[],
  links: LinkInfo[],
  truncation?: { truncated: boolean; warnings: string[] },
): CueEntry[] {
  const cues: CueEntry[] = [];

  // Error nodes
  const errNodes = nodes.filter(n => n.errorType === 'error');
  if (errNodes.length > 0) cues.push({
    key: 'error', label: 'Error', icon: '✕', count: errNodes.length,
    cssClass: 'gd-cue-error',
    relatedNodes: errNodes.map(n => n.title),
  });

  // Warning nodes
  const warnNodes = nodes.filter(n => n.errorType === 'warning');
  if (warnNodes.length > 0) cues.push({
    key: 'warning', label: 'Warning', icon: '⚠', count: warnNodes.length,
    cssClass: 'gd-cue-warning',
    relatedNodes: warnNodes.map(n => n.title),
  });

  // Disabled nodes
  const disNodes = nodes.filter(n => n.isDisabled === true);
  if (disNodes.length > 0) cues.push({
    key: 'disabled', label: 'Disabled', icon: '⊘', count: disNodes.length,
    cssClass: 'gd-cue-disabled',
    relatedNodes: disNodes.map(n => n.title),
  });

  // Unknown nodes
  const unkNodes = nodes.filter(n => n.nodeType === 'unknown');
  if (unkNodes.length > 0) cues.push({
    key: 'unknown', label: 'Unknown', icon: '?', count: unkNodes.length,
    cssClass: 'gd-cue-unknown',
    relatedNodes: unkNodes.map(n => n.title),
  });

  // Isolated nodes (no incoming and no outgoing links, excluding entry/event types)
  const entryTypes = new Set(['event', 'custom_event', 'input_action', 'input_key', 'function_entry']);
  const linkedNodeIds = new Set<string>();
  for (const link of links) {
    linkedNodeIds.add(link.sourceNodeId);
    linkedNodeIds.add(link.targetNodeId);
  }
  const isolatedNodes = nodes.filter(n =>
    !entryTypes.has(n.nodeType) &&
    !linkedNodeIds.has(n.nodeId)
  );
  if (isolatedNodes.length > 0) cues.push({
    key: 'isolated', label: 'Potential isolated', icon: '○', count: isolatedNodes.length,
    cssClass: 'gd-cue-isolated',
    relatedNodes: isolatedNodes.map(n => n.title),
  });

  // Unconnected execute output pins
  const unconnExecNodes = nodes.filter(n =>
    n.pins.some(p => p.direction === 'output' && p.pinKind === 'execute' && !p.isConnected)
  );
  if (unconnExecNodes.length > 0) cues.push({
    key: 'unconnected_exec', label: 'Unconnected exec output', icon: '→',
    count: unconnExecNodes.length,
    cssClass: 'gd-cue-unconnected',
    relatedNodes: unconnExecNodes.map(n => n.title),
  });

  // Unconnected data input pins
  const unconnDataNodes = nodes.filter(n =>
    n.pins.some(p => p.direction === 'input' && p.pinKind === 'data' && !p.isConnected)
  );
  if (unconnDataNodes.length > 0) cues.push({
    key: 'unconnected_data', label: 'Unconnected data input', icon: '←',
    count: unconnDataNodes.length,
    cssClass: 'gd-cue-unconnected',
    relatedNodes: unconnDataNodes.map(n => n.title),
  });

  // Truncation
  if (truncation?.truncated) cues.push({
    key: 'truncation', label: 'Truncation', icon: '…', count: truncation.warnings.length,
    cssClass: 'gd-cue-truncation',
    relatedNodes: [],
  });

  return cues;
}

function InspectionCues({
  cues,
  onFilter,
  copy,
}: {
  cues: CueEntry[];
  onFilter: (key: string) => void;
  copy: DesktopCopy;
}) {
  if (cues.length === 0) return null;
  return (
    <DiagSection title={copy.graphDetail.cuesTitle}>
      <div className="gd-cues">
        {cues.map(cue => (
          <div
            key={cue.key}
            className={`gd-cue-item ${cue.cssClass}`}
            title={`${cue.label}: ${cue.count}`}
            onClick={() => onFilter(cue.key)}
          >
            <span className="gd-cue-icon">{cue.icon}</span>
            <span className="gd-cue-label">{cue.label}</span>
            <span className="gd-cue-count">{cue.count}</span>
          </div>
        ))}
      </div>
      <div className="gd-cues-hint">{copy.graphDetail.cuesManualHint}</div>
    </DiagSection>
  );
}

// ── Sub-components ─────────────────────────────────────────────

function PinRow({ pin, copy }: { pin: PinInfo; copy: DesktopCopy }) {
  const ct = pin.containerType && pin.containerType !== 'none' ? pin.containerType : undefined;
  return (
    <tr className="gd-pin-row">
      <td className="gd-pin-name">{pin.name}</td>
      <td>{pin.direction}</td>
      <td>{pin.pinKind}</td>
      <td>{pin.dataType}</td>
      <td>{ct ? ct : '-'}</td>
      <td>{pin.isConnected ? copy.common.yes : copy.common.no}</td>
    </tr>
  );
}

function NodeStatusBadge({ node, copy }: { node: NodeInfo; copy: DesktopCopy }) {
  const disabled = node.isDisabled === true;
  const hasError = node.errorType === 'error' || node.errorType === 'warning';

  if (!disabled && !hasError) return null;

  return (
    <span className="gd-node-status">
      {disabled && <span className="gd-status-badge gd-status-disabled">{copy.graphDetail.disabled}</span>}
      {node.errorType === 'error' && <span className="gd-status-badge gd-status-error">{copy.graphDetail.errorStatus}</span>}
      {node.errorType === 'warning' && <span className="gd-status-badge gd-status-warning">{copy.graphDetail.warnStatus}</span>}
    </span>
  );
}

function NodeRow({
  node,
  isExpanded,
  isFocused,
  isSelected,
  onToggle,
  evidence,
  copy,
}: {
  node: NodeInfo;
  isExpanded: boolean;
  isFocused: boolean;
  isSelected: boolean;
  onToggle: () => void;
  evidence?: NodeEvidenceSummary[];
  copy: DesktopCopy;
}) {
  return (
    <>
      <tr
        className={`gd-node-row${isFocused ? ' gd-node-focused' : ''}${isSelected ? ' gd-node-selected' : ''}`}
        onClick={onToggle}
      >
        <td className="gd-node-expand">{isExpanded ? '▼' : '▶'}</td>
        <td className="gd-node-title">
          {node.title}
          {isFocused && <span className="gd-focused-tag">{copy.graphDetail.focused}</span>}
        </td>
        <td className="gd-node-type">{node.nodeType}</td>
        <td className="gd-node-status-cell"><NodeStatusBadge node={node} copy={copy} /></td>
        <td className="gd-node-evidence-cell">
          {evidence && evidence.length > 0 ? (
            <span className={`gd-evidence-badge gd-ev-severity-${highestEvidenceSeverity(evidence)}`}>
              {evidence.length} {copy.graphDetail.evidenceSection.toLowerCase()}
            </span>
          ) : null}
        </td>
        <td className="gd-node-id">{node.nodeId}</td>
        <td className="gd-node-pincount">{node.pins.length}</td>
      </tr>
      {isExpanded && (
        <tr className="gd-pins-row">
          <td colSpan={7}>
            {node.errorMessage && (
              <div className="gd-node-error-msg">
                <span className="gd-node-error-label">{node.errorType === 'error' ? copy.graphDetail.errorLabel : copy.graphDetail.warningLabel}</span>
                <span className="gd-node-error-text">{node.errorMessage}</span>
              </div>
            )}
            {evidence && evidence.length > 0 && (
              <div className="gd-evidence-summaries">
                <div className="gd-ev-summaries-label">{copy.graphDetail.evidenceLabel(evidence.length)}</div>
                {evidence.map((item, i) => (
                  <div key={i} className="gd-ev-summary-item">
                    <div className="gd-ev-summary-header">
                      <span className={`ev-severity ev-severity-${item.severity}`}>{item.severity}</span>
                      <span className={`ev-confidence-badge ev-confidence-${item.confidence}`}>{item.confidence}</span>
                      <span className="ev-item-source">{formatSourceKind(item.sourceKind)}</span>
                    </div>
                    <div className="gd-ev-summary-text">{item.summary}</div>
                    <div className="gd-ev-summary-next">→ {item.suggestedNextInspection}</div>
                  </div>
                ))}
              </div>
            )}
            <table className="gd-pins-table">
              <thead>
                <tr>
                  <th>{copy.graphDetail.pinName}</th>
                  <th>{copy.graphDetail.dir}</th>
                  <th>{copy.graphDetail.kind}</th>
                  <th>{copy.graphDetail.type}</th>
                  <th>{copy.graphDetail.containerType}</th>
                  <th>{copy.graphDetail.connected}</th>
                </tr>
              </thead>
              <tbody>
                {node.pins.map(pin => (
                  <PinRow key={pin.pinId} pin={pin} copy={copy} />
                ))}
              </tbody>
            </table>
          </td>
        </tr>
      )}
    </>
  );
}

function LinksSection({ links, copy }: { links: LinkInfo[]; copy: DesktopCopy }) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? links : links.slice(0, MAX_VISIBLE_LINKS);
  const remaining = links.length - MAX_VISIBLE_LINKS;

  return (
    <div className="gd-links-section">
      <h4 className="gd-subtitle">{copy.graphDetail.linksLabel(links.length)}</h4>
      {links.length === 0 ? (
        <span className="dimmed">{copy.graphDetail.noLinks}</span>
      ) : (
        <>
          <table className="gd-table gd-links-table">
            <thead>
              <tr>
                <th>{copy.graphDetail.linkId}</th>
                <th>{copy.graphDetail.sourceLabel}</th>
                <th>{copy.graphDetail.targetLabel}</th>
              </tr>
            </thead>
            <tbody>
              {visible.map(link => (
                <tr key={link.linkId}>
                  <td className="gd-link-id">{link.linkId}</td>
                  <td className="gd-link-endpoint">{link.sourceNodeId}/{link.sourcePinId}</td>
                  <td className="gd-link-endpoint">{link.targetNodeId}/{link.targetPinId}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!showAll && remaining > 0 && (
            <button className="gd-show-more" onClick={() => setShowAll(true)}>
              {copy.graphDetail.showAllMore(remaining)}
            </button>
          )}
        </>
      )}
    </div>
  );
}

// ── Graph Summary Strip ────────────────────────────────────────

interface SummaryStripProps {
  detail: { nodes: NodeInfo[]; links: LinkInfo[]; truncation?: { truncated: boolean; warnings: string[] } };
  graphName: string;
  graphKind: string;
  nodeEvidenceMap?: Record<string, NodeEvidenceSummary[]>;
  filterSummary: string;
  copy: DesktopCopy;
}

function SummaryStrip({ detail, graphName, graphKind, nodeEvidenceMap, filterSummary, copy }: SummaryStripProps) {
  const totalPins = detail.nodes.reduce((sum, n) => sum + n.pins.length, 0);
  const connectedPins = detail.nodes.reduce((sum, n) => sum + n.pins.filter(p => p.isConnected).length, 0);
  const unconnectedPins = totalPins - connectedPins;
  const errorCount = detail.nodes.filter(n => n.errorType === 'error').length;
  const warningCount = detail.nodes.filter(n => n.errorType === 'warning').length;
  const disabledCount = detail.nodes.filter(n => n.isDisabled === true).length;
  const evidenceCount = detail.nodes.filter(n => (nodeEvidenceMap?.[n.nodeId]?.length ?? 0) > 0).length;
  const commentedNodesCount = detail.nodes.filter(n => n.nodeComment && n.nodeComment.length > 0).length;
  const containerPinsCount = detail.nodes.reduce((sum, n) => sum + n.pins.filter(p => p.containerType && p.containerType !== 'none').length, 0);

  return (
    <div className="gd-summary-strip">
      <div className="gd-summary-item">
        <span className="gd-summary-label">{copy.graphDetail.graphLabel}</span>
        <span className="gd-summary-value">{graphName}</span>
      </div>
      <div className="gd-summary-item">
        <span className="gd-summary-label">{copy.graphDetail.kindLabel}</span>
        <span className="gd-summary-value">{graphKind}</span>
      </div>
      <div className="gd-summary-item">
        <span className="gd-summary-label">{copy.graphDetail.nodesLabel}</span>
        <span className="gd-summary-value">{detail.nodes.length}</span>
      </div>
      <div className="gd-summary-item">
        <span className="gd-summary-label">{copy.graphDetail.linksCount}</span>
        <span className="gd-summary-value">{detail.links.length}</span>
      </div>
      <div className="gd-summary-item">
        <span className="gd-summary-label">{copy.graphDetail.pinsLabel}</span>
        <span className="gd-summary-value">{totalPins} <span className="gd-summary-sub">({copy.graphDetail.pinSummary(connectedPins, unconnectedPins)})</span></span>
      </div>
      <div className="gd-summary-item">
        <span className="gd-summary-label">{copy.graphDetail.statusLabel}</span>
        <span className="gd-summary-value">
          {errorCount > 0 && <span className="gd-summary-badge gd-summary-err">{copy.graphDetail.errorCount(errorCount)}</span>}
          {warningCount > 0 && <span className="gd-summary-badge gd-summary-warn">{copy.graphDetail.warnCount(warningCount)}</span>}
          {disabledCount > 0 && <span className="gd-summary-badge gd-summary-dis">{copy.graphDetail.disCount(disabledCount)}</span>}
          {errorCount === 0 && warningCount === 0 && disabledCount === 0 && <span className="dimmed">{copy.graphDetail.none}</span>}
        </span>
      </div>
      <div className="gd-summary-item">
        <span className="gd-summary-label">{copy.graphDetail.evidenceSection}</span>
        <span className="gd-summary-value">{evidenceCount > 0 ? `${evidenceCount} ${copy.graphDetail.nodesText}` : <span className="dimmed">{copy.graphDetail.none}</span>}</span>
      </div>
      {commentedNodesCount > 0 && (
        <div className="gd-summary-item">
          <span className="gd-summary-label">{copy.graphDetail.commentedNodesLabel}</span>
          <span className="gd-summary-value">{commentedNodesCount}</span>
        </div>
      )}
      {containerPinsCount > 0 && (
        <div className="gd-summary-item">
          <span className="gd-summary-label">{copy.graphDetail.containerPinsLabel}</span>
          <span className="gd-summary-value">{containerPinsCount}</span>
        </div>
      )}
      {detail.truncation?.truncated && (
        <div className="gd-summary-item gd-summary-truncated">
          <span className="gd-summary-label">{copy.graphDetail.truncatedLabel}</span>
          <span className="gd-summary-value gd-summary-truncated-value">{copy.common.yes}</span>
        </div>
      )}
      <div className="gd-summary-item gd-summary-filters">
        <span className="gd-summary-label">{copy.graphDetail.viewLabel}</span>
        <span className="gd-summary-value gd-summary-filter-desc">{filterSummary}</span>
      </div>
    </div>
  );
}

// ── Selected Node Detail ───────────────────────────────────────

interface SelectedNodeDetailProps {
  node: NodeInfo;
  evidence?: NodeEvidenceSummary[];
  links: LinkInfo[];
  allNodes: NodeInfo[];
  onQueueNode?: (node: NodeInfo) => void;
  copy: DesktopCopy;
}

function SelectedNodeDetail({ node, evidence, links, allNodes, onQueueNode, copy }: SelectedNodeDetailProps) {
  const totalPins = node.pins.length;
  const connectedPins = node.pins.filter(p => p.isConnected).length;
  const unconnectedPins = totalPins - connectedPins;
  const execPins = node.pins.filter(p => p.pinKind === 'execute').length;
  const dataPins = node.pins.filter(p => p.pinKind === 'data').length;
  const delegatePins = node.pins.filter(p => p.pinKind === 'delegate').length;
  const incomingLinks = links.filter(l => l.targetNodeId === node.nodeId);
  const outgoingLinks = links.filter(l => l.sourceNodeId === node.nodeId);

  // E52: Map neighbor node IDs to titles/types
  const nodeMap = useMemo(() => {
    const m = new Map<string, NodeInfo>();
    for (const n of allNodes) m.set(n.nodeId, n);
    return m;
  }, [allNodes]);

  // E52: Unconnected pin breakdown
  const unconnectedExecInput = node.pins.filter(p => !p.isConnected && p.direction === 'input' && p.pinKind === 'execute').length;
  const unconnectedExecOutput = node.pins.filter(p => !p.isConnected && p.direction === 'output' && p.pinKind === 'execute').length;
  const unconnectedDataInput = node.pins.filter(p => !p.isConnected && p.direction === 'input' && p.pinKind === 'data').length;
  const unconnectedDataOutput = node.pins.filter(p => !p.isConnected && p.direction === 'output' && p.pinKind === 'data').length;

  // E52: Determine cue labels for this node
  const nodeCueLabels: string[] = [];
  if (node.errorType === 'error') nodeCueLabels.push('Error');
  if (node.errorType === 'warning') nodeCueLabels.push('Warning');
  if (node.isDisabled === true) nodeCueLabels.push('Disabled');
  if (node.nodeType === 'unknown') nodeCueLabels.push('Unknown');
  if (unconnectedExecOutput > 0) nodeCueLabels.push('Unconnected exec output');
  if (unconnectedDataInput > 0) nodeCueLabels.push('Unconnected data input');
  const linkedIds = new Set<string>();
  for (const link of links) { linkedIds.add(link.sourceNodeId); linkedIds.add(link.targetNodeId); }
  const entryTypes = new Set(['event', 'custom_event', 'input_action', 'input_key', 'function_entry']);
  if (!entryTypes.has(node.nodeType) && !linkedIds.has(node.nodeId)) nodeCueLabels.push('Potential isolated');

  return (
    <div className="gd-node-detail">
      <div className="gd-node-detail-header">
        <span className="gd-node-detail-title">{node.title}</span>
        <NodeStatusBadge node={node} copy={copy} />
        {onQueueNode && (
          <button
            className="gd-copy-btn"
            onClick={() => onQueueNode(node)}
            style={{ marginLeft: 'auto' }}
          >
            {copy.graphDetail.addNodeToQueue}
          </button>
        )}
      </div>
      <div className="gd-node-detail-fields">
        <div className="field">
          <span className="field-label">{copy.graphDetail.nodeId}</span>
          <span className="field-value gd-mono">{node.nodeId}</span>
        </div>
        <div className="field">
          <span className="field-label">{copy.common.type}</span>
          <span className="field-value">{node.nodeType}</span>
        </div>
        {/* E52: Type group */}
        <div className="field">
          <span className="field-label">{copy.graphDetail.detailTypeGroup}</span>
          <span className="field-value">{typeGroupLabel(nodeTypeGroup(node.nodeType), copy)}</span>
        </div>
        {node.errorMessage && (
          <div className="field">
            <span className="field-label">{node.errorType === 'error' ? copy.graphDetail.errorField : copy.graphDetail.warningField}</span>
            <span className="field-value" style={{ color: node.errorType === 'error' ? 'var(--accent-error)' : 'var(--accent-warn)' }}>{node.errorMessage}</span>
          </div>
        )}
        {node.position && (
          <div className="field">
            <span className="field-label">{copy.graphDetail.positionLabel}</span>
            <span className="field-value gd-mono">({node.position.x}, {node.position.y})</span>
          </div>
        )}
        {node.nodeComment && (
          <div className="field">
            <span className="field-label">{copy.graphDetail.nodeCommentLabel}</span>
            <span className="field-value gd-comment-text">{node.nodeComment}</span>
          </div>
        )}
      </div>

      {/* E52: Cue labels */}
      {nodeCueLabels.length > 0 && (
        <div className="gd-node-detail-section">
          <div className="gd-node-detail-section-title">{copy.graphDetail.detailCueLabel}</div>
          <div className="gd-node-detail-cues">
            {nodeCueLabels.map(label => (
              <span key={label} className="gd-node-detail-cue-tag">{label}</span>
            ))}
          </div>
        </div>
      )}

      {evidence && evidence.length > 0 && (
        <div className="gd-node-detail-section">
          <div className="gd-node-detail-section-title">{copy.graphDetail.evidenceLabel(evidence.length)}</div>
          {evidence.map((item, i) => (
            <div key={i} className="gd-node-detail-ev-item">
              <div className="gd-ev-summary-header">
                <span className={`ev-severity ev-severity-${item.severity}`}>{item.severity}</span>
                <span className={`ev-confidence-badge ev-confidence-${item.confidence}`}>{item.confidence}</span>
                <span className="ev-item-source">{formatSourceKind(item.sourceKind)}</span>
              </div>
              <div className="gd-node-detail-ev-summary">{item.summary}</div>
            </div>
          ))}
        </div>
      )}

      <div className="gd-node-detail-section">
        <div className="gd-node-detail-section-title">{copy.graphDetail.pinsSection}</div>
        <div className="gd-node-detail-pin-summary">
          <span>{copy.graphDetail.pinTotal} {totalPins}</span>
          <span>{copy.graphDetail.pinConnected} {connectedPins}</span>
          <span>{copy.graphDetail.pinUnconnected} {unconnectedPins}</span>
          <span>{copy.graphDetail.pinExec} {execPins}</span>
          <span>{copy.graphDetail.pinData} {dataPins}</span>
          <span>{copy.graphDetail.pinDelegate} {delegatePins}</span>
        </div>
        {/* E52: Unconnected pin breakdown */}
        {(unconnectedExecInput > 0 || unconnectedExecOutput > 0 || unconnectedDataInput > 0 || unconnectedDataOutput > 0) && (
          <div className="gd-node-detail-section-title" style={{ fontSize: '0.70rem', marginTop: 4 }}>
            {copy.graphDetail.detailUnconnectedBreakdown}
          </div>
        )}
        {(unconnectedExecInput > 0 || unconnectedExecOutput > 0 || unconnectedDataInput > 0 || unconnectedDataOutput > 0) && (
          <div className="gd-unconnected-breakdown">
            {unconnectedExecOutput > 0 && <span className="gd-unconnected-item">Exec output: {unconnectedExecOutput}</span>}
            {unconnectedExecInput > 0 && <span className="gd-unconnected-item">Exec input: {unconnectedExecInput}</span>}
            {unconnectedDataOutput > 0 && <span className="gd-unconnected-item">Data output: {unconnectedDataOutput}</span>}
            {unconnectedDataInput > 0 && <span className="gd-unconnected-item">Data input: {unconnectedDataInput}</span>}
          </div>
        )}
        <table className="gd-pins-table">
          <thead>
            <tr>
              <th>{copy.graphDetail.pinName}</th>
              <th>{copy.graphDetail.dir}</th>
              <th>{copy.graphDetail.kind}</th>
              <th>{copy.graphDetail.type}</th>
              <th>{copy.graphDetail.containerType}</th>
              <th>{copy.graphDetail.connected}</th>
            </tr>
          </thead>
          <tbody>
            {node.pins.map(pin => (
              <PinRow key={pin.pinId} pin={pin} copy={copy} />
            ))}
          </tbody>
        </table>
      </div>

      {/* E52: Enhanced link section with neighbor titles */}
      <div className="gd-node-detail-section">
        <div className="gd-node-detail-section-title">{copy.graphDetail.linksCount}</div>
        <div className="gd-node-detail-link-summary">
          <span>{copy.graphDetail.incoming} {incomingLinks.length}</span>
          <span>{copy.graphDetail.outgoing} {outgoingLinks.length}</span>
        </div>
        {incomingLinks.length > 0 && (
          <div style={{ marginTop: 4 }}>
            <div style={{ fontSize: '0.68rem', color: 'var(--text-dimmed)', marginBottom: 2 }}>Incoming:</div>
            {incomingLinks.slice(0, 10).map(link => {
              const neighbor = nodeMap.get(link.sourceNodeId);
              return (
                <div key={link.linkId} className="gd-node-detail-neighbor">
                  ← <span className="gd-node-detail-neighbor-link">{neighbor ? copy.graphDetail.detailNeighborTitle(neighbor.title, neighbor.nodeType) : link.sourceNodeId}</span>
                  {' / '}{link.sourcePinId}
                </div>
              );
            })}
          </div>
        )}
        {outgoingLinks.length > 0 && (
          <div style={{ marginTop: 4 }}>
            <div style={{ fontSize: '0.68rem', color: 'var(--text-dimmed)', marginBottom: 2 }}>Outgoing:</div>
            {outgoingLinks.slice(0, 10).map(link => {
              const neighbor = nodeMap.get(link.targetNodeId);
              return (
                <div key={link.linkId} className="gd-node-detail-neighbor">
                  → <span className="gd-node-detail-neighbor-link">{neighbor ? copy.graphDetail.detailNeighborTitle(neighbor.title, neighbor.nodeType) : link.targetNodeId}</span>
                  {' / '}{link.targetPinId}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Inspection Controls ────────────────────────────────────────

interface InspectionControlsProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  statusFilter: string;
  onStatusFilterChange: (f: string) => void;
  evidenceFilter: string;
  onEvidenceFilterChange: (f: string) => void;
  pinFilter: string;
  onPinFilterChange: (f: string) => void;
  sortMode: string;
  onSortChange: (s: string) => void;
  /** E52: nodeType filter */
  nodeTypeFilter: string;
  onNodeTypeFilterChange: (f: string) => void;
  /** E52: group filter */
  groupFilter: string;
  onGroupFilterChange: (f: string) => void;
  /** E52: available node types for filter dropdown */
  availableNodeTypes: string[];
  filteredCount: number;
  totalCount: number;
  onResetFilters: () => void;
  onExpandAllShown: () => void;
  onCollapseAllShown: () => void;
  onExpandStatusNodes: () => void;
  onExpandEvidenceNodes: () => void;
  hasStatusNodes: boolean;
  hasEvidenceNodes: boolean;
  copy: DesktopCopy;
}

function InspectionControls({
  searchQuery, onSearchChange,
  statusFilter, onStatusFilterChange,
  evidenceFilter, onEvidenceFilterChange,
  pinFilter, onPinFilterChange,
  sortMode, onSortChange,
  nodeTypeFilter, onNodeTypeFilterChange,
  groupFilter, onGroupFilterChange,
  availableNodeTypes,
  filteredCount, totalCount,
  onResetFilters,
  onExpandAllShown, onCollapseAllShown,
  onExpandStatusNodes, onExpandEvidenceNodes,
  hasStatusNodes, hasEvidenceNodes,
  copy,
}: InspectionControlsProps) {
  const hasActiveFilters = searchQuery !== '' || statusFilter !== 'all' || evidenceFilter !== 'all' || pinFilter !== 'all'
    || nodeTypeFilter !== 'all' || groupFilter !== 'all';

  return (
    <div className="gd-controls">
      <div className="gd-controls-row">
        <input
          className="gd-search-input"
          type="text"
          placeholder={copy.graphDetail.searchPlaceholder}
          value={searchQuery}
          onChange={e => onSearchChange(e.target.value)}
        />
      </div>
      <div className="gd-controls-row gd-controls-filters">
        <label className="gd-controls-label">
          {copy.graphDetail.statusFilter}
          <select className="gd-controls-select" value={statusFilter} onChange={e => onStatusFilterChange(e.target.value)}>
            <option value="all">{copy.graphDetail.allFilter}</option>
            <option value="error">{copy.graphDetail.errorFilter}</option>
            <option value="warning">{copy.graphDetail.warningFilter}</option>
            <option value="disabled">{copy.graphDetail.disabledFilter}</option>
            <option value="has_status">{copy.graphDetail.hasStatus}</option>
            <option value="no_status">{copy.graphDetail.noStatus}</option>
          </select>
        </label>
        <label className="gd-controls-label">
          {copy.graphDetail.evidenceFilter}
          <select className="gd-controls-select" value={evidenceFilter} onChange={e => onEvidenceFilterChange(e.target.value)}>
            <option value="all">{copy.graphDetail.allFilter}</option>
            <option value="has_evidence">{copy.graphDetail.hasEvidence}</option>
            <option value="no_evidence">{copy.graphDetail.noEvidenceFilter}</option>
          </select>
        </label>
        <label className="gd-controls-label">
          {copy.graphDetail.pinsFilter}
          <select className="gd-controls-select" value={pinFilter} onChange={e => onPinFilterChange(e.target.value)}>
            <option value="all">{copy.graphDetail.allFilter}</option>
            <option value="has_connected">{copy.graphDetail.hasConnected}</option>
            <option value="has_unconnected">{copy.graphDetail.hasUnconnected}</option>
          </select>
        </label>
        <label className="gd-controls-label">
          {copy.graphDetail.sortFilter}
          <select className="gd-controls-select" value={sortMode} onChange={e => onSortChange(e.target.value)}>
            <option value="original">{copy.evidence.original}</option>
            <option value="title">{copy.graphDetail.titleSort}</option>
            <option value="type">{copy.common.type}</option>
            <option value="status">{copy.graphDetail.statusSeveritySort}</option>
            <option value="evidence">{copy.graphDetail.evidenceCountSort}</option>
            <option value="pins">{copy.graphDetail.pinCountSort}</option>
          </select>
        </label>
        {/* E52: nodeType filter */}
        <label className="gd-controls-label">
          {copy.graphDetail.typeFilter}
          <select className="gd-controls-select" value={nodeTypeFilter} onChange={e => onNodeTypeFilterChange(e.target.value)}>
            <option value="all">{copy.graphDetail.typeFilterAll}</option>
            <option value="unknown">{copy.common.unknown}</option>
            {availableNodeTypes.filter(nt => nt !== 'unknown').map(nt => (
              <option key={nt} value={nt}>{nt}</option>
            ))}
          </select>
        </label>
        {/* E52: group filter */}
        <label className="gd-controls-label">
          {copy.graphDetail.groupFilter}
          <select className="gd-controls-select" value={groupFilter} onChange={e => onGroupFilterChange(e.target.value)}>
            <option value="all">{copy.graphDetail.groupFilterAll}</option>
            {TYPE_GROUP_ORDER.map(g => (
              <option key={g} value={g}>{typeGroupLabel(g, copy)}</option>
            ))}
          </select>
        </label>
        {hasActiveFilters && (
          <button className="gd-controls-reset" onClick={onResetFilters}>{copy.graphDetail.resetFilters}</button>
        )}
      </div>
      <div className="gd-controls-row gd-controls-expand">
        <button className="gd-toolbar-btn" onClick={onExpandAllShown} disabled={filteredCount === 0}>{copy.graphDetail.expandAllShown}</button>
        <button className="gd-toolbar-btn" onClick={onCollapseAllShown} disabled={filteredCount === 0}>{copy.graphDetail.collapseAllShown}</button>
        <button className="gd-toolbar-btn" onClick={onExpandStatusNodes} disabled={!hasStatusNodes || filteredCount === 0}>{copy.graphDetail.expandStatusNodes}</button>
        <button className="gd-toolbar-btn" onClick={onExpandEvidenceNodes} disabled={!hasEvidenceNodes || filteredCount === 0}>{copy.graphDetail.expandEvidenceNodes}</button>
      </div>
      <div className="gd-controls-count">
        {copy.graphDetail.showingNodes(filteredCount, totalCount)}
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────

export function GraphDetailPanel({ graphDetail, isLoading, error, onRetry, onClose, focusedNodeId, nodeEvidenceMap, onQueueNode }: Props) {
  const { copy } = useDesktopCopy();
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [evidenceFilter, setEvidenceFilter] = useState('all');
  const [pinFilter, setPinFilter] = useState('all');
  const [sortMode, setSortMode] = useState('original');
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  // E52: nodeType and group filters
  const [nodeTypeFilter, setNodeTypeFilter] = useState('all');
  const [groupFilter, setGroupFilter] = useState('all');
  const [showReportPreview, setShowReportPreview] = useState(false);
  const [cueFilter, setCueFilter] = useState<((n: NodeInfo) => boolean) | null>(null);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  // Detect graph change to reset local state
  const prevGraphIdRef = useRef<string | undefined>();
  const currentGraphId = graphDetail?.selectedBlueprint?.requestedGraphId;

  useEffect(() => {
    if (currentGraphId !== undefined && currentGraphId !== prevGraphIdRef.current) {
      setExpandedNodes(new Set());
      setSelectedNodeId(null);
      setSearchQuery('');
      setStatusFilter('all');
      setEvidenceFilter('all');
      setPinFilter('all');
      setSortMode('original');
      setNodeTypeFilter('all');
      setGroupFilter('all');
      setCopyStatus(null);
    }
    prevGraphIdRef.current = currentGraphId;
  }, [currentGraphId]);

  // Auto-expand focused node
  useEffect(() => {
    if (focusedNodeId) {
      setExpandedNodes(prev => {
        if (prev.has(focusedNodeId)) return prev;
        const next = new Set(prev);
        next.add(focusedNodeId);
        return next;
      });
    }
  }, [focusedNodeId]);

  // ── Derived data ──────────────────────────────────────────

  const detail = graphDetail?.selectedBlueprint?.graph?.detail;
  const graph = graphDetail?.selectedBlueprint?.graph;

  const originalIndexMap = useMemo(() => {
    if (!detail) return new Map<string, number>();
    const map = new Map<string, number>();
    detail.nodes.forEach((n, i) => map.set(n.nodeId, i));
    return map;
  }, [detail]);

  const filteredNodes = useMemo(() => {
    if (!detail) return [];
    let nodes = [...detail.nodes];

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      nodes = nodes.filter(n =>
        n.title.toLowerCase().includes(q) ||
        n.nodeId.toLowerCase().includes(q) ||
        n.nodeType.toLowerCase().includes(q) ||
        n.pins.some(p => p.name.toLowerCase().includes(q))
      );
    }

    // Status filter
    if (statusFilter !== 'all') {
      nodes = nodes.filter(n => {
        switch (statusFilter) {
          case 'error': return n.errorType === 'error';
          case 'warning': return n.errorType === 'warning';
          case 'disabled': return n.isDisabled === true;
          case 'has_status': return n.errorType === 'error' || n.errorType === 'warning' || n.isDisabled === true;
          case 'no_status': return n.errorType !== 'error' && n.errorType !== 'warning' && n.isDisabled !== true;
          default: return true;
        }
      });
    }

    // Evidence filter
    if (evidenceFilter !== 'all') {
      nodes = nodes.filter(n => {
        const hasEv = (nodeEvidenceMap?.[n.nodeId]?.length ?? 0) > 0;
        return evidenceFilter === 'has_evidence' ? hasEv : !hasEv;
      });
    }

    // Pin filter
    if (pinFilter !== 'all') {
      nodes = nodes.filter(n => {
        if (pinFilter === 'has_connected') return n.pins.some(p => p.isConnected);
        if (pinFilter === 'has_unconnected') return n.pins.some(p => !p.isConnected);
        return true;
      });
    }

    // E52: nodeType filter
    if (nodeTypeFilter !== 'all') {
      nodes = nodes.filter(n => n.nodeType === nodeTypeFilter);
    }

    // E52: group filter
    if (groupFilter !== 'all') {
      nodes = nodes.filter(n => nodeTypeGroup(n.nodeType) === groupFilter);
    }

    // E52: cue-based custom filter (isolated, unconnected, etc.)
    if (cueFilter) {
      nodes = nodes.filter(cueFilter);
    }

    // Sort
    if (sortMode !== 'original') {
      nodes.sort((a, b) => {
        switch (sortMode) {
          case 'title': return a.title.localeCompare(b.title);
          case 'type': return a.nodeType.localeCompare(b.nodeType);
          case 'status': {
            const diff = statusRank(b) - statusRank(a);
            if (diff !== 0) return diff;
            return (originalIndexMap.get(a.nodeId) ?? 0) - (originalIndexMap.get(b.nodeId) ?? 0);
          }
          case 'evidence': {
            const ea = nodeEvidenceMap?.[a.nodeId]?.length ?? 0;
            const eb = nodeEvidenceMap?.[b.nodeId]?.length ?? 0;
            const diff = eb - ea;
            if (diff !== 0) return diff;
            return (originalIndexMap.get(a.nodeId) ?? 0) - (originalIndexMap.get(b.nodeId) ?? 0);
          }
          case 'pins': {
            const diff = b.pins.length - a.pins.length;
            if (diff !== 0) return diff;
            return (originalIndexMap.get(a.nodeId) ?? 0) - (originalIndexMap.get(b.nodeId) ?? 0);
          }
          default: return (originalIndexMap.get(a.nodeId) ?? 0) - (originalIndexMap.get(b.nodeId) ?? 0);
        }
      });
    }

    return nodes;
  }, [detail, searchQuery, statusFilter, evidenceFilter, pinFilter, nodeTypeFilter, groupFilter, cueFilter, sortMode, nodeEvidenceMap, originalIndexMap]);

  // Auto-clear selection when filtered out
  useEffect(() => {
    if (selectedNodeId && !filteredNodes.some(n => n.nodeId === selectedNodeId)) {
      setSelectedNodeId(null);
    }
  }, [filteredNodes, selectedNodeId]);

  const selectedNode = useMemo(() => {
    if (!selectedNodeId || !detail) return null;
    return detail.nodes.find(n => n.nodeId === selectedNodeId) ?? null;
  }, [selectedNodeId, detail]);

  const hasStatusNodes = detail ? detail.nodes.some(n => n.errorType === 'error' || n.errorType === 'warning' || n.isDisabled === true) : false;
  const hasEvidenceNodes = detail ? detail.nodes.some(n => (nodeEvidenceMap?.[n.nodeId]?.length ?? 0) > 0) : false;

  // ── Filter summary for strip ──────────────────────────────

  const filterSummary = useMemo(() => {
    const parts: string[] = [];
    const c = copy;
    if (searchQuery.trim()) parts.push(`${c.common.search}: "${searchQuery}"`);
    if (statusFilter !== 'all') parts.push(`${c.common.status}: ${statusFilter.replace(/_/g, ' ')}`);
    if (evidenceFilter !== 'all') parts.push(`${c.graphDetail.evidenceSection}: ${evidenceFilter.replace(/_/g, ' ')}`);
    if (pinFilter !== 'all') parts.push(`${c.graphDetail.pinsLabel}: ${pinFilter.replace(/_/g, ' ')}`);
    if (nodeTypeFilter !== 'all') parts.push(`${c.graphDetail.typeFilter}: ${nodeTypeFilter}`);
    if (groupFilter !== 'all') parts.push(`${c.graphDetail.groupFilter}: ${groupFilter}`);
    if (cueFilter) parts.push('Cue filter active');
    if (sortMode !== 'original') parts.push(`${c.common.sort}: ${sortMode}`);
    return parts.length > 0 ? parts.join(', ') : c.graphDetail.none;
  }, [searchQuery, statusFilter, evidenceFilter, pinFilter, nodeTypeFilter, groupFilter, cueFilter, sortMode, copy]);

  const hasActiveFilters = searchQuery !== '' || statusFilter !== 'all' || evidenceFilter !== 'all' || pinFilter !== 'all' || nodeTypeFilter !== 'all' || groupFilter !== 'all' || cueFilter !== null;

  // ── Handlers ──────────────────────────────────────────────

  const handleToggleNode = useCallback((nodeId: string) => {
    setSelectedNodeId(prev => prev === nodeId ? null : nodeId);
    setExpandedNodes(prev => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  }, []);

  const handleResetFilters = useCallback(() => {
    setSearchQuery('');
    setStatusFilter('all');
    setEvidenceFilter('all');
    setPinFilter('all');
    setNodeTypeFilter('all');
    setGroupFilter('all');
    setCueFilter(null);
    setSortMode('original');
  }, []);

  const handleCopy = useCallback(async (text: string, label: string) => {
    if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    try {
      await navigator.clipboard.writeText(text);
      setCopyStatus(copy.graphDetail.copiedLabel(label));
    } catch {
      setCopyStatus(copy.graphDetail.copyFailed);
    }
    copyTimeoutRef.current = setTimeout(() => setCopyStatus(null), 3000);
  }, [copy]);

  const buildGraphSummaryText = useCallback((): string => {
    if (!detail || !graph) return '';
    const totalPins = detail.nodes.reduce((sum, n) => sum + n.pins.length, 0);
    const connectedPins = detail.nodes.reduce((sum, n) => sum + n.pins.filter(p => p.isConnected).length, 0);
    const unconnectedPins = totalPins - connectedPins;
    const errorCount = detail.nodes.filter(n => n.errorType === 'error').length;
    const warningCount = detail.nodes.filter(n => n.errorType === 'warning').length;
    const disabledCount = detail.nodes.filter(n => n.isDisabled === true).length;
    const evidenceCount = detail.nodes.filter(n => (nodeEvidenceMap?.[n.nodeId]?.length ?? 0) > 0).length;

    const lines = [
      copy.graphDetail.mdGraph(graph.name),
      copy.graphDetail.mdKind(graph.kind),
      copy.graphDetail.mdGraphId(detail.graphId),
      '',
      copy.graphDetail.mdNodes(detail.nodes.length),
      copy.graphDetail.mdLinks(detail.links.length),
      copy.graphDetail.mdTotalPins(totalPins, connectedPins, unconnectedPins),
      '',
      copy.graphDetail.mdStatusSummary(errorCount, warningCount, disabledCount),
      copy.graphDetail.mdEvidenceSummary(evidenceCount),
      detail.truncation?.truncated ? copy.graphDetail.mdTruncatedYes : copy.graphDetail.mdTruncatedNo,
    ];
    if (detail.truncation?.truncated && detail.truncation.warnings.length > 0) {
      lines.push('');
      lines.push(copy.graphDetail.mdTruncationWarnings);
      for (const w of detail.truncation.warnings) {
        lines.push(`  - ${w}`);
      }
    }
    lines.push('');
    lines.push(copy.graphDetail.mdCurrentView(filteredNodes.length, detail.nodes.length));
    if (hasActiveFilters) {
      lines.push(copy.graphDetail.mdFilters(filterSummary));
      lines.push(copy.graphDetail.mdSort(sortMode));
    }
    return lines.join('\n');
  }, [detail, graph, filteredNodes.length, hasActiveFilters, filterSummary, sortMode, nodeEvidenceMap, copy]);

  const buildNodeSummaryText = useCallback((): string => {
    if (!detail || !selectedNode) return '';
    const node = selectedNode;
    const totalPins = node.pins.length;
    const connectedPins = node.pins.filter(p => p.isConnected).length;
    const unconnectedPins = totalPins - connectedPins;
    const execPins = node.pins.filter(p => p.pinKind === 'execute').length;
    const dataPins = node.pins.filter(p => p.pinKind === 'data').length;
    const delegatePins = node.pins.filter(p => p.pinKind === 'delegate').length;
    const incomingLinks = detail.links.filter(l => l.targetNodeId === node.nodeId).length;
    const outgoingLinks = detail.links.filter(l => l.sourceNodeId === node.nodeId).length;
    const ev = nodeEvidenceMap?.[node.nodeId];

    const lines = [
      copy.graphDetail.mdNode(node.title),
      copy.graphDetail.mdNodeId(node.nodeId),
      copy.graphDetail.mdNodeType(node.nodeType),
      copy.graphDetail.mdNodeStatus(nodeStatusLabel(node, copy)),
    ];
    if (node.errorMessage) {
      lines.push(copy.graphDetail.mdNodeErrorMsg(node.errorMessage));
    }
    lines.push('');
    if (ev && ev.length > 0) {
      lines.push(copy.graphDetail.mdNodeEvidence(ev.length));
      for (const item of ev) {
        lines.push(`  - [${item.severity}/${item.confidence}] ${item.summary}`);
      }
    } else {
      lines.push(copy.graphDetail.mdNodeEvidenceNone);
    }
    lines.push('');
    lines.push(copy.graphDetail.mdNodePins(totalPins, connectedPins, unconnectedPins));
    lines.push(`  ${copy.graphDetail.mdNodePinBreakdown(execPins, dataPins, delegatePins)}`);
    lines.push(copy.graphDetail.mdNodeLinks(incomingLinks, outgoingLinks));
    return lines.join('\n');
  }, [detail, selectedNode, nodeEvidenceMap, copy]);

  const handleExpandAllShown = useCallback(() => {
    setExpandedNodes(prev => {
      const next = new Set(prev);
      for (const n of filteredNodes) next.add(n.nodeId);
      return next;
    });
  }, [filteredNodes]);

  const handleCollapseAllShown = useCallback(() => {
    setExpandedNodes(prev => {
      const next = new Set(prev);
      for (const n of filteredNodes) next.delete(n.nodeId);
      return next;
    });
  }, [filteredNodes]);

  const handleExpandStatusNodes = useCallback(() => {
    setExpandedNodes(prev => {
      const next = new Set(prev);
      for (const n of filteredNodes) {
        if (n.errorType === 'error' || n.errorType === 'warning' || n.isDisabled === true) {
          next.add(n.nodeId);
        }
      }
      return next;
    });
  }, [filteredNodes]);

  const handleExpandEvidenceNodes = useCallback(() => {
    setExpandedNodes(prev => {
      const next = new Set(prev);
      for (const n of filteredNodes) {
        if ((nodeEvidenceMap?.[n.nodeId]?.length ?? 0) > 0) {
          next.add(n.nodeId);
        }
      }
      return next;
    });
  }, [filteredNodes, nodeEvidenceMap]);

  // ── E52: Derived data for diagnostic workbench ──────────

  const availableNodeTypes = useMemo(() => {
    if (!detail) return [];
    const types = new Set(detail.nodes.map(n => n.nodeType));
    return [...types].sort();
  }, [detail]);

  const cues = useMemo(() => {
    if (!detail) return [];
    return computeCues(detail.nodes, detail.links, detail.truncation);
  }, [detail]);

  // Diagnostic Report — single memoized string for preview / copy consistency
  const diagReportText = useMemo(() => {
    if (!detail || !graph) return '';
    const totalPins = detail.nodes.reduce((s, n) => s + n.pins.length, 0);
    const connectedPins = detail.nodes.reduce((s, n) => s + n.pins.filter(p => p.isConnected).length, 0);
    const unconnectedPins = totalPins - connectedPins;
    const execPins = detail.nodes.reduce((s, n) => s + n.pins.filter(p => p.pinKind === 'execute').length, 0);
    const dataPins = detail.nodes.reduce((s, n) => s + n.pins.filter(p => p.pinKind === 'data').length, 0);
    const delegatePins = detail.nodes.reduce((s, n) => s + n.pins.filter(p => p.pinKind === 'delegate').length, 0);
    const errCount = detail.nodes.filter(n => n.errorType === 'error').length;
    const warnCount = detail.nodes.filter(n => n.errorType === 'warning').length;
    const disCount = detail.nodes.filter(n => n.isDisabled === true).length;
    const evCount = detail.nodes.filter(n => (nodeEvidenceMap?.[n.nodeId]?.length ?? 0) > 0).length;
    const unkCount = detail.nodes.filter(n => n.nodeType === 'unknown').length;
    const bpName = graphDetail?.selectedBlueprint?.blueprintName ?? '';

    const c = copy.graphDetail;
    const lines: string[] = [];
    lines.push(`# ${c.mdDiagTitle}`);
    lines.push('');
    lines.push(c.mdDiagGenerated(new Date().toISOString()));
    lines.push('');
    lines.push(`**${c.mdDiagGraphInfo(graph.name, graph.kind, detail.graphId)}**`);
    lines.push('');
    lines.push(`**${c.mdDiagCountsSummary(detail.nodes.length, detail.links.length, totalPins)}**`);
    lines.push('');
    lines.push(c.mdDiagPinBreakdown(execPins, dataPins, delegatePins, connectedPins, unconnectedPins));
    lines.push('');
    if (errCount > 0 || warnCount > 0 || disCount > 0) {
      lines.push(c.mdDiagStatusSummary(errCount, warnCount, disCount));
      lines.push('');
    }
    if (evCount > 0) {
      lines.push(c.mdDiagEvidenceNodes(evCount));
      lines.push('');
    }
    if (unkCount > 0) {
      lines.push(c.mdDiagUnknownNodes(unkCount, percentOf(unkCount, detail.nodes.length)));
      lines.push('');
    }

    // Node type distribution
    lines.push(`**${c.mdDiagNodeTypeDist}**`);
    const typeCounts = countBy(detail.nodes, n => n.nodeType);
    const sortedTypes = Object.entries(typeCounts).sort(([, a], [, b]) => b - a);
    for (const [type, count] of sortedTypes.slice(0, 15)) {
      lines.push(c.mdDiagNodeTypeRow(type, count, percentOf(count, detail.nodes.length)));
    }
    if (sortedTypes.length > 15) {
      lines.push(c.mdDiagOtherTypes(sortedTypes.length - 15));
    }
    lines.push('');

    // Type group distribution
    lines.push(`**${c.mdDiagTypeGroupDist}**`);
    const groupCounts = countBy(detail.nodes, n => nodeTypeGroup(n.nodeType));
    for (const group of TYPE_GROUP_ORDER) {
      const count = groupCounts[group] ?? 0;
      if (count === 0) continue;
      lines.push(c.mdDiagTypeGroupRow(typeGroupLabel(group, copy), count, percentOf(count, detail.nodes.length)));
    }
    lines.push('');

    // Inspection cues
    if (cues.length > 0) {
      lines.push(`**${c.mdDiagCuesSection}**`);
      for (const cue of cues) {
        lines.push(c.mdDiagCueItem(cue.label, cue.count));
      }
      lines.push('');
    }

    // Truncation
    if (detail.truncation?.truncated && detail.truncation.warnings.length > 0) {
      lines.push(`**${c.mdDiagTruncationWarnings}**`);
      for (const w of detail.truncation.warnings) {
        lines.push(`  - ${w}`);
      }
      lines.push('');
    }

    // Active filters
    if (hasActiveFilters) {
      lines.push(c.mdDiagActiveFilters(filterSummary));
      lines.push('');
    }

    // Selected node
    if (selectedNode) {
      lines.push(c.mdDiagSelectedNode(selectedNode.title));
      lines.push(`  - ${c.mdNodeId(selectedNode.nodeId)}`);
      lines.push(`  - ${c.mdNodeType(selectedNode.nodeType)}`);
    }

    // Safety note
    lines.push('');
    lines.push(c.mdDiagSafetyNote);

    return lines.join('\n');
  }, [detail, graph, graphDetail, nodeEvidenceMap, cues, hasActiveFilters, filterSummary, selectedNode, copy]);

  // ── Render ────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="card gd-panel">
        <h3 className="card-title">{copy.graphDetail.title}</h3>
        <div className="card-body">
          <span className="dimmed">{copy.graphDetail.loadingDetail}</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card gd-panel">
        <h3 className="card-title">{copy.graphDetail.title}</h3>
        <div className="card-body">
          <div className="gd-error">
            <span className="gd-error-msg">{error}</span>
            <div className="gd-error-actions">
              <button className="refresh-button" onClick={onRetry}>{copy.graphDetail.retry}</button>
              <button className="gd-close-btn" onClick={onClose}>{copy.graphDetail.close}</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!graphDetail || !graphDetail.selectedBlueprint) {
    return null;
  }

  const { graph: graphData } = graphDetail.selectedBlueprint;
  const { detail: detailData } = graphData;

  return (
    <div className="card gd-panel">
      <div className="gd-header">
        <h3 className="card-title">{copy.graphDetail.title}</h3>
        <div className="gd-header-actions">
          <button className="gd-copy-btn" onClick={() => handleCopy(buildGraphSummaryText(), 'graph summary')}>
            {copy.graphDetail.copyGraphSummary}
          </button>
          {selectedNode && (
            <button className="gd-copy-btn" onClick={() => handleCopy(buildNodeSummaryText(), 'node summary')}>
              {copy.graphDetail.copySelectedNode}
            </button>
          )}
          <button className="gd-copy-btn" onClick={() => handleCopy(diagReportText, 'diagnostic report')}>
            {copy.graphDetail.copyDiagnosticReport}
          </button>
          <button className="gd-close-btn" onClick={onClose}>{copy.graphDetail.close}</button>
        </div>
      </div>

      {copyStatus && (
        <div className={`gd-copy-status ${copyStatus !== copy.graphDetail.copyFailed ? 'gd-copy-ok' : 'gd-copy-error'}`}>
          {copyStatus}
        </div>
      )}

      <div className="card-body">
        <SummaryStrip
          detail={detailData}
          graphName={graphData.name}
          graphKind={graphData.kind}
          nodeEvidenceMap={nodeEvidenceMap}
          filterSummary={filterSummary}
          copy={copy}
        />

        {/* ── E52: Diagnostic Workbench Sections ── */}
        <DiagSection title={copy.graphDetail.diagOverviewTitle}>
          <div className="gd-diag-grid">
            <div className="gd-diag-item">
              <span className="gd-diag-label">{copy.graphDetail.nodesLabel}</span>
              <span className="gd-diag-value">{detailData.nodes.length}</span>
            </div>
            <div className="gd-diag-item">
              <span className="gd-diag-label">{copy.graphDetail.linksCount}</span>
              <span className="gd-diag-value">{detailData.links.length}</span>
            </div>
            <div className="gd-diag-item">
              <span className="gd-diag-label">{copy.graphDetail.pinsLabel}</span>
              <span className="gd-diag-value">
                {detailData.nodes.reduce((s, n) => s + n.pins.length, 0)}
              </span>
            </div>
            <div className="gd-diag-item">
              <span className="gd-diag-label">{copy.graphDetail.statusLabel}</span>
              <span className="gd-diag-value">
                {(detailData.nodes.filter(n => n.errorType === 'error').length > 0) && (
                  <span className="gd-summary-badge gd-summary-err">
                    {copy.graphDetail.errorCount(detailData.nodes.filter(n => n.errorType === 'error').length)}
                  </span>
                )}
                {(detailData.nodes.filter(n => n.errorType === 'warning').length > 0) && (
                  <span className="gd-summary-badge gd-summary-warn">
                    {copy.graphDetail.warnCount(detailData.nodes.filter(n => n.errorType === 'warning').length)}
                  </span>
                )}
                {(detailData.nodes.filter(n => n.isDisabled === true).length > 0) && (
                  <span className="gd-summary-badge gd-summary-dis">
                    {copy.graphDetail.disCount(detailData.nodes.filter(n => n.isDisabled === true).length)}
                  </span>
                )}
              </span>
            </div>
            <div className="gd-diag-item">
              <span className="gd-diag-label">{copy.graphDetail.evidenceSection}</span>
              <span className="gd-diag-value">
                {detailData.nodes.filter(n => (nodeEvidenceMap?.[n.nodeId]?.length ?? 0) > 0).length}
              </span>
            </div>
            <div className="gd-diag-item">
              <span className="gd-diag-label">{copy.graphDetail.truncatedLabel}</span>
              <span className="gd-diag-value" style={detailData.truncation?.truncated ? { color: 'var(--accent-warn)' } : undefined}>
                {detailData.truncation?.truncated ? copy.common.yes : copy.common.no}
              </span>
            </div>
            <div className="gd-diag-item">
              <span className="gd-diag-label">{copy.common.unknown}</span>
              <span className="gd-diag-value">
                {(() => {
                  const unkCount = detailData.nodes.filter(n => n.nodeType === 'unknown').length;
                  return unkCount > 0
                    ? <span className="gd-diag-unknown-badge">{copy.graphDetail.diagUnknownNodes(unkCount, percentOf(unkCount, detailData.nodes.length))}</span>
                    : '0';
                })()}
              </span>
            </div>
          </div>
        </DiagSection>

        <NodeTypeDistribution nodes={detailData.nodes} copy={copy} />
        <TypeGroupDistribution nodes={detailData.nodes} copy={copy} />
        <InspectionCues
          cues={cues}
          onFilter={key => {
            switch (key) {
              case 'error': setStatusFilter('error'); break;
              case 'warning': setStatusFilter('warning'); break;
              case 'disabled': setStatusFilter('disabled'); break;
              case 'unknown': setNodeTypeFilter('unknown'); break;
              default: {
                // For complex cues (isolated, unconnected), use the cueFilter function
                const entryTypes = new Set(['event', 'custom_event', 'input_action', 'input_key', 'function_entry']);
                if (key === 'isolated') {
                  const linkNodeIds = new Set(detailData.links.flatMap(l => [l.sourceNodeId, l.targetNodeId]));
                  setCueFilter(() => (n: NodeInfo) => !entryTypes.has(n.nodeType) && !linkNodeIds.has(n.nodeId));
                }
                else if (key === 'unconnected_exec') setCueFilter(() => (n: NodeInfo) => n.pins.some(p => p.direction === 'output' && p.pinKind === 'execute' && !p.isConnected));
                else if (key === 'unconnected_data') setCueFilter(() => (n: NodeInfo) => n.pins.some(p => p.direction === 'input' && p.pinKind === 'data' && !p.isConnected));
                break;
              }
            }
          }}
          copy={copy}
        />

        {detailData.truncation?.truncated && (
          <div className="gd-truncation-warning">
            {detailData.truncation.warnings.map((w, i) => (
              <div key={i} className="gd-truncation-msg">{w}</div>
            ))}
          </div>
        )}

        <InspectionControls
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          evidenceFilter={evidenceFilter}
          onEvidenceFilterChange={setEvidenceFilter}
          pinFilter={pinFilter}
          onPinFilterChange={setPinFilter}
          sortMode={sortMode}
          onSortChange={setSortMode}
          nodeTypeFilter={nodeTypeFilter}
          onNodeTypeFilterChange={setNodeTypeFilter}
          groupFilter={groupFilter}
          onGroupFilterChange={setGroupFilter}
          availableNodeTypes={availableNodeTypes}
          filteredCount={filteredNodes.length}
          totalCount={detailData.nodes.length}
          onResetFilters={handleResetFilters}
          onExpandAllShown={handleExpandAllShown}
          onCollapseAllShown={handleCollapseAllShown}
          onExpandStatusNodes={handleExpandStatusNodes}
          onExpandEvidenceNodes={handleExpandEvidenceNodes}
          hasStatusNodes={hasStatusNodes}
          hasEvidenceNodes={hasEvidenceNodes}
          copy={copy}
        />

        {selectedNode && (
          <SelectedNodeDetail
            node={selectedNode}
            evidence={nodeEvidenceMap?.[selectedNode.nodeId]}
            links={detailData.links}
            allNodes={detailData.nodes}
            onQueueNode={onQueueNode}
            copy={copy}
          />
        )}

        <div className="gd-nodes-section">
          <h4 className="gd-subtitle">{copy.graphDetail.nodesLabel}</h4>
          {filteredNodes.length === 0 ? (
            <div className="gd-empty-state">
              {hasActiveFilters
                ? copy.graphDetail.noNodesMatch
                : copy.graphDetail.noNodesInGraph}
            </div>
          ) : (
            <div className="gd-table-wrap">
              <table className="gd-table gd-nodes-table">
                <thead>
                  <tr>
                    <th></th>
                    <th>{copy.graphDetail.titleHeader}</th>
                    <th>{copy.common.type}</th>
                    <th>{copy.common.status}</th>
                    <th>{copy.graphDetail.evidenceSection}</th>
                    <th>{copy.graphDetail.idHeader}</th>
                    <th>{copy.graphDetail.pinsHeader}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredNodes.map(node => (
                    <NodeRow
                      key={node.nodeId}
                      node={node}
                      isExpanded={expandedNodes.has(node.nodeId)}
                      isFocused={focusedNodeId === node.nodeId}
                      isSelected={selectedNodeId === node.nodeId}
                      onToggle={() => handleToggleNode(node.nodeId)}
                      evidence={nodeEvidenceMap?.[node.nodeId]}
                      copy={copy}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <LinksSection links={detailData.links} copy={copy} />

        {/* ── E52: Diagnostic Report Preview ── */}
        <div className="gd-report-preview">
          <div className="gd-diag-collapsible-header" onClick={() => setShowReportPreview(prev => !prev)}>
            <span style={{ fontSize: '0.70rem', color: 'var(--text-dimmed)' }}>
              {showReportPreview ? '▼' : '▶'}
            </span>
            <h4 className="gd-subtitle" style={{ margin: 0 }}>{copy.graphDetail.diagnosticReportTitle}</h4>
          </div>
          {showReportPreview && (
            <textarea
              className="gd-report-text"
              readOnly
              value={diagReportText}
            />
          )}
        </div>
      </div>
    </div>
  );
}
