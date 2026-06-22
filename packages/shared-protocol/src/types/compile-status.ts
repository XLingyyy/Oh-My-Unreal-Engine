// ── 编译结果枚举 ─────────────────────────────────────────────

export type CompileResult = 'unknown' | 'success' | 'failed' | 'canceled';

// ── 编译错误/警告 ────────────────────────────────────────────

export type CompileIssueSeverity = 'error' | 'warning';

/** 单条编译错误/警告 */
export interface CompileIssue {
  /** 错误码，如 "CS1525" */
  code: string;

  /** 错误描述 */
  message: string;

  /** 出错文件路径 */
  file?: string;

  /** 出错行号 */
  line?: number;

  /** 出错列号 */
  column?: number;

  /** 严重程度 */
  severity: CompileIssueSeverity;
}

// ── 编译状态 ─────────────────────────────────────────────────

/**
 * 编辑器编译状态。
 * MVP 必需：isCompiling, lastCompileResult, errorCount, warningCount, lastErrors。
 */
export interface CompileStatus {
  /** 是否正在编译中 */
  isCompiling: boolean;

  /** 最近一次编译结果 */
  lastCompileResult: CompileResult;

  /** 最近一次编译的错误数 */
  errorCount: number;

  /** 最近一次编译的警告数 */
  warningCount: number;

  /** 上次编译时间 ISO 8601 */
  lastCompileTime?: string;

  /** 最近 N 条编译错误（最多 20 条） */
  lastErrors: CompileIssue[];
}
