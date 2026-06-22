// ── Real HTTP Bridge Client 接口契约与错误模型 ────────────────
//
// 本文件仅包含未来 RealHttpBridgeClient 实现所需的类型、常量和
// 接口草案。当前版本不包含任何 fetch / XMLHttpRequest / 真实 HTTP 调用。
//
// 当进入 "连接真实 UE Bridge" 阶段时，新建 RealHttpBridgeClient，
// 实现 BridgeClient 接口，并引用本文件的常量和错误模型。
//
// 最后更新：2026-05-31
// 状态：草案（design-only，not implemented）

import type {
  ApiSuccessResponse,
  ApiErrorResponse,
  HealthData,
  OmueContextSnapshot,
  BehaviorTreeDiagnosticResponse,
  BridgeCapabilityDiscovery,
  ReversibleWriteResponse,
  RollbackResponse,
  DuplicateScratchResponse,
  CompileBlueprintResponse,
} from '@omue/shared-protocol';

// ── 常量 ──────────────────────────────────────────────────────

/** 默认 Bridge HTTP 服务地址（localhost，不走外网） */
export const DEFAULT_BRIDGE_BASE_URL = 'http://127.0.0.1:21805';

/** 默认请求超时（毫秒）。超过此时间视为 REQUEST_TIMEOUT */
export const DEFAULT_BRIDGE_TIMEOUT_MS = 5000;

// ── Endpoint ──────────────────────────────────────────────────

/** Bridge HTTP API 端点路径（相对于 baseUrl） */
export const BRIDGE_ENDPOINT = {
  health: '/health',
  contextSnapshot: '/context/snapshot',
  contextProject: '/context/project',
  contextCurrentAsset: '/context/current-asset',
  logsRecent: '/logs/recent',
  compileStatus: '/compile/status',
  contextBlueprintSummary: '/context/blueprint-summary',
  contextBlueprintGraphs: '/context/blueprint-graphs',
  contextBlueprintGraphDetail: '/context/blueprint-graph-detail',
  contextBehaviorTreeDiagnostic: '/context/behavior-tree-diagnostic',
  capabilities: '/capabilities',
  writeScratch: '/write/scratch',
  writeScratchRollback: '/write/scratch/rollback',
  writeScratchDuplicate: '/write/scratch/duplicate',
  writeScratchSandboxApply: '/write/scratch/sandbox-apply',
  compileBlueprint: '/compile/blueprint',
} as const;

export type BridgeEndpointName = keyof typeof BRIDGE_ENDPOINT;

/** 全部只读增强端点列表（失败可降级，不阻止 snapshot 返回） */
export const ENHANCEMENT_ENDPOINTS: readonly BridgeEndpointName[] = [
  'contextCurrentAsset',
  'logsRecent',
  'compileStatus',
  'contextBlueprintSummary',
  'contextBlueprintGraphs',
] as const;

// ── HttpBridgeClient 配置 ─────────────────────────────────────

/** 未来 RealHttpBridgeClient 构造函数参数 */
export interface HttpBridgeClientOptions {
  /** Bridge HTTP 服务地址，默认 DEFAULT_BRIDGE_BASE_URL */
  baseUrl: string;
  /** 请求超时（毫秒），默认 DEFAULT_BRIDGE_TIMEOUT_MS */
  timeoutMs: number;
}

export const DEFAULT_HTTP_BRIDGE_CLIENT_OPTIONS: Readonly<HttpBridgeClientOptions> = {
  baseUrl: DEFAULT_BRIDGE_BASE_URL,
  timeoutMs: DEFAULT_BRIDGE_TIMEOUT_MS,
};

// ── 错误码 ────────────────────────────────────────────────────

/**
 * Bridge 客户端错误码。
 *
 * 与 shared-protocol 的 ErrorCode（协议层错误，由 Bridge 服务端返回）不同，
 * BridgeErrorCode 是客户端层错误，可能发生在网络层、解析层等 Bridge 服务端
 * 无法控制的环节。
 */
export const BridgeErrorCode = {
  /** Bridge 服务不可达（连接拒绝、DNS 失败、网络不通） */
  BRIDGE_UNREACHABLE: 'BRIDGE_UNREACHABLE',
  /** 请求超时（超过 timeoutMs 未收到完整响应） */
  REQUEST_TIMEOUT: 'REQUEST_TIMEOUT',
  /** 响应体不是合法 JSON，或 JSON 结构不符合 ApiResponse contract */
  INVALID_RESPONSE: 'INVALID_RESPONSE',
  /** 协议不匹配：success=true 但缺少 data 字段，或字段类型错误 */
  PROTOCOL_ERROR: 'PROTOCOL_ERROR',
  /** Bridge 服务端返回 HTTP 5xx 错误 */
  SERVER_ERROR: 'SERVER_ERROR',
  /** 当前上下文不可用（编辑器未加载、正在编译中、数据暂时不可采集） */
  CONTEXT_UNAVAILABLE: 'CONTEXT_UNAVAILABLE',
  /** 未知错误（兜底） */
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
} as const;

export type BridgeErrorCodeValue = (typeof BridgeErrorCode)[keyof typeof BridgeErrorCode];

// ── 错误对象 ──────────────────────────────────────────────────

/**
 * Bridge 客户端统一错误。
 *
 * 用户可见字段：code、message、isRetryable
 * 诊断字段：endpoint、statusCode、cause、occurredAt
 */
export interface BridgeClientError {
  /** 错误码（用户可见 + 诊断复用） */
  code: BridgeErrorCodeValue;

  /** 用户可读的错误描述（可展示在 UI） */
  message: string;

  /** 请求的 API 端点（诊断用） */
  endpoint?: string;

  /** HTTP 状态码（如有，诊断用） */
  statusCode?: number;

  /** 原始错误对象（诊断用，不直接展示给用户） */
  cause?: unknown;

  /** 是否建议自动或手动重试 */
  isRetryable: boolean;

  /** 错误发生时间 ISO 8601 */
  occurredAt: string;
}

// ── 请求诊断 ──────────────────────────────────────────────────

/**
 * 单次 Bridge 请求的诊断记录。
 *
 * 用途：调试面板、错误报告、性能监控。
 * 不直接展示给终端用户，但可供开发者查看或写入日志。
 */
export interface BridgeRequestDiagnostic {
  /** 请求的 API 端点 */
  endpoint: string;

  /** 请求开始时间 ISO 8601 */
  startedAt: string;

  /** 响应接收完成时间 ISO 8601（请求未完成时为 undefined） */
  finishedAt?: string;

  /** 请求耗时（毫秒）（请求未完成时为 undefined） */
  durationMs?: number;

  /** 请求是否成功（HTTP 200 + 响应解析成功） */
  success: boolean;

  /** 失败时的客户端错误码 */
  errorCode?: BridgeErrorCodeValue;

  /** HTTP 状态码（如有） */
  statusCode?: number;
}

// ── 端点响应类型映射 ─────────────────────────────────────────

/** 每个 Bridge 端点的 HTTP 响应类型 */
export interface BridgeEndpointTypes {
  [BRIDGE_ENDPOINT.health]: ApiSuccessResponse<HealthData> | ApiErrorResponse;
  [BRIDGE_ENDPOINT.contextSnapshot]: ApiSuccessResponse<OmueContextSnapshot> | ApiErrorResponse;
  [BRIDGE_ENDPOINT.contextBehaviorTreeDiagnostic]: BehaviorTreeDiagnosticResponse;
  [BRIDGE_ENDPOINT.capabilities]: ApiSuccessResponse<BridgeCapabilityDiscovery> | ApiErrorResponse;
  [BRIDGE_ENDPOINT.writeScratchDuplicate]: ApiSuccessResponse<DuplicateScratchResponse> | ApiErrorResponse;
  [BRIDGE_ENDPOINT.writeScratchSandboxApply]: ApiSuccessResponse<ReversibleWriteResponse> | ApiErrorResponse;
  [BRIDGE_ENDPOINT.compileBlueprint]: ApiSuccessResponse<CompileBlueprintResponse> | ApiErrorResponse;
  // 以下端点当前未接入 BridgeClient 接口，预留给后续阶段
  // [BRIDGE_ENDPOINT.contextProject]: ...
  // [BRIDGE_ENDPOINT.contextCurrentAsset]: ...
  // [BRIDGE_ENDPOINT.logsRecent]: ...
  // [BRIDGE_ENDPOINT.compileStatus]: ...
}

// ── 重试策略 ───────────────────────────────────────────────────

/** 默认最大重试次数 */
export const DEFAULT_MAX_RETRIES = 2;

/** 仅这些错误码建议重试（idempotent GET） */
export const RETRYABLE_ERROR_CODES: readonly BridgeErrorCodeValue[] = [
  BridgeErrorCode.BRIDGE_UNREACHABLE,
  BridgeErrorCode.REQUEST_TIMEOUT,
  BridgeErrorCode.SERVER_ERROR,
] as const;

/** 判断给定错误码是否建议重试 */
export function isRetryableErrorCode(code: BridgeErrorCodeValue): boolean {
  return (RETRYABLE_ERROR_CODES as readonly string[]).includes(code);
}

// ── 错误映射：客户端错误 → UI 表现 ────────────────────────────

/**
 * 将 BridgeClientError 映射到 UI 应有的处理策略。
 *
 * 此映射用于 useBridgeContext 或类似 hook，
 * 决定 UI 应展示 disconnected / error with retry / empty state / protocol error。
 */
export interface BridgeErrorUiStrategy {
  /** 顶层错误显示模式 */
  mode: 'disconnected' | 'error-retry' | 'empty-partial' | 'protocol-mismatch';
  /** 是否显示 Retry 按钮 */
  showRetry: boolean;
  /** 是否显示"部分数据不可用"提示 */
  showPartialWarning: boolean;
}

export function getErrorUiStrategy(code: BridgeErrorCodeValue): BridgeErrorUiStrategy {
  switch (code) {
    case BridgeErrorCode.BRIDGE_UNREACHABLE:
      return { mode: 'disconnected', showRetry: true, showPartialWarning: false };
    case BridgeErrorCode.REQUEST_TIMEOUT:
      return { mode: 'error-retry', showRetry: true, showPartialWarning: false };
    case BridgeErrorCode.SERVER_ERROR:
      return { mode: 'error-retry', showRetry: true, showPartialWarning: false };
    case BridgeErrorCode.CONTEXT_UNAVAILABLE:
      return { mode: 'empty-partial', showRetry: true, showPartialWarning: true };
    case BridgeErrorCode.INVALID_RESPONSE:
    case BridgeErrorCode.PROTOCOL_ERROR:
      return { mode: 'protocol-mismatch', showRetry: false, showPartialWarning: false };
    case BridgeErrorCode.UNKNOWN_ERROR:
    default:
      return { mode: 'error-retry', showRetry: true, showPartialWarning: false };
  }
}

// ── AbortController 集成（预留） ──────────────────────────────

/**
 * 每个请求可传入 AbortSignal 以支持取消。
 * 未来 RealHttpBridgeClient 应将此 signal 传递给 fetch(url, { signal })。
 */
export interface BridgeRequestOptions {
  /** AbortSignal 用于取消进行中的请求（可选） */
  signal?: AbortSignal;
}
