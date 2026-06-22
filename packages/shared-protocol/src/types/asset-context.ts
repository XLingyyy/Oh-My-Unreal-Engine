/**
 * 单个 UE 资源的上下文信息。
 * MVP 必需字段：assetName, assetPath, assetClass, isDirty, isSelected, isOpenInEditor。
 * references / referencedAssets 为后续扩展。
 */
export interface AssetContext {
  /** 资源名称 */
  assetName: string;

  /** 资源在 Content Browser 中的路径 */
  assetPath: string;

  /** 资源类型，如 "Blueprint", "StaticMesh", "Material" */
  assetClass: string;

  /** 资源的 Package 路径 */
  packagePath: string;

  /** 是否有未保存的修改 */
  isDirty: boolean;

  /** 是否在 Content Browser 中被选中 */
  isSelected: boolean;

  /** 是否在编辑器标签页中打开 */
  isOpenInEditor: boolean;

  /** 最后修改时间 ISO 8601（Phase 1 可选） */
  lastModified?: string;

  /** 被哪些资源引用（Phase 3+） */
  references?: string[];

  /** 引用了哪些资源（Phase 3+） */
  referencedAssets?: string[];
}
