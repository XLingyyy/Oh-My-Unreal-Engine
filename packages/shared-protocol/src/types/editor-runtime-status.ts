/** PIE 运行模式 */
export type PlayMode =
  | 'none'
  | 'in_editor'
  | 'in_window'
  | 'in_new_process'
  | 'vr';

/**
 * 编辑器运行时状态（PIE / 模拟）。
 * MVP 必需：isPieRunning, isSimulating。
 * activeWorldName / playMode 为 Phase 1 可选。
 */
export interface EditorRuntimeStatus {
  /** PIE 是否正在运行 */
  isPieRunning: boolean;

  /** 是否处于模拟模式 */
  isSimulating: boolean;

  /** 当前活跃 World 名称（Phase 1 可选） */
  activeWorldName?: string;

  /** PIE 模式（Phase 1 可选） */
  playMode?: PlayMode;

  /** PIE 端口（Phase 3+） */
  playInEditorPort?: number;
}
