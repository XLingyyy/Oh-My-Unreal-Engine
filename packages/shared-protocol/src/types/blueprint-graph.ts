// K2b-1: Blueprint graph summary 类型（只读，仅摘要级别，不包含 nodes/pins/links 数组）

// ── Graph 类型分类 ──────────────────────────────────────────────

export type GraphKind =
  | 'event'
  | 'function'
  | 'macro'
  | 'interface'
  | 'delegate'
  | 'custom'
  | 'unknown';

// ── 导出元信息 ──────────────────────────────────────────────────

export interface BlueprintExportMeta {
  /** 导出格式版本 */
  formatVersion: string;
  /** 导出时间 ISO 8601 */
  exportedAt: string;
  /** 导出来源 */
  source: 'live' | 'cache';
  /** Blueprint 资产路径 */
  assetPath: string;
  /** 本次导出包含的 Graph ID 列表（K2b-1 为空） */
  includedGraphIds: string[];
}

// ── Blueprint 元信息 ────────────────────────────────────────────

export interface BlueprintMetadata {
  name: string;
  packagePath: string;
  objectPath: string;
  assetClass: string;
  parentClassName: string;
  generatedClassName: string;
  skeletonClassName: string;
  blueprintType: string;
  status: string;
  isDataOnly: boolean;
  isDirty: boolean;
  graphCount: number;
  variableCount: number;
  functionCount: number;
  eventCount: number;
  macroCount: number;
  /** 全部 Graph 的节点总数 */
  totalNodeCount: number;
  /** 全部 Graph 的连线总数 */
  totalLinkCount: number;
}

// ── Graph 摘要信息 ──────────────────────────────────────────────

export interface BlueprintGraphInfo {
  /**
   * Graph ID — 导出内稳定但不承诺跨重命名稳定。
   * 第一阶段格式为 "{kind}::{name}"，例如 "event::EventGraph"。
   */
  graphId: string;
  /** Graph 显示名称 */
  name: string;
  /** Graph 类型分类 */
  kind: GraphKind;
  /** 当前 Graph 的节点数量 */
  nodeCount: number;
  /** 当前 Graph 的连线数量（已去重） */
  linkCount: number;
  /** 是否为入口 Graph（如 EventGraph） */
  isEntryGraph: boolean;
}

// ── 变量定义（摘要级别） ────────────────────────────────────────

export interface BlueprintVariableDef {
  name: string;
  type: string;
  category: string;
  isEditable: boolean;
  isExposed: boolean;
  isArray: boolean;
  defaultValue: string | null;
}

// ── 函数参数 ────────────────────────────────────────────────────

export interface BlueprintParamDef {
  name: string;
  type: string;
  isReturnValue: boolean;
  isReference: boolean;
  isArray: boolean;
}

// ── 函数定义（摘要级别） ────────────────────────────────────────

export interface BlueprintFunctionDef {
  name: string;
  /** 关联的 Graph ID，格式 "{kind}::{name}" */
  graphId: string;
  isOverride: boolean;
  isPure: boolean;
  isConst: boolean;
  inputParams: BlueprintParamDef[];
  outputParams: BlueprintParamDef[];
  /** 函数实现 Graph 内的节点数 */
  nodeCount: number;
}

// ── 事件定义（摘要级别） ────────────────────────────────────────

export interface BlueprintEventDef {
  name: string;
  eventType: string;
  /** 关联的 Graph ID */
  graphId: string;
  /** 事件所在 graph 的节点总数 */
  nodeCount: number;
}

// ── 宏定义（摘要级别） ──────────────────────────────────────────

export interface BlueprintMacroDef {
  name: string;
  /** 关联的 Graph ID */
  graphId: string;
  /** 宏实现 Graph 内的节点数 */
  nodeCount: number;
}

// ── 顶层导出结构 ────────────────────────────────────────────────

export interface BlueprintGraphExport {
  exportMeta: BlueprintExportMeta;
  blueprint: BlueprintMetadata;
  graphs: BlueprintGraphInfo[];
  variables: BlueprintVariableDef[];
  functions: BlueprintFunctionDef[];
  events: BlueprintEventDef[];
  macros: BlueprintMacroDef[];
}

// ── API 响应包装 ────────────────────────────────────────────────

export interface BlueprintGraphsData {
  /** 当前选中的 Blueprint graph 导出；无选中或非 Blueprint 时返回 null */
  selectedBlueprint: BlueprintGraphExport | null;
}
