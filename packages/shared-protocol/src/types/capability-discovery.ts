// ── Write Preflight & Bridge Capability Discovery Types ──────────
//
// E70: typed shared-protocol contracts for write preflight and
// capability reporting. Used by the UE bridge read-only endpoint,
// Desktop bridge client, and Desktop UI.
//
// These types are read-only discovery shapes. They do not trigger
// any UE write, compile, PIE, Automation, or asset mutation.

/** Operation kind identifier for preflight/capability purposes. */
export type OperationKind =
  | 'blueprint_edit'
  | 'behavior_tree'
  | 'blackboard'
  | 'manual'
  | 'asset_write'
  | 'scratch_duplicate'
  | 'scratch_compile'
  | 'scratch_sandbox_apply';

/** Severity of a preflight check issue. */
export type PreflightSeverity = 'info' | 'warning' | 'error';

/** Availability status of a capability or preflight check. */
export type CapabilityStatus =
  | 'supported'
  | 'unsupported'
  | 'pending_user_local_validation'
  | 'not_implemented';

/** Preflight check identifier string (machine-readable). */
export type PreflightCheckId =
  | 'bridge_availability'
  | 'asset_path_validity'
  | 'asset_type_supported'
  | 'package_writable'
  | 'dirty_state'
  | 'context_mismatch'
  | 'bridge_version'
  | 'approval_gate_status'
  | 'snapshot_availability'
  | 'source_asset_exists'
  | 'target_scratch_allowlisted'
  | 'target_sandbox_suffix'
  | 'typed_payload_valid'
  | 'asset_compilable'
  | 'approval_metadata_present';

/**
 * Describes what a single preflight check issue looks like.
 * Mirrors the pseudo-type from E68 §4 Write Preflight Contract.
 */
export interface WritePreflightIssue {
  /** Machine-readable check identifier. */
  checkId: PreflightCheckId;
  /** Human-readable check name. */
  checkName: string;
  /** Severity: info, warning, or error. */
  severity: PreflightSeverity;
  /** Whether this individual check passed. */
  passed: boolean;
  /** Human-readable result message. */
  message: string;
  /** Optional additional detail (e.g. which file is dirty). */
  details?: string;
  /** Optional hint for resolving a failed check. */
  resolutionHint?: string;
}

/**
 * Result of a write preflight check run against a target operation.
 * In E70 this is a data shape only — no actual preflight is executed.
 */
export interface WritePreflightResult {
  /** Whether the overall preflight passed (all error-severity checks passed). */
  passed: boolean;
  /** UTC ISO-8601 timestamp of when the preflight was (conceptually) run. */
  timestamp: string;
  /** Individual check results. */
  checks: WritePreflightIssue[];
  /** Quick summary counts. */
  summary: {
    totalChecks: number;
    passed: number;
    failed: number;
    warnings: number;
  };
}

/**
 * Parameters for requesting a write preflight on a target operation.
 * In E70 this is a data shape only — the UE bridge endpoint does not
 * execute preflight; it reports capability-only metadata.
 */
export interface WritePreflightRequest {
  /** Target asset path (e.g. "/Game/AI/BT_CombatGuard"). */
  targetAssetPath: string;
  /** Kind of operation being preflighted. */
  operationKind: OperationKind;
  /** Whether the operation requires a rollback snapshot. */
  requiresSnapshot: boolean;
}

/**
 * Describes the bridge's support for a single operation kind.
 */
export interface BridgeWriteCapability {
  /** The operation kind this capability entry describes. */
  operationKind: OperationKind;
  /** Availability status. */
  status: CapabilityStatus;
  /** Human-readable description of this capability. */
  description: string;
  /** Whether a preflight check is available for this operation kind. */
  preflightAvailable: boolean;
  /** Preflight check IDs that would apply to this operation kind. */
  applicablePreflightChecks: PreflightCheckId[];
}

/**
 * Read-only capability discovery response from the UE bridge.
 * Returned by GET /capabilities.
 */
export interface BridgeCapabilityDiscovery {
  /** Bridge/plugin version string. */
  bridgeVersion: string;
  /** Editor status at time of collection. */
  editorStatus: string;
  /** Per-operation-kind capability entries. */
  capabilities: BridgeWriteCapability[];
  /** Summary of preflight check availability across all capabilities. */
  preflightSummary: {
    /** Preflight check IDs that are available (can be run). */
    availableChecks: PreflightCheckId[];
    /** Preflight check IDs that are not yet implemented. */
    notImplementedChecks: PreflightCheckId[];
    /** Preflight check IDs that require user-local validation. */
    pendingUserValidationChecks: PreflightCheckId[];
  };
  /** UTC ISO-8601 timestamp. */
  timestamp: string;
}
