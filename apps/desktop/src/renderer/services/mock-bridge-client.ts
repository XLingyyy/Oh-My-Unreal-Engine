import { sampleContextSnapshot } from '@omue/shared-protocol';
import type { OmueContextSnapshot, BlueprintGraphDetailData, NodeInfo, PinInfo, LinkInfo, GraphDetail, BlueprintGraphInfo, BehaviorTreeDiagnosticResponse, BridgeCapabilityDiscovery, ReversibleWriteRequest, ReversibleWriteResponse, RollbackRequest, RollbackResponse, WritePreflightCheckResult, WriteRefusalReason, DuplicateScratchRequest, DuplicateScratchResponse, CompileBlueprintRequest, CompileBlueprintResponse } from '@omue/shared-protocol';
import {
  SAFE_SCRATCH_BLUEPRINT_MUTATION_SCHEMA_VERSION,
  TYPED_PAYLOAD_PREFLIGHT_CHECK_IDS,
  TYPED_PAYLOAD_REFUSAL_REASONS,
  DEFAULT_SAFE_SCRATCH_ALLOWLIST_PREFIXES,
} from '@omue/shared-protocol';
import type { TypedPayloadPreflightCheckRow, TypedPayloadValidationResult, ScratchMetadataWriteCapture, ScratchMetadataBeforeAfterState, ScratchMetadataRollbackIntent, ScratchMetadataRollbackPayload, ScratchVariableDefaultWriteCapture, ScratchVariableDefaultRollbackIntent, ScratchVariableDefaultRollbackPayload } from '@omue/shared-protocol';
import type { BridgeClient, BridgeHealth, MockBridgeScenario } from './bridge-client';

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isScratchWriteAllowlisted(assetPath: string): boolean {
  return assetPath.startsWith('/Game/Scratch/') || assetPath.startsWith('/Game/Test/');
}

function isScratchCompileAllowlisted(assetPath: string): boolean {
  return assetPath.startsWith('/Game/Scratch/');
}

// ── E85 canonical scratch fixture target path ────────────────
//
// E85 is stricter than E84: even when the target path is in the
// scratch/test allowlist, E85 only mutates the exact canonical
// scratch fixture. Any other /Game/Scratch/ or /Game/Test/ path
// must be refused before mutation.
const E85_CANONICAL_SCRATCH_FIXTURE_PATH = '/Game/Scratch/BP_OMUE_Scratch_Fixture';

type MockWriteRefusalReason = WriteRefusalReason | 'target_not_sandbox';

// ── E84 typed payload preflight helper ──────────────────────────
//
// Mock-side validator for the E83 typed fix payload. Mirrors the
// UE bridge `OmueHttpServer.cpp` `HandleWriteScratchRequest`
// preflight sequence at the level of check IDs and refusal
// reasons, so the Desktop mock and the real bridge stay aligned.
//
// Safety:
// - Pure data validation. No write, compile, PIE, Automation,
//   rollback, or asset mutation is triggered.
// - The validator never inspects `description`, candidate title,
//   or proposed-change text to decide mutation semantics.

function pushTypedCheck(
  checks: TypedPayloadPreflightCheckRow[],
  checkId: string,
  checkName: string,
  passed: boolean,
  message: string,
): void {
  checks.push({
    checkId: checkId as TypedPayloadPreflightCheckRow['checkId'],
    checkName,
    passed,
    message,
  });
}

function buildTypedFailure(
  checks: TypedPayloadPreflightCheckRow[],
  refusalReason: WriteRefusalReason,
  message: string,
): TypedPayloadValidationResult {
  return {
    passed: false,
    checks,
    refusalReason,
    message,
  };
}

function buildTypedSuccess(
  checks: TypedPayloadPreflightCheckRow[],
  message: string,
): TypedPayloadValidationResult {
  return {
    passed: true,
    checks,
    message,
  };
}

function validateE84TypedPayload(
  request: ReversibleWriteRequest,
  allowlistPrefixes: readonly string[],
): TypedPayloadValidationResult {
  const checks: TypedPayloadPreflightCheckRow[] = [];
  const payload = request.typedPayload;

  // 1. typed payload present
  if (!payload) {
    pushTypedCheck(
      checks,
      TYPED_PAYLOAD_PREFLIGHT_CHECK_IDS.TYPED_PAYLOAD_PRESENT,
      'Typed Payload Present',
      false,
      'Request does not include a typedPayload field.',
    );
    return buildTypedFailure(
      checks,
      TYPED_PAYLOAD_REFUSAL_REASONS.TYPED_PAYLOAD_MISSING,
      'Write refused: typed payload is missing.',
    );
  }
  pushTypedCheck(
    checks,
    TYPED_PAYLOAD_PREFLIGHT_CHECK_IDS.TYPED_PAYLOAD_PRESENT,
    'Typed Payload Present',
    true,
    'Request includes a typedPayload field.',
  );

  // 2. wrapper schema version
  if (payload.schemaVersion !== SAFE_SCRATCH_BLUEPRINT_MUTATION_SCHEMA_VERSION) {
    pushTypedCheck(
      checks,
      TYPED_PAYLOAD_PREFLIGHT_CHECK_IDS.TYPED_PAYLOAD_WRAPPER_SCHEMA_MATCHES,
      'Typed Payload Wrapper Schema',
      false,
      `Wrapper schemaVersion "${payload.schemaVersion}" does not match "${SAFE_SCRATCH_BLUEPRINT_MUTATION_SCHEMA_VERSION}".`,
    );
    return buildTypedFailure(
      checks,
      TYPED_PAYLOAD_REFUSAL_REASONS.TYPED_PAYLOAD_SCHEMA_MISMATCH,
      'Write refused: typed payload wrapper schema version does not match the active schema.',
    );
  }
  pushTypedCheck(
    checks,
    TYPED_PAYLOAD_PREFLIGHT_CHECK_IDS.TYPED_PAYLOAD_WRAPPER_SCHEMA_MATCHES,
    'Typed Payload Wrapper Schema',
    true,
    'Wrapper schemaVersion matches the active schema.',
  );

  // 3. body schema version
  if (payload.payload.schemaVersion !== SAFE_SCRATCH_BLUEPRINT_MUTATION_SCHEMA_VERSION) {
    pushTypedCheck(
      checks,
      TYPED_PAYLOAD_PREFLIGHT_CHECK_IDS.TYPED_PAYLOAD_BODY_SCHEMA_MATCHES,
      'Typed Payload Body Schema',
      false,
      `Body schemaVersion "${payload.payload.schemaVersion}" does not match the wrapper.`,
    );
    return buildTypedFailure(
      checks,
      TYPED_PAYLOAD_REFUSAL_REASONS.TYPED_PAYLOAD_SCHEMA_MISMATCH,
      'Write refused: typed payload body schema version does not match the wrapper.',
    );
  }
  pushTypedCheck(
    checks,
    TYPED_PAYLOAD_PREFLIGHT_CHECK_IDS.TYPED_PAYLOAD_BODY_SCHEMA_MATCHES,
    'Typed Payload Body Schema',
    true,
    'Body schemaVersion matches the wrapper.',
  );

  // 4. operation kind
  const operationKind = payload.payload.operationKind;
  if (operationKind !== 'set_blueprint_metadata_marker'
    && operationKind !== 'set_blueprint_variable_default') {
    pushTypedCheck(
      checks,
      TYPED_PAYLOAD_PREFLIGHT_CHECK_IDS.TYPED_PAYLOAD_OPERATION_SUPPORTED,
      'Typed Payload Operation Kind',
      false,
      `Operation kind "${operationKind}" is not supported by typed-payload preflight.`,
    );
    return buildTypedFailure(
      checks,
      TYPED_PAYLOAD_REFUSAL_REASONS.TYPED_PAYLOAD_OPERATION_UNSUPPORTED,
      'Write refused: typed payload operation kind is not supported.',
    );
  }
  pushTypedCheck(
    checks,
    TYPED_PAYLOAD_PREFLIGHT_CHECK_IDS.TYPED_PAYLOAD_OPERATION_SUPPORTED,
    'Typed Payload Operation Kind',
    true,
    `Operation kind "${operationKind}" is supported by typed-payload preflight.`,
  );

  // 5. target matches
  if (payload.payload.targetAssetPath !== request.targetAssetPath) {
    pushTypedCheck(
      checks,
      TYPED_PAYLOAD_PREFLIGHT_CHECK_IDS.TYPED_PAYLOAD_TARGET_MATCHES,
      'Typed Payload Target Matches',
      false,
      `Typed payload target "${payload.payload.targetAssetPath}" does not match request target "${request.targetAssetPath}".`,
    );
    return buildTypedFailure(
      checks,
      TYPED_PAYLOAD_REFUSAL_REASONS.TYPED_PAYLOAD_TARGET_MISMATCH,
      'Write refused: typed payload target asset path does not match the request target.',
    );
  }
  pushTypedCheck(
    checks,
    TYPED_PAYLOAD_PREFLIGHT_CHECK_IDS.TYPED_PAYLOAD_TARGET_MATCHES,
    'Typed Payload Target Matches',
    true,
    'Typed payload target matches the request target.',
  );

  // 6. target kind
  if (payload.payload.targetAssetKind !== 'blueprint_scratch_fixture') {
    pushTypedCheck(
      checks,
      TYPED_PAYLOAD_PREFLIGHT_CHECK_IDS.TYPED_PAYLOAD_TARGET_KIND_SUPPORTED,
      'Typed Payload Target Kind',
      false,
      `Target asset kind "${payload.payload.targetAssetKind}" is not supported.`,
    );
    return buildTypedFailure(
      checks,
      TYPED_PAYLOAD_REFUSAL_REASONS.TYPED_PAYLOAD_OPERATION_UNSUPPORTED,
      'Write refused: typed payload target asset kind is not supported.',
    );
  }
  pushTypedCheck(
    checks,
    TYPED_PAYLOAD_PREFLIGHT_CHECK_IDS.TYPED_PAYLOAD_TARGET_KIND_SUPPORTED,
    'Typed Payload Target Kind',
    true,
    'Target asset kind is blueprint_scratch_fixture.',
  );

  // 7. allowlist compatibility
  const payloadPrefixes = payload.payload.allowlistPrefixes ?? [];
  const allowlistSet = new Set(allowlistPrefixes);
  const allowlistOk = payloadPrefixes.length > 0
    && payloadPrefixes.every(p => typeof p === 'string' && p.length > 0)
    && payloadPrefixes.every(p => allowlistSet.has(p));
  if (!allowlistOk) {
    pushTypedCheck(
      checks,
      TYPED_PAYLOAD_PREFLIGHT_CHECK_IDS.TYPED_PAYLOAD_ALLOWLIST_COMPATIBLE,
      'Typed Payload Allowlist Compatible',
      false,
      `Typed payload allowlist prefixes [${payloadPrefixes.join(', ')}] are not a non-empty subset of the scratch/test allowlist.`,
    );
    return buildTypedFailure(
      checks,
      TYPED_PAYLOAD_REFUSAL_REASONS.TYPED_PAYLOAD_INVALID,
      'Write refused: typed payload allowlist is not compatible with the scratch/test allowlist.',
    );
  }
  pushTypedCheck(
    checks,
    TYPED_PAYLOAD_PREFLIGHT_CHECK_IDS.TYPED_PAYLOAD_ALLOWLIST_COMPATIBLE,
    'Typed Payload Allowlist Compatible',
    true,
    `Typed payload allowlist prefixes [${payloadPrefixes.join(', ')}] are compatible with the scratch/test allowlist.`,
  );

  // 8. requires approval and snapshot
  if (payload.payload.requireApproval !== true || payload.payload.requireSnapshot !== true) {
    pushTypedCheck(
      checks,
      TYPED_PAYLOAD_PREFLIGHT_CHECK_IDS.TYPED_PAYLOAD_REQUIRES_APPROVAL_AND_SNAPSHOT,
      'Typed Payload Requires Approval and Snapshot',
      false,
      'Typed payload must require both approval and snapshot.',
    );
    return buildTypedFailure(
      checks,
      TYPED_PAYLOAD_REFUSAL_REASONS.TYPED_PAYLOAD_INVALID,
      'Write refused: typed payload must require both approval and snapshot.',
    );
  }
  pushTypedCheck(
    checks,
    TYPED_PAYLOAD_PREFLIGHT_CHECK_IDS.TYPED_PAYLOAD_REQUIRES_APPROVAL_AND_SNAPSHOT,
    'Typed Payload Requires Approval and Snapshot',
    true,
    'Typed payload requires both approval and snapshot.',
  );

  // 9. before state
  if (payload.payload.beforeState.kind !== 'missing_or_absent_allowed') {
    pushTypedCheck(
      checks,
      TYPED_PAYLOAD_PREFLIGHT_CHECK_IDS.TYPED_PAYLOAD_BEFORE_STATE_SUPPORTED,
      'Typed Payload Before State Supported',
      false,
      `Typed payload beforeState.kind "${payload.payload.beforeState.kind}" is not supported by typed-payload preflight.`,
    );
    return buildTypedFailure(
      checks,
      TYPED_PAYLOAD_REFUSAL_REASONS.TYPED_PAYLOAD_BEFORE_STATE_UNSUPPORTED,
      'Write refused: typed payload beforeState is not supported.',
    );
  }
  pushTypedCheck(
    checks,
    TYPED_PAYLOAD_PREFLIGHT_CHECK_IDS.TYPED_PAYLOAD_BEFORE_STATE_SUPPORTED,
    'Typed Payload Before State Supported',
    true,
    'Typed payload beforeState is missing_or_absent_allowed.',
  );

  // 10. after state non-empty
  if (operationKind === 'set_blueprint_metadata_marker') {
    const afterState = payload.payload.afterState;
    const metadataKindOk = !('kind' in afterState) || afterState.kind === 'metadata_key_value';
    if (!metadataKindOk || !('key' in afterState) || !('value' in afterState)
      || !afterState.key || !afterState.value) {
      pushTypedCheck(
        checks,
        TYPED_PAYLOAD_PREFLIGHT_CHECK_IDS.TYPED_PAYLOAD_AFTER_STATE_NON_EMPTY,
        'Typed Payload After State Non-Empty',
        false,
        'Typed payload metadata afterState must include a compatible kind plus non-empty key and value.',
      );
      return buildTypedFailure(
        checks,
        TYPED_PAYLOAD_REFUSAL_REASONS.TYPED_PAYLOAD_INVALID,
        'Write refused: typed payload metadata afterState is invalid.',
      );
    }
    pushTypedCheck(
      checks,
      TYPED_PAYLOAD_PREFLIGHT_CHECK_IDS.TYPED_PAYLOAD_AFTER_STATE_NON_EMPTY,
      'Typed Payload After State Non-Empty',
      true,
      'Typed payload metadata afterState key and value are both non-empty.',
    );
  } else {
    const afterState = payload.payload.afterState;
    const variableName = 'variableName' in afterState ? afterState.variableName : '';
    const defaultValue = 'defaultValue' in afterState ? afterState.defaultValue : '';
    const variableKindOk = 'kind' in afterState && afterState.kind === 'variable_default';
    if (!variableKindOk || !variableName) {
      pushTypedCheck(
        checks,
        TYPED_PAYLOAD_PREFLIGHT_CHECK_IDS.TYPED_PAYLOAD_VARIABLE_NAME_NON_EMPTY,
        'Typed Payload Variable Name Non-Empty',
        false,
        'Typed payload variable-default afterState must include kind=variable_default and a non-empty variableName.',
      );
      return buildTypedFailure(
        checks,
        TYPED_PAYLOAD_REFUSAL_REASONS.TYPED_PAYLOAD_INVALID,
        'Write refused: typed payload variable name is empty.',
      );
    }
    pushTypedCheck(
      checks,
      TYPED_PAYLOAD_PREFLIGHT_CHECK_IDS.TYPED_PAYLOAD_VARIABLE_NAME_NON_EMPTY,
      'Typed Payload Variable Name Non-Empty',
      true,
      `Typed payload variableName "${variableName}" is non-empty.`,
    );
    if (!defaultValue) {
      pushTypedCheck(
        checks,
        TYPED_PAYLOAD_PREFLIGHT_CHECK_IDS.TYPED_PAYLOAD_VARIABLE_DEFAULT_VALUE_NON_EMPTY,
        'Typed Payload Variable Default Value Non-Empty',
        false,
        'Typed payload variable-default afterState must include a non-empty defaultValue.',
      );
      return buildTypedFailure(
        checks,
        TYPED_PAYLOAD_REFUSAL_REASONS.TYPED_PAYLOAD_INVALID,
        'Write refused: typed payload variable default value is empty.',
      );
    }
    pushTypedCheck(
      checks,
      TYPED_PAYLOAD_PREFLIGHT_CHECK_IDS.TYPED_PAYLOAD_VARIABLE_DEFAULT_VALUE_NON_EMPTY,
      'Typed Payload Variable Default Value Non-Empty',
      true,
      'Typed payload variable default value is non-empty.',
    );
  }

  return buildTypedSuccess(checks, 'All typed-payload preflight checks passed.');
}

/**
 * Convert typed-payload check rows into the standard
 * `WritePreflightCheckResult` rows used by `ReversibleWriteResponse.preflight.checks`.
 */
function toWritePreflightCheckResults(
  rows: readonly TypedPayloadPreflightCheckRow[],
): WritePreflightCheckResult[] {
  return rows.map(r => ({
    checkId: r.checkId as string,
    checkName: r.checkName,
    passed: r.passed,
    message: r.message,
  }));
}

function refusalErrorCodeFor(reason: MockWriteRefusalReason): string {
  switch (reason) {
    case TYPED_PAYLOAD_REFUSAL_REASONS.TYPED_PAYLOAD_MISSING:
      return 'TYPED_PAYLOAD_MISSING';
    case TYPED_PAYLOAD_REFUSAL_REASONS.TYPED_PAYLOAD_INVALID:
      return 'TYPED_PAYLOAD_INVALID';
    case TYPED_PAYLOAD_REFUSAL_REASONS.TYPED_PAYLOAD_SCHEMA_MISMATCH:
      return 'TYPED_PAYLOAD_SCHEMA_MISMATCH';
    case TYPED_PAYLOAD_REFUSAL_REASONS.TYPED_PAYLOAD_TARGET_MISMATCH:
      return 'TYPED_PAYLOAD_TARGET_MISMATCH';
    case TYPED_PAYLOAD_REFUSAL_REASONS.TYPED_PAYLOAD_OPERATION_UNSUPPORTED:
      return 'TYPED_PAYLOAD_OPERATION_UNSUPPORTED';
    case TYPED_PAYLOAD_REFUSAL_REASONS.TYPED_PAYLOAD_BEFORE_STATE_UNSUPPORTED:
      return 'TYPED_PAYLOAD_BEFORE_STATE_UNSUPPORTED';
    case TYPED_PAYLOAD_REFUSAL_REASONS.SNAPSHOT_REQUIRED:
      return 'SNAPSHOT_REQUIRED';
    case 'target_not_allowlisted':
      return 'FORBIDDEN';
    case 'target_not_sandbox':
      return 'INVALID_PARAMETER';
    case 'target_not_found':
      return 'NOT_FOUND';
    case 'source_not_found':
      return 'SOURCE_NOT_FOUND';
    case 'duplicate_failed':
      return 'DUPLICATE_FAILED';
    case 'compile_failed':
      return 'COMPILE_FAILED';
    case 'compile_in_progress':
      return 'COMPILE_IN_PROGRESS';
    case 'approval_missing':
      return 'APPROVAL_REQUIRED';
    case 'write_not_implemented':
      return 'NOT_IMPLEMENTED';
    case 'snapshot_unavailable':
      return 'SNAPSHOT_UNAVAILABLE';
    case 'rollback_not_verified':
      return 'ROLLBACK_NOT_VERIFIED';
    case 'preflight_failed':
      return 'PREFLIGHT_FAILED';
    case 'capability_unavailable':
      return 'CAPABILITY_UNAVAILABLE';
    default:
      return 'WRITE_REFUSED';
  }
}

function buildMockWriteRefusal(args: {
  now: string;
  passed: boolean;
  checks: WritePreflightCheckResult[];
  message: string;
  refusalReason: MockWriteRefusalReason;
  snapshotMessage?: string;
  rollbackMessage?: string;
}): ReversibleWriteResponse {
  const refusalReason = args.refusalReason;
  return {
    success: false,
    message: args.message,
    gateState: 'blocked',
    requiresUserLocalValidation: false,
    preflight: { passed: args.passed, checks: args.checks },
    snapshot: {
      created: false,
      refusalReason: 'snapshot_unavailable',
      message: args.snapshotMessage
        ?? 'Snapshot was not created because the write request was refused before any asset mutation.',
    },
    rollback: {
      attempted: false,
      refusalReason: 'rollback_not_verified',
      message: args.rollbackMessage
        ?? 'Rollback was not attempted because no asset mutation was performed.',
    },
    refusalReason: refusalReason as WriteRefusalReason,
    errorCode: refusalErrorCodeFor(refusalReason),
    timestamp: args.now,
  };
}

/** 空上下文快照 — 模拟 UE 已连接但当前无选中资源、无日志的场景 */
function buildEmptySnapshot(): OmueContextSnapshot {
  return {
    snapshotId: 'empty-0000-0000-0000-000000000000',
    capturedAt: new Date().toISOString(),
    bridgeVersion: '0.1.0',
    project: {
      projectName: 'EmptyProject',
      projectPath: 'D:/Projects/EmptyProject',
      uprojectFile: 'D:/Projects/EmptyProject/EmptyProject.uproject',
      engineVersion: '5.4.2',
      editorStatus: 'idle',
    },
    currentAsset: undefined,
    openAssets: [],
    blueprint: undefined,
    recentLogs: [],
    compileStatus: {
      isCompiling: false,
      lastCompileResult: 'success',
      errorCount: 0,
      warningCount: 0,
      lastCompileTime: undefined,
      lastErrors: [],
    },
    runtimeStatus: {
      isPieRunning: false,
      isSimulating: false,
      activeWorldName: undefined,
      playMode: 'none',
    },
  };
}

/** 部分可用快照 — 模拟部分数据不可用（Blueprint 未导出、编译有错误/警告） */
function buildPartialSnapshot(): OmueContextSnapshot {
  const base = { ...sampleContextSnapshot };
  // Blueprint 导出状态改为 not_exported — 表示结构化数据不可用
  if (base.blueprint) {
    base.blueprint = {
      ...base.blueprint,
      exportStatus: 'not_exported',
    };
  }
  // 编译状态保持 failed（原始 mock 已有 1 error + 2 warning）
  return base;
}

// ── Mock graph detail data ────────────────────────────────────
// K2b-2c: mock data aligns with graphIds from sampleContextSnapshot.blueprintGraphs.
// No defaultValue / defaultTextValue / autogeneratedDefaultValue / defaultObject fields.

const mockNodesByGraph: Record<string, NodeInfo[]> = {
  'custom::DemoFullDiagnostic': [
    {
      nodeId: 'd1',
      title: 'BeginPlay',
      nodeType: 'event',
      pins: [
        { pinId: 'd1_p1', name: 'then', direction: 'output', pinKind: 'execute', dataType: 'exec', isArray: false, isConnected: true, linkedTo: ['d3_p1'] },
        { pinId: 'd1_p2', name: 'WorldContextObject', direction: 'input', pinKind: 'data', dataType: 'Object', isArray: false, isConnected: false, linkedTo: [] },
      ],
      isDisabled: false,
      errorType: 'none',
    },
    {
      nodeId: 'd2',
      title: 'GameplayStatics.GetPlayerCharacter',
      nodeType: 'function_call',
      pins: [
        { pinId: 'd2_p1', name: 'execute', direction: 'input', pinKind: 'execute', dataType: 'exec', isArray: false, isConnected: false, linkedTo: [] },
        { pinId: 'd2_p2', name: 'then', direction: 'output', pinKind: 'execute', dataType: 'exec', isArray: false, isConnected: false, linkedTo: [] },
        { pinId: 'd2_p3', name: 'ReturnValue', direction: 'output', pinKind: 'data', dataType: 'Object', isArray: false, isConnected: false, linkedTo: [] },
      ],
      isDisabled: false,
      errorType: 'none',
    },
    {
      nodeId: 'd3',
      title: 'Sequence',
      nodeType: 'sequence',
      pins: [
        { pinId: 'd3_p1', name: 'execute', direction: 'input', pinKind: 'execute', dataType: 'exec', isArray: false, isConnected: true, linkedTo: [] },
        { pinId: 'd3_p2', name: 'Then 0', direction: 'output', pinKind: 'execute', dataType: 'exec', isArray: false, isConnected: true, linkedTo: ['d5_p1'] },
        { pinId: 'd3_p3', name: 'Then 1', direction: 'output', pinKind: 'execute', dataType: 'exec', isArray: false, isConnected: false, linkedTo: [] },
      ],
      isDisabled: false,
      errorType: 'none',
    },
    {
      nodeId: 'd4',
      title: 'MaxHealth (variable_get)',
      nodeType: 'variable_get',
      pins: [
        { pinId: 'd4_p1', name: 'MaxHealth', direction: 'output', pinKind: 'data', dataType: 'float', isArray: false, isConnected: true, linkedTo: ['d5_p2'] },
      ],
      isDisabled: false,
      errorType: 'none',
    },
    {
      nodeId: 'd5',
      title: 'Branch (IsValid)',
      nodeType: 'branch',
      pins: [
        { pinId: 'd5_p1', name: 'execute', direction: 'input', pinKind: 'execute', dataType: 'exec', isArray: false, isConnected: true, linkedTo: [] },
        { pinId: 'd5_p2', name: 'Condition', direction: 'input', pinKind: 'data', dataType: 'bool', isArray: false, isConnected: true, linkedTo: [] },
        { pinId: 'd5_p3', name: 'True', direction: 'output', pinKind: 'execute', dataType: 'exec', isArray: false, isConnected: true, linkedTo: ['d6_p1'] },
        { pinId: 'd5_p4', name: 'False', direction: 'output', pinKind: 'execute', dataType: 'exec', isArray: false, isConnected: true, linkedTo: ['d10_p1'] },
      ],
      isDisabled: false,
      errorType: 'error',
      errorMessage: 'Condition pin expects a bool but received Object reference',
      position: { x: 0, y: 160 },
    },
    {
      nodeId: 'd6',
      title: 'Cast To BP_MyCharacter',
      nodeType: 'dynamic_cast',
      pins: [
        { pinId: 'd6_p1', name: 'execute', direction: 'input', pinKind: 'execute', dataType: 'exec', isArray: false, isConnected: true, linkedTo: [] },
        { pinId: 'd6_p2', name: 'then', direction: 'output', pinKind: 'execute', dataType: 'exec', isArray: false, isConnected: true, linkedTo: ['d7_p1'] },
        { pinId: 'd6_p3', name: 'CastFailed', direction: 'output', pinKind: 'execute', dataType: 'exec', isArray: false, isConnected: false, linkedTo: [] },
        { pinId: 'd6_p4', name: 'Object', direction: 'input', pinKind: 'data', dataType: 'Object', isArray: false, isConnected: false, linkedTo: [] },
        { pinId: 'd6_p5', name: 'As BP My Character', direction: 'output', pinKind: 'data', dataType: 'BP_MyCharacter', isArray: false, isConnected: true, linkedTo: ['d7_p2'] },
      ],
      isDisabled: false,
      errorType: 'warning',
      errorMessage: 'Cast may fail: Object input is not connected',
    },
    {
      nodeId: 'd7',
      title: 'Set CurrentHealth',
      nodeType: 'variable_set',
      pins: [
        { pinId: 'd7_p1', name: 'execute', direction: 'input', pinKind: 'execute', dataType: 'exec', isArray: false, isConnected: true, linkedTo: [] },
        { pinId: 'd7_p2', name: 'CurrentHealth', direction: 'input', pinKind: 'data', dataType: 'float', isArray: false, isConnected: true, linkedTo: [] },
        { pinId: 'd7_p3', name: 'then', direction: 'output', pinKind: 'execute', dataType: 'exec', isArray: false, isConnected: false, linkedTo: [] },
      ],
      isDisabled: true,
      errorType: 'none',
      nodeComment: 'Disabled: being refactored to use new health system',
      commentBubbleVisible: false,
    },
    {
      nodeId: 'd8',
      title: 'Literal (Int 42)',
      nodeType: 'literal',
      pins: [
        { pinId: 'd8_p1', name: 'value', direction: 'output', pinKind: 'data', dataType: 'int', isArray: false, isConnected: false, linkedTo: [] },
      ],
      isDisabled: false,
      errorType: 'none',
    },
    {
      nodeId: 'd9',
      title: 'For Each Loop',
      nodeType: 'macro_instance',
      pins: [
        { pinId: 'd9_p1', name: 'execute', direction: 'input', pinKind: 'execute', dataType: 'exec', isArray: false, isConnected: false, linkedTo: [] },
        { pinId: 'd9_p2', name: 'LoopBody', direction: 'output', pinKind: 'execute', dataType: 'exec', isArray: false, isConnected: false, linkedTo: [] },
        { pinId: 'd9_p3', name: 'Array', direction: 'input', pinKind: 'data', dataType: 'int', isArray: true, containerType: 'array', isConnected: false, linkedTo: [] },
      ],
      isDisabled: false,
      errorType: 'none',
    },
    {
      nodeId: 'd10',
      title: 'Unknown_Node_Placeholder',
      nodeType: 'unknown',
      pins: [
        { pinId: 'd10_p1', name: 'execute', direction: 'input', pinKind: 'execute', dataType: 'exec', isArray: false, isConnected: true, linkedTo: [] },
        { pinId: 'd10_p2', name: 'then', direction: 'output', pinKind: 'execute', dataType: 'exec', isArray: false, isConnected: false, linkedTo: [] },
      ],
      isDisabled: false,
      errorType: 'none',
    },
    {
      nodeId: 'd11',
      title: 'Add Delegate',
      nodeType: 'add_delegate',
      pins: [
        { pinId: 'd11_p1', name: 'Target', direction: 'input', pinKind: 'data', dataType: 'Delegate', isArray: false, isConnected: false, linkedTo: [] },
      ],
      isDisabled: false,
      errorType: 'none',
    },
  ],

  'event::EventGraph': [
    {
      nodeId: 'n1',
      nodeGuid: 'A1B2C3D4-E5F6-7890-ABCD-EF1234567890',
      title: 'BeginPlay (Event)',
      nodeType: 'event',
      pins: [
        { pinId: 'n1_p1', name: 'then', direction: 'output', pinKind: 'execute', dataType: 'exec', isArray: false, isConnected: true, linkedTo: ['n3_p1'] },
        { pinId: 'n1_p2', name: 'WorldContextObject', direction: 'input', pinKind: 'data', dataType: 'Object', isArray: false, isConnected: false, linkedTo: [] },
      ],
      isDisabled: false,
      errorType: 'none',
      position: { x: -200, y: 0 },
    },
    {
      nodeId: 'n2',
      nodeGuid: 'B2C3D4E5-F6A7-8901-BCDE-F12345678901',
      title: 'Tick (Event)',
      nodeType: 'event',
      pins: [
        { pinId: 'n2_p1', name: 'then', direction: 'output', pinKind: 'execute', dataType: 'exec', isArray: false, isConnected: true, linkedTo: ['n4_p1'] },
        { pinId: 'n2_p2', name: 'DeltaSeconds', direction: 'output', pinKind: 'data', dataType: 'float', isArray: false, isConnected: true, linkedTo: ['n4_p2'] },
        { pinId: 'n2_p3', name: 'WorldContextObject', direction: 'input', pinKind: 'data', dataType: 'Object', isArray: false, isConnected: false, linkedTo: [] },
      ],
      isDisabled: false,
      errorType: 'none',
    },
    {
      nodeId: 'n3',
      title: 'Print String',
      nodeType: 'function_call',
      pins: [
        { pinId: 'n3_p1', name: 'execute', direction: 'input', pinKind: 'execute', dataType: 'exec', isArray: false, isConnected: true, linkedTo: [] },
        { pinId: 'n3_p2', name: 'then', direction: 'output', pinKind: 'execute', dataType: 'exec', isArray: false, isConnected: false, linkedTo: [] },
        { pinId: 'n3_p3', name: 'InString', direction: 'input', pinKind: 'data', dataType: 'String', isArray: false, isConnected: false, linkedTo: [] },
      ],
      isDisabled: false,
      errorType: 'warning',
      errorMessage: 'Format string missing argument for placeholder {0}',
      nodeComment: 'TODO: fix format string after next sprint',
      commentBubbleVisible: true,
    },
    {
      nodeId: 'n4',
      title: 'Branch',
      nodeType: 'branch',
      pins: [
        { pinId: 'n4_p1', name: 'execute', direction: 'input', pinKind: 'execute', dataType: 'exec', isArray: false, isConnected: true, linkedTo: [] },
        { pinId: 'n4_p2', name: 'Condition', direction: 'input', pinKind: 'data', dataType: 'bool', isArray: false, isConnected: true, linkedTo: [] },
        { pinId: 'n4_p3', name: 'True', direction: 'output', pinKind: 'execute', dataType: 'exec', isArray: false, isConnected: true, linkedTo: ['n5_p1'] },
      ],
      isDisabled: false,
      errorType: 'none',
    },
    {
      nodeId: 'n5',
      title: 'Get Player Character',
      nodeType: 'function_call',
      pins: [
        { pinId: 'n5_p1', name: 'execute', direction: 'input', pinKind: 'execute', dataType: 'exec', isArray: false, isConnected: true, linkedTo: [] },
        { pinId: 'n5_p2', name: 'then', direction: 'output', pinKind: 'execute', dataType: 'exec', isArray: false, isConnected: false, linkedTo: [] },
        { pinId: 'n5_p3', name: 'ReturnValue', direction: 'output', pinKind: 'data', dataType: 'Object', isArray: false, isConnected: false, linkedTo: [] },
      ],
      isDisabled: false,
      errorType: 'none',
    },
  ],
  'function::OnTakeDamage': [
    {
      nodeId: 'f1',
      nodeGuid: 'C3D4E5F6-A7B8-9012-CDEF-123456789012',
      title: 'OnTakeDamage',
      nodeType: 'function_entry',
      pins: [
        { pinId: 'f1_p1', name: 'then', direction: 'output', pinKind: 'execute', dataType: 'exec', isArray: false, isConnected: true, linkedTo: ['f3_p1'] },
        { pinId: 'f1_p2', name: 'Damage', direction: 'output', pinKind: 'data', dataType: 'float', isArray: false, isConnected: true, linkedTo: ['f2_p1'] },
      ],
      isDisabled: false,
      errorType: 'none',
    },
    {
      nodeId: 'f2',
      title: 'Multiply (float * float)',
      nodeType: 'function_call',
      pins: [
        { pinId: 'f2_p1', pinGuid: 'PIN-GUID-F2-A-00001', name: 'A', direction: 'input', pinKind: 'data', dataType: 'float', isArray: false, isConnected: true, linkedTo: [] },
        { pinId: 'f2_p2', pinGuid: 'PIN-GUID-F2-B-00002', name: 'B', direction: 'input', pinKind: 'data', dataType: 'float', isArray: false, isConnected: false, linkedTo: [] },
        { pinId: 'f2_p3', pinGuid: 'PIN-GUID-F2-RV-00003', name: 'ReturnValue', direction: 'output', pinKind: 'data', dataType: 'float', isArray: false, isConnected: true, linkedTo: ['f3_p2'] },
      ],
      isDisabled: false,
      errorType: 'error',
      errorMessage: 'Pin B is not connected — this will cause a compile error',
    },
    {
      nodeId: 'f3',
      title: 'Apply Damage',
      nodeType: 'function_call',
      pins: [
        { pinId: 'f3_p1', name: 'execute', direction: 'input', pinKind: 'execute', dataType: 'exec', isArray: false, isConnected: true, linkedTo: [] },
        { pinId: 'f3_p2', name: 'BaseDamage', direction: 'input', pinKind: 'data', dataType: 'float', isArray: false, isConnected: true, linkedTo: [] },
        { pinId: 'f3_p3', name: 'then', direction: 'output', pinKind: 'execute', dataType: 'exec', isArray: false, isConnected: false, linkedTo: [] },
      ],
      isDisabled: false,
      errorType: 'none',
    },
  ],
  'function::UpdateHealth': [
    {
      nodeId: 'u1',
      title: 'UpdateHealth',
      nodeType: 'function_entry',
      pins: [
        { pinId: 'u1_p1', name: 'then', direction: 'output', pinKind: 'execute', dataType: 'exec', isArray: false, isConnected: true, linkedTo: ['u3_p1'] },
      ],
      isDisabled: false,
      errorType: 'none',
    },
    {
      nodeId: 'u2',
      title: 'Get MaxHealth',
      nodeType: 'variable_get',
      pins: [
        { pinId: 'u2_p1', name: 'MaxHealth', direction: 'output', pinKind: 'data', dataType: 'float', isArray: false, isConnected: true, linkedTo: ['u3_p3'] },
      ],
      isDisabled: false,
      errorType: 'none',
    },
    {
      nodeId: 'u3',
      title: 'Set CurrentHealth',
      nodeType: 'variable_set',
      pins: [
        { pinId: 'u3_p1', name: 'execute', direction: 'input', pinKind: 'execute', dataType: 'exec', isArray: false, isConnected: true, linkedTo: [] },
        { pinId: 'u3_p2', name: 'then', direction: 'output', pinKind: 'execute', dataType: 'exec', isArray: false, isConnected: false, linkedTo: [] },
        { pinId: 'u3_p3', name: 'CurrentHealth', direction: 'input', pinKind: 'data', dataType: 'float', isArray: false, isConnected: true, linkedTo: [] },
      ],
      isDisabled: false,
      errorType: 'none',
    },
  ],
  'macro::ForEachWithBreak': [
    {
      nodeId: 'm1',
      nodeGuid: 'D4E5F6A7-B8C9-0123-DEF4-567890ABCDEF',
      title: 'Input',
      nodeType: 'unknown',
      pins: [
        { pinId: 'm1_p1', name: 'Exec', direction: 'output', pinKind: 'execute', dataType: 'exec', isArray: false, isConnected: true, linkedTo: ['m2_p1'] },
        { pinId: 'm1_p2', name: 'Array', direction: 'output', pinKind: 'data', dataType: 'Wildcard', isArray: true, containerType: 'array', isConnected: false, linkedTo: [] },
        { pinId: 'm1_p3', name: 'FirstIndex', direction: 'output', pinKind: 'data', dataType: 'int', isArray: false, isConnected: false, linkedTo: [] },
      ],
      isDisabled: false,
      errorType: 'none',
    },
    {
      nodeId: 'm2',
      nodeGuid: 'E5F6A7B8-C9D0-1234-EF56-7890ABCDEF01',
      title: 'For Loop With Break',
      nodeType: 'macro_instance',
      pins: [
        { pinId: 'm2_p1', name: 'execute', direction: 'input', pinKind: 'execute', dataType: 'exec', isArray: false, isConnected: true, linkedTo: [] },
        { pinId: 'm2_p2', name: 'LoopBody', direction: 'output', pinKind: 'execute', dataType: 'exec', isArray: false, isConnected: true, linkedTo: ['m3_p1'] },
        { pinId: 'm2_p3', name: 'Completed', direction: 'output', pinKind: 'execute', dataType: 'exec', isArray: false, isConnected: true, linkedTo: ['m4_p1'] },
      ],
      isDisabled: false,
      errorType: 'none',
    },
    {
      nodeId: 'm3',
      nodeGuid: 'F6A7B8C9-D0E1-2345-F678-90ABCDEF0123',
      title: 'Print String',
      nodeType: 'function_call',
      pins: [
        { pinId: 'm3_p1', name: 'execute', direction: 'input', pinKind: 'execute', dataType: 'exec', isArray: false, isConnected: true, linkedTo: [] },
        { pinId: 'm3_p2', name: 'InString', direction: 'input', pinKind: 'data', dataType: 'String', isArray: false, isConnected: false, linkedTo: [] },
        { pinId: 'm3_p4', name: 'then', direction: 'output', pinKind: 'execute', dataType: 'exec', isArray: false, isConnected: false, linkedTo: [] },
      ],
      isDisabled: false,
      errorType: 'none',
    },
    {
      nodeId: 'm4',
      nodeGuid: 'A7B8C9D0-E1F2-3456-7890-ABCDEF012345',
      title: 'Output',
      nodeType: 'unknown',
      pins: [
        { pinId: 'm4_p1', name: 'Exec', direction: 'input', pinKind: 'execute', dataType: 'exec', isArray: false, isConnected: true, linkedTo: [] },
      ],
      isDisabled: false,
      errorType: 'none',
    },
  ],
  'custom::ConstructionScript': [
    {
      nodeId: 'c1',
      nodeGuid: 'B8C9D0E1-F2A3-4567-8901-BCDEF0123456',
      title: 'Construction Script',
      nodeType: 'function_entry',
      pins: [
        { pinId: 'c1_p1', name: 'then', direction: 'output', pinKind: 'execute', dataType: 'exec', isArray: false, isConnected: true, linkedTo: ['c2_p1'] },
      ],
      isDisabled: false,
      errorType: 'none',
    },
    {
      nodeId: 'c2',
      nodeGuid: 'C9D0E1F2-A3B4-5678-9012-CDEF01234567',
      title: 'Add Static Mesh Component',
      nodeType: 'function_call',
      pins: [
        { pinId: 'c2_p1', name: 'execute', direction: 'input', pinKind: 'execute', dataType: 'exec', isArray: false, isConnected: true, linkedTo: [] },
        { pinId: 'c2_p2', name: 'then', direction: 'output', pinKind: 'execute', dataType: 'exec', isArray: false, isConnected: true, linkedTo: ['c3_p1'] },
        { pinId: 'c2_p3', name: 'ReturnValue', direction: 'output', pinKind: 'data', dataType: 'Object', isArray: false, isConnected: true, linkedTo: ['c3_p3'] },
      ],
      isDisabled: false,
      errorType: 'none',
    },
    {
      nodeId: 'c3',
      nodeGuid: 'D0E1F2A3-B4C5-6789-0123-DEF012345678',
      title: 'Set Mobility',
      nodeType: 'function_call',
      pins: [
        { pinId: 'c3_p1', name: 'execute', direction: 'input', pinKind: 'execute', dataType: 'exec', isArray: false, isConnected: true, linkedTo: [] },
        { pinId: 'c3_p2', name: 'then', direction: 'output', pinKind: 'execute', dataType: 'exec', isArray: false, isConnected: true, linkedTo: ['c4_p1'] },
        { pinId: 'c3_p3', name: 'Target', direction: 'input', pinKind: 'data', dataType: 'Object', isArray: false, isConnected: true, linkedTo: [] },
      ],
      isDisabled: false,
      errorType: 'none',
    },
    {
      nodeId: 'c4',
      nodeGuid: 'E1F2A3B4-C5D6-7890-1234-EF0123456789',
      title: 'Set Collision Enabled',
      nodeType: 'function_call',
      pins: [
        { pinId: 'c4_p1', name: 'execute', direction: 'input', pinKind: 'execute', dataType: 'exec', isArray: false, isConnected: true, linkedTo: [] },
        { pinId: 'c4_p2', name: 'then', direction: 'output', pinKind: 'execute', dataType: 'exec', isArray: false, isConnected: false, linkedTo: [] },
        { pinId: 'c4_p3', name: 'Target', direction: 'input', pinKind: 'data', dataType: 'Object', isArray: false, isConnected: false, linkedTo: [] },
      ],
      isDisabled: false,
      errorType: 'none',
    },
  ],
};

const mockLinksByGraph: Record<string, LinkInfo[]> = {
  'custom::DemoFullDiagnostic': [
    { linkId: 'dl1', sourcePinId: 'd1_p1', sourceNodeId: 'd1', targetPinId: 'd3_p1', targetNodeId: 'd3' },
    { linkId: 'dl2', sourcePinId: 'd3_p2', sourceNodeId: 'd3', targetPinId: 'd5_p1', targetNodeId: 'd5' },
    { linkId: 'dl3', sourcePinId: 'd4_p1', sourceNodeId: 'd4', targetPinId: 'd5_p2', targetNodeId: 'd5' },
    { linkId: 'dl4', sourcePinId: 'd5_p3', sourceNodeId: 'd5', targetPinId: 'd6_p1', targetNodeId: 'd6' },
    { linkId: 'dl5', sourcePinId: 'd6_p2', sourceNodeId: 'd6', targetPinId: 'd7_p1', targetNodeId: 'd7' },
    { linkId: 'dl6', sourcePinId: 'd6_p5', sourceNodeId: 'd6', targetPinId: 'd7_p2', targetNodeId: 'd7' },
    { linkId: 'dl7', sourcePinId: 'd5_p4', sourceNodeId: 'd5', targetPinId: 'd10_p1', targetNodeId: 'd10' },
  ],
  'event::EventGraph': [
    { linkId: 'l1', sourcePinId: 'n1_p1', sourceNodeId: 'n1', targetPinId: 'n3_p1', targetNodeId: 'n3' },
    { linkId: 'l2', sourcePinId: 'n2_p1', sourceNodeId: 'n2', targetPinId: 'n4_p1', targetNodeId: 'n4' },
    { linkId: 'l3', sourcePinId: 'n2_p2', sourceNodeId: 'n2', targetPinId: 'n4_p2', targetNodeId: 'n4' },
    { linkId: 'l4', sourcePinId: 'n4_p3', sourceNodeId: 'n4', targetPinId: 'n5_p1', targetNodeId: 'n5' },
  ],
  'function::OnTakeDamage': [
    { linkId: 'fl1', sourcePinId: 'f1_p1', sourceNodeId: 'f1', targetPinId: 'f3_p1', targetNodeId: 'f3' },
    { linkId: 'fl2', sourcePinId: 'f1_p2', sourceNodeId: 'f1', targetPinId: 'f2_p1', targetNodeId: 'f2' },
    { linkId: 'fl3', sourcePinId: 'f2_p3', sourceNodeId: 'f2', targetPinId: 'f3_p2', targetNodeId: 'f3' },
  ],
  'function::UpdateHealth': [
    { linkId: 'ul1', sourcePinId: 'u1_p1', sourceNodeId: 'u1', targetPinId: 'u3_p1', targetNodeId: 'u3' },
    { linkId: 'ul2', sourcePinId: 'u2_p1', sourceNodeId: 'u2', targetPinId: 'u3_p3', targetNodeId: 'u3' },
  ],
  'macro::ForEachWithBreak': [
    { linkId: 'ml1', sourcePinId: 'm1_p1', sourceNodeId: 'm1', targetPinId: 'm2_p1', targetNodeId: 'm2' },
    { linkId: 'ml3', sourcePinId: 'm2_p2', sourceNodeId: 'm2', targetPinId: 'm3_p1', targetNodeId: 'm3' },
    { linkId: 'ml5', sourcePinId: 'm2_p3', sourceNodeId: 'm2', targetPinId: 'm4_p1', targetNodeId: 'm4' },
  ],
  'custom::ConstructionScript': [
    { linkId: 'cl1', sourcePinId: 'c1_p1', sourceNodeId: 'c1', targetPinId: 'c2_p1', targetNodeId: 'c2' },
    { linkId: 'cl2', sourcePinId: 'c2_p2', sourceNodeId: 'c2', targetPinId: 'c3_p1', targetNodeId: 'c3' },
    { linkId: 'cl3', sourcePinId: 'c2_p3', sourceNodeId: 'c2', targetPinId: 'c3_p3', targetNodeId: 'c3' },
    { linkId: 'cl4', sourcePinId: 'c3_p2', sourceNodeId: 'c3', targetPinId: 'c4_p1', targetNodeId: 'c4' },
  ],
};

/** Synthetic graph info for mock graphs not listed in sampleContextSnapshot.blueprintGraphs */
function findOrCreateGraphInfo(graphId: string): BlueprintGraphInfo {
  const existing = sampleContextSnapshot.blueprintGraphs?.graphs.find(g => g.graphId === graphId);
  if (existing) return existing;
  // Create a synthetic entry for mock-only graphs
  return {
    graphId,
    name: graphId.includes('DemoFullDiagnostic') ? 'Demo Full Diagnostic' : graphId,
    kind: graphId.startsWith('custom::') ? 'custom' : 'function',
    nodeCount: mockNodesByGraph[graphId]?.length ?? 0,
    linkCount: mockLinksByGraph[graphId]?.length ?? 0,
    isEntryGraph: false,
  };
}

function buildMockGraphDetail(graphId: string): BlueprintGraphDetailData | null {
  const graph = findOrCreateGraphInfo(graphId);

  const nodes = mockNodesByGraph[graphId];
  if (!nodes) return null;

  const links = mockLinksByGraph[graphId] ?? [];

  const detail: GraphDetail = {
    graphId,
    nodes,
    links,
  };

  return {
    selectedBlueprint: {
      exportMeta: {
        formatVersion: '0.1.0',
        exportedAt: new Date().toISOString(),
        source: 'live',
        assetPath: '/Game/Blueprints/Characters/BP_PlayerCharacter',
        includedGraphIds: [graphId],
      },
      blueprintName: 'BP_PlayerCharacter',
      requestedGraphId: graphId,
      graph: { ...graph, detail },
    },
  };
}

// ── Mock Capability Discovery ───────────────────────────────────
// E70: deterministic mock data aligned with E69 plan fixtures.

function buildMockCapabilityDiscovery(): BridgeCapabilityDiscovery {
  const now = new Date().toISOString();
  return {
    bridgeVersion: '0.1.0',
    editorStatus: 'idle',
    capabilities: [
      {
        operationKind: 'blueprint_edit',
        status: 'pending_user_local_validation',
        description: 'Blueprint variable/property edit support — data shape ready, requires UE header verification and user-local validation before write.',
        preflightAvailable: true,
        applicablePreflightChecks: [
          'bridge_availability', 'asset_path_validity', 'asset_type_supported',
          'package_writable', 'dirty_state', 'context_mismatch',
          'bridge_version', 'approval_gate_status', 'snapshot_availability',
        ],
      },
      {
        operationKind: 'scratch_duplicate',
        status: 'pending_user_local_validation',
        description: 'Create a dirty, unsaved scratch duplicate of a Blueprint for sandbox repair flow.',
        preflightAvailable: true,
        applicablePreflightChecks: [
          'source_asset_exists', 'target_scratch_allowlisted', 'approval_metadata_present',
        ],
      },
      {
        operationKind: 'scratch_compile',
        status: 'pending_user_local_validation',
        description: 'Compile an allowlisted scratch Blueprint without saving, PIE, or Automation.',
        preflightAvailable: true,
        applicablePreflightChecks: [
          'asset_compilable', 'target_scratch_allowlisted', 'approval_metadata_present',
        ],
      },
      {
        operationKind: 'behavior_tree',
        status: 'not_implemented',
        description: 'Behavior Tree node/selector/task edit — deferred. Requires separate design and asset-specific preflight.',
        preflightAvailable: false,
        applicablePreflightChecks: [
          'bridge_availability', 'asset_path_validity', 'bridge_version', 'approval_gate_status',
        ],
      },
      {
        operationKind: 'blackboard',
        status: 'not_implemented',
        description: 'Blackboard key add/edit/remove — deferred. Requires separate design and asset-specific preflight.',
        preflightAvailable: false,
        applicablePreflightChecks: [
          'bridge_availability', 'asset_path_validity', 'bridge_version', 'approval_gate_status',
        ],
      },
      {
        operationKind: 'manual',
        status: 'supported',
        description: 'Manual/user-performed steps — no UE bridge operation required. Listed as a supported operation kind for completeness.',
        preflightAvailable: false,
        applicablePreflightChecks: [],
      },
      {
        operationKind: 'asset_write',
        status: 'not_implemented',
        description: 'Generic UE asset write (non-Blueprint, non-BT, non-BB) — deferred. Requires separate design and safety review.',
        preflightAvailable: false,
        applicablePreflightChecks: [
          'bridge_availability', 'asset_path_validity', 'asset_type_supported',
          'bridge_version', 'approval_gate_status',
        ],
      },
    ],
    preflightSummary: {
      availableChecks: [
        'bridge_availability', 'bridge_version', 'approval_gate_status',
        'source_asset_exists', 'target_scratch_allowlisted',
        'asset_compilable', 'approval_metadata_present',
      ],
      notImplementedChecks: [
        'asset_path_validity', 'asset_type_supported', 'package_writable',
        'dirty_state', 'context_mismatch', 'snapshot_availability',
      ],
      pendingUserValidationChecks: [],
    },
    timestamp: now,
  };
}

// ── Mock BT / Blackboard Diagnostic ───────────────────────────
// E62: deterministic mock data aligned with E59 panel fixture.

function buildMockBtDiagnostic(): BehaviorTreeDiagnosticResponse {
  const now = new Date().toISOString();
  return {
    asset: {
      assetName: 'BT_CombatGuard',
      assetPath: '/Game/AI/BT_CombatGuard',
      rootNodeId: '0xmock-root',
      rootNodeName: 'Root Sequence',
      blackboardAssetName: 'BB_CombatGuard',
      blackboardAssetPath: '/Game/AI/BB_CombatGuard',
    },
    nodeHierarchy: [
      { nodeId: '0xmock-root', nodeName: 'Root Sequence', nodeKind: 'Root', className: 'BTComposite_Sequence', parentNodeId: null, childNodeIds: ['0xmock-sel-combat'] },
      { nodeId: '0xmock-sel-combat', nodeName: 'Combat Selector', nodeKind: 'Composite', className: 'BTComposite_Selector', parentNodeId: '0xmock-root', childNodeIds: ['0xmock-dec-hasenemy', '0xmock-svc-patrol', '0xmock-seq-attack'] },
      { nodeId: '0xmock-dec-hasenemy', nodeName: 'Condition_HasEnemy', nodeKind: 'Decorator', className: 'BBConditionalDecorator', parentNodeId: '0xmock-sel-combat', childNodeIds: [] },
      { nodeId: '0xmock-svc-patrol', nodeName: 'Service_Patrol', nodeKind: 'Service', className: 'BTService_BlueprintBase', parentNodeId: '0xmock-sel-combat', childNodeIds: [] },
      { nodeId: '0xmock-seq-attack', nodeName: 'Attack Sequence', nodeKind: 'Composite', className: 'BTComposite_Sequence', parentNodeId: '0xmock-sel-combat', childNodeIds: ['0xmock-dec-cooldown', '0xmock-dec-ammo', '0xmock-task-wait'] },
      { nodeId: '0xmock-dec-cooldown', nodeName: 'CooldownCheck', nodeKind: 'Decorator', className: 'BBDecorator_Cooldown', parentNodeId: '0xmock-seq-attack', childNodeIds: [] },
      { nodeId: '0xmock-dec-ammo', nodeName: 'AmmoCheck', nodeKind: 'Decorator', className: 'BBConditionalDecorator', parentNodeId: '0xmock-seq-attack', childNodeIds: [] },
      { nodeId: '0xmock-task-wait', nodeName: 'Wait', nodeKind: 'Task', className: 'BTTask_Wait', parentNodeId: '0xmock-seq-attack', childNodeIds: [] },
    ],
    blackboardKeys: [
      { keyName: 'HasEnemy', keyType: 'BlackboardKeyType_Bool', bInstanceSynced: true },
      { keyName: 'MoveTarget', keyType: 'BlackboardKeyType_Object', bInstanceSynced: true },
      { keyName: 'PatrolCenter', keyType: 'BlackboardKeyType_Vector', bInstanceSynced: false },
      { keyName: 'AttackCooldown', keyType: 'BlackboardKeyType_Float', bInstanceSynced: true },
      { keyName: 'HasAmmo', keyType: 'BlackboardKeyType_Bool', bInstanceSynced: true },
      { keyName: 'FocusTarget', keyType: 'BlackboardKeyType_Name', bInstanceSynced: false },
      { keyName: 'AttackMontage', keyType: 'BlackboardKeyType_Object', bInstanceSynced: false },
      { keyName: 'WaitTime', keyType: 'BlackboardKeyType_Float', bInstanceSynced: false },
      { keyName: 'AcceptableRadius', keyType: 'BlackboardKeyType_Float', bInstanceSynced: false },
      { keyName: 'CombatState', keyType: 'BlackboardKeyType_Enum', bInstanceSynced: true },
    ],
    nodeCount: 8,
    bbKeyCount: 10,
    warnings: [
      { type: 'mock_data', message: 'This is mock data — not from a real UE bridge endpoint.' },
      { type: 'mock_no_inherited_keys', message: 'Mock fixture skips parent blackboard chain simulation.' },
    ],
    source: 'MockBridgeClient fixture',
    timestamp: now,
  };
}

/** Mock 实现：根据 scenario 返回不同的 mock 结果。不发起真实网络请求。 */
export class MockBridgeClient implements BridgeClient {
  private scenario: MockBridgeScenario = 'normal';

  /** 切换 mock 场景（仅 MockBridgeClient 有此方法，不属于 BridgeClient 接口） */
  setScenario(scenario: MockBridgeScenario): void {
    this.scenario = scenario;
  }

  /** 获取当前场景 */
  getScenario(): MockBridgeScenario {
    return this.scenario;
  }

  async getHealth(): Promise<BridgeHealth> {
    if (this.scenario === 'disconnected') {
      await delay(100);
      return {
        connectionStatus: 'disconnected',
        serviceName: 'OmueUnrealBridge (Mock)',
        version: '0.1.0',
        message: 'Mock bridge is disconnected — 模拟断连状态',
        checkedAt: new Date().toISOString(),
      };
    }

    const ms = this.scenario === 'slow' ? 1200 : 200;
    await delay(ms);
    return {
      connectionStatus: 'connected',
      serviceName: 'OmueUnrealBridge (Mock)',
      version: '0.1.0',
      message: `Mock bridge — 当前场景: ${this.scenario}`,
      checkedAt: new Date().toISOString(),
    };
  }

  async getBlueprintGraphDetail(graphId: string): Promise<BlueprintGraphDetailData> {
    await delay(this.scenario === 'slow' ? 800 : 150);

    if (this.scenario === 'disconnected') {
      throw new Error('Mock bridge is disconnected. Cannot fetch graph detail.');
    }

    if (this.scenario === 'empty') {
      return { selectedBlueprint: null };
    }

    const detail = buildMockGraphDetail(graphId);
    if (!detail) {
      throw new Error(`Mock bridge: unknown graphId "${graphId}"`);
    }
    return detail;
  }

  async getContextSnapshot(): Promise<OmueContextSnapshot> {
    if (this.scenario === 'disconnected') {
      // 短暂延迟后抛出错误，模拟桥接层不可达
      await delay(100);
      throw new Error('Mock bridge is disconnected. 无法获取上下文快照。');
    }

    const ms = this.scenario === 'slow' ? 1500 : 200;
    await delay(ms);

    switch (this.scenario) {
      case 'empty':
        return buildEmptySnapshot();
      case 'partial':
        return buildPartialSnapshot();
      case 'normal':
        {
          const base = { ...sampleContextSnapshot };
          // E41: add a compile issue that uniquely matches graph detail node f2's errorMessage
          // to demonstrate high-confidence nodeRef and medium-confidence pinRef.
          base.compileStatus.lastErrors = [
            ...(base.compileStatus.lastErrors ?? []),
            {
              code: 'BPUnconnectedPin',
              message: 'Pin B is not connected — this will cause a compile error',
              file: '/Game/Blueprints/Characters/BP_PlayerCharacter',
              severity: 'error',
            },
          ];
          return base;
        }
      default:
        return { ...sampleContextSnapshot };
    }
  }

  async getBehaviorTreeDiagnostic(assetPath: string): Promise<BehaviorTreeDiagnosticResponse> {
    await delay(this.scenario === 'slow' ? 800 : 150);

    if (this.scenario === 'disconnected') {
      throw new Error('Mock bridge is disconnected. Cannot fetch BT diagnostic.');
    }

    if (this.scenario === 'empty') {
      return {
        asset: {
          assetName: 'Unknown',
          assetPath,
          rootNodeId: null,
          rootNodeName: null,
          blackboardAssetName: null,
          blackboardAssetPath: null,
        },
        nodeHierarchy: [],
        blackboardKeys: [],
        nodeCount: 0,
        bbKeyCount: 0,
        warnings: [{ type: 'empty_simulated', message: 'Mock scenario: empty — no BT data returned.' }],
        source: 'MockBridgeClient (empty scenario)',
        timestamp: new Date().toISOString(),
      };
    }

    if (this.scenario === 'partial') {
      const base = buildMockBtDiagnostic();
      return {
        ...base,
        asset: { ...base.asset, blackboardAssetName: null, blackboardAssetPath: null },
        blackboardKeys: [],
        bbKeyCount: 0,
        warnings: [
          ...base.warnings,
          { type: 'missing_blackboard', message: 'BehaviorTree has no BlackboardAsset assigned (partial simulation).' },
        ],
      };
    }

    const mock = buildMockBtDiagnostic();
    // Override assetPath to the requested path for realism
    mock.asset.assetPath = assetPath;
    return mock;
  }

  async getCapabilities(): Promise<BridgeCapabilityDiscovery> {
    await delay(this.scenario === 'slow' ? 600 : 100);

    if (this.scenario === 'disconnected') {
      throw new Error('Mock bridge is disconnected. Cannot fetch capabilities.');
    }

    const mock = buildMockCapabilityDiscovery();
    return mock;
  }

  // ── Reversible write (E71 + E84 typed payload preflight) ─────

  async duplicateScratch(request: DuplicateScratchRequest): Promise<DuplicateScratchResponse> {
    await delay(this.scenario === 'slow' ? 1200 : 100);

    if (this.scenario === 'disconnected') {
      throw new Error('Mock bridge is disconnected. Cannot duplicate scratch asset.');
    }

    const target = request.targetScratchPath;
    if (!request.approval?.approvalId || !request.approval?.approvedAt) {
      return {
        success: false,
        scratchAssetPath: target,
        message: 'Duplicate refused: approval metadata is missing or incomplete.',
        refusalReason: 'approval_missing',
      };
    }

    if (!isScratchWriteAllowlisted(target)) {
      return {
        success: false,
        scratchAssetPath: target,
        message: `Duplicate refused: target path "${target}" is not allowlisted.`,
        refusalReason: 'target_not_allowlisted',
      };
    }

    if (!request.sourceAssetPath || this.scenario === 'target_not_found') {
      return {
        success: false,
        scratchAssetPath: target,
        message: `Duplicate refused: source Blueprint "${request.sourceAssetPath}" was not found.`,
        refusalReason: 'source_not_found',
      };
    }

    const stamp = new Date().toISOString().replace(/[^0-9]/g, '');
    return {
      success: true,
      scratchAssetPath: target,
      snapshotId: `mock-dup-${stamp}`,
      message: `Mock duplicated "${request.sourceAssetPath}" to dirty unsaved scratch asset "${target}".`,
    };
  }

  async compileBlueprint(request: CompileBlueprintRequest): Promise<CompileBlueprintResponse> {
    await delay(this.scenario === 'slow' ? 1200 : 100);

    if (this.scenario === 'disconnected') {
      throw new Error('Mock bridge is disconnected. Cannot compile Blueprint.');
    }

    if (!request.approval?.approvalId || !request.approval?.approvedAt) {
      return {
        success: false,
        errors: [],
        durationMs: 0,
        message: 'Compile refused: approval metadata is missing or incomplete.',
        refusalReason: 'approval_missing',
      };
    }

    if (!isScratchCompileAllowlisted(request.assetPath)) {
      return {
        success: false,
        errors: [],
        durationMs: 0,
        message: `Compile refused: asset path "${request.assetPath}" is not under /Game/Scratch/.`,
        refusalReason: 'target_not_allowlisted',
      };
    }

    if (!request.assetPath || this.scenario === 'target_not_found') {
      return {
        success: false,
        errors: [],
        durationMs: 0,
        message: `Compile refused: target Blueprint "${request.assetPath}" was not found.`,
        refusalReason: 'target_not_found',
      };
    }

    if (this.scenario === 'write_not_implemented') {
      return {
        success: false,
        errors: [{
          code: 'MOCK_COMPILE_ERROR',
          message: 'Mock scenario write_not_implemented simulates a sandbox compile failure.',
          severity: 'error',
        }],
        durationMs: 25,
        message: `Mock compile completed with errors for "${request.assetPath}".`,
      };
    }

    return {
      success: true,
      errors: [],
      durationMs: 18,
      message: `Mock compile succeeded for "${request.assetPath}".`,
    };
  }

  async writeReversible(request: ReversibleWriteRequest): Promise<ReversibleWriteResponse> {
    return this.performScratchWrite(request, 'canonical');
  }

  async sandboxApply(request: ReversibleWriteRequest): Promise<ReversibleWriteResponse> {
    return this.performScratchWrite(request, 'sandbox');
  }

  private async performScratchWrite(
    request: ReversibleWriteRequest,
    targetMode: 'canonical' | 'sandbox',
  ): Promise<ReversibleWriteResponse> {
    await delay(this.scenario === 'slow' ? 1200 : 100);

    if (this.scenario === 'disconnected') {
      throw new Error('Mock bridge is disconnected. Cannot perform write.');
    }

    const now = new Date().toISOString();
    const checks: WritePreflightCheckResult[] = [];

    // 1. Request JSON valid (implicit: the request is a typed object).
    checks.push({
      checkId: TYPED_PAYLOAD_PREFLIGHT_CHECK_IDS.REQUEST_JSON_VALID,
      checkName: 'Request JSON Valid',
      passed: true,
      message: 'Request body parsed as a JSON object.',
    });

    // 2. Target path present.
    if (!request.targetAssetPath) {
      checks.push({
        checkId: TYPED_PAYLOAD_PREFLIGHT_CHECK_IDS.TARGET_PATH_PRESENT,
        checkName: 'Target Path Present',
        passed: false,
        message: 'targetAssetPath is required and must not be empty.',
      });
      return buildMockWriteRefusal({
        now,
        passed: false,
        checks,
        message: 'Write refused: targetAssetPath is required and must not be empty.',
        refusalReason: 'target_not_allowlisted',
        snapshotMessage: 'Snapshot not attempted — target path was missing.',
        rollbackMessage: 'Rollback not attempted — target path was missing.',
      });
    }
    checks.push({
      checkId: TYPED_PAYLOAD_PREFLIGHT_CHECK_IDS.TARGET_PATH_PRESENT,
      checkName: 'Target Path Present',
      passed: true,
      message: `Target path "${request.targetAssetPath}" is present.`,
    });

    // 3. Target path allowlisted.
    if (!isScratchWriteAllowlisted(request.targetAssetPath)) {
      checks.push({
        checkId: TYPED_PAYLOAD_PREFLIGHT_CHECK_IDS.TARGET_PATH_ALLOWLISTED,
        checkName: 'Target Path Allowlisted',
        passed: false,
        message: `Target path "${request.targetAssetPath}" is not in /Game/Scratch/ or /Game/Test/.`,
      });
      return buildMockWriteRefusal({
        now,
        passed: false,
        checks,
        message: `Write refused: target path "${request.targetAssetPath}" is not allowlisted. Use /Game/Scratch/ or /Game/Test/.`,
        refusalReason: 'target_not_allowlisted',
      });
    }
    checks.push({
      checkId: TYPED_PAYLOAD_PREFLIGHT_CHECK_IDS.TARGET_PATH_ALLOWLISTED,
      checkName: 'Target Path Allowlisted',
      passed: true,
      message: `Target path "${request.targetAssetPath}" is in the scratch/test allowlist.`,
    });

    // 4. E82 scenario: `empty` short-circuits with target_not_allowlisted
    //    to simulate a UI state where the request shape itself is rejected.
    if (this.scenario === 'empty') {
      return {
        success: false,
        message: `Write refused: target path "${request.targetAssetPath}" is not allowlisted.`,
        gateState: 'blocked',
        requiresUserLocalValidation: false,
        preflight: { passed: false, checks },
        snapshot: {
          created: false,
          refusalReason: 'snapshot_unavailable',
          message: 'Snapshot not attempted — write was refused.',
        },
        rollback: {
          attempted: false,
          refusalReason: 'rollback_not_verified',
          message: 'Rollback not attempted — write was refused.',
        },
        refusalReason: 'target_not_allowlisted',
        errorCode: refusalErrorCodeFor('target_not_allowlisted'),
        timestamp: now,
      };
    }

    // 5. Target Blueprint exists (mock-simulated; UE side checks
    //    `DoesBlueprintAssetExist` against the actual UBlueprint).
    if (this.scenario === 'target_not_found') {
      checks.push({
        checkId: TYPED_PAYLOAD_PREFLIGHT_CHECK_IDS.TARGET_BLUEPRINT_EXISTS,
        checkName: 'Target Blueprint Exists',
        passed: false,
        message: `Mock scenario "target_not_found": target asset "${request.targetAssetPath}" not found.`,
      });
      return buildMockWriteRefusal({
        now,
        passed: false,
        checks,
        message: `Write refused: target asset "${request.targetAssetPath}" not found.`,
        refusalReason: 'target_not_found',
        snapshotMessage: 'Snapshot not attempted — target not found.',
        rollbackMessage: 'Rollback not attempted — target not found.',
      });
    }
    checks.push({
      checkId: TYPED_PAYLOAD_PREFLIGHT_CHECK_IDS.TARGET_BLUEPRINT_EXISTS,
      checkName: 'Target Blueprint Exists',
      passed: true,
      message: `Mock scenario assumes target asset "${request.targetAssetPath}" exists.`,
    });

    // 6. E82 scenario: `partial` short-circuits with approval_missing to
    //    simulate a UI state where approval metadata was lost.
    if (this.scenario === 'partial') {
      checks.push({
        checkId: TYPED_PAYLOAD_PREFLIGHT_CHECK_IDS.APPROVAL_METADATA_PRESENT,
        checkName: 'Approval Metadata Present',
        passed: false,
        message: 'Mock scenario "partial": approval metadata reported missing by bridge.',
      });
      return {
        success: false,
        message: 'Write refused: approval metadata is missing or incomplete.',
        gateState: 'blocked',
        requiresUserLocalValidation: false,
        preflight: { passed: false, checks },
        snapshot: {
          created: false,
          refusalReason: 'snapshot_unavailable',
          message: 'Snapshot not attempted — approval missing.',
        },
        rollback: {
          attempted: false,
          refusalReason: 'rollback_not_verified',
          message: 'Rollback not attempted — approval missing.',
        },
        refusalReason: 'approval_missing',
        errorCode: refusalErrorCodeFor('approval_missing'),
        timestamp: now,
      };
    }

    // 7. Approval metadata present.
    if (!request.approval || !request.approval.approvalId || !request.approval.approvedAt) {
      checks.push({
        checkId: TYPED_PAYLOAD_PREFLIGHT_CHECK_IDS.APPROVAL_METADATA_PRESENT,
        checkName: 'Approval Metadata Present',
        passed: false,
        message: "Approval metadata is required: 'approval.approvalId' and 'approval.approvedAt' must be non-empty.",
      });
      return buildMockWriteRefusal({
        now,
        passed: false,
        checks,
        message: 'Write refused: approval metadata is missing or incomplete.',
        refusalReason: 'approval_missing',
        snapshotMessage: 'Snapshot not attempted — approval missing.',
        rollbackMessage: 'Rollback not attempted — approval missing.',
      });
    }
    checks.push({
      checkId: TYPED_PAYLOAD_PREFLIGHT_CHECK_IDS.APPROVAL_METADATA_PRESENT,
      checkName: 'Approval Metadata Present',
      passed: true,
      message: `Approved by ${request.approval.approvalId} at ${request.approval.approvedAt}.`,
    });

    // 8. Request explicitly requires snapshot.
    if (request.requireSnapshot !== true) {
      checks.push({
        checkId: TYPED_PAYLOAD_PREFLIGHT_CHECK_IDS.REQUEST_REQUIRES_SNAPSHOT,
        checkName: 'Request Requires Snapshot',
        passed: false,
        message: 'Request must set requireSnapshot to true for safe scratch writes.',
      });
      return buildMockWriteRefusal({
        now,
        passed: false,
        checks,
        message: 'Write refused: request must explicitly require a snapshot.',
        refusalReason: 'snapshot_required',
        snapshotMessage: 'Snapshot not attempted — request did not require snapshot.',
        rollbackMessage: 'Rollback not attempted — request did not require snapshot.',
      });
    }
    checks.push({
      checkId: TYPED_PAYLOAD_PREFLIGHT_CHECK_IDS.REQUEST_REQUIRES_SNAPSHOT,
      checkName: 'Request Requires Snapshot',
      passed: true,
      message: 'Request explicitly requires a snapshot.',
    });

    // 9. E84 typed-payload preflight. The mock validator returns the
    //    same check IDs and refusal reasons as the UE bridge so the
    //    Desktop UI can exercise the full preflight vocabulary
    //    without a live UE bridge.
    const typedValidation = validateE84TypedPayload(
      request,
      DEFAULT_SAFE_SCRATCH_ALLOWLIST_PREFIXES,
    );
    const typedChecks = toWritePreflightCheckResults(typedValidation.checks);
    for (const c of typedChecks) checks.push(c);

    if (!typedValidation.passed) {
      return buildMockWriteRefusal({
        now,
        passed: false,
        checks,
        message: typedValidation.message,
        refusalReason: typedValidation.refusalReason ?? 'typed_payload_invalid',
        snapshotMessage: 'Snapshot not attempted — typed payload preflight failed.',
        rollbackMessage: 'Rollback not attempted — typed payload preflight failed.',
      });
    }

    const payload = request.typedPayload!;
    const canonicalPath = E85_CANONICAL_SCRATCH_FIXTURE_PATH;
    const writeTargetPath = request.targetAssetPath;

    if (targetMode === 'sandbox') {
      const payloadTarget = payload?.payload?.targetAssetPath ?? '';
      const requestIsScratch = request.targetAssetPath.startsWith('/Game/Scratch/');
      const payloadIsScratch = payloadTarget.startsWith('/Game/Scratch/');
      if (!requestIsScratch || !payloadIsScratch) {
        checks.push({
          checkId: 'target_scratch_allowlisted',
          checkName: 'Sandbox Target Scratch Allowlisted',
          passed: false,
          message: `Sandbox apply only accepts /Game/Scratch/ targets. Request target "${request.targetAssetPath}" and payload target "${payloadTarget}" were refused.`,
        });
        return buildMockWriteRefusal({
          now,
          passed: false,
          checks,
          message: `Sandbox apply refused: target "${request.targetAssetPath}" is not under /Game/Scratch/.`,
          refusalReason: 'target_not_allowlisted',
          snapshotMessage: 'Snapshot not attempted — sandbox target was not scratch-allowlisted.',
          rollbackMessage: 'Rollback not attempted — sandbox target was not scratch-allowlisted.',
        });
      }
      checks.push({
        checkId: 'target_scratch_allowlisted',
        checkName: 'Sandbox Target Scratch Allowlisted',
        passed: true,
        message: `Request and payload target are under /Game/Scratch/: "${request.targetAssetPath}".`,
      });

      const requestHasSandboxSuffix = request.targetAssetPath.endsWith('_Sandbox');
      const payloadHasSandboxSuffix = payloadTarget.endsWith('_Sandbox');
      if (!requestHasSandboxSuffix || !payloadHasSandboxSuffix) {
        checks.push({
          checkId: 'target_sandbox_suffix',
          checkName: 'Sandbox Target Suffix',
          passed: false,
          message: `Sandbox apply requires request and payload targets to end with "_Sandbox". Request target "${request.targetAssetPath}" and payload target "${payloadTarget}" were refused.`,
        });
        return buildMockWriteRefusal({
          now,
          passed: false,
          checks,
          message: `Sandbox apply refused: target "${request.targetAssetPath}" must end with "_Sandbox".`,
          refusalReason: 'target_not_sandbox',
          snapshotMessage: 'Snapshot not attempted — target was not a sandbox copy.',
          rollbackMessage: 'Rollback not attempted — target was not a sandbox copy.',
        });
      }
      checks.push({
        checkId: 'target_sandbox_suffix',
        checkName: 'Sandbox Target Suffix',
        passed: true,
        message: `Request and payload target identify sandbox copy "${request.targetAssetPath}".`,
      });
    } else {
      // 10. E85 canonical target gate. E84 already validated the
      //     scratch/test allowlist. E85 is stricter: it only mutates
      //     the exact canonical scratch fixture.
      const requestIsCanonical = request.targetAssetPath === canonicalPath;
      const payloadIsCanonical = payload?.payload?.targetAssetPath === canonicalPath;
      if (!requestIsCanonical || !payloadIsCanonical) {
        checks.push({
          checkId: 'e85_canonical_target',
          checkName: 'Canonical Scratch Target',
          passed: false,
          message: `This write operation only executes on "${canonicalPath}". Request and payload targets must match the canonical scratch fixture.`,
        });
        return buildMockWriteRefusal({
          now,
          passed: false,
          checks,
          message: `Write refused: the target must be the canonical scratch fixture "${canonicalPath}".`,
          refusalReason: 'target_not_allowlisted',
          snapshotMessage: 'Snapshot not attempted — target is not the canonical scratch fixture.',
          rollbackMessage: 'Rollback not attempted — target is not the canonical scratch fixture.',
        });
      }
      checks.push({
        checkId: 'e85_canonical_target',
        checkName: 'Canonical Scratch Target',
        passed: true,
        message: `Request and payload target match the canonical scratch fixture "${canonicalPath}".`,
      });
    }

    if (payload.payload.operationKind === 'set_blueprint_variable_default') {
      const afterState = payload.payload.afterState;
      const variableName = 'variableName' in afterState ? afterState.variableName : '';
      const defaultValue = 'defaultValue' in afterState ? afterState.defaultValue : '';

      checks.push({
        checkId: 'typed_payload_variable_exists',
        checkName: 'Typed Payload Variable Exists',
        passed: true,
        message: targetMode === 'canonical'
          ? `Mock scenario assumes Blueprint variable "${variableName}" exists on the canonical scratch fixture.`
          : `Mock scenario assumes Blueprint variable "${variableName}" exists on sandbox target "${writeTargetPath}".`,
      });
      checks.push({
        checkId: 'typed_payload_variable_default_type_compatible',
        checkName: 'Typed Payload Variable Default Type Compatible',
        passed: true,
        message: `Mock scenario assumes default value "${defaultValue}" is compatible with variable "${variableName}".`,
      });

      const snapshotId = `mock-var-snap-${now.replace(/[^0-9]/g, '')}-${Math.floor(
        Math.random() * 0xffffff,
      ).toString(16).padStart(6, '0')}`;
      const rollbackIntent: ScratchVariableDefaultRollbackIntent = 'clear_variable_default';
      const rollback: ScratchVariableDefaultRollbackPayload = {
        intent: rollbackIntent,
        targetAssetPath: request.targetAssetPath,
        operationKind: 'set_blueprint_variable_default',
        variableName,
        previousDefaultExisted: false,
        previousDefaultValue: undefined,
        requestedDefaultValue: defaultValue,
        approvalId: request.approval.approvalId,
        snapshotId,
        writeTimestamp: now,
        packageDirty: true,
        packageSaved: false,
      };
      const capture: ScratchVariableDefaultWriteCapture = {
        kind: 'scratch_variable_default',
        targetAssetPath: request.targetAssetPath,
        operationKind: 'set_blueprint_variable_default',
        variable: {
          variableName,
          previousDefaultExisted: false,
          previousDefaultValue: undefined,
          requestedDefaultValue: defaultValue,
        },
        approvalId: request.approval.approvalId,
        snapshotId,
        timestamp: now,
        packageDirty: true,
        packageSaved: false,
        rollback,
      };

      return {
        success: true,
        message: `Accepted the scratch variable-default write on "${writeTargetPath}" (variable="${variableName}"). User-local UE validation is required; the package is dirty but not saved.`,
        gateState: 'executed_pending_validation',
        requiresUserLocalValidation: true,
        preflight: { passed: true, checks },
        snapshot: {
          created: true,
          snapshotId,
          snapshotAt: now,
          label: `Mock variable-default snapshot for ${writeTargetPath}`,
          operationCount: 1,
          sizeEstimate: 'mock',
          capture: capture as unknown as ScratchMetadataWriteCapture,
          message: `Mock captured before-state for variable "${variableName}" on ${writeTargetPath}; package is dirty but not saved by automation.`,
        },
        rollback: {
          attempted: false,
          snapshotId,
          refusalReason: 'rollback_not_verified',
          message: `Rollback not attempted. Rollback payload available: ${rollbackIntent} on variable="${variableName}".`,
        },
        timestamp: now,
      };
    }

    // 11. E85 rollback-ready before-state capture (mock-simulated).
    //     The real bridge would read the current metadata value for
    //     `afterState.key` on the target Blueprint asset via
    //     `UMetaData::GetValue`. The mock returns a deterministic
    //     empty previous state because the canonical scratch fixture
    //     is expected to be clean in mock mode. Capture failure
    //     here would refuse with `snapshot_unavailable` or
    //     `rollback_not_verified`; the mock cannot fail this step.
    const beforeState: ScratchMetadataBeforeAfterState = {
      key: 'key' in payload.payload.afterState ? payload.payload.afterState.key : '',
      keyExisted: false,
      previousValue: undefined,
      requestedValue: 'value' in payload.payload.afterState ? payload.payload.afterState.value : '',
    };

    // 13. E85 metadata update (mock-simulated). The real bridge
    //     would call `UMetaData::SetValue` and `MarkPackageDirty`
    //     inside the same final guarded block. The mock performs
    //     no real asset mutation and the package is never saved.
    const snapshotId = `mock-snap-${now.replace(/[^0-9]/g, '')}-${Math.floor(
      Math.random() * 0xffffff,
    ).toString(16).padStart(6, '0')}`;

    // E86 rollback payload: derived from the before-state.
    // Since the mock always simulates a clean fixture (key did
    // not exist), the intent is always `remove_metadata_key`.
    // The real bridge will switch to `restore_metadata_value`
    // when `keyExisted === true`.
    const rollbackIntent: ScratchMetadataRollbackIntent = beforeState.keyExisted
      ? 'restore_metadata_value'
      : 'remove_metadata_key';
    const rollback: ScratchMetadataRollbackPayload = {
      intent: rollbackIntent,
      targetAssetPath: request.targetAssetPath,
      operationKind: 'set_blueprint_metadata_marker',
      metadataKey: beforeState.key,
      keyExisted: beforeState.keyExisted,
      previousValue: beforeState.previousValue,
      requestedValue: beforeState.requestedValue,
      approvalId: request.approval.approvalId,
      snapshotId,
      writeTimestamp: now,
      packageDirty: true,
      packageSaved: false,
    };

    const capture: ScratchMetadataWriteCapture = {
      kind: 'scratch_metadata_marker',
      targetAssetPath: request.targetAssetPath,
      operationKind: 'set_blueprint_metadata_marker',
      metadata: beforeState,
      approvalId: request.approval.approvalId,
      snapshotId,
      timestamp: now,
      packageDirty: true,
      packageSaved: false,
      rollback,
    };

    // 13. E85 accepted response. The write is reported as accepted
    //     with `gateState === 'executed_pending_validation'`. The
    //     package is dirty but not saved. Rollback is not attempted
    //     by E85; E86 will own executable rollback closure.
    return {
      success: true,
      message: `Accepted the scratch metadata write on "${writeTargetPath}" (key="${beforeState.key}"). User-local UE validation is required; the package is dirty but not saved.`,
      gateState: 'executed_pending_validation',
      requiresUserLocalValidation: true,
      preflight: { passed: true, checks },
      snapshot: {
        created: true,
        snapshotId,
        snapshotAt: now,
        label: `Mock metadata snapshot for ${writeTargetPath}`,
        operationCount: 1,
        sizeEstimate: 'mock',
        capture,
        message: `Mock captured before-state for key "${beforeState.key}" on ${writeTargetPath}; package is dirty but not saved by automation.`,
      },
      rollback: {
        attempted: false,
        snapshotId,
        refusalReason: 'rollback_not_verified',
        message: `Rollback was not attempted automatically. A rollback payload is available: ${rollbackIntent} on key="${beforeState.key}".`,
      },
      timestamp: now,
    };
  }

  async rollbackReversible(request: RollbackRequest): Promise<RollbackResponse> {
    await delay(this.scenario === 'slow' ? 1200 : 100);

    if (this.scenario === 'disconnected') {
      throw new Error('Mock bridge is disconnected. Cannot perform rollback.');
    }

    const now = new Date().toISOString();

    if (!isScratchWriteAllowlisted(request.targetAssetPath)) {
      return {
        success: false,
        gateState: 'blocked',
        requiresUserLocalValidation: false,
        rollback: {
          attempted: false,
          refusalReason: 'target_not_allowlisted',
          message: `Rollback refused: target path "${request.targetAssetPath}" is not allowlisted. Use /Game/Scratch/ or /Game/Test/.`,
        },
        refusalReason: 'target_not_allowlisted',
        message: `Rollback refused: target path "${request.targetAssetPath}" is not allowlisted.`,
        timestamp: now,
      };
    }

    if (this.scenario === 'empty') {
      return {
        success: false,
        gateState: 'blocked',
        requiresUserLocalValidation: false,
        rollback: {
          attempted: true,
          success: false,
          rolledBackAt: now,
          snapshotId: request.snapshotId,
          refusalReason: 'rollback_not_verified',
          message: 'Rollback refused: snapshot could not be verified.',
        },
        refusalReason: 'rollback_not_verified',
        message: 'Rollback could not be completed — snapshot verification failed.',
        timestamp: now,
      };
    }

    // normal / partial scenario: accepted with pending user-local validation
    return {
      success: true,
      gateState: 'rolled_back',
      requiresUserLocalValidation: true,
      rollback: {
        attempted: true,
        success: true,
        rolledBackAt: now,
        snapshotId: request.snapshotId,
        message: `Successfully rolled back "${request.targetAssetPath}" to snapshot ${request.snapshotId}.`,
      },
      message: `Rollback completed for "${request.targetAssetPath}". User-local validation recommended to confirm asset state.`,
      timestamp: now,
    };
  }
}
