// ── Typed Fix Payload Schema (E83) ───────────────────────────────
//
// Defines one typed, machine-readable safe scratch Blueprint metadata
// mutation payload. The payload is attached to `ReversibleWriteRequest`
// so a later UE bridge implementation can validate every field before
// performing any write.
//
// Safety:
// - This file defines data shapes only. No write, compile, PIE,
//   Automation, rollback, or asset mutation is triggered by
//   instantiating these types.
// - The payload must NOT be inferred from natural-language `description`,
//   candidate `title`, or `proposedChange` text. Callers must construct
//   it deterministically from explicit constants.
// - The current UE bridge may ignore unknown JSON fields and still
//   return `write_not_implemented`. That is acceptable for E83.
//
// E84 owns typed payload preflight semantics: see
// `TYPED_PAYLOAD_PREFLIGHT_CHECK_IDS` and `TYPED_PAYLOAD_REFUSAL_REASONS`
// below. Mock and real bridge report these checks in
// `ReversibleWriteResponse.preflight.checks`.
// E85 owns the single safe scratch write adapter. It is read-only plus
// one in-memory metadata marker write on the exact canonical scratch
// fixture. The write produces a typed capture shape
// (`ScratchMetadataWriteCapture`) attached to
// `ReversibleWriteResponse.snapshot.capture` so that E86 can build
// rollback/history without re-reading the asset.
// E86 owns executable rollback payload/history closure.

/**
 * Schema/version identifier for the typed fix payload.
 * Bump when adding new fields or changing the shape of existing ones.
 */
export const SAFE_SCRATCH_BLUEPRINT_MUTATION_SCHEMA_VERSION =
  'omue.safeScratchBlueprintMutation.v1';

/**
 * Operation kinds allowed inside the typed fix payload.
 * E83 only defines one operation: setting a metadata marker on the
 * canonical scratch fixture Blueprint. Future operations (graph edits,
 * blackboard changes, etc.) must be added as new string values, not
 * reused.
 */
export type SafeScratchBlueprintMutationOperationKind =
  | 'set_blueprint_metadata_marker'
  | 'set_blueprint_variable_default';

/**
 * Target asset class/kind for the typed fix payload.
 * E83 constrains the payload to scratch Blueprint metadata only.
 */
export type SafeScratchBlueprintMutationAssetKind = 'blueprint_scratch_fixture';

/**
 * Expected before-state for the metadata marker.
 * - `value`: the metadata key MUST hold exactly this string before the
 *   write is allowed.
 * - `missing_or_absent_allowed`: the metadata key may be missing, or
 *   may hold any current value; no pre-write validation is required.
 *
 * E83 only allows `missing_or_absent_allowed`. `value` is reserved for
 * future E84/E85 preflight semantics.
 */
export type SafeScratchBlueprintMutationBeforeState =
  | { kind: 'missing_or_absent_allowed' }
  | { kind: 'value'; value: string };

/**
 * Metadata marker after-state.
 * The bridge is expected to set the metadata key on the target Blueprint
 * to exactly this value, after passing E84 preflight checks.
 */
export interface SafeScratchBlueprintMetadataAfterState {
  /** Optional compatibility tag for metadata payloads. */
  kind?: 'metadata_key_value';
  /** Metadata key on the target Blueprint (e.g. a string MetadataTag). */
  key: string;
  /** Metadata value to set. */
  value: string;
}

export interface SafeScratchBlueprintVariableDefaultAfterState {
  kind: 'variable_default';
  /** Declared variable name on `UBlueprint::NewVariables`. */
  variableName: string;
  /** Serialized Blueprint default value string to assign. */
  defaultValue: string;
}

export type SafeScratchBlueprintMutationAfterState =
  | SafeScratchBlueprintMetadataAfterState
  | SafeScratchBlueprintVariableDefaultAfterState;

/**
 * Display-only metadata for the typed fix payload.
 *
 * IMPORTANT: These fields are display/audit text only. They MUST NOT be
 * parsed to infer UE mutation behavior. The executable semantics of the
 * payload are defined entirely by the structured fields above
 * (schemaVersion, operationKind, target, beforeState, afterState, etc.).
 */
export interface SafeScratchBlueprintMutationDisplay {
  /** Short human-readable summary of the mutation. */
  summary: string;
  /** Optional longer human-readable note. */
  note?: string;
}

/**
 * One typed fix payload describing a single safe scratch Blueprint
 * metadata marker operation. The shape is intentionally narrow so that
 * a later bridge implementation can validate every field before
 * writing.
 */
export interface SafeScratchBlueprintMutationPayload {
  /**
   * Schema/version identifier. Must equal
   * `SAFE_SCRATCH_BLUEPRINT_MUTATION_SCHEMA_VERSION` for E83 payloads.
   */
  schemaVersion: typeof SAFE_SCRATCH_BLUEPRINT_MUTATION_SCHEMA_VERSION;
  /**
   * Operation kind. Must be one of
   * `SafeScratchBlueprintMutationOperationKind`. E83 only allows
   * `set_blueprint_metadata_marker`.
   */
  operationKind: SafeScratchBlueprintMutationOperationKind;
  /**
   * Target asset path. Must be allowlisted under
   * `allowlistPrefixes` (e.g. `/Game/Scratch/BP_OMUE_Scratch_Fixture`).
   */
  targetAssetPath: string;
  /**
   * Target asset class/kind. E83 only allows
   * `blueprint_scratch_fixture`.
   */
  targetAssetKind: SafeScratchBlueprintMutationAssetKind;
  /**
   * Allowlist prefixes that the target asset path MUST match.
   * E83 uses the E82 scratch/test allowlist constants.
   */
  allowlistPrefixes: string[];
  /**
   * Expected before-state for the metadata marker. E83 only uses
   * `missing_or_absent_allowed`.
   */
  beforeState: SafeScratchBlueprintMutationBeforeState;
  /**
   * Required after-state for the metadata marker.
   */
  afterState: SafeScratchBlueprintMutationAfterState;
  /**
   * Approval requirement marker. Must be `true` for E83; the bridge
   * will refuse to execute without an attached `OperationApproval`.
   */
  requireApproval: true;
  /**
   * Snapshot/rollback requirement marker. Must be `true` for E83.
   */
  requireSnapshot: true;
  /**
   * Display-only metadata. Never parsed for mutation semantics.
   */
  display: SafeScratchBlueprintMutationDisplay;
}

/**
 * Tagged union of typed fix payloads. E83 only contains
 * `SafeScratchBlueprintMutationPayload`; future schema versions may
 * add new branches.
 */
export interface TypedFixPayload {
  /**
   * Discriminator that matches `SafeScratchBlueprintMutationPayload.schemaVersion`.
   * Allows E84+ to dispatch on schema without parsing the full body.
   */
  schemaVersion: typeof SAFE_SCRATCH_BLUEPRINT_MUTATION_SCHEMA_VERSION;
  /**
   * The actual typed payload body. E83 only carries the safe scratch
   * Blueprint metadata mutation payload.
   */
  payload: SafeScratchBlueprintMutationPayload;
}

// ═══════════════════════════════════════════════════════════════
// E84 typed-payload preflight vocabulary
// ═══════════════════════════════════════════════════════════════
//
// E84 introduces a small set of preflight check identifiers and
// refusal reasons so that the Desktop mock and the UE bridge can
// agree on why a typed payload was rejected before the final
// `write_not_implemented` refusal.
//
// These constants are machine-readable strings. Names are stable
// across mock and bridge implementations; do not rename or remove
// them. New checks can be added by appending new string values.

/**
 * E84 typed-payload preflight check identifiers.
 *
 * Used as the `checkId` of `WritePreflightCheckResult` entries
 * reported by both the Desktop mock and the UE bridge. Names are
 * stable; consumers should treat them as part of the protocol.
 */
export const TYPED_PAYLOAD_PREFLIGHT_CHECK_IDS = {
  /** Request body parsed as a JSON object. */
  REQUEST_JSON_VALID: 'request_json_valid',
  /** Target asset path is present on the request. */
  TARGET_PATH_PRESENT: 'target_path_present',
  /** Target asset path is in the scratch/test allowlist. */
  TARGET_PATH_ALLOWLISTED: 'target_path_allowlisted',
  /** Target Blueprint asset exists in the current project (UE side only). */
  TARGET_BLUEPRINT_EXISTS: 'target_blueprint_exists',
  /** Approval metadata is present. */
  APPROVAL_METADATA_PRESENT: 'approval_metadata_present',
  /** Request explicitly requires a snapshot. */
  REQUEST_REQUIRES_SNAPSHOT: 'request_require_snapshot',
  /** Typed payload is attached to the request. */
  TYPED_PAYLOAD_PRESENT: 'typed_payload_present',
  /** Typed payload wrapper `schemaVersion` matches the active schema. */
  TYPED_PAYLOAD_WRAPPER_SCHEMA_MATCHES: 'typed_payload_wrapper_schema_matches',
  /** Typed payload body `schemaVersion` matches the wrapper. */
  TYPED_PAYLOAD_BODY_SCHEMA_MATCHES: 'typed_payload_body_schema_matches',
  /** Typed payload operation kind is the single supported kind. */
  TYPED_PAYLOAD_OPERATION_SUPPORTED: 'typed_payload_operation_supported',
  /** Typed payload target asset path matches the request target path. */
  TYPED_PAYLOAD_TARGET_MATCHES: 'typed_payload_target_matches',
  /** Typed payload target asset kind is the single supported kind. */
  TYPED_PAYLOAD_TARGET_KIND_SUPPORTED: 'typed_payload_target_kind_supported',
  /** Typed payload allowlist prefixes are a non-empty subset of the scratch/test allowlist. */
  TYPED_PAYLOAD_ALLOWLIST_COMPATIBLE: 'typed_payload_allowlist_compatible',
  /** Typed payload requires approval and snapshot. */
  TYPED_PAYLOAD_REQUIRES_APPROVAL_AND_SNAPSHOT: 'typed_payload_requires_approval_and_snapshot',
  /** Typed payload before-state is supported by E84 (`missing_or_absent_allowed`). */
  TYPED_PAYLOAD_BEFORE_STATE_SUPPORTED: 'typed_payload_before_state_supported',
  /** Typed payload after-state key and value are both non-empty. */
  TYPED_PAYLOAD_AFTER_STATE_NON_EMPTY: 'typed_payload_after_state_non_empty',
  /** Typed payload variable name is non-empty. */
  TYPED_PAYLOAD_VARIABLE_NAME_NON_EMPTY: 'typed_payload_variable_name_non_empty',
  /** Typed payload variable default value is non-empty. */
  TYPED_PAYLOAD_VARIABLE_DEFAULT_VALUE_NON_EMPTY: 'typed_payload_variable_default_value_non_empty',
} as const;

/** Type of the E84 typed-payload preflight check ID constants. */
export type TypedPayloadPreflightCheckId =
  (typeof TYPED_PAYLOAD_PREFLIGHT_CHECK_IDS)[keyof typeof TYPED_PAYLOAD_PREFLIGHT_CHECK_IDS];

/**
 * E84 typed-payload refusal reasons. Subset of `WriteRefusalReason`
 * that distinguishes typed-payload failures. Names are stable; new
 * reasons can be added as new string values.
 */
export const TYPED_PAYLOAD_REFUSAL_REASONS = {
  TYPED_PAYLOAD_MISSING: 'typed_payload_missing',
  TYPED_PAYLOAD_INVALID: 'typed_payload_invalid',
  TYPED_PAYLOAD_SCHEMA_MISMATCH: 'typed_payload_schema_mismatch',
  TYPED_PAYLOAD_TARGET_MISMATCH: 'typed_payload_target_mismatch',
  TYPED_PAYLOAD_OPERATION_UNSUPPORTED: 'typed_payload_operation_unsupported',
  TYPED_PAYLOAD_BEFORE_STATE_UNSUPPORTED: 'typed_payload_before_state_unsupported',
  SNAPSHOT_REQUIRED: 'snapshot_required',
} as const;

/** Type of the E84 typed-payload refusal reason constants. */
export type TypedPayloadRefusalReason =
  (typeof TYPED_PAYLOAD_REFUSAL_REASONS)[keyof typeof TYPED_PAYLOAD_REFUSAL_REASONS];

/**
 * Default scratch/test allowlist prefixes used to check typed-payload
 * allowlist compatibility. Re-exports the E82 prefix list shape as a
 * `readonly` tuple for consumers that want to validate compatibility
 * without importing the Desktop constants module.
 */
export const DEFAULT_SAFE_SCRATCH_ALLOWLIST_PREFIXES: readonly string[] = [
  '/Game/Scratch/',
  '/Game/Test/',
];

/**
 * A single typed-payload preflight check result row. Mirrors the
 * `WritePreflightCheckResult` shape but is purpose-built for E84
 * typed-payload checks so the mock and the UE bridge can report a
 * common row shape.
 */
export interface TypedPayloadPreflightCheckRow {
  /** Machine-readable check identifier (see `TYPED_PAYLOAD_PREFLIGHT_CHECK_IDS`). */
  checkId: TypedPayloadPreflightCheckId;
  /** Human-readable check name. */
  checkName: string;
  /** Whether this individual check passed. */
  passed: boolean;
  /** Human-readable result message. */
  message: string;
}

/**
 * Outcome of validating the E83 typed payload.
 *
 * `passed === true` means every check in `checks` passed and the
 * payload is safe to forward to the future E85 write adapter. Mock
 * and real bridge both use this row shape.
 */
export interface TypedPayloadValidationResult {
  /** True when every check passed. */
  passed: boolean;
  /** Per-check rows. */
  checks: TypedPayloadPreflightCheckRow[];
  /**
   * First refusal reason encountered, if any. Maps to a member of
   * `WriteRefusalReason` so the bridge can include it on the
   * response envelope.
   */
  refusalReason?: import('./reversible-write.js').WriteRefusalReason;
  /** Human-readable summary of the outcome. */
  message: string;
}

// ═══════════════════════════════════════════════════════════════
// E85 single safe scratch write capture
// ═══════════════════════════════════════════════════════════════
//
// E85 accepts exactly one typed write: set one metadata marker on
// the canonical scratch Blueprint fixture. After the E84 preflight
// passes, the bridge must capture enough pre-write state for E86 to
// construct rollback/history without re-reading the asset.
//
// The capture is data-only and lives on
// `ReversibleWriteResponse.snapshot.capture`. The package is marked
// dirty by the write, but is NOT saved by automation; the user must
// verify and save in UE Editor. E86 will use `snapshotId` plus the
// captured before/after state to drive the rollback path.
//
// ═══════════════════════════════════════════════════════════════
// E86 rollback payload/history closure
// ═══════════════════════════════════════════════════════════════
//
// E86 defines a machine-readable reverse payload that encodes the
// exact undo operation for the E85 scratch metadata marker write.
// The rollback payload is derived from the same before/after capture
// and is attached to every E85 `ScratchMetadataWriteCapture` so that
// any consumer of the capture automatically has the data needed for
// a future rollback.
//
// Two intents cover both cases:
//   - `remove_metadata_key`: the key did not exist before E85; a
//     rollback must delete it. The empty-string ambiguity mentioned
//     in the E86 requirements is avoided because the intent is
//     explicit — consumers do not infer deletion from a missing
//     `previousValue`.
//   - `restore_metadata_value`: the key existed with a known value;
//     a rollback must set it back to that value.
//
// The rollback payload is NOT an executable rollback command. It is
// audit data for the Desktop, report/copy output, and future
// authorized rollback execution.

/**
 * Captured before/after state of the single metadata marker key.
 *
 * `present === true` means the metadata key already held a value on
 * the target Blueprint before the write; `previousValue` then carries
 * that value. `present === false` means the key was absent.
 */
export interface ScratchMetadataBeforeAfterState {
  /** Metadata key on the target Blueprint. */
  key: string;
  /** Whether the metadata key existed on the target Blueprint before the write. */
  keyExisted: boolean;
  /** Previous metadata value when `keyExisted` is true, otherwise undefined. */
  previousValue?: string;
  /** Value that was set by E85. */
  requestedValue: string;
}

/**
 * Intent of a future rollback for the E85 scratch metadata marker operation.
 *
 * - `remove_metadata_key`: the key did not exist before E85. Undoing the
 *   write means deleting the metadata key. This is explicitly represented
 *   as a distinct intent rather than inferred from a missing/empty value.
 * - `restore_metadata_value`: the key existed before E85. Undoing the
 *   write means setting the key back to its previous value.
 */
export type ScratchMetadataRollbackIntent =
  | 'remove_metadata_key'
  | 'restore_metadata_value';

/**
 * Machine-readable reverse payload describing the single undo operation
 * that would revert the E85 scratch metadata marker write.
 *
 * This is data-only audit information. It is NOT an executable rollback
 * command. Every field is derived deterministically from the E85
 * `ScratchMetadataWriteCapture` before/after state at response time.
 *
 * Consumers (Desktop report/copy output, post-fix reports, future
 * rollback executors) should read this payload to understand exactly
 * what a rollback would do, without re-reading the UE asset or
 * inferring intent from display text.
 */
export interface ScratchMetadataRollbackPayload {
  /** Rollback intent derived from `keyExisted`. */
  intent: ScratchMetadataRollbackIntent;
  /** Target asset path (same as the write capture). */
  targetAssetPath: string;
  /**
   * Operation kind that was written. E85 only uses
   * `set_blueprint_metadata_marker`; the reverse operation
   * is encoded in `intent`.
   */
  operationKind: 'set_blueprint_metadata_marker';
  /** Metadata key on the target Blueprint. */
  metadataKey: string;
  /** Whether the metadata key existed on the target before E85. */
  keyExisted: boolean;
  /**
   * Previous metadata value when `keyExisted` is true, otherwise
   * undefined. When `keyExisted === false`, the rollback intent is
   * `remove_metadata_key` and this field carries no meaning.
   */
  previousValue?: string;
  /** Value that was set by E85. */
  requestedValue: string;
  /** Approval id used to authorize the write. */
  approvalId: string;
  /** Snapshot id for rollback/history lookup. */
  snapshotId: string;
  /** UTC ISO-8601 timestamp of the write. */
  writeTimestamp: string;
  /** True: the target package was marked dirty by E85. */
  packageDirty: true;
  /** False: the target package was NOT saved by automation. */
  packageSaved: false;
}

/**
 * E85 capture for the single safe scratch Blueprint metadata marker
 * operation. E85 is the only operation that produces this capture
 * shape; E86 is expected to consume it.
 *
 * The capture is intentionally additive: it does not require any
 * other field on `ReversibleWriteResponse` to change. Consumers that
 * only understand pre-E85 responses can ignore the `capture` field.
 */
export interface ScratchMetadataWriteCapture {
  /** Discriminator; E85 only supports "scratch_metadata_marker". */
  kind: 'scratch_metadata_marker';
  /** Target asset path that was written (canonical scratch fixture). */
  targetAssetPath: string;
  /**
   * Operation kind. E85 only writes
   * `set_blueprint_metadata_marker`.
   */
  operationKind: 'set_blueprint_metadata_marker';
  /** Captured before/after state of the metadata key. */
  metadata: ScratchMetadataBeforeAfterState;
  /** Approval id used to authorize the write. */
  approvalId: string;
  /** Stable snapshot id for rollback/history lookup. */
  snapshotId: string;
  /** UTC ISO-8601 timestamp of the write. */
  timestamp: string;
  /** True: the target package was marked dirty by E85. */
  packageDirty: true;
  /** False: the target package was NOT saved by automation. */
  packageSaved: false;
  /**
   * E86 machine-readable reverse payload describing the single undo
   * operation that would revert this write. Derived deterministically
   * from `metadata` at response construction time.
   *
   * Consumers use this to audit rollback readiness without re-reading
   * the asset. This is NOT an executable rollback command.
   */
  rollback: ScratchMetadataRollbackPayload;
}

export type ScratchVariableDefaultRollbackIntent =
  | 'restore_variable_default'
  | 'clear_variable_default';

export interface ScratchVariableDefaultRollbackPayload {
  intent: ScratchVariableDefaultRollbackIntent;
  targetAssetPath: string;
  operationKind: 'set_blueprint_variable_default';
  variableName: string;
  previousDefaultExisted: boolean;
  previousDefaultValue?: string;
  requestedDefaultValue: string;
  approvalId: string;
  snapshotId: string;
  writeTimestamp: string;
  packageDirty: true;
  packageSaved: false;
}

export interface ScratchVariableDefaultWriteCapture {
  kind: 'scratch_variable_default';
  targetAssetPath: string;
  operationKind: 'set_blueprint_variable_default';
  variable: {
    variableName: string;
    previousDefaultExisted: boolean;
    previousDefaultValue?: string;
    requestedDefaultValue: string;
  };
  approvalId: string;
  snapshotId: string;
  timestamp: string;
  packageDirty: true;
  packageSaved: false;
  rollback: ScratchVariableDefaultRollbackPayload;
}
