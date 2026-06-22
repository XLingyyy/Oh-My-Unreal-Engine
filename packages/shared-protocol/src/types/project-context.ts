/**
 * 编辑器状态。Phase 1 仅读取，后续阶段可用于状态联动。
 */
export type EditorStatus =
  | 'idle'
  | 'playing'
  | 'simulating'
  | 'compiling'
  | 'loading';

/**
 * 当前 Unreal Engine 工程的基本信息。
 * MVP 必需字段：projectName, projectPath, engineVersion, editorStatus。
 * modules / targetPlatforms 为后续扩展。
 */
export interface ProjectContext {
  /** 工程名（.uproject 文件名不含扩展名） */
  projectName: string;

  /** 工程根目录绝对路径 */
  projectPath: string;

  /** .uproject 文件完整路径 */
  uprojectFile: string;

  /** 引擎版本，如 "5.4.2" */
  engineVersion: string;

  /** 编辑器当前状态 */
  editorStatus: EditorStatus;

  /** 工程模块列表（Phase 2+） */
  modules?: string[];

  /** 目标平台列表（Phase 2+） */
  targetPlatforms?: string[];
}
