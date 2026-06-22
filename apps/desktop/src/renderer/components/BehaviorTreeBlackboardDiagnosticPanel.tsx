import { useState, useMemo, useRef, useCallback } from 'react';
import { useDesktopCopy } from '../i18n';
import type { BridgeClient } from '../services/bridge-client';
import type { BehaviorTreeDiagnosticResponse, BehaviorTreeDiagnosticWarning } from '@omue/shared-protocol';

// ── Types ──────────────────────────────────────────────────────

interface BtNode {
  id: string;
  name: string;
  kind: 'root' | 'composite' | 'decorator' | 'service' | 'task';
  parentId: string | null;
  children: BtNode[];
  // Detail properties
  className?: string;
  decorators?: {
    label: string;
    abortMode?: string;
    observedKey?: string;
  }[];
  services?: {
    label: string;
    interval: string;
    randomDeviation: string;
  }[];
  tasks?: {
    label: string;
    taskClass: string;
  }[];
  referencedBbKeys: string[];
}

interface BbKey {
  id: string;
  name: string;
  type: string;
  scope: string;
  defaultValue: string;
  isObserved: boolean;
  referenceCount: number;
}

interface BtBbReference {
  nodeId: string;
  nodeName: string;
  keyId: string;
  keyName: string;
  kind: 'decorator' | 'service' | 'task';
}

interface ReadinessItem {
  id: string;
  label: string;
  status: 'info' | 'warning' | 'error';
}

// ── Component Props ──────────────────────────────────────────────

interface BehaviorTreeBlackboardDiagnosticPanelProps {
  /** Optional bridge client for real endpoint mode. If omitted, only mock mode is available. */
  bridgeClient?: BridgeClient;
}

// ── Mock Fixture Data (deterministic, Desktop-only) ───────────

const MOCK_ASSET = {
  name: 'BT_CombatGuard',
  path: '/Game/AI/BT_CombatGuard',
  source: 'Desktop mock fixture' as const,
};

const MOCK_BB_KEYS: BbKey[] = [
  { id: 'bb-hasenemy', name: 'HasEnemy', type: 'Bool', scope: 'Instance', defaultValue: 'false', isObserved: true, referenceCount: 2 },
  { id: 'bb-movetarget', name: 'MoveTarget', type: 'Object (Actor)', scope: 'Instance', defaultValue: 'None', isObserved: true, referenceCount: 2 },
  { id: 'bb-patrolcenter', name: 'PatrolCenter', type: 'Vector', scope: 'Instance', defaultValue: '(0,0,0)', isObserved: false, referenceCount: 1 },
  { id: 'bb-attackcooldown', name: 'AttackCooldown', type: 'Float', scope: 'Instance', defaultValue: '3.0', isObserved: true, referenceCount: 1 },
  { id: 'bb-hasammo', name: 'HasAmmo', type: 'Bool', scope: 'Instance', defaultValue: 'true', isObserved: true, referenceCount: 1 },
  { id: 'bb-focustarget', name: 'FocusTarget', type: 'Name', scope: 'Instance', defaultValue: 'None', isObserved: false, referenceCount: 1 },
  { id: 'bb-attackmontage', name: 'AttackMontage', type: 'Object (AnimMontage)', scope: 'Instance', defaultValue: 'None', isObserved: false, referenceCount: 1 },
  { id: 'bb-waittime', name: 'WaitTime', type: 'Float', scope: 'Instance', defaultValue: '1.0', isObserved: false, referenceCount: 2 },
  { id: 'bb-acceptableradius', name: 'AcceptableRadius', type: 'Float', scope: 'Instance', defaultValue: '100.0', isObserved: false, referenceCount: 1 },
  { id: 'bb-combatstate', name: 'CombatState', type: 'Enum (ECombatState)', scope: 'Instance', defaultValue: 'Idle', isObserved: true, referenceCount: 0 },
];

const KEY_MAP = Object.fromEntries(MOCK_BB_KEYS.map(k => [k.id, k]));

function buildMockTree(): BtNode[] {
  const root: BtNode = {
    id: 'seq-root',
    name: 'Root Sequence',
    kind: 'root',
    parentId: null,
    children: [],
    className: 'Sequence',
    referencedBbKeys: [],
  };

  const selector: BtNode = {
    id: 'sel-combat',
    name: 'Combat Selector',
    kind: 'composite',
    parentId: root.id,
    children: [],
    className: 'Selector',
    referencedBbKeys: [],
  };

  const condDecorator: BtNode = {
    id: 'dec-hasenemy',
    name: 'Condition_HasEnemy',
    kind: 'decorator',
    parentId: selector.id,
    children: [],
    className: 'BBConditionalDecorator',
    decorators: [{ label: 'Condition_HasEnemy', abortMode: 'Self', observedKey: 'HasEnemy' }],
    referencedBbKeys: ['bb-hasenemy'],
  };

  const moveTo: BtNode = {
    id: 'task-moveto',
    name: 'MoveTo',
    kind: 'task',
    parentId: condDecorator.id,
    children: [],
    className: 'BTTask_MoveTo',
    referencedBbKeys: ['bb-movetarget', 'bb-acceptableradius'],
  };
  condDecorator.children.push(moveTo);

  const patrolService: BtNode = {
    id: 'svc-patrol',
    name: 'Service_Patrol',
    kind: 'service',
    parentId: selector.id,
    children: [],
    className: 'BTService_BlueprintBase',
    services: [{ label: 'Service_Patrol', interval: '1.0 s', randomDeviation: '0.2 s' }],
    referencedBbKeys: ['bb-patrolcenter'],
  };

  const patrolWait: BtNode = {
    id: 'task-patrolwait',
    name: 'Patrol_Wait',
    kind: 'task',
    parentId: patrolService.id,
    children: [],
    className: 'BTTask_Wait',
    referencedBbKeys: ['bb-waittime', 'bb-patrolcenter'],
  };
  patrolService.children.push(patrolWait);

  const attackSeq: BtNode = {
    id: 'seq-attack',
    name: 'Attack Sequence',
    kind: 'composite',
    parentId: selector.id,
    children: [],
    className: 'Sequence',
    referencedBbKeys: [],
  };

  const cooldownDec: BtNode = {
    id: 'dec-cooldown',
    name: 'CooldownCheck',
    kind: 'decorator',
    parentId: attackSeq.id,
    children: [],
    className: 'BBDecorator_Cooldown',
    decorators: [{ label: 'CooldownCheck', abortMode: 'None', observedKey: 'AttackCooldown' }],
    referencedBbKeys: ['bb-attackcooldown'],
  };

  const setFocus: BtNode = {
    id: 'task-setfocus',
    name: 'SetFocus',
    kind: 'task',
    parentId: cooldownDec.id,
    children: [],
    className: 'BTTask_SetFocus',
    referencedBbKeys: ['bb-focustarget'],
  };
  cooldownDec.children.push(setFocus);

  const ammoDec: BtNode = {
    id: 'dec-ammo',
    name: 'AmmoCheck',
    kind: 'decorator',
    parentId: attackSeq.id,
    children: [],
    className: 'BBConditionalDecorator',
    decorators: [{ label: 'AmmoCheck', abortMode: 'Both', observedKey: 'HasAmmo' }],
    referencedBbKeys: ['bb-hasammo'],
  };

  const playMontage: BtNode = {
    id: 'task-playmontage',
    name: 'PlayMontage',
    kind: 'task',
    parentId: ammoDec.id,
    children: [],
    className: 'BTTask_PlayMontage',
    referencedBbKeys: ['bb-attackmontage'],
  };
  ammoDec.children.push(playMontage);

  const wait: BtNode = {
    id: 'task-wait',
    name: 'Wait',
    kind: 'task',
    parentId: attackSeq.id,
    children: [],
    className: 'BTTask_Wait',
    referencedBbKeys: ['bb-waittime'],
  };

  attackSeq.children.push(cooldownDec, ammoDec, wait);
  selector.children.push(condDecorator, patrolService, attackSeq);

  const senseService: BtNode = {
    id: 'svc-sense',
    name: 'Service_SenseEnemies',
    kind: 'service',
    parentId: root.id,
    children: [],
    className: 'BTService_BlueprintBase',
    services: [{ label: 'Service_SenseEnemies', interval: '0.3 s', randomDeviation: '0.05 s' }],
    referencedBbKeys: ['bb-hasenemy', 'bb-movetarget'],
  };

  const senseTask: BtNode = {
    id: 'task-sense',
    name: 'SenseEnemy',
    kind: 'task',
    parentId: senseService.id,
    children: [],
    className: 'BTTask_BlueprintBase',
    referencedBbKeys: ['bb-hasenemy', 'bb-movetarget'],
  };
  senseService.children.push(senseTask);

  root.children.push(selector, senseService);
  return [root];
}

const MOCK_TREE = buildMockTree();

// Build flat node map for lookup
function buildNodeMap(nodes: BtNode[]): Record<string, BtNode> {
  const map: Record<string, BtNode> = {};
  function walk(list: BtNode[]) {
    for (const n of list) {
      map[n.id] = n;
      if (n.children.length > 0) walk(n.children);
    }
  }
  walk(nodes);
  return map;
}

const NODE_MAP = buildNodeMap(MOCK_TREE);

function buildReferences(nodes: BtNode[]): BtBbReference[] {
  const refs: BtBbReference[] = [];
  function walk(list: BtNode[]) {
    for (const n of list) {
      let refKind: BtBbReference['kind'] = 'task';
      if (n.kind === 'decorator') refKind = 'decorator';
      else if (n.kind === 'service') refKind = 'service';
      for (const kId of n.referencedBbKeys) {
        const key = KEY_MAP[kId];
        if (key) {
          refs.push({ nodeId: n.id, nodeName: n.name, keyId: kId, keyName: key.name, kind: refKind });
        }
      }
      walk(n.children);
    }
  }
  walk(nodes);
  return refs;
}

const MOCK_REFERENCES = buildReferences(MOCK_TREE);


function countNodes(nodes: BtNode[]): number {
  let count = 0;
  function walk(list: BtNode[]) {
    for (const n of list) {
      count++;
      if (n.children.length > 0) walk(n.children);
    }
  }
  walk(nodes);
  return count;
}

const TOTAL_NODES = countNodes(MOCK_TREE);

// Compute counts statically
function countKind(nodes: BtNode[], kind: BtNode['kind']): number {
  let c = 0;
  function walk(list: BtNode[]) {
    for (const n of list) {
      if (n.kind === kind) c++;
      walk(n.children);
    }
  }
  walk(nodes);
  return c;
}

const DECORATOR_COUNT = countKind(MOCK_TREE, 'decorator');
const SERVICE_COUNT = countKind(MOCK_TREE, 'service');
const TASK_COUNT = countKind(MOCK_TREE, 'task');

// ── Map shared-protocol response to internal types ──────────────

function mapResponseToTree(response: BehaviorTreeDiagnosticResponse): {
  tree: BtNode[];
  keys: BbKey[];
  refs: BtBbReference[];
} {
  const allNodes: Record<string, BtNode> = {};

  // Create BtNode entries
  for (const entry of response.nodeHierarchy) {
    const kindMap: Record<string, BtNode['kind']> = {
      Root: 'root',
      Composite: 'composite',
      Decorator: 'decorator',
      Service: 'service',
      Task: 'task',
    };
    const kind = kindMap[entry.nodeKind] ?? 'task';

    allNodes[entry.nodeId] = {
      id: entry.nodeId,
      name: entry.nodeName,
      kind,
      parentId: entry.parentNodeId,
      children: [],
      className: entry.className,
      referencedBbKeys: [],
    };
  }

  // Wire children
  const tree: BtNode[] = [];
  for (const entry of response.nodeHierarchy) {
    const node = allNodes[entry.nodeId];
    if (entry.parentNodeId && allNodes[entry.parentNodeId]) {
      allNodes[entry.parentNodeId].children.push(node);
    } else {
      tree.push(node);
    }
  }

  // Map BB keys
  const keys: BbKey[] = response.blackboardKeys.map((k, i) => ({
    id: `bb-${i}`,
    name: k.keyName,
    type: k.keyType,
    scope: k.bInstanceSynced ? 'Instance' : 'Shared',
    defaultValue: '',
    isObserved: k.bInstanceSynced,
    referenceCount: 0,
  }));

  const keyMap = Object.fromEntries(keys.map(k => [k.name.toLowerCase(), k]));

  // Build references (nodeName → keyName heuristic; real endpoint doesn't provide selectors)
  const refs: BtBbReference[] = [];
  for (const entry of response.nodeHierarchy) {
    const node = allNodes[entry.nodeId];
    if (!node) continue;
    let refKind: BtBbReference['kind'] = 'task';
    if (node.kind === 'decorator') refKind = 'decorator';
    else if (node.kind === 'service') refKind = 'service';
    // Scan node name for key name matches as a simple heuristic
    const lowerName = node.name.toLowerCase();
    for (const key of keys) {
      if (lowerName.includes(key.name.toLowerCase())) {
        refs.push({ nodeId: node.id, nodeName: node.name, keyId: key.id, keyName: key.name, kind: refKind });
      }
    }
  }

  return { tree, keys, refs };
}

// ── Exported diagnostic summary for integration ──────────────

export interface BtBbDiagnosticSummary {
  source: string;
  assetName: string;
  assetPath: string;
  nodeCount: number;
  bbKeyCount: number;
  refCount: number;
  decoratorCount: number;
  serviceCount: number;
  taskCount: number;
  hasSelectedNode: boolean;
  selectedNodeName: string | null;
  readinessLabels: string[];
  isMockOnly: boolean;
}

export const MOCK_BB_DIAGNOSTIC_SUMMARY: BtBbDiagnosticSummary = {
  source: 'Desktop mock fixture',
  assetName: MOCK_ASSET.name,
  assetPath: MOCK_ASSET.path,
  nodeCount: TOTAL_NODES,
  bbKeyCount: MOCK_BB_KEYS.length,
  refCount: MOCK_REFERENCES.length,
  decoratorCount: DECORATOR_COUNT,
  serviceCount: SERVICE_COUNT,
  taskCount: TASK_COUNT,
  hasSelectedNode: false,
  selectedNodeName: null,
  readinessLabels: [
    'Mock fixture only — no real UE data',
    'No UE bridge endpoint implemented',
    'No shared-protocol schema',
    'Header verification required for yellow zone collector',
  ],
  isMockOnly: true,
};

// ── Component ──────────────────────────────────────────────────

export function BehaviorTreeBlackboardDiagnosticPanel({ bridgeClient }: BehaviorTreeBlackboardDiagnosticPanelProps) {
  const { copy } = useDesktopCopy();
  const btbb = copy.behaviorTreeBlackboard;
  const common = copy.common;

  // ── Mode state ────────────────────────────────────────────
  const [mode, setMode] = useState<'mock' | 'real'>('mock');
  const [assetPath, setAssetPath] = useState('/Game/AI/BT_MonsterAI');
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [realResponse, setRealResponse] = useState<BehaviorTreeDiagnosticResponse | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [keySearch, setKeySearch] = useState('');
  const [keyTypeFilter, setKeyTypeFilter] = useState<string>('all');
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  // ── Data source selection ────────────────────────────────
  const isRealMode = mode === 'real' && realResponse !== null;

  const activeData = useMemo(() => {
    if (isRealMode && realResponse) {
      return mapResponseToTree(realResponse);
    }
    return {
      tree: MOCK_TREE,
      keys: MOCK_BB_KEYS,
      refs: MOCK_REFERENCES,
    };
  }, [isRealMode, realResponse]);

  const activeAssetInfo = useMemo(() => {
    if (isRealMode && realResponse) {
      return {
        name: realResponse.asset.assetName,
        path: realResponse.asset.assetPath,
        source: realResponse.source,
        warnings: realResponse.warnings,
        nodeCount: realResponse.nodeCount,
        bbKeyCount: realResponse.bbKeyCount,
      };
    }
    return {
      name: MOCK_ASSET.name,
      path: MOCK_ASSET.path,
      source: MOCK_ASSET.source,
      warnings: [] as BehaviorTreeDiagnosticWarning[],
      nodeCount: TOTAL_NODES,
      bbKeyCount: MOCK_BB_KEYS.length,
    };
  }, [isRealMode, realResponse]);

  // Node counts for mock mode
  const mockDecoratorCount = useMemo(() => {
    let c = 0;
    function walk(list: BtNode[]) {
      for (const n of list) {
        if (n.kind === 'decorator') c++;
        if (n.children.length > 0) walk(n.children);
      }
    }
    walk(MOCK_TREE);
    return c;
  }, []);

  const mockServiceCount = useMemo(() => {
    let c = 0;
    function walk(list: BtNode[]) {
      for (const n of list) {
        if (n.kind === 'service') c++;
        if (n.children.length > 0) walk(n.children);
      }
    }
    walk(MOCK_TREE);
    return c;
  }, []);

  const mockTaskCount = useMemo(() => {
    let c = 0;
    function walk(list: BtNode[]) {
      for (const n of list) {
        if (n.kind === 'task') c++;
        if (n.children.length > 0) walk(n.children);
      }
    }
    walk(MOCK_TREE);
    return c;
  }, []);

  // ── Real mode node counts ────────────────────────────────
  const realNodeCounts = useMemo(() => {
    if (!isRealMode || !realResponse) return null;
    let composites = 0, decorators = 0, services = 0, tasks = 0;
    for (const entry of realResponse.nodeHierarchy) {
      if (entry.nodeKind === 'Composite') composites++;
      else if (entry.nodeKind === 'Decorator') decorators++;
      else if (entry.nodeKind === 'Service') services++;
      else if (entry.nodeKind === 'Task') tasks++;
    }
    return { composites, decorators, services, tasks };
  }, [isRealMode, realResponse]);

  // Build node map for the active tree
  const activeNodeMap = useMemo(() => {
    return buildNodeMap(activeData.tree);
  }, [activeData.tree]);

  // Selected node from the active tree
  const selectedNode = selectedNodeId ? activeNodeMap[selectedNodeId] ?? null : null;

  // ── Load from endpoint ───────────────────────────────────
  const handleLoad = useCallback(async () => {
    if (!bridgeClient || !assetPath.trim()) return;
    setLoading(true);
    setLoadError(null);
    setRealResponse(null);
    setSelectedNodeId(null);

    try {
      const result = await bridgeClient.getBehaviorTreeDiagnostic(assetPath.trim());
      setRealResponse(result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setLoadError(msg);
    } finally {
      setLoading(false);
    }
  }, [bridgeClient, assetPath]);

  // ── Handle Enter key in asset path input ─────────────────
  const handleAssetPathKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleLoad();
    }
  }, [handleLoad]);

  // ── Readiness items ──────────────────────────────────────
  const readinessItems = useMemo((): ReadinessItem[] => {
    if (mode === 'mock') {
      return [
        { id: 'r-mock', label: btbb.readinessMockOnly, status: 'warning' },
        { id: 'r-endpoint', label: btbb.readinessNoEndpoint, status: 'warning' },
        { id: 'r-schema', label: btbb.readinessNoSchema, status: 'info' },
        { id: 'r-header', label: btbb.readinessHeaderVerification, status: 'info' },
      ];
    }
    // Real mode readiness
    if (loadError) {
      return [
        { id: 'r-error', label: `${btbb.loadError}: ${loadError}`, status: 'error' },
      ];
    }
    if (!realResponse) {
      return [
        { id: 'r-notloaded', label: btbb.noDataFromEndpoint, status: 'warning' },
      ];
    }
    const items: ReadinessItem[] = [
      { id: 'r-source', label: `${btbb.sourceLabel}: ${btbb.realApiSource}`, status: 'info' },
    ];
    if (realResponse.warnings && realResponse.warnings.length > 0) {
      items.push({ id: 'r-warnings', label: `${realResponse.warnings.length} ${btbb.warningsSection.toLowerCase()}`, status: 'warning' });
    }
    return items;
  }, [mode, loadError, realResponse, btbb]);

  // Filtered keys
  const filteredKeys = useMemo(() => {
    let result = activeData.keys;
    if (keySearch.trim()) {
      const q = keySearch.toLowerCase();
      result = result.filter(k => k.name.toLowerCase().includes(q) || k.type.toLowerCase().includes(q));
    }
    if (keyTypeFilter !== 'all') {
      result = result.filter(k => k.type.toLowerCase().includes(keyTypeFilter.toLowerCase()));
    }
    return result;
  }, [activeData.keys, keySearch, keyTypeFilter]);

  // Unique key types for filter dropdown
  const keyTypes = useMemo(() => {
    const s = new Set(activeData.keys.map(k => {
      const parts = k.type.split(' ');
      return parts.length > 1 ? parts[0] : k.type;
    }));
    return Array.from(s).sort();
  }, [activeData.keys]);

  // ── Markdown builder ──────────────────────────────────────

  const markdown = useMemo((): string => {
    const lines: string[] = [];

    lines.push(btbb.mdTitle);
    lines.push('');
    lines.push(`${btbb.mdAssetSummary}`);
    lines.push(`- **${common.name}:** ${activeAssetInfo.name}`);
    lines.push(`- **${common.path}:** ${activeAssetInfo.path}`);
    lines.push(`- **${btbb.sourceLabel}:** ${activeAssetInfo.source}`);
    lines.push('');
    lines.push(`- ${btbb.mdSummaryLine(activeAssetInfo.nodeCount, activeAssetInfo.bbKeyCount, activeData.refs.length)}`);
    lines.push('');

    // Tree hierarchy
    lines.push(btbb.mdTreeHierarchy);
    lines.push('');
    function printTree(nodes: BtNode[], depth: number) {
      for (const n of nodes) {
        const indent = '  '.repeat(depth);
        const kindLabel = btbb[`kind${n.kind.charAt(0).toUpperCase() + n.kind.slice(1)}` as keyof typeof btbb] as string;
        lines.push(`${indent}${btbb.mdNodeEntry(n.name, kindLabel)}`);
        if (n.children.length > 0) printTree(n.children, depth + 1);
      }
    }
    printTree(activeData.tree, 0);
    lines.push('');

    // Blackboard keys
    lines.push(btbb.mdBlackboardKeys);
    lines.push('');
    for (const key of activeData.keys) {
      lines.push(btbb.mdKeyEntry(key.name, key.type, key.scope));
    }
    lines.push('');

    // Node → Key references
    if (activeData.refs.length > 0) {
      lines.push(btbb.mdNodeKeyRefs);
      lines.push('');
      for (const ref of activeData.refs) {
        lines.push(btbb.mdRefEntry(ref.nodeName, ref.keyName, ref.kind));
      }
      lines.push('');
    }

    // Warnings (real mode only)
    if (activeAssetInfo.warnings.length > 0) {
      lines.push(`### ${btbb.warningsSection}`);
      lines.push('');
      for (const w of activeAssetInfo.warnings) {
        lines.push(`- **${w.type}**: ${w.message}`);
      }
      lines.push('');
    }

    // Readiness / Risk
    lines.push(btbb.mdReadiness);
    lines.push('');
    for (const item of readinessItems) {
      lines.push(btbb.mdRiskEntry(item.label));
    }
    lines.push('');

    // Safety
    lines.push(btbb.mdSafetyNote);
    lines.push('');

    return lines.join('\n');
  }, [btbb, common, activeData, activeAssetInfo, readinessItems]);

  // ── Copy handler ──────────────────────────────────────────

  const handleCopy = useCallback(async () => {
    if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    try {
      await navigator.clipboard.writeText(markdown);
      setCopyState('copied');
    } catch {
      setCopyState('error');
    }
    copyTimeoutRef.current = setTimeout(() => setCopyState('idle'), 3000);
  }, [markdown]);

  // ── Tree renderer ─────────────────────────────────────────

  function renderTreeNode(node: BtNode, depth: number): JSX.Element {
    const isSelected = selectedNodeId === node.id;
    const kindLabel = btbb[`kind${node.kind.charAt(0).toUpperCase() + node.kind.slice(1)}` as keyof typeof btbb] as string;

    return (
      <div key={node.id}>
        <div
          className={`btbb-tree-node${isSelected ? ' btbb-tree-node-selected' : ''}`}
          style={{ paddingLeft: `${12 + depth * 16}px` }}
          onClick={() => setSelectedNodeId(node.id)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setSelectedNodeId(node.id); }}
        >
          <span className={`btbb-tree-node-kind btbb-kind-${node.kind}`}>{kindLabel}</span>
          <span className="btbb-tree-node-name">{node.name}</span>
        </div>
        {node.children.map(child => renderTreeNode(child, depth + 1))}
      </div>
    );
  }

  // ── Node detail renderer ──────────────────────────────────

  function renderNodeDetail(node: BtNode): JSX.Element {
    const kindLabel = btbb[`kind${node.kind.charAt(0).toUpperCase() + node.kind.slice(1)}` as keyof typeof btbb] as string;
    const parent = node.parentId ? activeNodeMap[node.parentId] : null;
    const childCount = node.children.length;

    return (
      <div className="btbb-detail">
        <div className="btbb-detail-field">
          <span className="btbb-detail-label">{btbb.treeNodeName}</span>
          <span className="btbb-detail-value">{node.name}</span>
        </div>
        <div className="btbb-detail-field">
          <span className="btbb-detail-label">{btbb.treeNodeKind}</span>
          <span className="btbb-detail-value">{kindLabel}{node.className ? ` (${node.className})` : ''}</span>
        </div>
        {parent && (
          <div className="btbb-detail-field">
            <span className="btbb-detail-label">{btbb.treeNodeParent}</span>
            <span className="btbb-detail-value">{parent.name}</span>
          </div>
        )}
        <div className="btbb-detail-field">
          <span className="btbb-detail-label">{btbb.treeNodeChildren}</span>
          <span className="btbb-detail-value">{childCount}</span>
        </div>

        {/* Decorators — mock only (real endpoint provides structure only) */}
        {node.decorators && node.decorators.length > 0 && (
          <div className="btbb-detail-section">
            <span className="btbb-detail-section-title">{btbb.detailDecorators}</span>
            {node.decorators.map((d, i) => (
              <div key={i} className="btbb-detail-subdetail">
                <div className="btbb-detail-field">
                  <span className="btbb-detail-label">Name</span>
                  <span className="btbb-detail-value">{d.label}</span>
                </div>
                {d.abortMode && (
                  <div className="btbb-detail-field">
                    <span className="btbb-detail-label">{btbb.decoratorAbortMode}</span>
                    <span className="btbb-detail-value">{d.abortMode}</span>
                  </div>
                )}
                {d.observedKey && (
                  <div className="btbb-detail-field">
                    <span className="btbb-detail-label">{btbb.decoratorObservedKey}</span>
                    <span className="btbb-detail-value">{d.observedKey}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Services — mock only */}
        {node.services && node.services.length > 0 && (
          <div className="btbb-detail-section">
            <span className="btbb-detail-section-title">{btbb.detailServices}</span>
            {node.services.map((s, i) => (
              <div key={i} className="btbb-detail-subdetail">
                <div className="btbb-detail-field">
                  <span className="btbb-detail-label">Name</span>
                  <span className="btbb-detail-value">{s.label}</span>
                </div>
                <div className="btbb-detail-field">
                  <span className="btbb-detail-label">{btbb.serviceInterval}</span>
                  <span className="btbb-detail-value">{s.interval}</span>
                </div>
                <div className="btbb-detail-field">
                  <span className="btbb-detail-label">{btbb.serviceRandomDeviation}</span>
                  <span className="btbb-detail-value">{s.randomDeviation}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Tasks — mock only */}
        {node.tasks && node.tasks.length > 0 && (
          <div className="btbb-detail-section">
            <span className="btbb-detail-section-title">{btbb.detailTasks}</span>
            {node.tasks.map((t, i) => (
              <div key={i} className="btbb-detail-subdetail">
                <div className="btbb-detail-field">
                  <span className="btbb-detail-label">Name</span>
                  <span className="btbb-detail-value">{t.label}</span>
                </div>
                <div className="btbb-detail-field">
                  <span className="btbb-detail-label">{btbb.taskClass}</span>
                  <span className="btbb-detail-value">{t.taskClass}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Referenced BB Keys */}
        {node.referencedBbKeys.length > 0 && (
          <div className="btbb-detail-section">
            <span className="btbb-detail-section-title">{btbb.detailReferencedBBKeys}</span>
            {node.referencedBbKeys.map(kId => {
              const key = Object.values(activeNodeMap).length > 0 ? undefined : undefined; // handled via keyMap
              const foundKey = activeData.keys.find(k => k.id === kId);
              return foundKey ? (
                <div key={kId} className="btbb-detail-field">
                  <span className="btbb-detail-value btbb-ref-key-name">{foundKey.name}</span>
                  <span className="btbb-detail-label">({foundKey.type})</span>
                </div>
              ) : null;
            })}
          </div>
        )}
      </div>
    );
  }

  // ── Warning item renderer ─────────────────────────────────

  function renderWarning(w: BehaviorTreeDiagnosticWarning, i: number): JSX.Element {
    return (
      <div key={i} className="btbb-warning-item">
        <span className="btbb-warning-icon">⚠</span>
        <span className="btbb-warning-text">
          <strong>{w.type}:</strong> {w.message}
        </span>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────

  return (
    <section className="btbb-panel">
      <div className="btbb-header">
        <h2 className="section-title" style={{ marginBottom: 0 }}>{btbb.panelTitle}</h2>
        <div className="btbb-header-actions">
          {copyState === 'copied' && (
            <span className="btbb-copy-status btbb-copy-ok">{btbb.copied}</span>
          )}
          {copyState === 'error' && (
            <span className="btbb-copy-status btbb-copy-error">{btbb.copyFailed}</span>
          )}
          <button className="refresh-button btbb-copy-btn" onClick={handleCopy}>
            {btbb.copyMarkdown}
          </button>
        </div>
      </div>

      {/* ── Mode Tabs ──────────────────────────────────────── */}
      <div className="btbb-mode-tabs">
        <button
          className={`btbb-mode-tab${mode === 'mock' ? ' btbb-mode-tab-active' : ''}`}
          onClick={() => { setMode('mock'); setSelectedNodeId(null); }}
        >
          {btbb.modeMock}
        </button>
        <button
          className={`btbb-mode-tab${mode === 'real' ? ' btbb-mode-tab-active' : ''}`}
          disabled={!bridgeClient}
          title={!bridgeClient ? 'Bridge client not available' : ''}
          onClick={() => { setMode('real'); setSelectedNodeId(null); }}
        >
          {btbb.modeReal}
        </button>
      </div>

      {/* ── Real Endpoint Input Bar ────────────────────────── */}
      {mode === 'real' && (
        <div className="btbb-endpoint-bar">
          <span className="btbb-endpoint-label">{btbb.assetPathLabel}</span>
          <input
            className="btbb-endpoint-input"
            type="text"
            value={assetPath}
            onChange={(e) => setAssetPath(e.target.value)}
            onKeyDown={handleAssetPathKeyDown}
            placeholder={btbb.assetPathPlaceholder}
            disabled={loading}
          />
          <button
            className="refresh-button btbb-endpoint-load-btn"
            onClick={handleLoad}
            disabled={loading || !assetPath.trim()}
          >
            {loading ? common.loading : btbb.loadFromEndpoint}
          </button>
        </div>
      )}

      {/* ── Loading State ──────────────────────────────────── */}
      {loading && (
        <div className="btbb-loading">{btbb.loadingDiagnostic}</div>
      )}

      {/* ── Error State ────────────────────────────────────── */}
      {loadError && !loading && (
        <div className="btbb-error-bar">
          <span className="btbb-error-text">{btbb.loadError}: {loadError}</span>
          <button className="refresh-button btbb-error-retry" onClick={handleLoad}>
            {btbb.loadRetry}
          </button>
        </div>
      )}

      {/* ── Warnings (real mode) ───────────────────────────── */}
      {isRealMode && activeAssetInfo.warnings.length > 0 && (
        <div className="btbb-warnings-section">
          <h3 className="btbb-section-label">{btbb.warningsSection} ({activeAssetInfo.warnings.length})</h3>
          <div className="btbb-warnings-list">
            {activeAssetInfo.warnings.map((w, i) => renderWarning(w, i))}
          </div>
        </div>
      )}

      {/* ── Partial data warning ───────────────────────────── */}
      {isRealMode && !realResponse?.asset.blackboardAssetName && (
        <div className="btbb-partial-bar">
          {btbb.partialDataMessage}
        </div>
      )}

      {/* ── No data in real mode ──────────────────────────── */}
      {mode === 'real' && !loading && !loadError && !realResponse && (
        <div className="btbb-empty-state">
          {btbb.noDataFromEndpoint}
        </div>
      )}

      {/* ── Main data content — shown only when data exists ── */}
      {(mode === 'mock' || (mode === 'real' && realResponse)) && (
        <>
          {/* Summary Cards */}
          <div className="btbb-summary-strip">
            <span className="btbb-summary-item">
              {btbb.sourceLabel}: <strong className={mode === 'mock' ? 'btbb-mock-label' : ''}>{activeAssetInfo.source}</strong>
            </span>
            <span className="btbb-summary-item">
              {btbb.assetName}: <strong>{activeAssetInfo.name}</strong>
            </span>
            <span className="btbb-summary-item">
              {btbb.assetPath}: <strong className="btbb-mono">{activeAssetInfo.path}</strong>
            </span>
          </div>

          <div className="btbb-stat-strip">
            <span className="btbb-stat-item">{btbb.nodeCount}: <strong>{activeAssetInfo.nodeCount}</strong></span>
            {mode === 'mock' ? (
              <>
                <span className="btbb-stat-item">{btbb.kindComposite}: <strong>{TOTAL_NODES - mockDecoratorCount - mockServiceCount - mockTaskCount}</strong></span>
                <span className="btbb-stat-item">{btbb.kindDecorator}: <strong>{mockDecoratorCount}</strong></span>
                <span className="btbb-stat-item">{btbb.kindService}: <strong>{mockServiceCount}</strong></span>
                <span className="btbb-stat-item">{btbb.kindTask}: <strong>{mockTaskCount}</strong></span>
              </>
            ) : realNodeCounts ? (
              <>
                <span className="btbb-stat-item">{btbb.kindComposite}: <strong>{realNodeCounts.composites}</strong></span>
                <span className="btbb-stat-item">{btbb.kindDecorator}: <strong>{realNodeCounts.decorators}</strong></span>
                <span className="btbb-stat-item">{btbb.kindService}: <strong>{realNodeCounts.services}</strong></span>
                <span className="btbb-stat-item">{btbb.kindTask}: <strong>{realNodeCounts.tasks}</strong></span>
              </>
            ) : null}
            <span className="btbb-stat-item">{btbb.bbKeyCount}: <strong>{activeAssetInfo.bbKeyCount}</strong></span>
            <span className="btbb-stat-item">{btbb.refCount}: <strong>{activeData.refs.length}</strong></span>
          </div>

          {/* Mock-only warning */}
          {mode === 'mock' && (
            <div className="btbb-warning-bar">
              {btbb.mockWarning}
            </div>
          )}

          {/* Tree Hierarchy + Node Detail */}
          <div className="btbb-split">
            <div className="btbb-tree-section">
              <h3 className="btbb-section-label">{btbb.treeHierarchy}</h3>
              <div className="btbb-tree-list">
                {activeData.tree.map(node => renderTreeNode(node, 0))}
              </div>
            </div>

            <div className="btbb-detail-section-container">
              <h3 className="btbb-section-label">
                {selectedNode ? btbb.detailLabel : btbb.selectedNode}
              </h3>
              <div className="btbb-detail-container">
                {selectedNode ? renderNodeDetail(selectedNode) : (
                  <div className="btbb-empty">{btbb.noSelection}</div>
                )}
              </div>
            </div>
          </div>

          {/* Blackboard Key Table */}
          <h3 className="btbb-section-label" style={{ marginTop: 12 }}>{btbb.blackboardKeys}</h3>
          <div className="btbb-key-filters">
            <div className="btbb-filter-group">
              <span className="btbb-filter-label">{btbb.filterName}</span>
              <input
                className="btbb-filter-input"
                type="text"
                value={keySearch}
                onChange={(e) => setKeySearch(e.target.value)}
                placeholder={btbb.filterPlaceholder}
              />
            </div>
            <div className="btbb-filter-group">
              <span className="btbb-filter-label">{btbb.filterType}</span>
              <select
                className="btbb-filter-select"
                value={keyTypeFilter}
                onChange={(e) => setKeyTypeFilter(e.target.value)}
              >
                <option value="all">{common.all}</option>
                {keyTypes.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <span className="btbb-key-count">{filteredKeys.length} / {activeData.keys.length}</span>
          </div>
          <div className="btbb-key-table">
            <div className="btbb-key-table-header">
              <span className="btbb-key-col-name">{btbb.refKeyName}</span>
              <span className="btbb-key-col-type">{btbb.keyType}</span>
              <span className="btbb-key-col-scope">{btbb.keyScope}</span>
              <span className="btbb-key-col-default">{btbb.keyDefault}</span>
              <span className="btbb-key-col-observed">{btbb.keyObserved}</span>
              <span className="btbb-key-col-refs">{btbb.keyRefCount}</span>
            </div>
            {filteredKeys.map(key => (
              <div key={key.id} className={`btbb-key-row${key.isObserved ? ' btbb-key-observed' : ''}`}>
                <span className="btbb-key-col-name btbb-key-name">{key.name}</span>
                <span className="btbb-key-col-type">{key.type}</span>
                <span className="btbb-key-col-scope">{key.scope}</span>
                <span className="btbb-key-col-default btbb-mono">{key.defaultValue}</span>
                <span className="btbb-key-col-observed">
                  <span className={`btbb-badge ${key.isObserved ? 'btbb-badge-yes' : 'btbb-badge-no'}`}>
                    {key.isObserved ? common.yes : common.no}
                  </span>
                </span>
                <span className="btbb-key-col-refs">{key.referenceCount}</span>
              </div>
            ))}
            {filteredKeys.length === 0 && (
              <div className="btbb-empty">{common.empty}</div>
            )}
          </div>

          {/* Reference Matrix */}
          <h3 className="btbb-section-label" style={{ marginTop: 12 }}>{btbb.referenceMatrix} ({activeData.refs.length})</h3>
          <div className="btbb-ref-table">
            <div className="btbb-ref-table-header">
              <span className="btbb-ref-col-node">{btbb.refNode}</span>
              <span className="btbb-ref-col-key">{btbb.refKeyName}</span>
              <span className="btbb-ref-col-kind">{btbb.refKind}</span>
            </div>
            {activeData.refs.map((ref, i) => (
              <div key={`${ref.nodeId}-${ref.keyId}-${i}`} className={`btbb-ref-row btbb-ref-kind-${ref.kind}`}>
                <span className="btbb-ref-col-node">
                  <span className="btbb-ref-node-name"
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedNodeId(ref.nodeId)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setSelectedNodeId(ref.nodeId); }}
                  >
                    {ref.nodeName}
                  </span>
                </span>
                <span className="btbb-ref-col-key btbb-mono">{ref.keyName}</span>
                <span className="btbb-ref-col-kind">
                  <span className={`btbb-kind-badge btbb-kind-${ref.kind}`}>{ref.kind}</span>
                </span>
              </div>
            ))}
          </div>

          {/* Readiness / Risk Checklist */}
          <h3 className="btbb-section-label" style={{ marginTop: 12 }}>{btbb.readinessChecklist}</h3>
          <div className="btbb-readiness-list">
            {readinessItems.map(item => (
              <div key={item.id} className={`btbb-readiness-item btbb-readiness-${item.status}`}>
                <span className="btbb-readiness-icon">
                  {item.status === 'warning' ? '⚠' : item.status === 'error' ? '✗' : 'ℹ'}
                </span>
                <span className="btbb-readiness-text">{item.label}</span>
              </div>
            ))}
          </div>

          {/* Markdown Preview */}
          <h3 className="btbb-section-label" style={{ marginTop: 16 }}>{btbb.markdownPreview}</h3>
          <pre className="btbb-markdown">{markdown}</pre>
        </>
      )}
    </section>
  );
}
