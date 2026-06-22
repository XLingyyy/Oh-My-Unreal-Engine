// ── Minimal Reversible UE Write Types ─────────────────────────────
//
// E71: typed shared-protocol contracts for a single minimal reversible
// UE write operation. Covers request/response, snapshot/rollback status,
// operation gate state, and typed refusal reasons.
//
// E83: extends `ReversibleWriteRequest` with an optional `typedPayload`
// field carrying a machine-readable schema for exactly one safe scratch
// Blueprint metadata mutation. Callers must construct `typedPayload`
// deterministically from explicit constants; the bridge must validate
// every field before writing. The `description` field remains
// display/audit text only and MUST NOT be parsed to infer mutation
// behavior.
//
// E84: extends `WriteRefusalReason` with structured typed-payload
// refusal reasons. Mock and real bridge must distinguish
// missing/malformed/mismatched/unsupported typed payloads before
// the final `write_not_implemented` refusal. Valid E83 typed payloads
// still refuse execution as `write_not_implemented` until E85.
//
// E85: extends `SnapshotStatus` with an optional `capture` field
// carrying the in-memory pre-write state of the single supported
// scratch metadata marker write. The capture is data-only and
// exists so E86 can build rollback/history without re-reading the
// asset. E85 itself only writes one metadata marker on the exact
// canonical scratch fixture; it does not save the package, does
// not compile, does not run PIE/Automation, and does not execute
// rollback.
//
// Safety: all types are data-only. No write, compile, PIE, Automation,
// or asset mutation is triggered by instantiating these types.
// Write execution requires user-local compile/curl/PIE validation.

/**
 * Refusal/error reason for a write, snapshot, or rollback operation.
 *
 * E84 adds structured typed-payload refusal reasons. Names are
 * stable; do not remove or rename without bumping the E83 schema
 * version. New reasons can be added as new string values.
 */
export type WriteRefusalReason =
  | 'capability_unavailable'
  | 'preflight_failed'
  | 'snapshot_unavailable'
  | 'snapshot_required'
  | 'target_not_allowlisted'
  | 'target_not_found'
  | 'approval_missing'
  | 'typed_payload_missing'
  | 'typed_payload_invalid'
  | 'typed_payload_schema_mismatch'
  | 'typed_payload_target_mismatch'
  | 'typed_payload_operation_unsupported'
  | 'typed_payload_before_state_unsupported'
  | 'source_not_found'
  | 'duplicate_failed'
  | 'compile_failed'
  | 'compile_in_progress'
  | 'write_not_implemented'
  | 'rollback_not_verified';

/** Per-operation approval gate metadata submitted by the user. */
export interface OperationApproval {
  /** Unique identifier for this approval decision. */
  approvalId: string;
  /** UTC ISO-8601 timestamp of when the user approved. */
  approvedAt: string;
  /** Optional note from the user accompanying the approval. */
  note?: string;
}

/** Status of a snapshot taken before a write operation. */
export interface SnapshotStatus {
  /** Whether a snapshot has been created/attempted. */
  created: boolean;
  /** Unique identifier for the snapshot (if created). */
  snapshotId?: string;
  /** UTC ISO-8601 timestamp when the snapshot was taken. */
  snapshotAt?: string;
  /** Label/description of the snapshot content. */
  label?: string;
  /** Number of operations covered by this snapshot. */
  operationCount?: number;
  /** Human-readable size estimate. */
  sizeEstimate?: string;
  /** Refusal reason if snapshot creation was refused. */
  refusalReason?: WriteRefusalReason;
  /**
   * Optional E85 write capture.
   *
   * When the bridge performs the single safe scratch metadata marker
   * write, it captures the pre-write state of the metadata key on the
   * canonical scratch fixture and attaches it here. E86 is expected
   * to consume this capture to build rollback/history without
   * re-reading the asset. Pre-E85 responses do not set this field.
   */
  capture?: import('./typed-fix-payload.js').ScratchMetadataWriteCapture;
  /** Human-readable message about the snapshot state. */
  message: string;
}

/** Status of a rollback attempt. */
export interface RollbackStatus {
  /** Whether rollback has been attempted. */
  attempted: boolean;
  /** Whether rollback completed successfully. */
  success?: boolean;
  /** UTC ISO-8601 timestamp of the rollback. */
  rolledBackAt?: string;
  /** Snapshot identifier that (would have been) used for rollback. */
  snapshotId?: string;
  /** Refusal reason if rollback was refused. */
  refusalReason?: WriteRefusalReason;
  /** Human-readable message about rollback state. */
  message: string;
}

/** Result of a preflight check for a reversible write. */
export interface WritePreflightCheckResult {
  /** Machine-readable check identifier. */
  checkId: string;
  /** Human-readable check name. */
  checkName: string;
  /** Whether this individual check passed. */
  passed: boolean;
  /** Human-readable result message. */
  message: string;
}

/** Gate state of an operation: where it is in the reversible-write lifecycle. */
export type OperationGateState =
  | 'draft'
  | 'preflight_check'
  | 'snapshot_ready'
  | 'ready_for_execution'
  | 'executed_pending_validation'
  | 'validation_passed'
  | 'validation_failed'
  | 'rollback_required'
  | 'rolled_back'
  | 'blocked'
  | 'closed';

/** Request to perform a minimal reversible write. */
export interface ReversibleWriteRequest {
  /** Target asset path (must be allowlisted scratch/test path). */
  targetAssetPath: string;
  /**
   * Human-readable description of what the write does.
   *
   * DISPLAY/AUDIT TEXT ONLY. Callers and bridges MUST NOT parse this
   * field to infer UE mutation behavior. The executable semantics of
   * the write are described by `operationKind`, `typedPayload`, and the
   * structured approval/snapshot metadata. E83 explicitly forbids any
   * natural-language-to-mutation inference.
   */
  description: string;
  /** Operation kind identifier. */
  operationKind: string;
  /** Per-operation approval metadata (required). */
  approval: OperationApproval;
  /** Whether snapshot/rollback preparation is requested. */
  requireSnapshot: boolean;
  /** Version stamp for the operation payload schema. */
  payloadVersion?: string;
  /**
   * Optional typed, machine-readable payload describing the write.
   *
   * E83 adds this field so that callers can attach a fully structured
   * `TypedFixPayload` instead of relying on free-form text. When
   * present, a bridge implementation is expected to validate every
   * field of the payload before performing any write. Older call sites
   * that do not yet set this field remain compatible; the existing UE
   * bridge will continue to refuse such requests with a typed
   * `write_not_implemented` refusal until E85 execution support lands.
   */
  typedPayload?: import('./typed-fix-payload.js').TypedFixPayload;
}

/** Full structured response for a reversible write request. */
export interface ReversibleWriteResponse {
  /** Whether the core write was considered completed or requires user-local validation. */
  success: boolean;
  /** Human-readable summary of the result. */
  message: string;
  /** Current gate state after this operation. */
  gateState: OperationGateState;
  /** Whether user-local validation is required to confirm this result. */
  requiresUserLocalValidation: boolean;
  /** Details about the write preflight execution. */
  preflight: {
    passed: boolean;
    checks: WritePreflightCheckResult[];
  };
  /** Snapshot status (before write). */
  snapshot: SnapshotStatus;
  /** Rollback status (if applicable). */
  rollback: RollbackStatus;
  /** Typed refusal reason, if the write was refused. */
  refusalReason?: WriteRefusalReason;
  /** Error code in the bridge's standard error format, if applicable. */
  errorCode?: string;
  /** UTC ISO-8601 timestamp. */
  timestamp: string;
}

/** Request to roll back a previously written operation. */
export interface RollbackRequest {
  /** Target asset path to roll back. */
  targetAssetPath: string;
  /** Approval metadata for the rollback operation. */
  approval: OperationApproval;
  /** Snapshot identifier to roll back to. */
  snapshotId: string;
}

/** Response for a rollback request. */
export interface RollbackResponse {
  /** Whether the rollback was accepted/completed. */
  success: boolean;
  /** Current gate state after rollback. */
  gateState: OperationGateState;
  /** Whether user-local validation is required. */
  requiresUserLocalValidation: boolean;
  /** Rollback status details. */
  rollback: RollbackStatus;
  /** Typed refusal reason, if rollback was refused. */
  refusalReason?: WriteRefusalReason;
  /** Human-readable summary. */
  message: string;
  /** UTC ISO-8601 timestamp. */
  timestamp: string;
}
