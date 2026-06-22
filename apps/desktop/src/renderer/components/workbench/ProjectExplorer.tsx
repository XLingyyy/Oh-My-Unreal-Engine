import {
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import type { AssetContext } from '@omue/shared-protocol';
import { useDesktopCopy } from '../../i18n';
import {
  buildExplorerAssetNodes,
  filterExplorerAssetNodes,
  findNextExplorerAssetIndex,
  resolveExplorerRovingPath,
  type ExplorerAssetKind,
  type ExplorerAssetNode,
} from './projectExplorerModel';

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
      <path d="M4 7h16v12H4z" fill="none" stroke="currentColor" strokeWidth="1.4" />
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

function renderKindIcon(kind: ExplorerAssetKind) {
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
  targetAssetPath?: string;
  manualTargetAssetPath?: string;
  isRefreshing: boolean;
  refreshError: string | null;
  onRefresh: () => void;
  onSelectAsset?: (assetPath: string) => void;
}

export function ProjectExplorer({
  currentAsset,
  openAssets,
  targetAssetPath,
  manualTargetAssetPath,
  isRefreshing,
  refreshError,
  onRefresh,
  onSelectAsset,
}: ProjectExplorerProps) {
  const { copy } = useDesktopCopy();
  const [query, setQuery] = useState('');
  const [rovingPath, setRovingPath] = useState<string | null>(null);
  const rootRef = useRef<HTMLElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const rowRefs = useRef(new Map<string, HTMLDivElement>());

  const assetNodes = useMemo(
    () => buildExplorerAssetNodes(currentAsset, openAssets),
    [currentAsset, openAssets],
  );
  const visibleNodes = useMemo(
    () => filterExplorerAssetNodes(assetNodes, query),
    [assetNodes, query],
  );
  const resolvedRovingPath = resolveExplorerRovingPath(visibleNodes, [
    rovingPath ?? undefined,
    targetAssetPath,
    currentAsset?.assetPath,
  ]);
  const trimmedQuery = query.trim();

  const clearSearch = () => {
    setQuery('');
    searchInputRef.current?.focus();
  };

  const focusRowAt = (index: number) => {
    const node = visibleNodes[index];
    if (!node) return;
    setRovingPath(node.path);
    rowRefs.current.get(node.path)?.focus();
  };

  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      focusRowAt(0);
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      focusRowAt(visibleNodes.length - 1);
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      if (query) {
        clearSearch();
      } else {
        rootRef.current?.focus();
      }
    }
  };

  const handleRowKeyDown = (
    event: KeyboardEvent<HTMLDivElement>,
    node: ExplorerAssetNode,
  ) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const currentIndex = visibleNodes.findIndex(item => item.path === node.path);
      const direction = event.key === 'ArrowDown' ? 1 : -1;
      focusRowAt(findNextExplorerAssetIndex(
        visibleNodes.length,
        currentIndex,
        direction,
      ));
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSelectAsset?.(node.path);
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      searchInputRef.current?.focus();
    }
  };

  return (
    <aside
      ref={rootRef}
      className="ue-explorer"
      tabIndex={-1}
      aria-busy={isRefreshing}
      data-explorer-refreshing={String(isRefreshing)}
    >
      <div className="ue-explorer-header">
        <div className="ue-explorer-heading">
          <span className="ue-explorer-title">
            {copy.ueAgentUi.projectExplorer.title}
          </span>
          <button
            type="button"
            className="ue-explorer-refresh"
            onClick={onRefresh}
            disabled={isRefreshing}
          >
            {isRefreshing
              ? copy.ueAgentUi.projectExplorer.refreshing
              : copy.ueAgentUi.projectExplorer.refresh}
          </button>
        </div>
        <p className="ue-explorer-scope-note">
          {copy.ueAgentUi.projectExplorer.scopeNote}
        </p>
      </div>

      <div className="ue-explorer-toolbar">
        <div className="ue-explorer-search">
          <input
            ref={searchInputRef}
            type="text"
            placeholder={copy.ueAgentUi.projectExplorer.searchPlaceholder}
            className="ue-explorer-search-input"
            value={query}
            onChange={event => setQuery(event.target.value)}
            onKeyDown={handleSearchKeyDown}
            aria-label={copy.ueAgentUi.projectExplorer.searchPlaceholder}
          />
          {query && (
            <button
              type="button"
              className="ue-explorer-search-clear"
              onClick={clearSearch}
              aria-label={copy.ueAgentUi.projectExplorer.clearSearch}
              title={copy.ueAgentUi.projectExplorer.clearSearch}
            >
              ×
            </button>
          )}
        </div>
        <span className="ue-explorer-result-count" aria-live="polite">
          {copy.ueAgentUi.projectExplorer.resultCount(
            visibleNodes.length,
            assetNodes.length,
          )}
        </span>
      </div>

      {refreshError && (
        <div className="ue-explorer-refresh-error" role="alert">
          <strong>{copy.ueAgentUi.projectExplorer.refreshErrorTitle}</strong>
          <span>{refreshError}</span>
        </div>
      )}

      <div
        className="ue-explorer-tree"
        aria-label={copy.ueAgentUi.projectExplorer.listAriaLabel}
        role="listbox"
      >
        {assetNodes.length === 0 ? (
          <div className="ue-tree-empty">
            <span className="ue-empty-state-icon" aria-hidden="true">
              <EmptyAssetsIcon />
            </span>
            <span className="ue-tree-empty-title">
              {copy.ueAgentUi.projectExplorer.emptyTitle}
            </span>
            <span className="ue-tree-empty-body">
              {copy.ueAgentUi.projectExplorer.emptyGuidance}
            </span>
            <button
              type="button"
              className="ue-tree-empty-action"
              onClick={onRefresh}
              disabled={isRefreshing}
            >
              {isRefreshing
                ? copy.ueAgentUi.projectExplorer.refreshing
                : copy.ueAgentUi.projectExplorer.refresh}
            </button>
          </div>
        ) : visibleNodes.length === 0 ? (
          <div className="ue-tree-empty">
            <span className="ue-empty-state-icon" aria-hidden="true">
              <SearchEmptyIcon />
            </span>
            <span className="ue-tree-empty-title">
              {copy.ueAgentUi.projectExplorer.noMatchesTitle}
            </span>
            <span className="ue-tree-empty-body">
              {copy.ueAgentUi.projectExplorer.noMatches(trimmedQuery)}
            </span>
            <button
              type="button"
              className="ue-tree-empty-action"
              onClick={clearSearch}
            >
              {copy.ueAgentUi.projectExplorer.clearSearch}
            </button>
          </div>
        ) : (
          visibleNodes.map(node => {
            const isEffectiveTarget = node.path === targetAssetPath;
            const isManualTarget = node.path === manualTargetAssetPath;
            const isRoving = node.path === resolvedRovingPath;
            const targetKind = isManualTarget
              ? 'manual'
              : isEffectiveTarget
                ? 'effective'
                : 'none';
            const rowClass = [
              'ue-tree-row',
              isEffectiveTarget ? 'ue-tree-row-selected' : '',
              node.isCurrent ? 'ue-tree-row-current' : '',
              node.isDirty ? 'ue-tree-row-warning' : '',
            ]
              .filter(Boolean)
              .join(' ');

            return (
              <div
                key={node.id}
                ref={element => {
                  if (element) {
                    rowRefs.current.set(node.path, element);
                  } else {
                    rowRefs.current.delete(node.path);
                  }
                }}
                className={rowClass}
                role="option"
                aria-label={node.path}
                aria-selected={isEffectiveTarget}
                tabIndex={isRoving ? 0 : -1}
                data-explorer-asset-path={node.path}
                data-current-asset={String(node.isCurrent)}
                data-open-asset={String(node.isOpen)}
                data-target-kind={targetKind}
                data-dirty-asset={String(node.isDirty)}
                onFocus={() => setRovingPath(node.path)}
                onClick={() => {
                  setRovingPath(node.path);
                  onSelectAsset?.(node.path);
                }}
                onKeyDown={event => handleRowKeyDown(event, node)}
                title={node.path}
              >
                {renderKindIcon(node.kind)}
                <span className="ue-tree-name">{node.name}</span>
                <span className="ue-tree-badges" aria-hidden="true">
                  {node.isCurrent && (
                    <span className="ue-tree-badge ue-tree-badge-current">
                      {copy.ueAgentUi.projectExplorer.currentAssetLabel}
                    </span>
                  )}
                  {node.isOpen && (
                    <span className="ue-tree-badge ue-tree-badge-open">
                      {copy.ueAgentUi.projectExplorer.openAssetLabel}
                    </span>
                  )}
                  {isEffectiveTarget && (
                    <span className="ue-tree-badge ue-tree-badge-target">
                      {copy.ueAgentUi.projectExplorer.activeTargetLabel}
                    </span>
                  )}
                  {isManualTarget && (
                    <span className="ue-tree-badge ue-tree-badge-manual">
                      {copy.ueAgentUi.projectExplorer.chosenTargetLabel}
                    </span>
                  )}
                </span>
                {node.isDirty && (
                  <span
                    className="ue-tree-warning-dot"
                    title={copy.ueAgentUi.projectExplorer.dirtyTooltip}
                    aria-label={copy.ueAgentUi.projectExplorer.dirtyTooltip}
                  />
                )}
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}
