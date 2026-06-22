import type { BlueprintAssetSummary, BlueprintChangePlan, PlanSafetyClassification } from '@omue/shared-protocol';
import type { BlueprintChangeWorkspaceCopy } from '../i18n/types';

export interface ReadinessChecklist {
  targetSelected: boolean;
  intentProvided: boolean;
  planGenerated: boolean;
  eligibilityClear: boolean;
  rollbackDescribed: boolean;
  validationListed: boolean;
  executionDeferred: boolean;
}

export function computeReadinessChecklist(
  selectedTarget: BlueprintAssetSummary | null,
  userIntent: string,
  selectedPlan: BlueprintChangePlan | null,
): ReadinessChecklist {
  return {
    targetSelected: selectedTarget !== null,
    intentProvided: userIntent.trim().length > 0,
    planGenerated: selectedPlan !== null,
    eligibilityClear: selectedTarget !== null && (
      selectedTarget.eligibility === 'eligible_scratch_or_test' ||
      selectedTarget.eligibility === 'production_write_blocked'
    ),
    rollbackDescribed: selectedPlan !== null && selectedPlan.rollbackReadiness.status.length > 0,
    validationListed: selectedPlan !== null && (
      selectedPlan.validationRequirements.requiredChecks.length > 0 ||
      selectedPlan.validationRequirements.userLocalChecks.length > 0
    ),
    executionDeferred: true,
  };
}

export function buildReviewPacket(
  selectedAssetPath: string | null,
  selectedTarget: BlueprintAssetSummary | null,
  userIntent: string,
  planSourceMode: 'local' | 'mock_adapter',
  selectedPlan: BlueprintChangePlan | null,
  safetyClassification: PlanSafetyClassification | null,
  sourceLabel: string,
  eligibilityLabel: string,
  classificationLabel: string,
  nextDecisionLabel: string,
  writeLabel: string,
  execDeferredLabel: string,
  cc: BlueprintChangeWorkspaceCopy,
): string {
  const lines: string[] = [
    cc.reviewPacketTitle,
    '',
    `${cc.reviewPacketTargetLabel}: ${selectedAssetPath ?? cc.reviewPacketNotSelected}`,
    `${cc.reviewPacketDisplayNameLabel}: ${selectedTarget?.displayName ?? '—'}`,
    `${cc.reviewPacketSourceLabel}: ${sourceLabel}`,
    `${cc.reviewPacketEligibilityLabel}: ${eligibilityLabel}`,
    `${cc.reviewPacketIntentLabel}: ${userIntent || cc.reviewPacketEmptyIntent}`,
    `${cc.reviewPacketPlanSourceLabel}: ${planSourceMode === 'mock_adapter' ? cc.reviewPacketPlanSourceMock : cc.reviewPacketPlanSourceLocal}`,
    `${cc.reviewPacketSafetyClassificationLabel}: ${classificationLabel}`,
    `${cc.reviewPacketNextDecisionLabel}: ${nextDecisionLabel}`,
    `${cc.reviewPacketWriteStatusLabel}: ${writeLabel}`,
    '',
    cc.reviewPacketOpsSection,
  ];

  if (selectedPlan && selectedPlan.operations.length > 0) {
    for (const op of selectedPlan.operations) {
      lines.push(`  [${op.kind}] ${op.description} (${op.safetyStatus})`);
    }
  } else {
    lines.push(`  ${cc.reviewPacketNoneProposed}`);
  }

  lines.push('');
  lines.push(cc.reviewPacketRollbackSection);
  lines.push(`  ${cc.rollbackStatus}: ${selectedPlan?.rollbackReadiness.status ?? cc.reviewPacketNotDescribed}`);
  if (selectedPlan?.rollbackReadiness.notes) {
    lines.push(`  ${cc.rollbackNotes}: ${selectedPlan.rollbackReadiness.notes}`);
  }

  lines.push('');
  lines.push(cc.reviewPacketValidationSection);
  if (selectedPlan) {
    if (selectedPlan.validationRequirements.requiredChecks.length > 0) {
      lines.push(`  ${cc.reviewPacketRequiredChecks}:`);
      for (const c of selectedPlan.validationRequirements.requiredChecks) {
        lines.push(`    - ${c}`);
      }
    }
    if (selectedPlan.validationRequirements.userLocalChecks.length > 0) {
      lines.push(`  ${cc.reviewPacketUserLocalChecks}:`);
      for (const c of selectedPlan.validationRequirements.userLocalChecks) {
        lines.push(`    - ${c}`);
      }
    }
  }
  if (selectedPlan && selectedPlan.validationRequirements.requiredChecks.length === 0 && selectedPlan.validationRequirements.userLocalChecks.length === 0) {
    lines.push(`  ${cc.reviewPacketNoneListed}`);
  }

  lines.push('');
  lines.push(cc.reviewPacketExecSection);
  lines.push(`  ${execDeferredLabel}`);

  lines.push('');
  lines.push('---');
  lines.push(cc.reviewPacketSafetyPrefix);
  lines.push(cc.reviewPacketSafetyMid);
  lines.push(cc.reviewPacketSafetyDeferred);

  return lines.join('\n');
}
