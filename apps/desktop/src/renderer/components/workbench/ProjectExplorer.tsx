import { useMemo, useState, type KeyboardEvent } from 'react';
import { useDesktopCopy } from '../../i18n';
import type { AssetContext } from '@omue/shared-protocol';

type AssetKind = 'Blueprint' | 'Material' | 'Map' | 'Config' | 'Cpp' | 'Folder' | 'Other';

type SearchMatch = 'direct' | 'ancestor' | 'none';

interface SearchResult {
  matches: Map<string, SearchMatch>;
  visibleIds: Set<string>;
}

interface AssetNode {
  id: string;
  name: string;
  path: string;
  kind: AssetKind;
  isCurrent: boolean;
  isOpen: boolean;
  isDirty: boolean;
}

const EXPANDABLE_KINDS: ReadonlySet<AssetKind> = new Set<AssetKind>(['Folder']);

function classifyAsset(asset: AssetContext): AssetKind {
  const cls = asset.assetClass.toLowerCase();
  if (cls.includes('blueprint')) return 'Blueprint';
  if (cls.includes('material')) return 'Material';
  if (cls.includes('map') || cls.includes('world')) return 'Map';
  if (cls.includes('config') || cls.includes('ini')) return 'Config';
  if (cls.includes('cpp') || cls.includes('code')) return 'Cpp';
  if (cls.includes('folder')) return 'Folder';
  return 'Other';
}

function buildAssetList(currentAsset: AssetContext | undefined, openAssets: AssetContext[]): AssetNode[] {
  const seen = new Set<string>();
  const nodes: AssetNode[] = [];

  if (currentAsset) {
    const key = currentAsset.assetPath;
    if (!seen.has(key)) {
      seen.add(key);
      nodes.push({
        id: key,
        name: currentAsset.assetName,
        path: currentAsset.assetPath,
        kind: classifyAsset(currentAsset),
        isCurrent: true,
        isOpen: currentAsset.isOpenInEditor,
        isDirty: currentAsset.isDirty,
      });
    }
  }

  for (const asset of openAssets) {
    const key = asset.assetPath;
    if (seen.has(key)) {
      const existing = nodes.find(n => n.id === key);
      if (existing) {
        existing.isOpen = existing.isOpen || asset.isOpenInEditor;
      }
      continue;
    }
    seen.add(key);
    nodes.push({
      id: key,
      name: asset.assetName,
      path: asset.assetPath,
      kind: classifyAsset(asset),
      isCurrent: false,
      isOpen: asset.isOpenInEditor,
      isDirty: asset.isDirty,
    });
  }

  return nodes;
}

function normalize(value: string): string {
  return value.toLowerCase();
}

function matchesQuery(node: AssetNode, query: string): boolean {
  const q = normalize(query);
  if (!q) return true;
  const name = normalize(node.name);
  const path = normalize(node.path);
  return name === q || name.startsWith(q) || path.includes(q);
}

function BlueprintIcon() {
  return (
    <svg
      className="ue-tree-icon ue-tree-icon-blueprint"
      viewBox="0 0 16 16"
      width="16"
      height="16"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="2" y="2" width="12" height="12" rx="2" fill="currentColor" opacity="0.18" />
      <rect x="2" y="2" width="12" height="12" rx="2" fill="none" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function MaterialIcon() {
  return (
    <svg
      className="ue-tree-icon ue-tree-icon-material"
      viewBox="0 0 16 16"
      width="16"
      height="16"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="8" cy="8" r="6" fill="currentColor" opacity="0.18" />
      <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function MapIcon() {
  return (
    <svg
      className="ue-tree-icon ue-tree-icon-map"
      viewBox="0 0 16 16"
      width="16"
      height="16"
      aria-hidden="true"
      focusable="false"
    >
      <rect
        x="3.5"
        y="3.5"
        width="9"
        height="9"
        transform="rotate(45 8 8)"
        fill="currentColor"
        opacity="0.2"
      />
      <rect
        x="3.5"
        y="3.5"
        width="9"
        height="9"
        transform="rotate(45 8 8)"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
      />
    </svg>
  );
}

function ConfigIcon() {
  return (
    <svg
      className="ue-tree-icon ue-tree-icon-config"
      viewBox="0 0 16 16"
      width="16"
      height="16"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="8" cy="8" r="2.4" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <path
        d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CppIcon() {
  return (
    <svg
      className="ue-tree-icon ue-tree-icon-cpp"
      viewBox="0 0 16 16"
      width="16"
      height="16"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M5 4.5 1.5 8 5 11.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M11 4.5 14.5 8 11 11.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function OtherIcon() {
  return (
    <svg
      className="ue-tree-icon ue-tree-icon-other"
      viewBox="0 0 16 16"
      width="16"
      height="16"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="3" y="3" width="10" height="10" rx="1.5" fill="currentColor" opacity="0.15" />
      <rect x="3" y="3" width="10" height="10" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.1" />
    </svg>
  );
}

function SearchEmptyIcon() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false">
      <circle
        cx="10.5"
        cy="10.5"
        r="5.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="m15 15 4 4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function EmptyAssetsIcon() {
  return (
    <svg viewBox="0 0 24 24" width="32" height="32" aria-hidden="true" focusable="false">
      <path
        d="M4 7h16v12H4z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <path
        d="M4 7l4-3h8l4 3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path
        d="M12 11v4M10 13h4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function renderKindIcon(kind: AssetKind) {
  switch (kind) {
    case 'Blueprint':
      return <BlueprintIcon />;
    case 'Material':
      return <MaterialIcon />;
    case 'Map':
      return <MapIcon />;
    case 'Config':
      return <ConfigIcon />;
    case 'Cpp':
      return <CppIcon />;
    case 'Folder':
      return null;
    case 'Other':
    default:
      return <OtherIcon />;
  }
}

export interface ProjectExplorerProps {
  currentAsset?: AssetContext;
  openAssets: AssetContext[];
  selectedAssetPath?: string;
  onSelectAsset?: (assetPath: string) => void;
}

export function ProjectExplorer({ currentAsset, openAssets, selectedAssetPath, onSelectAsset }: ProjectExplorerProps) {
  const { copy } = useDesktopCopy();
  const [query, setQuery] = useState('');

  const trimmedQuery = query.trim();
  const isSearching = trimmedQuery.length > 0;

  const assetList = useMemo(
    () => buildAssetList(currentAsset, openAssets),
    [currentAsset, openAssets],
  );

  const hasAssets = assetList.length > 0;

  const searchResult = useMemo<SearchResult | null>(() => {
    if (!isSearching) return null;
    const directIds = new Set<string>();
    for (const node of assetList) {
      if (matchesQuery(node, trimmedQuery)) {
        directIds.add(node.id);
      }
    }
    const matches = new Map<string, SearchMatch>();
    for (const id of directIds) {
      matches.set(id, 'direct');
    }
    const visibleIds = new Set<string>(directIds);
    return { matches, visibleIds };
  }, [isSearching, trimmedQuery, assetList]);

  const hasAnyMatch = isSearching
    ? searchResult !== null && searchResult.visibleIds.size > 0
    : hasAssets;

  const handleSelect = (node: AssetNode) => {
    if (EXPANDABLE_KINDS.has(node.kind)) return;
    onSelectAsset?.(node.path);
  };

  return (
    <aside className="ue-explorer">
      <div className="ue-explorer-header">
        <span className="ue-explorer-title">{copy.ueAgentUi.projectExplorer.title}</span>
      </div>
      <div className="ue-explorer-search">
        <input
          type="text"
          placeholder={copy.ueAgentUi.projectExplorer.searchPlaceholder}
          className="ue-explorer-search-input"
          value={query}
          onChange={event => setQuery(event.target.value)}
          aria-label={copy.ueAgentUi.projectExplorer.searchPlaceholder}
        />
      </div>
      <div className="ue-explorer-tree" aria-label="Project assets" role="tree">
        {hasAssets ? (
          hasAnyMatch ? (
            assetList
              .filter(node => !isSearching || searchResult?.visibleIds.has(node.id))
              .map(node => (
                <AssetRow
                  key={node.id}
                  node={node}
                  selectedAssetPath={selectedAssetPath}
                  currentLabel={copy.ueAgentUi.projectExplorer.currentAssetLabel}
                  openLabel={copy.ueAgentUi.projectExplorer.openAssetLabel}
                  dirtyTooltip={copy.ueAgentUi.projectExplorer.dirtyTooltip}
                  onSelect={handleSelect}
                />
              ))
          ) : (
            <div className="ue-tree-empty">
              <span className="ue-empty-state-icon" aria-hidden="true">
                <SearchEmptyIcon />
              </span>
              <span className="ue-tree-empty-title">{copy.ueAgentUi.projectExplorer.noMatchesTitle}</span>
              <span className="ue-tree-empty-body">{copy.ueAgentUi.projectExplorer.noMatches}</span>
            </div>
          )
        ) : (
          <div className="ue-tree-empty">
            <span className="ue-empty-state-icon" aria-hidden="true">
              <EmptyAssetsIcon />
            </span>
            <span className="ue-tree-empty-title">{copy.ueAgentUi.projectExplorer.emptyTitle}</span>
            <span className="ue-tree-empty-body">{copy.ueAgentUi.projectExplorer.emptyGuidance}</span>
          </div>
        )}
      </div>
    </aside>
  );
}

interface AssetRowProps {
  node: AssetNode;
  selectedAssetPath?: string;
  currentLabel: string;
  openLabel: string;
  dirtyTooltip: string;
  onSelect: (node: AssetNode) => void;
}

function AssetRow({
  node,
  selectedAssetPath,
  currentLabel,
  openLabel,
  dirtyTooltip,
  onSelect,
}: AssetRowProps) {
  const isSelected = node.path === selectedAssetPath;

  const rowClass = [
    'ue-tree-row',
    isSelected ? 'ue-tree-row-selected' : '',
    node.isCurrent ? 'ue-tree-row-current' : '',
    node.isDirty ? 'ue-tree-row-warning' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSelect(node);
    }
  };

  return (
    <div
      className={rowClass}
      role="treeitem"
      aria-label={node.path}
      aria-selected={isSelected}
      tabIndex={0}
      onClick={() => onSelect(node)}
      onKeyDown={handleKeyDown}
      title={node.path}
    >
      {renderKindIcon(node.kind)}
      <span className="ue-tree-name">{node.name}</span>
      {node.isCurrent && (
        <span className="ue-tree-current-badge" aria-label={currentLabel}>
          {currentLabel}
        </span>
      )}
      {!node.isCurrent && node.isOpen && (
        <span className="ue-tree-open-badge" aria-label={openLabel}>
          {openLabel}
        </span>
      )}
      {node.isDirty && (
        <span
          className="ue-tree-warning-dot"
          title={dirtyTooltip}
          aria-label={dirtyTooltip}
        />
      )}
    </div>
  );
}
