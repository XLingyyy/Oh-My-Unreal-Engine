// ── Blueprint 导出状态 ───────────────────────────────────────

/**
 * Blueprint 结构导出状态。
 * Phase 1 所有 Blueprint 为 not_exported。
 * Phase 3 开始支持 partial / full。
 */
export type BlueprintExportStatus =
  | 'not_supported'
  | 'not_exported'
  | 'pending'
  | 'partial'
  | 'complete'
  | 'failed';

// ── Blueprint 子结构 ─────────────────────────────────────────

/** Blueprint 变量 */
export interface BlueprintVariable {
  name: string;
  type: string;
  defaultValue?: string;
  isEditable: boolean;
  isExposed: boolean;
  category?: string;
}

/** Blueprint 函数参数 */
export interface BlueprintParam {
  name: string;
  type: string;
  isReturnValue: boolean;
  isReference: boolean;
}

/** Blueprint 函数 / 覆盖 */
export interface BlueprintFunction {
  name: string;
  isOverride: boolean;
  isPure: boolean;
  isConst: boolean;
  inputParams: BlueprintParam[];
  outputParams: BlueprintParam[];
  /** 函数内节点数（Phase 3+） */
  nodeCount?: number;
}

/** Blueprint 事件 */
export interface BlueprintEvent {
  name: string;
  eventType: string; // "BeginPlay", "Tick", "Custom" 等
  nodeCount: number;
}

// ── Blueprint 上下文 ─────────────────────────────────────────

export type BlueprintType =
  | 'Normal'
  | 'Const'
  | 'MacroLibrary'
  | 'Interface'
  | 'FunctionLibrary';

/**
 * 单个 Blueprint 的结构化上下文。
 * Phase 1：仅填充 assetPath / graphNames / nodeCount / edgeCount / exportStatus，
 *           variables / functions / events 为空数组占位。
 * Phase 3：完整导出。
 */
export interface BlueprintContext {
  /** Blueprint 资源路径 */
  assetPath: string;

  /** 父类名称 */
  parentClass: string;

  /** Blueprint 类型 */
  blueprintType: BlueprintType;

  /** 所有 Graph 名称（EventGraph, Functions, Macros 等） */
  graphNames: string[];

  /** 变量列表（Phase 3+） */
  variables: BlueprintVariable[];

  /** 函数列表（Phase 3+） */
  functions: BlueprintFunction[];

  /** 事件列表（Phase 3+） */
  events: BlueprintEvent[];

  /** 总节点数 */
  nodeCount: number;

  /** 总连线数 */
  edgeCount: number;

  /** Blueprint 导出状态 */
  exportStatus: BlueprintExportStatus;

  /** 实现的接口列表（Phase 3+） */
  implementedInterfaces?: string[];
}
