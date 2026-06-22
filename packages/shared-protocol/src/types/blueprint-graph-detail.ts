// K2b-2: 单 Graph 节点/引脚/连线详情类型（只读，不含 default value 字段）

import type { BlueprintExportMeta, BlueprintGraphInfo } from './blueprint-graph.js';

// ── 节点标注 ────────────────────────────────────────────────────

export interface NodePosition {
  x: number;
  y: number;
}

export type PinContainerType = 'none' | 'array' | 'set' | 'map';

// ── 节点类型 ──────────────────────────────────────────────────────

export type NodeType =
  | 'event'
  | 'custom_event'
  | 'input_action'
  | 'input_key'
  | 'function_call'
  | 'parent_call'
  | 'function_entry'
  | 'function_result'
  | 'variable_get'
  | 'variable_set'
  | 'branch'
  | 'sequence'
  | 'for_loop'
  | 'for_each'
  | 'while_loop'
  | 'delay'
  | 'timeline'
  | 'macro_instance'
  | 'literal'
  | 'delegate'
  | 'add_delegate'
  | 'remove_delegate'
  | 'call_delegate'
  | 'dynamic_cast'
  | 'class_dynamic_cast'
  | 'make_array'
  | 'get_array_item'
  | 'make_struct'
  | 'break_struct'
  | 'spawn_actor'
  | 'create_widget'
  | 'latent_action'
  | 'tunnel'
  | 'comment'
  | 'unknown';

// ── 节点信息 ──────────────────────────────────────────────────────

export interface NodeInfo {
  /** 导出内临时 ID，不承诺跨 session 稳定 */
  nodeId: string;
  /** UE NodeGuid best-effort，可能为空 */
  nodeGuid?: string;
  /** 节点显示标题 */
  title: string;
  /** 节点类型分类 */
  nodeType: NodeType;
  /** 节点上的引脚列表 */
  pins: PinInfo[];
  /** 节点是否被禁用 */
  isDisabled?: boolean;
  /** 节点上的编译错误/警告类型 */
  errorType?: 'error' | 'warning' | 'none';
  /** 节点上的编译错误/警告消息 */
  errorMessage?: string;
  /** 节点在 Graph 编辑面板中的位置 */
  position?: NodePosition;
  /** 用户编写的节点注释 */
  nodeComment?: string;
  /** 注释气泡是否可见 */
  commentBubbleVisible?: boolean;
}

// ── 引脚方向 ──────────────────────────────────────────────────────

export type PinDirection = 'input' | 'output';

// ── 引脚种类 ──────────────────────────────────────────────────────

export type PinKind = 'execute' | 'data' | 'delegate' | 'unknown';

// ── 引脚信息 ──────────────────────────────────────────────────────

export interface PinInfo {
  /** 导出内临时 ID，不承诺跨 session 稳定 */
  pinId: string;
  /** UE UEdGraphPin::PinId，可选；仅在 UE bridge 实时导出时填充 */
  pinGuid?: string;
  /** 引脚显示名称 */
  name: string;
  /** 引脚方向：input 或 output */
  direction: PinDirection;
  /** 引脚种类：execute / data / delegate / unknown */
  pinKind: PinKind;
  /** 引脚数据类型显示名 */
  dataType: string;
  /** UE 的 PinCategory 原始值 */
  pinCategory?: string;
  /** 是否为数组引脚 */
  isArray: boolean;
  /** 容器语义：none / array / set / map */
  containerType?: PinContainerType;
  /** 此引脚是否有连线 */
  isConnected: boolean;
  /** 此引脚连接到的目标引脚 ID 列表 */
  linkedTo: string[];
}

// ── 连线信息 ──────────────────────────────────────────────────────

export interface LinkInfo {
  /** 导出内临时 ID，不承诺跨 session 稳定 */
  linkId: string;
  /** 源引脚 ID */
  sourcePinId: string;
  /** 源节点 ID */
  sourceNodeId: string;
  /** 目标引脚 ID */
  targetPinId: string;
  /** 目标节点 ID */
  targetNodeId: string;
}

// ── 截断 ──────────────────────────────────────────────────────────

export type GraphDetailTruncationReason =
  | 'node_limit'
  | 'pin_limit'
  | 'link_limit'
  | 'graph_size';

export interface GraphDetailTruncation {
  /** 本次导出是否被截断 */
  truncated: boolean;
  /** 截断原因 */
  reason: GraphDetailTruncationReason;
  /** 截断相关警告消息 */
  warnings: string[];
}

// ── Graph 详情 ────────────────────────────────────────────────────

export interface GraphDetail {
  /** 请求的 Graph ID */
  graphId: string;
  /** 该 Graph 内的节点列表 */
  nodes: NodeInfo[];
  /** 该 Graph 内的连线列表 */
  links: LinkInfo[];
  /** 截断信息（仅在截断时存在） */
  truncation?: GraphDetailTruncation;
}

// ── API 响应数据 ──────────────────────────────────────────────────

export interface BlueprintGraphDetailData {
  /** 当前选中的 Blueprint graph 详情；无选中或非 Blueprint 时返回 null */
  selectedBlueprint: {
    /** 导出元信息 */
    exportMeta: BlueprintExportMeta;
    /** Blueprint 名称 */
    blueprintName: string;
    /** 请求的 Graph ID */
    requestedGraphId: string;
    /** Graph 摘要信息 + 详情 */
    graph: BlueprintGraphInfo & { detail: GraphDetail };
  } | null;
}
