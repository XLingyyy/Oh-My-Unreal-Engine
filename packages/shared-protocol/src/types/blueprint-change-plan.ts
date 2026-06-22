export type PlanSafetyClassification =
  | 'preview_only'
  | 'write_blocked_production'
  | 'needs_user_approval_future'
  | 'unsupported_or_unknown';

export type PlanSource = 'mock_local_plan' | 'real_bridge_future';

export type AssetSource =
  | 'mock_local_fixture'
  | 'manual_entry'
  | 'imported_list'
  | 'real_readonly_bridge'
  | 'real_bridge_future';

export type BlueprintInventorySourceKind =
  | 'mock_local'
  | 'manual'
  | 'imported'
  | 'real_readonly_bridge'
  | 'real_bridge_future';

export type BlueprintInventoryHealth =
  | 'loaded'
  | 'empty'
  | 'unavailable'
  | 'error'
  | 'stale';

export interface BlueprintInventoryEntry {
  assetPath: string;
  displayName: string;
  assetClass: string;
  eligibility: AssetEligibility;
  dirtyState: string;
  source: AssetSource;
}

export interface BlueprintInventoryState {
  sourceKind: BlueprintInventorySourceKind;
  health: BlueprintInventoryHealth;
  items: BlueprintInventoryEntry[];
  requestTimestamp: string;
  detail: string;
}

export type AssetEligibility = 'eligible_scratch_or_test' | 'production_write_blocked' | 'unknown';

export type OperationKind = 'set_variable' | 'modify_graph' | 'update_metadata' | 'add_component';

export type OperationTargetArea = 'variable' | 'graph' | 'metadata' | 'component';

export type SafetyStatus = 'safe' | 'caution' | 'danger';

export interface BlueprintAssetSummary {
  assetPath: string;
  displayName: string;
  assetClass: string;
  eligibility: AssetEligibility;
  dirtyState: string;
  source: AssetSource;
}

export interface ChangePlanOperation {
  id: string;
  kind: OperationKind;
  targetArea: OperationTargetArea;
  description: string;
  safetyStatus: SafetyStatus;
  beforePreview?: string;
  afterPreview?: string;
  blockedReason?: string;
}

export interface BlueprintChangePlan {
  schemaVersion: number;
  planId: string;
  createdTimestamp: string;
  source: PlanSource;
  targetAssetPath: string;
  targetDisplayName: string;
  userIntent: string;
  summary: string;
  operations: ChangePlanOperation[];
  safetyClassification: PlanSafetyClassification;
  risk: {
    level: string;
    reasons: string[];
  };
  approvalRequirements: {
    required: boolean;
    notes: string;
  };
  rollbackReadiness: {
    status: string;
    notes: string;
  };
  validationRequirements: {
    requiredChecks: string[];
    userLocalChecks: string[];
  };
  rawSource: string;
}
