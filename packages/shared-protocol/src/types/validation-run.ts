// ── Compile / Validation Loop Data Shapes ───────────────────────────
//
// E72: typed contracts for validation run plans, steps, results,
// artifacts, and user-local decision state. These are data-only shapes.
// No compile, PIE, Automation, write, rollback, repair, or AI action
// is triggered by instantiating or rendering these types.

/** Kind of a single validation step. */
export type ValidationStepKind =
  | 'compile_check'
  | 'pie_placeholder'
  | 'automation_placeholder'
  | 'manual_inspection'
  | 'rollback_confirmation'
  | 'desktop_real_mode_confirmation';

/** Status of a single validation step.
 *
 * - `planned`: step has not been acted upon.
 * - `observed`: read-only status observed (e.g. existing compile status
 *   was read from the bridge).
 * - `manual_passed`: user manually marked the step as passed.
 * - `manual_failed`: user manually marked the step as failed.
 * - `pending_user_local_validation`: step requires local UE-side
 *   validation that cannot be performed from Desktop.
 */
export type ValidationStepStatus =
  | 'planned'
  | 'observed'
  | 'manual_passed'
  | 'manual_failed'
  | 'pending_user_local_validation';

/** An artifact produced by or associated with a validation step. */
export interface ValidationArtifact {
  id: string;
  kind: 'log' | 'error_list' | 'warning_list' | 'snapshot' | 'report';
  name: string;
  summary: string;
  detail?: string;
}

/** Result data for a validation step (non-user-decision metadata). */
export interface ValidationResult {
  stepId: string;
  passed: boolean;
  message: string;
  timestamp: string;
  artifacts: ValidationArtifact[];
}

/** A user's manual pass/fail decision on a validation step. */
export interface ValidationUserDecision {
  stepId: string;
  decision: 'pass' | 'fail';
  timestamp: string;
  note?: string;
}

/** A single validation step within a plan. */
export interface ValidationStep {
  id: string;
  kind: ValidationStepKind;
  name: string;
  status: ValidationStepStatus;
  detail: string;
  result?: ValidationResult;
  userDecision?: ValidationUserDecision;
  artifacts: ValidationArtifact[];
}

/** A complete validation run plan. */
export interface ValidationRunPlan {
  id: string;
  title: string;
  description: string;
  steps: ValidationStep[];
  createdAt: string;
  updatedAt: string;
}

/** Aggregate local execution state for a validation plan on Desktop. */
export interface ValidationLocalExecutionState {
  planId: string;
  status: 'idle' | 'in_review' | 'all_passed' | 'has_failures';
  completedSteps: number;
  totalSteps: number;
  compileStatusObserved: boolean;
}
