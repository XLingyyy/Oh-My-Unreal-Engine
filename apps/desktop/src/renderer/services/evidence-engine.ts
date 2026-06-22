import type {
  EvidenceChain,
  EvidenceChainItem,
  EvidenceSource,
  EvidenceSnippet,
  EvidenceSeverity,
  EvidenceConfidence,
  ConfidenceAnnotation,
  AssetReference,
  GraphReference,
  NodeReference,
  PinReference,
  OmueContextSnapshot,
  CompileIssue,
  LogEntry,
  BlueprintGraphDetailData,
  BlueprintGraphExport,
  BlueprintSummary,
  NodeInfo,
} from '@omue/shared-protocol';

// ── Input ────────────────────────────────────────────────────

interface EvidenceEngineInput {
  snapshot: OmueContextSnapshot;
  graphDetail?: BlueprintGraphDetailData | null;
}

// ── Extracted context ────────────────────────────────────────

interface ExtractedContext {
  knownAssetPaths: Array<{ path: string; name: string; assetClass?: string }>;
  knownBlueprintNames: string[];
  blueprintGraphs: BlueprintGraphExport | null;
  knownGraphs: Array<{ name: string; graphId: string; kind: string; assetPath: string }>;
  knownNodes: Array<{ title: string; nodeId: string; nodeType: string; graphId: string }>;
}

// ── Limits ───────────────────────────────────────────────────

const MAX_COMPILE_ISSUES = 20;
const MAX_LOG_CANDIDATES = 20;
const MAX_CHAINS = 20;

// ── Log categories relevant to Blueprint diagnostics ─────────

const BLUEPRINT_RELEVANT_CATEGORIES = [
  'logblueprint',
  'logcompile',
  'logscript',
  'logkismet',
  'loglinker',
  'logclass',
  'logasset',
];

// ── Helpers ──────────────────────────────────────────────────

function normalizePath(p: string): string {
  return p.trim().toLowerCase().replace(/\\/g, '/');
}

/** Check if `file` matches a known asset path. */
function isAssetPathMatch(file: string, knownPath: string): boolean {
  const nf = normalizePath(file);
  const np = normalizePath(knownPath);
  if (nf === np) return true;
  // Suffix match in either direction
  if (nf.endsWith(np) || np.endsWith(nf)) return true;
  // Substring match for substantial paths
  if (np.length > 10 && nf.includes(np)) return true;
  return false;
}

/** Check if `file` looks like a UE content path (starts with /Game/ or /Engine/). */
function looksLikeUeContentPath(file: string): boolean {
  const nf = normalizePath(file);
  return nf.startsWith('/game/') || nf.startsWith('/engine/');
}

function extractAssetName(path: string): string {
  const segments = normalizePath(path).split('/').filter(Boolean);
  return segments.length > 0 ? segments[segments.length - 1] : path;
}

function compileSeverityToEvidenceSeverity(severity: 'error' | 'warning'): EvidenceSeverity {
  return severity;
}

function logVerbosityToEvidenceSeverity(verbosity: string): EvidenceSeverity {
  switch (verbosity) {
    case 'fatal': return 'fatal';
    case 'error': return 'error';
    case 'warning': return 'warning';
    default: return 'info';
  }
}

function minConfidence(a: EvidenceConfidence, b: EvidenceConfidence): EvidenceConfidence {
  const order: Record<EvidenceConfidence, number> = {
    high: 3,
    medium: 2,
    low: 1,
    unresolved: 0,
  };
  return order[a] <= order[b] ? a : b;
}

function isLogRelevant(entry: LogEntry): boolean {
  const verb = entry.verbosity;
  if (verb === 'fatal' || verb === 'error' || verb === 'warning') return true;
  const cat = entry.category.toLowerCase();
  return BLUEPRINT_RELEVANT_CATEGORIES.some(c => cat.includes(c));
}

// ── Context extraction ───────────────────────────────────────

function extractContext(snapshot: OmueContextSnapshot, graphDetail?: BlueprintGraphDetailData | null): ExtractedContext {
  const knownAssetPaths: Array<{ path: string; name: string; assetClass?: string }> = [];
  const knownBlueprintNames: string[] = [];

  // From currentAsset
  if (snapshot.currentAsset) {
    const ca = snapshot.currentAsset;
    knownAssetPaths.push({ path: ca.assetPath, name: ca.assetName, assetClass: ca.assetClass });
    knownAssetPaths.push({ path: ca.packagePath, name: ca.assetName, assetClass: ca.assetClass });
    knownBlueprintNames.push(ca.assetName);
  }

  // From blueprintSummary
  const bpSummary: BlueprintSummary | null = snapshot.blueprintSummary ?? null;
  if (bpSummary) {
    knownAssetPaths.push({ path: bpSummary.packagePath, name: bpSummary.name, assetClass: bpSummary.assetClass });
    knownAssetPaths.push({ path: bpSummary.objectPath, name: bpSummary.name, assetClass: bpSummary.assetClass });
    knownBlueprintNames.push(bpSummary.name);
  }

  // From blueprintGraphs
  const bpGraphs: BlueprintGraphExport | null = snapshot.blueprintGraphs ?? null;
  if (bpGraphs) {
    knownAssetPaths.push({ path: bpGraphs.exportMeta.assetPath, name: bpGraphs.blueprint.name, assetClass: bpGraphs.blueprint.assetClass });
    knownAssetPaths.push({ path: bpGraphs.blueprint.packagePath, name: bpGraphs.blueprint.name, assetClass: bpGraphs.blueprint.assetClass });
    knownBlueprintNames.push(bpGraphs.blueprint.name);
  }

  // Deduplicate names
  const uniqueNames = [...new Set(knownBlueprintNames.filter(n => n.length > 0))];
  // Deduplicate paths
  const seen = new Set<string>();
  const uniquePaths = knownAssetPaths.filter(p => {
    const key = normalizePath(p.path);
    if (seen.has(key)) return false;
    seen.add(key);
    return p.path.length > 0;
  });

  // Known graphs
  const knownGraphs: Array<{ name: string; graphId: string; kind: string; assetPath: string }> = [];
  if (bpGraphs) {
    const ap = bpGraphs.exportMeta.assetPath;
    for (const g of bpGraphs.graphs) {
      knownGraphs.push({ name: g.name, graphId: g.graphId, kind: g.kind, assetPath: ap });
    }
  }

  // Known nodes from graphDetail
  const knownNodes: Array<{ title: string; nodeId: string; nodeType: string; graphId: string }> = [];
  if (graphDetail?.selectedBlueprint) {
    const gd = graphDetail.selectedBlueprint;
    for (const node of gd.graph.detail.nodes) {
      if (node.title && node.title.length > 1) {
        knownNodes.push({
          title: node.title,
          nodeId: node.nodeId,
          nodeType: node.nodeType,
          graphId: gd.requestedGraphId,
        });
      }
    }
  }

  return {
    knownAssetPaths: uniquePaths,
    knownBlueprintNames: uniqueNames,
    blueprintGraphs: bpGraphs,
    knownGraphs,
    knownNodes,
  };
}

// ── Reference builders ───────────────────────────────────────

function tryMatchAssetPath(
  file: string | undefined,
  ctx: ExtractedContext,
): AssetReference | null {
  if (!file || file.length === 0) return null;
  for (const ap of ctx.knownAssetPaths) {
    if (isAssetPathMatch(file, ap.path)) {
      const confidence: EvidenceConfidence = looksLikeUeContentPath(file) ? 'high' : 'medium';
      return {
        assetPath: ap.path,
        assetName: ap.name,
        assetClass: ap.assetClass,
        confidence,
        associationMethod: `exact:asset_path_match(file=${file}, target=${ap.path})`,
      };
    }
  }
  return null;
}

function findNameMatches(text: string, names: string[]): string[] {
  if (!text || names.length === 0) return [];
  const lower = text.toLowerCase();
  return names.filter(name => {
    const nl = name.toLowerCase();
    // Require name length >= 3 to avoid false positives on short names
    return nl.length >= 3 && lower.includes(nl);
  });
}

function tryMatchBlueprintName(
  message: string,
  ctx: ExtractedContext,
): AssetReference | null {
  const matched = findNameMatches(message, ctx.knownBlueprintNames);
  if (matched.length === 0) return null;
  // Use the first matching blueprint (best-effort)
  const name = matched[0];
  // Find corresponding path
  const pathEntry = ctx.knownAssetPaths.find(
    ap => ap.name.toLowerCase() === name.toLowerCase(),
  );
  return {
    assetPath: pathEntry?.path ?? `/Game/Blueprints/${name}`,
    assetName: name,
    assetClass: pathEntry?.assetClass,
    confidence: 'low',
    associationMethod: `heuristic:name_match(pattern="${name}", source=message)`,
  };
}

function tryMatchGraphName(
  message: string,
  ctx: ExtractedContext,
): GraphReference | null {
  const graphNames = ctx.knownGraphs.map(g => g.name);
  const matched = findNameMatches(message, graphNames);
  if (matched.length === 0) return null;
  const name = matched[0];
  const graph = ctx.knownGraphs.find(g => g.name.toLowerCase() === name.toLowerCase())!;
  return {
    graphId: graph.graphId,
    graphName: graph.name,
    graphKind: graph.kind,
    assetPath: graph.assetPath,
    confidence: 'low',
    associationMethod: `heuristic:name_match(pattern="${name}", source=message)`,
  };
}

function tryMatchNodeTitles(
  message: string,
  ctx: ExtractedContext,
): NodeReference | null {
  if (ctx.knownNodes.length === 0) return null;
  const nodeTitles = [...new Set(ctx.knownNodes.map(n => n.title))];
  const matched = findNameMatches(message, nodeTitles);
  if (matched.length === 0) return null;
  const title = matched[0];
  const node = ctx.knownNodes.find(n => n.title.toLowerCase() === title.toLowerCase())!;
  const candidateCount = ctx.knownNodes.filter(
    n => n.title.toLowerCase() === title.toLowerCase(),
  ).length;
  const ambiguityNote = candidateCount > 1 ? ` (${candidateCount} candidate nodes)` : '';
  return {
    nodeId: node.nodeId,
    nodeTitle: node.title,
    nodeType: node.nodeType,
    graphId: node.graphId,
    confidence: 'low',
    associationMethod: `heuristic:name_match(pattern="${title}", source=message)${ambiguityNote}`,
  };
}

// ── Item builder ─────────────────────────────────────────────

function buildEvidenceItem(params: {
  evidenceId: string;
  kind: 'compile_issue' | 'recent_log';
  endpoint: string;
  fetchTime: string;
  rawIndex: number;
  summary: string;
  severity: EvidenceSeverity;
  message: string;
  category?: string;
  line?: number;
  column?: number;
  assetPath?: string;
  assetRef?: AssetReference | null;
  graphRef?: GraphReference | null;
  nodeRef?: NodeReference | null;
  /** 来自 compile issue ↔ graph detail node 交叉验证的 high-confidence nodeRef */
  correlationNodeRef?: NodeReference | null;
  /** 来自已匹配 node 内唯一 pin name 命中的 medium-confidence pinRef */
  correlationPinRef?: PinReference | null;
}): EvidenceChainItem {
  const source: EvidenceSource = {
    kind: params.kind,
    endpoint: params.endpoint,
    fetchTime: params.fetchTime,
    rawIndex: params.rawIndex,
  };

  const snippet: EvidenceSnippet = {
    source,
    summary: params.summary,
    severity: params.severity,
    message: params.message,
    category: params.category,
    line: params.line,
    column: params.column,
    assetPath: params.assetPath,
  };

  // Determine item confidence
  let level: EvidenceConfidence = 'unresolved';
  if (params.correlationNodeRef) {
    // Cross-validated with graph detail node status → high confidence
    level = 'high';
  } else if (params.assetRef?.confidence === 'high') {
    level = 'high';
  } else if (params.assetRef || params.graphRef || params.nodeRef) {
    level = 'low';
  }

  const refs: string[] = [];
  if (params.assetRef) refs.push('asset');
  if (params.graphRef) refs.push('graph');
  if (params.nodeRef) refs.push('node');
  if (params.correlationNodeRef) refs.push('node(cross_validation)');
  if (params.correlationPinRef) refs.push('pin(context)');

  let reason: string;
  let upgradePath: string | undefined;
  let suggestedNext: string;

  if (params.correlationNodeRef) {
    reason = `Compile issue message uniquely matched node "${params.correlationNodeRef.nodeTitle}" error message in loaded graph detail. This is a fact cross-validation — not a heuristic match.`;
    upgradePath = undefined;
    if (params.correlationPinRef) {
      suggestedNext = `Open graph "${params.correlationNodeRef.graphId}" in UE Editor and inspect node "${params.correlationNodeRef.nodeTitle}" — pin "${params.correlationPinRef.pinName}" is a contextual hint (medium confidence, not a direct UE compile pin mapping).`;
    } else {
      suggestedNext = `Open graph "${params.correlationNodeRef.graphId}" in UE Editor and inspect node "${params.correlationNodeRef.nodeTitle}".`;
    }
  } else if (level === 'high') {
    reason = `CompileIssue.file contains exact asset path matching current Blueprint.`;
    upgradePath = undefined;
    suggestedNext = `Open this Blueprint in UE Editor and inspect for compilation issues related to the error message.`;
  } else if (level === 'low') {
    reason = `Associations based on heuristic text matching (${refs.join(', ')}). These are not confirmed structural references.`;
    upgradePath = 'Load graph detail and manually inspect the referenced areas to verify the association.';
    if (params.graphRef) {
      suggestedNext = `Open graph "${params.graphRef.graphName}" in UE Editor and manually inspect nodes.`;
    } else if (params.nodeRef) {
      const ambiguity = params.nodeRef.associationMethod.includes('candidate nodes')
        ? ' Multiple candidate nodes exist — inspect all matching nodes.'
        : '';
      suggestedNext = `Inspect node "${params.nodeRef.nodeTitle}" in graph ${params.nodeRef.graphId}.${ambiguity}`;
    } else {
      suggestedNext = `Open the Blueprint in UE Editor and manually inspect for related issues.`;
    }
  } else {
    reason = 'No structured reference could be derived from the available data. CompileIssue type lacks graphRef/nodeRef fields.';
    upgradePath = 'May require a UE version upgrade or richer structured-reference support.';
    suggestedNext = 'Cannot auto-navigate. Manually inspect the Blueprint in UE Editor for related issues.';
  }

  return {
    evidenceId: params.evidenceId,
    snippet,
    assetRef: params.assetRef ?? undefined,
    graphRef: params.graphRef ?? undefined,
    nodeRef: params.correlationNodeRef ?? params.nodeRef ?? undefined,
    pinRef: params.correlationPinRef ?? undefined,
    confidence: { level, reason, upgradePath },
    suggestedNextInspection: suggestedNext,
  };
}

// ── Compile issue ↔ graph detail node correlation ───────────

interface CorrelationResult {
  nodeRef: NodeReference | null;
  pinRef: PinReference | null;
}

/**
 * 比较 compile issue 与已加载 graph detail 中的 node error 状态。
 *
 * 仅在唯一匹配时输出 high-confidence nodeRef；匹配到多个 node 时不输出。
 * 仅在已匹配 node 中唯一 pin name 命中时输出 medium-confidence pinRef。
 * 未加载 graph detail 时直接返回 null。
 */
function correlateCompileIssueWithGraphDetail(
  issue: CompileIssue,
  graphDetail: BlueprintGraphDetailData,
): CorrelationResult {
  const gd = graphDetail?.selectedBlueprint;
  if (!gd) return { nodeRef: null, pinRef: null };

  const nodes = gd.graph.detail.nodes;
  if (nodes.length === 0) return { nodeRef: null, pinRef: null };

  const expectedErrorType = issue.severity === 'error' ? 'error' : 'warning';

  // Stage 1: find candidate nodes where errorMessage relates to issue.message
  const candidates: Array<{ node: NodeInfo; matchType: 'exact' | 'contains' | 'normalized_exact' | 'normalized_contains' }> = [];

  for (const node of nodes) {
    if (!node.errorMessage || node.errorMessage.length === 0) continue;
    // Node must have an error type compatible with issue severity
    if (node.errorType !== expectedErrorType) continue;

    const nodeMsg = node.errorMessage.trim();
    const issueMsg = issue.message.trim();

    // Exact match (case-insensitive)
    if (nodeMsg.toLowerCase() === issueMsg.toLowerCase()) {
      candidates.push({ node, matchType: 'exact' });
      continue;
    }

    // One contains the other (require meaningful length)
    if (nodeMsg.length > 5 && issueMsg.length > 5) {
      if (nodeMsg.toLowerCase().includes(issueMsg.toLowerCase())) {
        candidates.push({ node, matchType: 'contains' });
        continue;
      }
      if (issueMsg.toLowerCase().includes(nodeMsg.toLowerCase())) {
        candidates.push({ node, matchType: 'contains' });
        continue;
      }
    }

    // Normalized match: strip "BP_Name: GraphName — " prefix from issue messages
    const normalizedIssue = issueMsg.replace(/^[^:—\-–]+\s*[—\-–]\s*/, '').trim();
    if (normalizedIssue.length > 3 && nodeMsg.length > 3) {
      if (normalizedIssue.toLowerCase() === nodeMsg.toLowerCase()) {
        candidates.push({ node, matchType: 'normalized_exact' });
      } else if (
        normalizedIssue.toLowerCase().includes(nodeMsg.toLowerCase()) ||
        nodeMsg.toLowerCase().includes(normalizedIssue.toLowerCase())
      ) {
        candidates.push({ node, matchType: 'normalized_contains' });
      }
    }
  }

  // Deduplicate by nodeId
  const uniqueCandidates = Array.from(
    new Map(candidates.map(c => [c.node.nodeId, c])).values(),
  );

  // No unique match → keep existing behavior
  if (uniqueCandidates.length !== 1) return { nodeRef: null, pinRef: null };

  const matched = uniqueCandidates[0];

  // Stage 2: build high-confidence nodeRef
  const nodeRef: NodeReference = {
    nodeId: matched.node.nodeId,
    nodeGuid: matched.node.nodeGuid,
    nodeTitle: matched.node.title,
    nodeType: matched.node.nodeType,
    graphId: gd.requestedGraphId,
    confidence: 'high',
    associationMethod: `fact_cross_validation:compile_issue+graph_detail_node_status(match=${matched.matchType})`,
  };

  // Stage 3: try unique pin name match in the matched node
  let pinRef: PinReference | null = null;
  const searchTexts = [issue.message.toLowerCase(), matched.node.errorMessage!.toLowerCase()];
  const pinNameMatches = matched.node.pins.filter((pin) => {
    const pn = pin.name.toLowerCase();
    const escaped = pn.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const boundaryRegex = new RegExp(`\\b${escaped}\\b`, 'i');
    return searchTexts.some(t => boundaryRegex.test(t));
  });

  if (pinNameMatches.length === 1) {
    const pin = pinNameMatches[0];
    pinRef = {
      pinId: pin.pinId,
      pinName: pin.name,
      direction: pin.direction,
      pinGuid: pin.pinGuid,
      nodeId: matched.node.nodeId,
      graphId: gd.requestedGraphId,
      confidence: 'medium',
      associationMethod: 'context:unique_pin_name_in_matched_node_error_message',
    };
  }

  return { nodeRef, pinRef };
}

// ── Main engine ──────────────────────────────────────────────

export function buildEvidenceChains(input: EvidenceEngineInput): EvidenceChain[] {
  const { snapshot, graphDetail } = input;
  const ctx = extractContext(snapshot, graphDetail);
  const chains: EvidenceChain[] = [];

  const snapshotTime = snapshot.capturedAt ?? new Date().toISOString();
  const fetchTime = snapshot.capturedAt ?? snapshotTime;

  // ── Compile issue chain ──────────────────────────────────

  const compileIssues: CompileIssue[] = (snapshot.compileStatus?.lastErrors ?? []).slice(0, MAX_COMPILE_ISSUES);
  const compileItems: EvidenceChainItem[] = [];

  for (let i = 0; i < compileIssues.length; i++) {
    const issue = compileIssues[i];
    const sev = compileSeverityToEvidenceSeverity(issue.severity);

    // Try asset path match from file
    const assetRef = tryMatchAssetPath(issue.file, ctx);

    // Try name-based matches on message
    const nameAssetRef = assetRef ? null : tryMatchBlueprintName(issue.message, ctx);
    const graphRef = tryMatchGraphName(issue.message, ctx);
    const heuristicNodeRef = tryMatchNodeTitles(issue.message, ctx);

    // Try cross-validation with loaded graph detail node status
    let correlationNodeRef: NodeReference | null = null;
    let correlationPinRef: PinReference | null = null;
    if (graphDetail) {
      const correlation = correlateCompileIssueWithGraphDetail(issue, graphDetail);
      correlationNodeRef = correlation.nodeRef;
      correlationPinRef = correlation.pinRef;
    }

    const finalAssetRef = assetRef ?? nameAssetRef;

    const summary = issue.file
      ? `Compile ${issue.severity} in ${issue.file}${issue.line ? `:${issue.line}` : ''}: ${issue.message.substring(0, 80)}`
      : `Compile ${issue.severity}: ${issue.message.substring(0, 80)}`;

    compileItems.push(
      buildEvidenceItem({
        evidenceId: `ev-compile-${i}`,
        kind: 'compile_issue',
        endpoint: '/compile/status',
        fetchTime,
        rawIndex: i,
        summary: summary.substring(0, 120),
        severity: sev,
        message: issue.message,
        category: issue.code,
        line: issue.line,
        column: issue.column,
        assetPath: issue.file,
        assetRef: finalAssetRef,
        graphRef,
        nodeRef: heuristicNodeRef,
        correlationNodeRef,
        correlationPinRef,
      }),
    );
  }

  if (compileItems.length > 0) {
    const overallConf = compileItems.reduce(
      (acc, item) => minConfidence(acc, item.confidence.level),
      'high' as EvidenceConfidence,
    );
    const unresolvedCount = compileItems.filter(
      item => item.confidence.level === 'unresolved',
    ).length;

    const direction = compileItems.some(item => item.confidence.level !== 'unresolved')
      ? 'Investigate the compile issues listed below. Start with high-confidence asset references, then inspect low-confidence heuristic matches.'
      : 'Compile issues detected but no structured references available. Manually inspect the Blueprint in UE Editor.';

    chains.push({
      chainId: `chain-compile-${snapshotTime}`,
      title: snapshot.compileStatus.lastCompileResult === 'failed'
        ? `Compile Failure — ${snapshot.compileStatus.errorCount} error(s), ${snapshot.compileStatus.warningCount} warning(s)`
        : `Compile Issues — ${snapshot.compileStatus.errorCount} error(s), ${snapshot.compileStatus.warningCount} warning(s)`,
      createdAt: snapshot.compileStatus.lastCompileTime ?? snapshotTime,
      snapshotTime,
      items: compileItems,
      overallConfidence: overallConf,
      unresolvedCount,
      suggestedDiagnosisDirection: direction,
    });
  }

  // ── Log chain ────────────────────────────────────────────

  const logCandidates: LogEntry[] = (snapshot.recentLogs ?? [])
    .filter(isLogRelevant)
    .slice(0, MAX_LOG_CANDIDATES);

  const logItems: EvidenceChainItem[] = [];

  for (let i = 0; i < logCandidates.length; i++) {
    const entry = logCandidates[i];
    const sev = logVerbosityToEvidenceSeverity(entry.verbosity);

    const assetRef = tryMatchBlueprintName(entry.message, ctx);
    const graphRef = tryMatchGraphName(entry.message, ctx);
    const nodeRef = tryMatchNodeTitles(entry.message, ctx);

    const summary = `[${entry.category}] ${entry.message.substring(0, 80)}`;

    logItems.push(
      buildEvidenceItem({
        evidenceId: `ev-log-${i}`,
        kind: 'recent_log',
        endpoint: '/logs/recent',
        fetchTime,
        rawIndex: i,
        summary: summary.substring(0, 120),
        severity: sev,
        message: entry.message,
        category: entry.category,
        line: entry.lineNumber,
        assetRef,
        graphRef,
        nodeRef,
      }),
    );
  }

  if (logItems.length > 0) {
    const overallConf = logItems.reduce(
      (acc, item) => minConfidence(acc, item.confidence.level),
      'high' as EvidenceConfidence,
    );
    const unresolvedCount = logItems.filter(
      item => item.confidence.level === 'unresolved',
    ).length;

    const errorCount = logItems.filter(i => i.snippet.severity === 'error' || i.snippet.severity === 'fatal').length;
    const warnCount = logItems.filter(i => i.snippet.severity === 'warning').length;

    chains.push({
      chainId: `chain-log-${snapshotTime}`,
      title: `Recent Logs — ${errorCount} error(s), ${warnCount} warning(s)`,
      createdAt: logCandidates[0]?.timestamp ?? snapshotTime,
      snapshotTime,
      items: logItems,
      overallConfidence: overallConf,
      unresolvedCount,
      suggestedDiagnosisDirection: 'Review the log entries below for potential Blueprint or compile-related issues. Heuristic matches marked LOW should be verified manually.',
    });
  }

  // ── Graph detail node status chain ──────────────────────────

  const gd = graphDetail?.selectedBlueprint;
  if (gd) {
    const gdItems: EvidenceChainItem[] = [];
    const detailNodes = gd.graph.detail.nodes;

    for (let i = 0; i < detailNodes.length; i++) {
      const node = detailNodes[i];
      const hasError = node.errorType === 'error';
      const hasWarning = node.errorType === 'warning';
      const isDisabledOnly = node.isDisabled === true && !hasError && !hasWarning;

      if (!hasError && !hasWarning && !isDisabledOnly) continue;

      let sev: EvidenceSeverity;
      let message: string;
      let summary: string;

      if (hasError) {
        sev = 'error';
        message = node.errorMessage && node.errorMessage.length > 0
          ? node.errorMessage
          : `Node "${node.title}" has an unresolved compile error`;
        summary = `Error on "${node.title}" (${node.nodeType})`;
      } else if (hasWarning) {
        sev = 'warning';
        message = node.errorMessage && node.errorMessage.length > 0
          ? node.errorMessage
          : `Node "${node.title}" has a compile warning`;
        summary = `Warning on "${node.title}" (${node.nodeType})`;
      } else {
        sev = 'info';
        message = `Node "${node.title}" is disabled and will not execute`;
        summary = `Disabled node: "${node.title}" (${node.nodeType})`;
      }

      const nodeRef: NodeReference = {
        nodeId: node.nodeId,
        nodeTitle: node.title,
        nodeType: node.nodeType,
        graphId: gd.requestedGraphId,
        confidence: 'high',
        associationMethod: 'direct:graph_detail_node_status',
      };

      const graphRef: GraphReference = {
        graphId: gd.graph.graphId,
        graphName: gd.graph.name,
        graphKind: gd.graph.kind,
        assetPath: gd.exportMeta.assetPath,
        confidence: 'high',
        associationMethod: 'direct:graph_detail_loaded_graph',
      };

      const assetRef: AssetReference = {
        assetPath: gd.exportMeta.assetPath,
        assetName: gd.blueprintName,
        confidence: 'high',
        associationMethod: 'direct:graph_detail_loaded_blueprint',
      };

      let suggestedNext: string;
      if (hasError) {
        suggestedNext = `Open graph "${gd.graph.name}" in UE Editor and inspect node "${node.title}". Check for disconnected pins, invalid function calls, or missing variable references.`;
      } else if (hasWarning) {
        suggestedNext = `Open graph "${gd.graph.name}" in UE Editor and inspect node "${node.title}". Review the warning and verify node configuration.`;
      } else {
        suggestedNext = `Open graph "${gd.graph.name}" in UE Editor and inspect disabled node "${node.title}". Consider whether this node should be re-enabled or removed.`;
      }

      gdItems.push({
        evidenceId: `ev-gd-${i}`,
        snippet: {
          source: {
            kind: 'graph_detail',
            endpoint: '/context/blueprint-graph-detail',
            fetchTime,
            rawIndex: i,
          },
          summary: summary.substring(0, 120),
          severity: sev,
          message,
        },
        assetRef,
        graphRef,
        nodeRef,
        confidence: {
          level: 'high',
          reason: `Direct node status field from loaded graph detail for "${gd.graph.name}".`,
        },
        suggestedNextInspection: suggestedNext,
      });
    }

    if (gdItems.length > 0) {
      const errorCount = gdItems.filter(i => i.snippet.severity === 'error').length;
      const warnCount = gdItems.filter(i => i.snippet.severity === 'warning').length;
      const disabledCount = gdItems.filter(i => i.snippet.severity === 'info').length;

      const parts: string[] = [];
      if (errorCount > 0) parts.push(`${errorCount} error(s)`);
      if (warnCount > 0) parts.push(`${warnCount} warning(s)`);
      if (disabledCount > 0) parts.push(`${disabledCount} disabled`);

      chains.push({
        chainId: `chain-gd-${snapshotTime}`,
        title: `Graph "${gd.graph.name}" Node Status — ${parts.join(', ')}`,
        createdAt: gd.exportMeta.exportedAt ?? snapshotTime,
        snapshotTime,
        items: gdItems,
        overallConfidence: 'high',
        unresolvedCount: 0,
        suggestedDiagnosisDirection: `Graph "${gd.graph.name}" contains nodes with diagnostic status. Manually inspect these nodes in the UE Editor — do not attempt to auto-fix or auto-modify Blueprint assets.`,
      });
    }
  }

  return chains.slice(0, MAX_CHAINS);
}
