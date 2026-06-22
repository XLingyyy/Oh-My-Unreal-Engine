/**
 * 日志详细级别。
 * 对齐 UE 的 ELogVerbosity 枚举，数值越低越严重。
 */
export type LogVerbosity =
  | 'fatal'
  | 'error'
  | 'warning'
  | 'display'
  | 'log'
  | 'verbose'
  | 'very_verbose';

/**
 * 单条 Output Log / Message Log 条目。
 * MVP 必需：timestamp, category, verbosity, message。
 * source / lineNumber 为 Phase 2+ 可选扩展。
 */
export interface LogEntry {
  /** 日志时间戳 ISO 8601 */
  timestamp: string;

  /** 日志类别，如 "LogBlueprint", "LogCompile" */
  category: string;

  /** 详细级别 */
  verbosity: LogVerbosity;

  /** 日志正文 */
  message: string;

  /** 来源文件/函数（Phase 2+） */
  source?: string;

  /** 来源行号（Phase 2+） */
  lineNumber?: number;
}
