// ── Evidence Source Kind ────────────────────────────────────────

export type EvidenceSourceKind =
  | 'compile_issue'
  | 'recent_log'
  | 'blueprint_graph'
  | 'graph_detail'
  | 'blueprint_meta'
  | 'current_asset';

// ── Evidence Source ─────────────────────────────────────────────

export interface EvidenceSource {
  kind: EvidenceSourceKind;
  /** 数据来源端点路径 */
  endpoint: string;
  /** 数据抓取时间 ISO 8601 */
  fetchTime: string;
  /** 数组中的原始索引（如 lastErrors[2]） */
  rawIndex?: number;
}

// ── Severity ────────────────────────────────────────────────────

export type EvidenceSeverity = 'fatal' | 'error' | 'warning' | 'info' | 'unknown';

// ── Confidence ──────────────────────────────────────────────────

export type EvidenceConfidence = 'high' | 'medium' | 'low' | 'unresolved';

export interface ConfidenceAnnotation {
  level: EvidenceConfidence;
  /** 为什么是这个置信度 */
  reason: string;
  /** 如果置信度 < high，建议如何提升 */
  upgradePath?: string;
}

// ── Evidence Snippet ────────────────────────────────────────────

export interface EvidenceSnippet {
  /** 原始数据来源 */
  source: EvidenceSource;
  /** 数据摘要，用于列表展示（≤ 120 字符） */
  summary: string;
  /** 严重程度 */
  severity: EvidenceSeverity;
  /** 原始消息/描述正文 */
  message: string;
  /** 来源 category（如 compile issue code、log category） */
  category?: string;
  /** 行号（如果原始数据有） */
  line?: number;
  /** 列号（如果原始数据有） */
  column?: number;
  /** 资产路径（如果原始数据包含或可推断） */
  assetPath?: string;
}

// ── References ──────────────────────────────────────────────────

export interface AssetReference {
  /** 资产路径，如 /Game/Blueprints/BP_Player */
  assetPath: string;
  /** 资产名称 */
  assetName: string;
  /** 资产类名，如 Blueprint / AnimBlueprint */
  assetClass?: string;
  /** 引用置信度 */
  confidence: EvidenceConfidence;
  /** 关联方式：如何得出这个引用 */
  associationMethod: string;
}

export interface GraphReference {
  /** Graph ID，格式 "{kind}::{name}"，如 "event::EventGraph" */
  graphId: string;
  /** Graph 显示名称 */
  graphName: string;
  /** Graph 类型 */
  graphKind: string;
  /** 所属 Blueprint 的资产路径 */
  assetPath: string;
  /** 引用置信度 */
  confidence: EvidenceConfidence;
  /** 关联方式 */
  associationMethod: string;
}

export interface NodeReference {
  /** 节点 ID（graph detail 内的临时 ID） */
  nodeId: string;
  /** UE NodeGuid，可选；仅在从 graph detail 交叉验证时填充 */
  nodeGuid?: string;
  /** 节点标题 */
  nodeTitle: string;
  /** 节点类型 */
  nodeType: string;
  /** 所属 Graph ID */
  graphId: string;
  /** 引用置信度 */
  confidence: EvidenceConfidence;
  /** 关联方式 */
  associationMethod: string;
}

export interface PinReference {
  pinId: string;
  pinName: string;
  direction: 'input' | 'output';
  /** UE UEdGraphPin::PinId，可选；仅在从 graph detail 交叉验证时填充 */
  pinGuid?: string;
  nodeId: string;
  graphId: string;
  /** 引用置信度 — 通常为 low/medium，因为当前无结构化 pin→issue 映射 */
  confidence: EvidenceConfidence;
  associationMethod: string;
}

/** 证据引用的联合类型，表示任一资产/graph/node/pin 引用 */
export type EvidenceReference = AssetReference | GraphReference | NodeReference | PinReference;

// ── Evidence Chain ──────────────────────────────────────────────

export interface EvidenceChainItem {
  /** 证据唯一 ID（session 内临时） */
  evidenceId: string;
  /** 证据片段数据 */
  snippet: EvidenceSnippet;
  /** 关联到的资产 */
  assetRef?: AssetReference;
  /** 关联到的 graph */
  graphRef?: GraphReference;
  /** 关联到的节点 */
  nodeRef?: NodeReference;
  /** 关联到的引脚 */
  pinRef?: PinReference;
  /** 此条证据的置信度 */
  confidence: ConfidenceAnnotation;
  /** 建议的下一步检查动作（人工可执行） */
  suggestedNextInspection: string;
}

export interface EvidenceChain {
  /** 证据链唯一 ID */
  chainId: string;
  /** 诊断问题的简短标题 */
  title: string;
  /** 问题创建时间 ISO 8601 */
  createdAt: string;
  /** 当前数据源快照时间 ISO 8601 */
  snapshotTime: string;
  /** 证据链各项 */
  items: EvidenceChainItem[];
  /** 本链的整体置信度（取各项最低值） */
  overallConfidence: EvidenceConfidence;
  /** 是否包含 unresolved 证据（置信度为 unresolved 的项数） */
  unresolvedCount: number;
  /** 建议的整体诊断方向（面向用户的可操作指引） */
  suggestedDiagnosisDirection: string;
}
