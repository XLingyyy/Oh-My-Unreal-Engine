import type { BlueprintChangePlan } from '@omue/shared-protocol';

export type AiPlanAdapterMode = 'mock_local_adapter';

export type AiAdapterStatus = 'ok' | 'needs_clarification' | 'blocked' | 'error';

export type AiAdapterSource = 'mock_local_adapter' | 'real_provider_disabled_future';

export interface AiPlanAdapterRequest {
  selectedTargetPath: string;
  selectedTargetDisplayName: string;
  userIntent: string;
  mode: AiPlanAdapterMode;
  contextSummary?: string;
}

export type AdapterSafetyMsgCode =
  | 'safety_no_real_ai'
  | 'safety_no_network'
  | 'safety_no_ue_write_save'
  | 'safety_plan_untrusted'
  | 'safety_production_blocked';

export type AdapterValidationMsgCode =
  | 'validation_no_intent'
  | 'validation_production_no_write';

export type AdapterProviderDisabledReasonCode =
  | 'provider_disabled_mock_preview';

export interface AiPlanAdapterResponse {
  status: AiAdapterStatus;
  source: AiAdapterSource;
  plan: BlueprintChangePlan | null;
  safetyMessages: string[];
  validationMessages: string[];
  safetyMessageCodes: AdapterSafetyMsgCode[];
  validationMessageCodes: AdapterValidationMsgCode[];
  providerDisabled: boolean;
  providerDisabledReason: string;
  providerDisabledReasonCode: AdapterProviderDisabledReasonCode;
}
