import type {
  AgentProposal,
  AgentProposalErrorCode,
  AgentProposalRequest,
  AgentProposalResult,
  AgentSessionScope,
  TypedFixPayload,
} from '@omue/shared-protocol';
import {
  AGENT_PROPOSAL_CANDIDATE_MAX,
  AGENT_PROPOSAL_DIAGNOSIS_SUMMARY_MAX,
  AGENT_PROPOSAL_EVIDENCE_SUMMARY_MAX,
  AGENT_PROPOSAL_SUMMARY_MAX,
  AGENT_USER_INTENT_MAX,
} from '@omue/shared-protocol';

type JsonObject = Record<string, unknown>;

const SAFE_SCRATCH_BLUEPRINT_MUTATION_SCHEMA_VERSION =
  'omue.safeScratchBlueprintMutation.v1';

const FIX_TOP_LEVEL_KEYS = ['kind', 'summary', 'diagnosisSummary', 'evidenceSummary', 'confidence', 'risk', 'typedPayload'] as const;
const DIAGNOSIS_TOP_LEVEL_KEYS = ['kind', 'summary', 'evidenceSummary', 'confidence', 'risk', 'candidateAssets', 'suggestedNextSteps'] as const;
const ESCALATION_TOP_LEVEL_KEYS = ['kind', 'reason', 'suggestedHumanAction'] as const;
const CANDIDATE_ASSET_KEYS = ['assetPath', 'assetName', 'assetType', 'reason', 'confidence'] as const;
const TYPED_FIX_PAYLOAD_KEYS = ['schemaVersion', 'payload'] as const;
const SAFE_MUTATION_PAYLOAD_KEYS = [
  'schemaVersion',
  'operationKind',
  'targetAssetPath',
  'targetAssetKind',
  'allowlistPrefixes',
  'beforeState',
  'afterState',
  'requireApproval',
  'requireSnapshot',
  'display',
] as const;
const BEFORE_STATE_KEYS = ['kind', 'value'] as const;
const AFTER_STATE_KEYS = ['kind', 'key', 'value'] as const;
const DISPLAY_KEYS = ['summary', 'note'] as const;

const CONFIDENCE_VALUES: ReadonlySet<string> = new Set(['low', 'medium', 'high']);
const RISK_VALUES: ReadonlySet<string> = new Set(['low', 'medium', 'high']);

function fail(errorCode: AgentProposalErrorCode, message: string): AgentProposalResult {
  return { ok: false, errorCode, message };
}

function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasOnlyKeys(
  value: JsonObject,
  allowedKeys: readonly string[],
): boolean {
  return Object.keys(value).every(key => allowedKeys.includes(key));
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function validateStringArray(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0 && value.every(item => typeof item === 'string');
}

function validateBeforeState(value: unknown): boolean {
  if (!isObject(value) || !hasOnlyKeys(value, BEFORE_STATE_KEYS)) return false;
  if (value.kind === 'missing_or_absent_allowed') {
    return Object.keys(value).length === 1;
  }
  return value.kind === 'value' && typeof value.value === 'string';
}

function validateAfterState(value: unknown): boolean {
  if (!isObject(value) || !hasOnlyKeys(value, AFTER_STATE_KEYS)) return false;
  if (
    value.kind !== undefined
    && value.kind !== 'metadata_key_value'
    && value.kind !== 'variable_default'
  ) {
    return false;
  }
  return isNonEmptyString(value.key) && isNonEmptyString(value.value);
}

function validateDisplay(value: unknown): boolean {
  return isObject(value)
    && hasOnlyKeys(value, DISPLAY_KEYS)
    && isNonEmptyString(value.summary)
    && (value.note === undefined || typeof value.note === 'string');
}

function validateTypedFixPayloadShape(
  value: unknown,
  expectedTargetAssetPath: string,
): AgentProposalResult | null {
  if (!isObject(value) || !hasOnlyKeys(value, TYPED_FIX_PAYLOAD_KEYS)) {
    return fail('llm_output_schema_invalid', 'typedPayload must contain only schemaVersion and payload.');
  }

  if (value.schemaVersion !== SAFE_SCRATCH_BLUEPRINT_MUTATION_SCHEMA_VERSION) {
    return fail('llm_output_schema_invalid', 'typedPayload.schemaVersion does not match the supported schema.');
  }

  const payload = value.payload;
  if (!isObject(payload) || !hasOnlyKeys(payload, SAFE_MUTATION_PAYLOAD_KEYS)) {
    return fail('llm_output_schema_invalid', 'typedPayload.payload has an invalid field set.');
  }

  if (payload.schemaVersion !== SAFE_SCRATCH_BLUEPRINT_MUTATION_SCHEMA_VERSION) {
    return fail('llm_output_schema_invalid', 'typedPayload.payload.schemaVersion does not match the supported schema.');
  }

  if (typeof payload.operationKind !== 'string') {
    return fail('llm_output_schema_invalid', 'typedPayload.payload.operationKind must be a string.');
  }

  if (payload.operationKind !== 'set_blueprint_metadata_marker') {
    return fail('llm_output_operation_not_supported', `Unsupported operationKind: ${payload.operationKind}.`);
  }

  if (typeof payload.targetAssetPath !== 'string') {
    return fail('llm_output_schema_invalid', 'typedPayload.payload.targetAssetPath must be a string.');
  }

  if (payload.targetAssetPath !== expectedTargetAssetPath) {
    return fail(
      'llm_output_target_mismatch',
      `typedPayload targetAssetPath "${payload.targetAssetPath}" does not match expected target "${expectedTargetAssetPath}".`,
    );
  }

  if (payload.targetAssetKind !== 'blueprint_scratch_fixture') {
    return fail('llm_output_schema_invalid', 'typedPayload.payload.targetAssetKind must be blueprint_scratch_fixture.');
  }

  if (!validateStringArray(payload.allowlistPrefixes)) {
    return fail('llm_output_schema_invalid', 'typedPayload.payload.allowlistPrefixes must be a non-empty string array.');
  }

  if (!validateBeforeState(payload.beforeState)) {
    return fail('llm_output_schema_invalid', 'typedPayload.payload.beforeState is invalid.');
  }

  if (!validateAfterState(payload.afterState)) {
    return fail('llm_output_schema_invalid', 'typedPayload.payload.afterState is invalid.');
  }

  if (payload.requireApproval !== true || payload.requireSnapshot !== true) {
    return fail('llm_output_schema_invalid', 'typedPayload payload must require approval and snapshot.');
  }

  if (!validateDisplay(payload.display)) {
    return fail('llm_output_schema_invalid', 'typedPayload.payload.display is invalid.');
  }

  return null;
}

function validateCandidateAsset(value: unknown): boolean {
  if (!isObject(value) || !hasOnlyKeys(value, CANDIDATE_ASSET_KEYS)) return false;
  if (!isNonEmptyString(value.assetPath)) return false;
  if (!isNonEmptyString(value.reason)) return false;
  if (typeof value.confidence !== 'string' || !CONFIDENCE_VALUES.has(value.confidence)) return false;
  if (value.assetName !== undefined && typeof value.assetName !== 'string') return false;
  if (value.assetType !== undefined && typeof value.assetType !== 'string') return false;
  return true;
}

function validateDiagnosisBody(value: JsonObject): AgentProposalResult | null {
  if (!isObject(value) || !hasOnlyKeys(value, DIAGNOSIS_TOP_LEVEL_KEYS)) {
    return fail('llm_output_schema_invalid', 'Diagnosis output contains unknown fields.');
  }
  if (typeof value.summary !== 'string' || value.summary.length === 0 || value.summary.length > AGENT_PROPOSAL_SUMMARY_MAX) {
    return fail('llm_output_schema_invalid', `Diagnosis summary must be a non-empty string up to ${AGENT_PROPOSAL_SUMMARY_MAX} characters.`);
  }
  if (typeof value.evidenceSummary !== 'string' || value.evidenceSummary.length > AGENT_PROPOSAL_EVIDENCE_SUMMARY_MAX) {
    return fail('llm_output_schema_invalid', `Diagnosis evidenceSummary must be a string up to ${AGENT_PROPOSAL_EVIDENCE_SUMMARY_MAX} characters.`);
  }
  if (typeof value.confidence !== 'string' || !CONFIDENCE_VALUES.has(value.confidence)) {
    return fail('llm_output_schema_invalid', 'Diagnosis confidence must be low, medium, or high.');
  }
  if (typeof value.risk !== 'string' || !RISK_VALUES.has(value.risk)) {
    return fail('llm_output_schema_invalid', 'Diagnosis risk must be low, medium, or high.');
  }
  if (!Array.isArray(value.candidateAssets) || value.candidateAssets.length > AGENT_PROPOSAL_CANDIDATE_MAX) {
    return fail('llm_output_schema_invalid', `Diagnosis candidateAssets must be an array of at most ${AGENT_PROPOSAL_CANDIDATE_MAX} entries.`);
  }
  if (!value.candidateAssets.every(validateCandidateAsset)) {
    return fail('llm_output_schema_invalid', 'Diagnosis candidateAssets contain invalid entries.');
  }
  if (!Array.isArray(value.suggestedNextSteps) || value.suggestedNextSteps.length === 0
    || !value.suggestedNextSteps.every(step => typeof step === 'string' && step.length > 0)) {
    return fail('llm_output_schema_invalid', 'Diagnosis suggestedNextSteps must be a non-empty array of non-empty strings.');
  }
  return null;
}

function validateEscalationBody(value: JsonObject): AgentProposalResult | null {
  if (!isObject(value) || !hasOnlyKeys(value, ESCALATION_TOP_LEVEL_KEYS)) {
    return fail('llm_output_schema_invalid', 'Escalation output contains unknown fields.');
  }
  if (!isNonEmptyString(value.reason)) {
    return fail('llm_output_schema_invalid', 'Escalation reason must be a non-empty string.');
  }
  if (value.suggestedHumanAction !== undefined && typeof value.suggestedHumanAction !== 'string') {
    return fail('llm_output_schema_invalid', 'Escalation suggestedHumanAction must be a string when present.');
  }
  return null;
}

function validateFixBody(
  value: JsonObject,
  expectedTargetAssetPath: string,
): AgentProposalResult | null {
  if (!isObject(value) || !hasOnlyKeys(value, FIX_TOP_LEVEL_KEYS)) {
    return fail('llm_output_schema_invalid', 'Fix output contains unknown fields.');
  }
  if (typeof value.summary !== 'string' || value.summary.length === 0 || value.summary.length > AGENT_PROPOSAL_SUMMARY_MAX) {
    return fail('llm_output_schema_invalid', `Fix summary must be a non-empty string up to ${AGENT_PROPOSAL_SUMMARY_MAX} characters.`);
  }
  if (typeof value.diagnosisSummary !== 'string' || value.diagnosisSummary.length > AGENT_PROPOSAL_DIAGNOSIS_SUMMARY_MAX) {
    return fail('llm_output_schema_invalid', `Fix diagnosisSummary must be a string up to ${AGENT_PROPOSAL_DIAGNOSIS_SUMMARY_MAX} characters.`);
  }
  if (typeof value.evidenceSummary !== 'string' || value.evidenceSummary.length > AGENT_PROPOSAL_EVIDENCE_SUMMARY_MAX) {
    return fail('llm_output_schema_invalid', `Fix evidenceSummary must be a string up to ${AGENT_PROPOSAL_EVIDENCE_SUMMARY_MAX} characters.`);
  }
  if (typeof value.confidence !== 'string' || !CONFIDENCE_VALUES.has(value.confidence)) {
    return fail('llm_output_schema_invalid', 'Fix confidence must be low, medium, or high.');
  }
  if (typeof value.risk !== 'string' || !RISK_VALUES.has(value.risk)) {
    return fail('llm_output_schema_invalid', 'Fix risk must be low, medium, or high.');
  }
  return validateTypedFixPayloadShape(value.typedPayload, expectedTargetAssetPath);
}

export function validateAgentProposal(
  rawText: string,
  request: Pick<AgentProposalRequest, 'scope' | 'targetAssetPath'>,
): AgentProposalResult {
  const expectedTargetAssetPath = request.targetAssetPath ?? '';

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return fail('llm_output_not_json', 'LLM output was not valid JSON.');
  }

  if (!isObject(parsed)) {
    return fail('llm_output_schema_invalid', 'LLM output must be a JSON object.');
  }

  if (parsed.kind !== 'diagnosis' && parsed.kind !== 'fix' && parsed.kind !== 'escalation') {
    return fail('llm_output_schema_invalid', 'LLM output kind must be diagnosis, fix, or escalation.');
  }

  if (request.scope === 'project') {
    if (parsed.kind === 'fix') {
      return fail(
        'scope_execution_forbidden',
        'Project scope proposals must be kind="diagnosis" or kind="escalation", not kind="fix".',
      );
    }
  }

  if (request.scope === 'asset' && parsed.kind === 'diagnosis') {
    return fail(
      'llm_output_schema_invalid',
      'Asset scope proposals must be kind="fix" or kind="escalation", not kind="diagnosis".',
    );
  }

  if (parsed.kind === 'diagnosis') {
    const err = validateDiagnosisBody(parsed);
    if (err) return err;
    return {
      ok: true,
      proposal: {
        kind: 'diagnosis',
        summary: parsed.summary as string,
        evidenceSummary: parsed.evidenceSummary as string,
        confidence: parsed.confidence as 'low' | 'medium' | 'high',
        risk: parsed.risk as 'low' | 'medium' | 'high',
        candidateAssets: parsed.candidateAssets as AgentProposal extends { kind: 'diagnosis'; candidateAssets: infer C } ? C : never,
        suggestedNextSteps: parsed.suggestedNextSteps as string[],
      } as AgentProposal,
    };
  }

  if (parsed.kind === 'escalation') {
    const err = validateEscalationBody(parsed);
    if (err) return err;
    return {
      ok: true,
      proposal: parsed.suggestedHumanAction === undefined
        ? { kind: 'escalation', reason: parsed.reason as string }
        : {
            kind: 'escalation',
            reason: parsed.reason as string,
            suggestedHumanAction: parsed.suggestedHumanAction as string,
          },
    };
  }

  const err = validateFixBody(parsed, expectedTargetAssetPath);
  if (err) return err;
  return {
    ok: true,
    proposal: {
      kind: 'fix',
      summary: parsed.summary as string,
      diagnosisSummary: parsed.diagnosisSummary as string,
      evidenceSummary: parsed.evidenceSummary as string,
      confidence: parsed.confidence as 'low' | 'medium' | 'high',
      risk: parsed.risk as 'low' | 'medium' | 'high',
      typedPayload: parsed.typedPayload as TypedFixPayload,
    } as AgentProposal,
  };
}

export function parseLegacyTypedPayloadProposal(
  rawText: string,
  expectedTargetAssetPath: string,
): AgentProposalResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return fail('legacy_proposal_parse_failed', 'Legacy proposal JSON parse failed.');
  }
  if (!isObject(parsed)) {
    return fail('legacy_proposal_parse_failed', 'Legacy proposal must be a JSON object.');
  }
  if (parsed.kind !== 'fix') {
    return fail('legacy_proposal_parse_failed', 'Legacy proposal must be kind="fix".');
  }
  if (!hasOnlyKeys(parsed, ['kind', 'typedPayload'])) {
    return fail('legacy_proposal_parse_failed', 'Legacy proposal contains unknown fields.');
  }
  const typedPayloadError = validateTypedFixPayloadShape(parsed.typedPayload, expectedTargetAssetPath);
  if (typedPayloadError) {
    const errorMessage = typedPayloadError.ok
      ? 'typed payload validation failed'
      : typedPayloadError.message;
    return {
      ok: false,
      errorCode: 'legacy_proposal_parse_failed',
      message: errorMessage,
    };
  }
  return {
    ok: true,
    proposal: {
      kind: 'fix',
      summary: '',
      diagnosisSummary: '',
      evidenceSummary: '',
      confidence: 'medium',
      risk: 'low',
      typedPayload: parsed.typedPayload as TypedFixPayload,
    },
  };
}

export type AgentProposalRequestValidationResult =
  | { ok: true; request: AgentProposalRequest }
  | { ok: false; message: string };

const REQUEST_KEYS = [
  'scope',
  'userIntent',
  'parentSessionId',
  'inheritedEvidenceSummary',
  'compileIssueIds',
  'targetAssetPath',
  'compileIssues',
  'blueprintSummary',
  'graphDetailJson',
  'messageLogJson',
  'previousAttempts',
  'feedback',
] as const;

const COMPILE_ISSUE_KEYS = ['code', 'message', 'file', 'line', 'column', 'severity'] as const;
const BLUEPRINT_SUMMARY_KEYS = [
  'assetPath',
  'displayName',
  'assetClass',
  'eligibility',
  'dirtyState',
  'source',
] as const;
const PREVIOUS_ATTEMPT_KEYS = ['proposalId', 'feedback'] as const;

function validateScope(value: unknown): value is AgentSessionScope {
  return value === 'asset' || value === 'project';
}

function validateCompileIssue(value: unknown): boolean {
  return isObject(value)
    && hasOnlyKeys(value, COMPILE_ISSUE_KEYS)
    && isNonEmptyString(value.code)
    && isNonEmptyString(value.message)
    && (value.file === undefined || typeof value.file === 'string')
    && (value.line === undefined || typeof value.line === 'number')
    && (value.column === undefined || typeof value.column === 'number')
    && (value.severity === 'error' || value.severity === 'warning');
}

function validateBlueprintSummary(value: unknown): boolean {
  return isObject(value)
    && hasOnlyKeys(value, BLUEPRINT_SUMMARY_KEYS)
    && isNonEmptyString(value.assetPath)
    && isNonEmptyString(value.displayName)
    && isNonEmptyString(value.assetClass)
    && (value.eligibility === 'eligible_scratch_or_test'
      || value.eligibility === 'production_write_blocked'
      || value.eligibility === 'unknown')
    && typeof value.dirtyState === 'string'
    && (value.source === 'mock_local_fixture'
      || value.source === 'manual_entry'
      || value.source === 'imported_list'
      || value.source === 'real_readonly_bridge'
      || value.source === 'real_bridge_future');
}

function validatePreviousAttempts(value: unknown): boolean {
  return Array.isArray(value) && value.every(item =>
    isObject(item)
    && hasOnlyKeys(item, PREVIOUS_ATTEMPT_KEYS)
    && isNonEmptyString(item.proposalId)
    && typeof item.feedback === 'string',
  );
}

export function validateAgentProposalRequest(
  request: unknown,
): AgentProposalRequestValidationResult {
  if (!isObject(request) || !hasOnlyKeys(request, REQUEST_KEYS)) {
    return { ok: false, message: 'Request must be an object with only AgentProposalRequest fields.' };
  }

  if (!validateScope(request.scope)) {
    return { ok: false, message: 'scope must be "asset" or "project".' };
  }

  if (typeof request.userIntent !== 'string' || request.userIntent.trim().length === 0
    || request.userIntent.length > AGENT_USER_INTENT_MAX) {
    return { ok: false, message: `userIntent must be a non-empty string up to ${AGENT_USER_INTENT_MAX} characters.` };
  }

  if (request.parentSessionId !== undefined && typeof request.parentSessionId !== 'string') {
    return { ok: false, message: 'parentSessionId must be a string when present.' };
  }

  if (request.inheritedEvidenceSummary !== undefined && typeof request.inheritedEvidenceSummary !== 'string') {
    return { ok: false, message: 'inheritedEvidenceSummary must be a string when present.' };
  }

  if (request.compileIssueIds !== undefined
    && !(Array.isArray(request.compileIssueIds) && request.compileIssueIds.every(id => typeof id === 'string'))) {
    return { ok: false, message: 'compileIssueIds must be an array of strings when present.' };
  }

  if (request.scope === 'project' && request.targetAssetPath !== undefined) {
    return { ok: false, message: 'targetAssetPath is forbidden for project scope.' };
  }

  if (request.scope === 'asset') {
    if (typeof request.targetAssetPath !== 'string' || request.targetAssetPath.trim().length === 0) {
      return { ok: false, message: 'targetAssetPath is required for asset scope.' };
    }
    if (!Array.isArray(request.compileIssues) || !request.compileIssues.every(validateCompileIssue)) {
      return { ok: false, message: 'compileIssues must be an array of valid CompileIssue objects.' };
    }
    if (!validateBlueprintSummary(request.blueprintSummary)) {
      return { ok: false, message: 'blueprintSummary must be a valid BlueprintAssetSummary.' };
    }
  }

  if (request.graphDetailJson !== undefined && typeof request.graphDetailJson !== 'string') {
    return { ok: false, message: 'graphDetailJson must be a string when present.' };
  }

  if (request.messageLogJson !== undefined && typeof request.messageLogJson !== 'string') {
    return { ok: false, message: 'messageLogJson must be a string when present.' };
  }

  if (request.previousAttempts !== undefined && !validatePreviousAttempts(request.previousAttempts)) {
    return { ok: false, message: 'previousAttempts must contain proposalId and feedback strings.' };
  }

  if (request.feedback !== undefined && typeof request.feedback !== 'string') {
    return { ok: false, message: 'feedback must be a string when present.' };
  }

  return { ok: true, request: request as unknown as AgentProposalRequest };
}
