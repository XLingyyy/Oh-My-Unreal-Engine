import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { AssetContext } from '@omue/shared-protocol';
import {
  buildExplorerAssetNodes,
  filterExplorerAssetNodes,
  findNextExplorerAssetIndex,
  resolveExplorerRovingPath,
} from '../renderer/components/workbench/projectExplorerModel';

const desktopRoot = process.cwd();
const sourcePath = (relativePath: string): string => resolve(desktopRoot, relativePath);
const readSource = (relativePath: string): string =>
  readFileSync(sourcePath(relativePath), 'utf8');

function makeAsset(
  path: string,
  name?: string,
  overrides?: Partial<AssetContext>,
): AssetContext {
  return {
    assetName: name ?? path.split('/').pop() ?? 'Asset',
    assetPath: path,
    assetClass: 'Blueprint',
    packagePath: path.slice(0, path.lastIndexOf('/') + 1),
    isDirty: false,
    isSelected: false,
    isOpenInEditor: true,
    ...overrides,
  };
}

test('Project Explorer pure model boundary exists and is compiled for Agent UI tests', () => {
  assert.equal(
    existsSync(sourcePath(
      'src/renderer/components/workbench/projectExplorerModel.ts',
    )),
    true,
  );
  assert.match(
    readSource('tsconfig.agent-tests.json'),
    /renderer\/components\/workbench\/projectExplorerModel\.ts/,
  );
});

test('buildExplorerAssetNodes dedupes by asset path and preserves current/open/dirty facts', () => {
  const current = makeAsset('/Game/Characters/BP_Player', 'BP_Player', {
    isDirty: false,
    isSelected: true,
    isOpenInEditor: false,
  });
  const duplicateOpen = makeAsset('/Game/Characters/BP_Player', 'BP_Player', {
    isDirty: true,
    isSelected: false,
    isOpenInEditor: true,
  });
  const otherOpen = makeAsset('/Game/Maps/L_Main', 'L_Main', {
    assetClass: 'World',
  });

  const nodes = buildExplorerAssetNodes(current, [duplicateOpen, otherOpen]);

  assert.equal(nodes.length, 2);
  assert.deepEqual(nodes[0], {
    id: '/Game/Characters/BP_Player',
    name: 'BP_Player',
    path: '/Game/Characters/BP_Player',
    kind: 'Blueprint',
    isCurrent: true,
    isOpen: true,
    isDirty: true,
  });
  assert.deepEqual(nodes[1], {
    id: '/Game/Maps/L_Main',
    name: 'L_Main',
    path: '/Game/Maps/L_Main',
    kind: 'Map',
    isCurrent: false,
    isOpen: true,
    isDirty: false,
  });
});

test('buildExplorerAssetNodes emits only supplied current/open assets without synthetic ancestors', () => {
  const current = makeAsset('/Game/Characters/Heroes/BP_Player', 'BP_Player');
  const open = makeAsset('/Game/UI/WBP_HUD', 'WBP_HUD', {
    assetClass: 'WidgetBlueprint',
  });

  const nodes = buildExplorerAssetNodes(current, [open]);

  assert.deepEqual(nodes.map(node => node.path), [
    '/Game/Characters/Heroes/BP_Player',
    '/Game/UI/WBP_HUD',
  ]);
  assert.equal(nodes.some(node => node.path === '/Game'), false);
  assert.equal(nodes.some(node => node.path === '/Game/Characters'), false);
});

test('filterExplorerAssetNodes matches name and full path case-insensitively', () => {
  const nodes = buildExplorerAssetNodes(undefined, [
    makeAsset('/Game/Characters/BP_PlayerCharacter', 'BP_PlayerCharacter'),
    makeAsset('/Game/UI/WBP_HUD', 'WBP_HUD', { assetClass: 'WidgetBlueprint' }),
  ]);

  assert.deepEqual(
    filterExplorerAssetNodes(nodes, 'player').map(node => node.path),
    ['/Game/Characters/BP_PlayerCharacter'],
  );
  assert.deepEqual(
    filterExplorerAssetNodes(nodes, '  /GAME/UI/  ').map(node => node.path),
    ['/Game/UI/WBP_HUD'],
  );
  assert.deepEqual(filterExplorerAssetNodes(nodes, 'missing'), []);
  assert.deepEqual(filterExplorerAssetNodes(nodes, ''), nodes);
});

test('findNextExplorerAssetIndex wraps in both directions and handles no visible rows', () => {
  assert.equal(findNextExplorerAssetIndex(3, 0, 1), 1);
  assert.equal(findNextExplorerAssetIndex(3, 2, 1), 0);
  assert.equal(findNextExplorerAssetIndex(3, 0, -1), 2);
  assert.equal(findNextExplorerAssetIndex(3, 2, -1), 1);
  assert.equal(findNextExplorerAssetIndex(3, -1, 1), 0);
  assert.equal(findNextExplorerAssetIndex(3, -1, -1), 2);
  assert.equal(findNextExplorerAssetIndex(0, 0, 1), -1);
});

test('resolveExplorerRovingPath keeps the first visible preferred path or falls back to first row', () => {
  const nodes = buildExplorerAssetNodes(undefined, [
    makeAsset('/Game/A'),
    makeAsset('/Game/B'),
  ]);

  assert.equal(
    resolveExplorerRovingPath(nodes, ['/Game/Missing', '/Game/B', '/Game/A']),
    '/Game/B',
  );
  assert.equal(resolveExplorerRovingPath(nodes, [undefined]), '/Game/A');
  assert.equal(resolveExplorerRovingPath([], ['/Game/A']), null);
});

test('Project Explorer renders factual listbox semantics and stable row facts', () => {
  const src = readSource('src/renderer/components/workbench/ProjectExplorer.tsx');
  assert.match(src, /projectExplorerModel/);
  assert.match(src, /role="listbox"/);
  assert.match(src, /role="option"/);
  assert.doesNotMatch(src, /role="tree"/);
  assert.doesNotMatch(src, /role="treeitem"/);
  assert.match(src, /data-explorer-asset-path=/);
  assert.match(src, /data-current-asset=/);
  assert.match(src, /data-open-asset=/);
  assert.match(src, /data-target-kind=/);
  assert.match(src, /aria-selected=/);
  assert.match(src, /tabIndex=\{isRoving \? 0 : -1\}/);
});

test('Project Explorer exposes search clear, keyboard roving and focus return contracts', () => {
  const src = readSource('src/renderer/components/workbench/ProjectExplorer.tsx');
  assert.match(src, /clearSearch/);
  assert.match(src, /type="text"/);
  assert.doesNotMatch(src, /type="search"/);
  assert.match(src, /searchInputRef/);
  assert.match(src, /rowRefs/);
  assert.match(src, /ArrowDown/);
  assert.match(src, /ArrowUp/);
  assert.match(src, /event\.key === ['"]Enter['"]/);
  assert.match(src, /event\.key === ['"] ['"]/);
  assert.match(src, /event\.key === ['"]Escape['"]/);
  assert.match(src, /findNextExplorerAssetIndex/);
  assert.match(src, /resolveExplorerRovingPath/);
});

test('Project Explorer shows factual scope, badges, count, truthful empty and manual refresh states', () => {
  const src = readSource('src/renderer/components/workbench/ProjectExplorer.tsx');
  for (const key of [
    'scopeNote',
    'resultCount',
    'currentAssetLabel',
    'openAssetLabel',
    'activeTargetLabel',
    'chosenTargetLabel',
    'dirtyTooltip',
    'noMatchesTitle',
    'noMatches',
    'clearSearch',
    'emptyTitle',
    'emptyGuidance',
    'refresh',
    'refreshing',
    'refreshErrorTitle',
  ]) {
    assert.match(src, new RegExp(`projectExplorer\\.${key}`), `missing UI copy ${key}`);
  }
  assert.match(src, /aria-busy=\{isRefreshing\}/);
  assert.match(src, /disabled=\{isRefreshing\}/);
  assert.match(src, /onClick=\{onRefresh\}/);
});

test('Shell wires only existing composer target and bridge refresh authorities', () => {
  const src = readSource('src/renderer/components/workbench/AgentWorkbenchShell.tsx');
  const explorerCalls = src.match(/<ProjectExplorer[\s\S]*?\/>/g) ?? [];
  assert.equal(explorerCalls.length, 2);
  for (const call of explorerCalls) {
    assert.match(call, /targetAssetPath=\{state\.composer\.state\.targetAssetPath\}/);
    assert.match(call, /manualTargetAssetPath=\{state\.composer\.targetChoice\}/);
    assert.match(call, /onSelectAsset=\{state\.composer\.selectAssetTarget\}/);
    assert.match(call, /isRefreshing=\{state\.bridge\.isRefreshing\}/);
    assert.match(call, /refreshError=\{state\.bridge\.error\}/);
    assert.match(call, /onRefresh=\{state\.bridge\.refreshContext\}/);
    assert.doesNotMatch(call, /startSession|refreshSessions|window\.omue/);
  }
});

test('typed English and Chinese Explorer copy covers the factual workflow', () => {
  const types = readSource('src/renderer/i18n/types.ts');
  const english = readSource('src/renderer/i18n/dict-en.ts');
  const chinese = readSource('src/renderer/i18n/dict-zh.ts');
  const keys = [
    'title',
    'scopeNote',
    'listAriaLabel',
    'searchPlaceholder',
    'clearSearch',
    'refresh',
    'refreshing',
    'refreshErrorTitle',
    'currentAssetLabel',
    'openAssetLabel',
    'activeTargetLabel',
    'chosenTargetLabel',
    'dirtyTooltip',
    'resultCount',
    'panelCollapseAria',
    'panelExpandAria',
    'overlayLabel',
    'noMatchesTitle',
    'noMatches',
    'emptyTitle',
    'emptyGuidance',
  ];

  for (const key of keys) {
    assert.match(types, new RegExp(`${key}:`), `types missing ${key}`);
    assert.match(english, new RegExp(`${key}:`), `English copy missing ${key}`);
    assert.match(chinese, new RegExp(`${key}:`), `Chinese copy missing ${key}`);
  }
  assert.match(english, /title:\s*['"]Current \/ Open Assets['"]/);
  assert.match(chinese, /title:\s*['"]当前 \/ 已打开资产['"]/);
  assert.doesNotMatch(english, /title:\s*['"]Project Explorer['"]/);
  assert.doesNotMatch(chinese, /title:\s*['"]项目资源浏览器['"]/);
});

test('Explorer CSS covers factual header, controls, badges, focus, error and empty actions', () => {
  const css = readSource('src/renderer/components/workbench/workbench.css');
  for (const selector of [
    '.ue-explorer-scope-note',
    '.ue-explorer-toolbar',
    '.ue-explorer-search-clear',
    '.ue-explorer-refresh',
    '.ue-explorer-refresh-error',
    '.ue-explorer-result-count',
    '.ue-tree-row:focus-visible',
    '.ue-tree-badges',
    '.ue-tree-badge-target',
    '.ue-tree-empty-action',
  ]) {
    assert.match(css, new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('Explorer implementation stays Renderer-only and does not add unsafe capabilities', () => {
  const combined = [
    readSource('src/renderer/components/workbench/projectExplorerModel.ts'),
    readSource('src/renderer/components/workbench/ProjectExplorer.tsx'),
    readSource('src/renderer/components/workbench/AgentWorkbenchShell.tsx'),
  ].join('\n');
  assert.doesNotMatch(
    combined,
    /WebSocket|OpenAI|Anthropic|AssetRegistry|compileBlueprint|Automation|PIE|saveAsset|writeAsset/i,
  );
});
