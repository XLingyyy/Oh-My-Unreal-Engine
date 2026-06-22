import type { AssetContext } from '@omue/shared-protocol';

export type ExplorerAssetKind =
  | 'Blueprint'
  | 'Material'
  | 'Map'
  | 'Config'
  | 'Cpp'
  | 'Folder'
  | 'Other';

export interface ExplorerAssetNode {
  id: string;
  name: string;
  path: string;
  kind: ExplorerAssetKind;
  isCurrent: boolean;
  isOpen: boolean;
  isDirty: boolean;
}

function classifyExplorerAsset(asset: AssetContext): ExplorerAssetKind {
  const assetClass = asset.assetClass.toLowerCase();
  if (assetClass.includes('blueprint')) return 'Blueprint';
  if (assetClass.includes('material')) return 'Material';
  if (assetClass.includes('map') || assetClass.includes('world')) return 'Map';
  if (assetClass.includes('config') || assetClass.includes('ini')) return 'Config';
  if (assetClass.includes('cpp') || assetClass.includes('code')) return 'Cpp';
  if (assetClass.includes('folder')) return 'Folder';
  return 'Other';
}

function createExplorerAssetNode(
  asset: AssetContext,
  facts: Pick<ExplorerAssetNode, 'isCurrent' | 'isOpen'>,
): ExplorerAssetNode {
  return {
    id: asset.assetPath,
    name: asset.assetName,
    path: asset.assetPath,
    kind: classifyExplorerAsset(asset),
    isCurrent: facts.isCurrent,
    isOpen: facts.isOpen,
    isDirty: asset.isDirty,
  };
}

export function buildExplorerAssetNodes(
  currentAsset: AssetContext | undefined,
  openAssets: readonly AssetContext[],
): ExplorerAssetNode[] {
  const nodes: ExplorerAssetNode[] = [];
  const nodesByPath = new Map<string, ExplorerAssetNode>();

  if (currentAsset) {
    const currentNode = createExplorerAssetNode(currentAsset, {
      isCurrent: true,
      isOpen: currentAsset.isOpenInEditor,
    });
    nodes.push(currentNode);
    nodesByPath.set(currentNode.path, currentNode);
  }

  for (const asset of openAssets) {
    const existing = nodesByPath.get(asset.assetPath);
    if (existing) {
      existing.isOpen = existing.isOpen || asset.isOpenInEditor;
      existing.isDirty = existing.isDirty || asset.isDirty;
      continue;
    }

    const openNode = createExplorerAssetNode(asset, {
      isCurrent: false,
      isOpen: asset.isOpenInEditor,
    });
    nodes.push(openNode);
    nodesByPath.set(openNode.path, openNode);
  }

  return nodes;
}

export function filterExplorerAssetNodes(
  nodes: readonly ExplorerAssetNode[],
  query: string,
): ExplorerAssetNode[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return [...nodes];

  return nodes.filter(node => (
    node.name.toLowerCase().includes(normalizedQuery)
    || node.path.toLowerCase().includes(normalizedQuery)
  ));
}

export function findNextExplorerAssetIndex(
  count: number,
  currentIndex: number,
  direction: 1 | -1,
): number {
  if (count <= 0) return -1;
  if (currentIndex < 0 || currentIndex >= count) {
    return direction === 1 ? 0 : count - 1;
  }
  return (currentIndex + direction + count) % count;
}

export function resolveExplorerRovingPath(
  nodes: readonly ExplorerAssetNode[],
  preferredPaths: readonly (string | undefined)[],
): string | null {
  if (nodes.length === 0) return null;

  const visiblePaths = new Set(nodes.map(node => node.path));
  for (const path of preferredPaths) {
    if (path && visiblePaths.has(path)) return path;
  }
  return nodes[0]?.path ?? null;
}
