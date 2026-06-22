import type {
  AgentProposalRequest,
  AgentProposalResult,
} from '@omue/shared-protocol';
import type { AiProviderConfig } from './ai-blueprint-explanation-provider-types';
import { validateAgentProposal } from './ai-blueprint-propose-fix-provider-types';

const COMMON_INSTRUCTION_LINES = [
  'You are a UE Agent that produces strict JSON proposals for the OMUE Desktop Agent Loop.',
  'The user\'s natural-language userIntent is the diagnosis objective for this session.',
  'You must output exactly one JSON object with kind="diagnosis" or "escalation".',
  'Do not output free-text commands. Do not output Apply, Compile, PIE, write, rollback, or patch instructions.',
  'Unknown JSON fields are rejected by Main validation.',
  'Return JSON only, with no Markdown fences or explanatory text.',
];

const PROJECT_INSTRUCTION_LINES = [
  ...COMMON_INSTRUCTION_LINES,
  'This is a project-scope session: you may only output kind="diagnosis" or kind="escalation".',
  'NEVER output kind="fix", a typedPayload, or any executable action for project scope; such output is rejected with scope_execution_forbidden.',
  'Project diagnoses are read-only and must include: summary, evidenceSummary, confidence, risk, candidateAssets, suggestedNextSteps.',
  'candidateAssets must be a JSON array (max 10 entries) of objects with assetPath, reason, confidence. assetName and assetType are optional. candidateAssets may be empty only when suggestedNextSteps explains the gap.',
  'suggestedNextSteps must be a non-empty JSON array of non-empty strings describing what a human should investigate next.',
  'Escalation is allowed when the diagnosis cannot be safely produced; include reason (non-empty string) and optionally suggestedHumanAction.',
];

const ASSET_INSTRUCTION_LINES = [
  ...COMMON_INSTRUCTION_LINES,
  'This is an asset-scope session: you may only output kind="fix" or kind="escalation".',
  'The only supported write operation is set_blueprint_metadata_marker for Blueprint metadata markers.',
  'You must escalate for graph structure edits, relinking pins, adding or deleting nodes, modifying pin connections, modifying variable definitions, modifying functions or events, setting variable defaults, setting property values, or any operation outside set_blueprint_metadata_marker.',
  'Fix output must include: summary, diagnosisSummary, evidenceSummary, confidence, risk, typedPayload.',
  'typedPayload.schemaVersion and typedPayload.payload.schemaVersion must both equal omue.safeScratchBlueprintMutation.v1.',
  'typedPayload.payload.operationKind must equal set_blueprint_metadata_marker.',
  'typedPayload.payload.targetAssetPath must exactly equal the request targetAssetPath.',
  'typedPayload.payload.targetAssetKind must equal blueprint_scratch_fixture.',
  'typedPayload.payload.requireApproval and typedPayload.payload.requireSnapshot must both be literal true.',
  'typedPayload.payload must include allowlistPrefixes, beforeState, afterState, and display.',
  'typedPayload.payload.allowlistPrefixes must be a non-empty JSON array of strings, each string being a UE asset path prefix the mutation is allowed to target (for example ["/Game/Scratch/"]). Empty arrays, non-array values, or arrays containing non-string elements are rejected.',
  'typedPayload.payload.display must be exactly {"summary":"<non-empty human-readable string describing the proposed change>","note":"<optional string with extra context>"} — the "summary" field is required and must be a non-empty string; the "note" field is optional and may be omitted, but if present must be a string. Do not add any other fields. An empty object {} is rejected.',
  'typedPayload.payload.beforeState must be exactly one of: {"kind":"missing_or_absent_allowed"} (if you do not know the current metadata value) OR {"kind":"value","value":"<exact previous string value>"} (if you know the current value). Do not add extra fields. Do not omit the "kind" field.',
  'typedPayload.payload.afterState for set_blueprint_metadata_marker must be exactly {"kind":"metadata_key_value","key":"<metadata key string>","value":"<value to set>"} - the "kind":"metadata_key_value" tag is required. Do not add or omit fields.',
  'typedPayload.payload.afterState for set_blueprint_variable_default must be exactly {"kind":"variable_default","variableName":"<exact variable name>","defaultValue":"<value to set>"} - the "kind":"variable_default" tag is required. Do not add or omit fields.',
  'typedPayload.payload.targetAssetPath must EXACTLY match the request targetAssetPath string (including leading slash, casing, and path). Mismatches are rejected.',
  'When retrying after a previous proposal was rejected, you MUST include ALL required fields again, including both typedPayload.schemaVersion AND typedPayload.payload.schemaVersion (both must equal omue.safeScratchBlueprintMutation.v1). Do not drop any field from your previous response — fix only the specific issue that caused the rejection and keep everything else identical.',
];

export function buildSystemInstruction(
  request: Pick<AgentProposalRequest, 'scope'>,
): string {
  return (request.scope === 'project' ? PROJECT_INSTRUCTION_LINES : ASSET_INSTRUCTION_LINES).join(' ');
}

export const PROPOSE_FIX_SYSTEM_INSTRUCTION = ASSET_INSTRUCTION_LINES.join(' ');

export interface RequestAgentProposalCapture {
  rawText?: string;
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

function llmFailure(message: string): AgentProposalResult {
  return { ok: false, errorCode: 'llm_call_failed', message };
}

function timeoutFailure(): AgentProposalResult {
  return { ok: false, errorCode: 'timeout', message: 'LLM request timed out.' };
}

function providerError(status: number): AgentProposalResult {
  return llmFailure(`Provider returned HTTP ${status}.`);
}

function buildUserMessage(request: AgentProposalRequest): string {
  const payload: Record<string, unknown> = {
    scope: request.scope,
    userIntent: request.userIntent,
    parentSessionId: request.parentSessionId,
    inheritedEvidenceSummary: request.inheritedEvidenceSummary,
    compileIssueIds: request.compileIssueIds ?? [],
  };
  if (request.scope === 'asset') {
    payload.targetAssetPath = request.targetAssetPath;
    payload.compileIssues = request.compileIssues ?? [];
    payload.blueprintSummary = request.blueprintSummary;
    payload.graphDetailJson = request.graphDetailJson;
    payload.messageLogJson = request.messageLogJson;
    payload.previousAttempts = request.previousAttempts ?? [];
    payload.feedback = request.feedback ?? '';
  }
  return JSON.stringify(payload, null, 2);
}

async function parseOpenAIText(resp: Response): Promise<string | null> {
  const data = await resp.json() as Record<string, unknown>;

  if (typeof data.output_text === 'string' && data.output_text.length > 0) {
    return data.output_text;
  }

  const output = data.output;
  if (!Array.isArray(output)) return null;

  const parts: string[] = [];
  for (const item of output) {
    if (!item || typeof item !== 'object') continue;
    const content = (item as Record<string, unknown>).content;
    if (!Array.isArray(content)) continue;
    for (const c of content) {
      if (!c || typeof c !== 'object') continue;
      const record = c as Record<string, unknown>;
      if (typeof record.text === 'string' && record.text.length > 0) {
        parts.push(record.text);
      } else if (record.type === 'text' && typeof record.value === 'string') {
        parts.push(record.value);
      }
    }
  }

  return parts.length > 0 ? parts.join('\n\n') : null;
}

async function parseAnthropicText(resp: Response): Promise<string | null> {
  const data = await resp.json() as Record<string, unknown>;
  const content = data.content;
  if (!Array.isArray(content)) return null;

  const parts: string[] = [];
  for (const c of content) {
    if (!c || typeof c !== 'object') continue;
    const record = c as Record<string, unknown>;
    if (record.type === 'text' && typeof record.text === 'string' && record.text.length > 0) {
      parts.push(record.text);
    }
  }

  return parts.length > 0 ? parts.join('\n\n') : null;
}

async function parseDeepSeekText(resp: Response): Promise<string | null> {
  const data = await resp.json() as Record<string, unknown>;
  const choices = data.choices as Array<Record<string, unknown>> | undefined;
  const message = choices?.[0]?.message as Record<string, unknown> | undefined;
  return typeof message?.content === 'string' && message.content.length > 0
    ? message.content
    : null;
}

async function callOpenAI(
  request: AgentProposalRequest,
  config: AiProviderConfig,
  signal: AbortSignal,
  capture?: RequestAgentProposalCapture,
): Promise<AgentProposalResult> {
  const resp = await fetch(`${normalizeBaseUrl(config.baseUrl)}/responses`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      input: `${buildSystemInstruction(request)}\n\nUser request JSON:\n${buildUserMessage(request)}`,
    }),
    signal,
  });

  if (!resp.ok) return providerError(resp.status);

  const text = await parseOpenAIText(resp);
  if (!text) return llmFailure('Provider response did not contain text output.');
  if (capture) capture.rawText = text;
  return validateAgentProposal(text, request);
}

async function callAnthropic(
  request: AgentProposalRequest,
  config: AiProviderConfig,
  signal: AbortSignal,
  capture?: RequestAgentProposalCapture,
): Promise<AgentProposalResult> {
  const resp = await fetch(`${normalizeBaseUrl(config.baseUrl)}/v1/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: 2048,
      system: buildSystemInstruction(request),
      messages: [
        { role: 'user', content: buildUserMessage(request) },
      ],
    }),
    signal,
  });

  if (!resp.ok) return providerError(resp.status);

  const text = await parseAnthropicText(resp);
  if (!text) return llmFailure('Provider response did not contain text output.');
  if (capture) capture.rawText = text;
  return validateAgentProposal(text, request);
}

async function callDeepSeek(
  request: AgentProposalRequest,
  config: AiProviderConfig,
  signal: AbortSignal,
  capture?: RequestAgentProposalCapture,
): Promise<AgentProposalResult> {
  const resp = await fetch(`${normalizeBaseUrl(config.baseUrl)}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: 'system', content: buildSystemInstruction(request) },
        { role: 'user', content: buildUserMessage(request) },
      ],
      stream: false,
    }),
    signal,
  });

  if (!resp.ok) return providerError(resp.status);

  const text = await parseDeepSeekText(resp);
  if (!text) return llmFailure('Provider response did not contain text output.');
  if (capture) capture.rawText = text;
  return validateAgentProposal(text, request);
}

export async function requestAgentProposal(
  request: AgentProposalRequest,
  config: AiProviderConfig,
  capture?: RequestAgentProposalCapture,
): Promise<AgentProposalResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, config.timeoutMs);

  try {
    switch (config.provider) {
      case 'openai':
        return await callOpenAI(request, config, controller.signal, capture);
      case 'anthropic':
        return await callAnthropic(request, config, controller.signal, capture);
      case 'deepseek':
        return await callDeepSeek(request, config, controller.signal, capture);
      default:
        return llmFailure(`Unsupported provider: ${config.provider}.`);
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return timeoutFailure();
    }
    if (controller.signal.aborted) {
      return timeoutFailure();
    }
    return llmFailure(err instanceof Error ? err.message : 'Unknown provider error.');
  } finally {
    clearTimeout(timeoutId);
  }
}
