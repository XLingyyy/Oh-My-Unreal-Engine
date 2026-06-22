import type { BlueprintChangePlan } from '@omue/shared-protocol';
import type { AiPlanAdapterRequest, AiPlanAdapterResponse } from './ai-plan-adapter-types';
import { buildMockPlan } from './blueprint-change-plan-service';

const DEFAULT_SAFETY_MESSAGE_CODES: import('./ai-plan-adapter-types').AdapterSafetyMsgCode[] = [
  'safety_no_real_ai',
  'safety_no_network',
  'safety_no_ue_write_save',
  'safety_plan_untrusted',
];

const DEFAULT_SAFETY_FALLBACKS: string[] = [
  'No real AI was called.',
  'No network request was made.',
  'No UE write/compile/PIE/Automation/rollback/save was triggered.',
  'Plan output is untrusted until reviewed.',
];

const PRODUCTION_BLOCKED_CODE: import('./ai-plan-adapter-types').AdapterSafetyMsgCode = 'safety_production_blocked';
const PRODUCTION_BLOCKED_FALLBACK = 'Production target is write-blocked. Plan is for review only.';

const PROVIDER_DISABLED_CODE: import('./ai-plan-adapter-types').AdapterProviderDisabledReasonCode = 'provider_disabled_mock_preview';
const PROVIDER_DISABLED_FALLBACK = 'Real AI provider is not configured. This is a mock preview only.';

export function generateMockAiPlan(request: AiPlanAdapterRequest): AiPlanAdapterResponse {
  const emptyIntent = !request.userIntent || request.userIntent.trim().length === 0;

  if (emptyIntent) {
    return {
      status: 'needs_clarification',
      source: 'mock_local_adapter',
      plan: null,
      safetyMessages: DEFAULT_SAFETY_FALLBACKS,
      validationMessages: ['No user intent provided. Enter a change intent and try again.'],
      safetyMessageCodes: DEFAULT_SAFETY_MESSAGE_CODES,
      validationMessageCodes: ['validation_no_intent'],
      providerDisabled: true,
      providerDisabledReason: PROVIDER_DISABLED_FALLBACK,
      providerDisabledReasonCode: PROVIDER_DISABLED_CODE,
    };
  }

  const plan: BlueprintChangePlan = buildMockPlan(
    request.selectedTargetPath,
    request.selectedTargetDisplayName,
    request.userIntent,
  );

  if (plan.safetyClassification === 'write_blocked_production') {
    return {
      status: 'blocked',
      source: 'mock_local_adapter',
      plan,
      safetyMessages: [
        ...DEFAULT_SAFETY_FALLBACKS,
        PRODUCTION_BLOCKED_FALLBACK,
      ],
      validationMessages: ['Target is a production asset — no write path is available.'],
      safetyMessageCodes: [
        ...DEFAULT_SAFETY_MESSAGE_CODES,
        PRODUCTION_BLOCKED_CODE,
      ],
      validationMessageCodes: ['validation_production_no_write'],
      providerDisabled: true,
      providerDisabledReason: PROVIDER_DISABLED_FALLBACK,
      providerDisabledReasonCode: PROVIDER_DISABLED_CODE,
    };
  }

  return {
    status: 'ok',
    source: 'mock_local_adapter',
    plan,
    safetyMessages: DEFAULT_SAFETY_FALLBACKS,
    validationMessages: [],
    safetyMessageCodes: DEFAULT_SAFETY_MESSAGE_CODES,
    validationMessageCodes: [],
    providerDisabled: true,
    providerDisabledReason: PROVIDER_DISABLED_FALLBACK,
    providerDisabledReasonCode: PROVIDER_DISABLED_CODE,
  };
}

export interface AdapterValidationResult {
  valid: boolean;
  messages: string[];
}

export function validateAdapterOutput(
  response: AiPlanAdapterResponse,
  request: AiPlanAdapterRequest,
): AdapterValidationResult {
  const messages: string[] = [];
  let valid = true;

  if (response.plan && response.plan.targetAssetPath !== request.selectedTargetPath) {
    messages.push(
      `Target path mismatch: plan targets "${response.plan.targetAssetPath}" but selected target is "${request.selectedTargetPath}".`,
    );
    valid = false;
  }

  if (response.source !== 'mock_local_adapter') {
    messages.push(`Unexpected adapter source: "${response.source}". Expected "mock_local_adapter".`);
    valid = false;
  }

  if (response.plan && response.plan.source !== 'mock_local_plan') {
    messages.push(`Unexpected plan source: "${response.plan.source}". Expected "mock_local_plan".`);
    valid = false;
  }

  if (
    response.plan &&
    response.plan.safetyClassification !== 'write_blocked_production' &&
    request.selectedTargetPath.startsWith('/Game/Blueprints/')
  ) {
    messages.push('Production target should have write_blocked_production classification.');
    valid = false;
  }

  return { valid, messages };
}
