import type { CompileIssue } from './compile-status.js';
import type { OperationApproval, WriteRefusalReason } from './reversible-write.js';

/** Request body for POST /write/scratch/duplicate. */
export interface DuplicateScratchRequest {
  /** Source Blueprint asset path, for example "/Game/SomeFolder/BP_MyActor". */
  sourceAssetPath: string;
  /** Scratch duplicate target path, for example "/Game/Scratch/BP_MyActor_Sandbox". */
  targetScratchPath: string;
  /** Per-operation approval metadata. */
  approval: OperationApproval;
}

/** Structured result from POST /write/scratch/duplicate. */
export interface DuplicateScratchResponse {
  /** Whether the scratch duplicate was created. */
  success: boolean;
  /** Actual created scratch asset path, or the requested path on refusal. */
  scratchAssetPath: string;
  /** Snapshot/marker identifier for later cleanup or audit, when available. */
  snapshotId?: string;
  /** Human-readable result summary. */
  message: string;
  /** Structured refusal reason when success is false. */
  refusalReason?: WriteRefusalReason;
}

/** Request body for POST /compile/blueprint. */
export interface CompileBlueprintRequest {
  /** Blueprint asset path to compile. MVP requires /Game/Scratch/*. */
  assetPath: string;
  /** Per-operation approval metadata. */
  approval: OperationApproval;
}

/** Structured result from POST /compile/blueprint. */
export interface CompileBlueprintResponse {
  /** True when compile completed and no error-severity issues were reported. */
  success: boolean;
  /** Error/warning details collected from the Blueprint compiler message log. */
  errors: CompileIssue[];
  /** Compile call duration in milliseconds. */
  durationMs: number;
  /** Human-readable result summary. */
  message: string;
  /** Structured refusal reason when bridge cannot run the compile operation. */
  refusalReason?: WriteRefusalReason;
}
