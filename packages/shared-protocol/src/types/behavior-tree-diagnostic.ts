// ── Behavior Tree / Blackboard Read-Only Diagnostic ────────────
//
// Response from GET /context/behavior-tree-diagnostic?assetPath=...
// Read-only BT asset identity, node hierarchy, and Blackboard key definitions.
// No runtime BB values, no PIE/world context, no AI controller state.

export interface BehaviorTreeAssetInfo {
  /** Short asset name, e.g. "BT_MonsterAI" */
  assetName: string;
  /** Full asset path, e.g. "/Game/AI/BT_MonsterAI" */
  assetPath: string;
  /** NodeId of the root composite, or null */
  rootNodeId: string | null;
  /** Display name of the root composite node, or null */
  rootNodeName: string | null;
  /** Linked Blackboard asset name, or null if unset */
  blackboardAssetName: string | null;
  /** Linked Blackboard asset path, or null if unset */
  blackboardAssetPath: string | null;
}

export type BehaviorTreeNodeKind = 'Root' | 'Composite' | 'Decorator' | 'Service' | 'Task';

export interface BehaviorTreeNodeEntry {
  /** Stable identifier (hex pointer or index within this response) */
  nodeId: string;
  /** Node display name (NodeName from UBTNode) */
  nodeName: string;
  /** Classified kind */
  nodeKind: BehaviorTreeNodeKind;
  /** UE class name, e.g. "BTComposite_Sequence", "BTTask_MoveTo" */
  className: string;
  /** Parent nodeId in hierarchy, or null for root */
  parentNodeId: string | null;
  /** Child nodeIds in hierarchy */
  childNodeIds: string[];
}

export interface BlackboardKeyDefinition {
  /** EntryName (FName) of the FBlackboardEntry */
  keyName: string;
  /** UE class name of the KeyType, e.g. "BlackboardKeyType_Bool" */
  keyType: string;
  /** Whether this key is instance-synced (bInstanceSynced) */
  bInstanceSynced: boolean;
}

export interface BehaviorTreeDiagnosticWarning {
  /** Machine-readable category, e.g. "missing_blackboard", "empty_tree" */
  type: string;
  /** Human-readable message */
  message: string;
}

export interface BehaviorTreeDiagnosticResponse {
  /** Asset identity information */
  asset: BehaviorTreeAssetInfo;
  /** Flat node hierarchy list. Roots have parentNodeId === null. */
  nodeHierarchy: BehaviorTreeNodeEntry[];
  /** Blackboard key definitions (including inherited parent keys) */
  blackboardKeys: BlackboardKeyDefinition[];
  /** Total node count (root + composites + decorators + services + tasks) */
  nodeCount: number;
  /** Total blackboard key count */
  bbKeyCount: number;
  /** Non-fatal warnings (missing blackboard, partial walk, etc.) */
  warnings: BehaviorTreeDiagnosticWarning[];
  /** Source identifier, e.g. "OmueBehaviorTreeReadCollector v1" */
  source: string;
  /** UTC ISO-8601 timestamp of collection */
  timestamp: string;
}
