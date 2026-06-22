import type { ProjectContext } from './project-context.js';
import type { AssetContext } from './asset-context.js';
import type { BlueprintContext } from './blueprint-context.js';
import type { BlueprintSummary } from './blueprint-summary.js';
import type { BlueprintGraphExport } from './blueprint-graph.js';
import type { LogEntry } from './log-entry.js';
import type { CompileStatus } from './compile-status.js';
import type { EditorRuntimeStatus } from './editor-runtime-status.js';

/**
 * 一次上下文采集的完整快照。
 * 这是桌面端最主要的数据消费入口。
 */
export interface OmueContextSnapshot {
  /** 快照唯一 ID（UUID v4） */
  snapshotId: string;

  /** 采集时间 ISO 8601 */
  capturedAt: string;

  /** 插件版本号 */
  bridgeVersion: string;

  /** 工程基本信息 */
  project: ProjectContext;

  /** 当前选中/打开的资产（可能为空） */
  currentAsset?: AssetContext;

  /** 所有打开的资产标签页 */
  openAssets: AssetContext[];

  /** Blueprint 上下文（仅当当前资源是 Blueprint 时填充） */
  blueprint?: BlueprintContext;

  /** K2a Blueprint 顶层元信息摘要（不包含节点/引脚/连线） */
  blueprintSummary?: BlueprintSummary;

  /** K2b-1 Blueprint graph 摘要（不包含 nodes/pins/links 详情数组） */
  blueprintGraphs?: BlueprintGraphExport;

  /** 最近日志（默认 50 条） */
  recentLogs: LogEntry[];

  /** 编译状态 */
  compileStatus: CompileStatus;

  /** PIE / 运行时状态 */
  runtimeStatus: EditorRuntimeStatus;
}

/**
 * 上下文采集来源标识。
 */
export type ContextSource = 'live' | 'cache' | 'mock';

/**
 * 某个上下文字段的可用性。
 * 用于精确表达"为什么某个字段不可用"，避免 null/undefined 语义不清。
 */
export interface ContextAvailability {
  /** 字段是否可用 */
  available: boolean;

  /** 不可用原因（仅 available=false 时有意义） */
  reason?: string;
}
