import type { ProjectContext } from './project-context.js';
import type { AssetContext } from './asset-context.js';
import type { BlueprintContext } from './blueprint-context.js';
import type { BlueprintGraphsData } from './blueprint-graph.js';
import type { BlueprintGraphDetailData } from './blueprint-graph-detail.js';
import type { LogEntry } from './log-entry.js';
import type { CompileStatus } from './compile-status.js';
import type { BlueprintSummaryData } from './blueprint-summary.js';
import type { EditorRuntimeStatus } from './editor-runtime-status.js';
import type { OmueContextSnapshot } from './context-snapshot.js';

// ── 通用 API 响应 ────────────────────────────────────────────

/** API 成功响应 */
export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  timestamp: string;
}

/** API 错误响应 */
export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
  };
  timestamp: string;
}

/** 统一 API 响应（成功或失败） */
export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

// ── 错误码 ────────────────────────────────────────────────────

export type ErrorCode =
  | 'BRIDGE_NOT_READY'
  | 'EDITOR_NOT_AVAILABLE'
  | 'INVALID_PARAMETER'
  | 'INTERNAL_ERROR'
  | 'NOT_IMPLEMENTED';

// ── 桌面端连接状态（非协议字段，仅桌面端使用） ──────────────

export type EditorConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'error';

// ── 各端点响应类型 ────────────────────────────────────────────

export interface HealthData {
  status: 'ok' | 'degraded';
  bridgeVersion: string;
  editorStatus: string;
  uptime: number;
}

export type HealthResponse = ApiResponse<HealthData>;

export type ContextSnapshotResponse = ApiResponse<OmueContextSnapshot>;

export type ProjectContextResponse = ApiResponse<ProjectContext>;

export interface CurrentAssetData {
  /** 当前选中的资产；无选中时为 null */
  selectedAsset?: AssetContext | null;
  openAssets: AssetContext[];
}

export type CurrentAssetResponse = ApiResponse<CurrentAssetData>;

export interface RecentLogsData {
  entries: LogEntry[];
  totalCount?: number;
}

export type RecentLogsResponse = ApiResponse<RecentLogsData>;

export type CompileStatusResponse = ApiResponse<CompileStatus>;

export type BlueprintSummaryResponse = ApiResponse<BlueprintSummaryData>;

export type BlueprintGraphsResponse = ApiResponse<BlueprintGraphsData>;

export type BlueprintGraphDetailResponse = ApiResponse<BlueprintGraphDetailData>;

export type RuntimeStatusResponse = ApiResponse<EditorRuntimeStatus>;

export interface BlueprintExportData {
  blueprint: BlueprintContext;
  source: string;
}

export type BlueprintExportResponse = ApiResponse<BlueprintExportData>;

// ── API 查询参数 ──────────────────────────────────────────────

export interface SnapshotQueryParams {
  includeBlueprint?: boolean;
  logCount?: number;
}

export interface RecentLogsQueryParams {
  count?: number;
  category?: string;
  minVerbosity?: string;
}

export interface BlueprintExportQueryParams {
  assetPath: string;
  graphName?: string;
}

export interface BlueprintGraphDetailQueryParams {
  graphId: string;
}
