import type { RepairSession } from '@omue/shared-protocol';
import {
  getExecutionResult,
  getApproval,
  getPreview,
  getRollbackResult,
  getRollbackHistory,
  getRollbackPayload,
  getWriteResponse,
  getWriteResponseSummary,
  getValidationRuns,
  getValidationRunDecisions,
  deriveValidationClosure,
  getValidationClosure,
  getRefusalAudit,
} from './repair-session-store';

interface PostFixReportInput {
  session: RepairSession;
}

export interface PostFixReport {
  markdown: string;
  generatedAt: string;
}

export function generatePostFixReport(input: PostFixReportInput): PostFixReport | null {
  const { session } = input;
  const line = (text: string = '') => text;

  const approval = getApproval(session.sessionId);
  const candidate = session.selectedCandidateId
    ? session.fixCandidates.find(c => c.candidateId === session.selectedCandidateId)
    : null;
  const execResult = getExecutionResult(session.sessionId);
  const writeSummary = getWriteResponseSummary(session.sessionId);
  const rollbackResult = getRollbackResult(session.sessionId);
  const rollbackHistory = getRollbackHistory(session.sessionId);
  const validationRuns = getValidationRuns().filter(r =>
    r.description.includes(session.sessionId),
  );

  const now = new Date().toISOString();
  const lines: string[] = [];

  // Title
  lines.push(line('# Post-Fix Report'));
  lines.push(line(''));
  lines.push(line(`**Generated:** ${now}`));
  lines.push(line(`**Session:** ${session.sessionId}`));
  lines.push(line(`**Target Asset:** ${session.targetAssetPath}`));
  lines.push(line(`**Session Status:** ${session.status}`));
  lines.push(line(''));

  // Fix candidate
  lines.push(line('## Fix Candidate'));
  lines.push(line(''));
  if (candidate) {
    lines.push(line(`- **Candidate ID:** ${candidate.candidateId}`));
    lines.push(line(`- **Title:** ${candidate.title}`));
    lines.push(line(`- **Source:** ${candidate.source}`));
    lines.push(line(`- **Ranking:** ${candidate.ranking}`));
    lines.push(line(`- **Confidence:** ${candidate.confidence}`));
    lines.push(line(`- **Proposed Change:** ${candidate.proposedChange}`));
    lines.push(line(''));
  } else {
    lines.push(line('- No candidate selected.'));
    lines.push(line(''));
  }

  // Approval / preview
  lines.push(line('## Approval & Preview'));
  lines.push(line(''));
  if (approval) {
    lines.push(line(`- **Approval ID:** ${approval.approvalId}`));
    lines.push(line(`- **Approved By:** ${approval.approvedBy}`));
    lines.push(line(`- **Approved At:** ${approval.approvedAt}`));
    if (approval.approvalText) {
      lines.push(line(`- **Approval Text:** ${approval.approvalText}`));
    }
    lines.push(line(`- **Snapshot Verified:** ${approval.snapshotVerified ? 'Yes' : 'No'}`));
    lines.push(line(`- **Target Asset Verified:** ${approval.targetAssetVerified ? 'Yes' : 'No'}`));
  } else {
    lines.push(line('- No approval recorded.'));
  }
  const preview = candidate ? getPreview(candidate.candidateId) : undefined;
  if (preview) {
    lines.push(line(`- **Preview ID:** ${preview.previewId}`));
    lines.push(line(`- **Diff generated:** Yes`));
  } else {
    lines.push(line('- No preview generated.'));
  }
  lines.push(line(''));

  // Execution result
  lines.push(line('## Execution Result'));
  lines.push(line(''));
  if (execResult) {
    lines.push(line(`- **Success:** ${execResult.success ? 'Yes' : 'No'}`));
    lines.push(line(`- **Outcome:** ${execResult.outcome}`));
    lines.push(line(`- **Rollback Recommended:** ${execResult.rollbackRecommended ? 'Yes' : 'No'}`));
    lines.push(line(`- **Requires User Local Validation:** ${execResult.requiresUserLocalValidation ? 'Yes' : 'No'}`));
    if (writeSummary) {
      lines.push(line(`- **Write Response:** ${writeSummary}`));
    }
    if (execResult.details) {
      lines.push(line(`- **Details:** ${execResult.details}`));
    }
  } else {
    lines.push(line('- No execution result recorded.'));
  }
  lines.push(line(''));

  // Rollback
  lines.push(line('## Rollback Status'));
  lines.push(line(''));
  if (rollbackResult) {
    lines.push(line(`- **Rollback Attempted:** Yes`));
    lines.push(line(`- **Success:** ${rollbackResult.success ? 'Yes' : 'No'}`));
    lines.push(line(`- **Outcome:** ${rollbackResult.outcome}`));
    if (rollbackResult.details) {
      lines.push(line(`- **Details:** ${rollbackResult.details}`));
    }
  } else {
    lines.push(line('- No rollback attempted.'));
  }

  // Rollback payload (from E85 capture)
  const rollbackPayload = getRollbackPayload(session.sessionId);
  if (rollbackPayload) {
    lines.push(line('## Rollback Payload'));
    lines.push(line(''));
    lines.push(line(`- **Intent:** ${rollbackPayload.intent}`));
    lines.push(line(`- **Target Asset Path:** ${rollbackPayload.targetAssetPath}`));
    lines.push(line(`- **Operation Kind:** ${rollbackPayload.operationKind}`));
    lines.push(line(`- **Metadata Key:** ${rollbackPayload.metadataKey}`));
    lines.push(line(`- **Key Existed Before Write:** ${rollbackPayload.keyExisted ? 'Yes' : 'No'}`));
    if (rollbackPayload.previousValue !== undefined) {
      lines.push(line(`- **Previous Value:** ${rollbackPayload.previousValue}`));
    }
    lines.push(line(`- **Requested Value:** ${rollbackPayload.requestedValue}`));
    lines.push(line(`- **Approval ID:** ${rollbackPayload.approvalId}`));
    lines.push(line(`- **Snapshot ID:** ${rollbackPayload.snapshotId}`));
    lines.push(line(`- **Package Dirty:** ${rollbackPayload.packageDirty ? 'Yes' : 'No'}`));
    lines.push(line(`- **Package Saved:** ${rollbackPayload.packageSaved ? 'Yes' : 'No'}`));
    lines.push(line(`- **Write Timestamp:** ${rollbackPayload.writeTimestamp}`));
    lines.push(line(''));
  }

  // Rollback history
  if (rollbackHistory.length > 0) {
    lines.push(line('## Rollback History'));
    lines.push(line(''));
    for (const rec of rollbackHistory) {
      lines.push(line(`- **Record:** ${rec.recordId}`));
      lines.push(line(`  - **Reason:** ${rec.reason}`));
      lines.push(line(`  - **Success:** ${rec.success ? 'Yes' : 'No'}`));
      lines.push(line(`  - **Outcome:** ${rec.outcome}`));
      lines.push(line(`  - **Details:** ${rec.details}`));
      lines.push(line(`  - **Timestamp:** ${rec.attemptedAt}`));
      if (rec.snapshotId) {
        lines.push(line(`  - **Snapshot:** ${rec.snapshotId}`));
      }
    }
    lines.push(line(''));
  }

  // Validation runs
  if (validationRuns.length > 0) {
    lines.push(line('## Validation Runs'));
    lines.push(line(''));
    for (const run of validationRuns) {
      lines.push(line(`- **Run:** ${run.id}`));
      lines.push(line(`  - **Title:** ${run.title}`));
      const decisions = getValidationRunDecisions(run.id);
      for (const step of run.steps) {
        const d = decisions[step.id];
        const statusStr = d === 'pass' ? 'Passed'
          : d === 'fail' ? 'Failed'
          : 'Pending User Validation';
        lines.push(line(`  - [${step.kind}] ${step.name}: ${statusStr}`));
      }
    }
    lines.push(line(''));
  }

  // E87 Validation closure
  const validationClosure = getValidationClosure(session.sessionId) ?? deriveValidationClosure(session.sessionId);
  lines.push(line('## Validation Closure'));
  lines.push(line(''));
  if (validationClosure && (validationClosure.hasWriteResponse || validationClosure.hasRollbackPayload)) {
    lines.push(line('### What OMUE Has Recorded'));
    lines.push(line(''));
    lines.push(line(`- **Session ID:** ${validationClosure.sessionId}`));
    lines.push(line(`- **Target Asset:** ${validationClosure.targetAssetPath}`));
    lines.push(line(`- **Validation Status:** ${validationClosure.validationStatus}`));
    if (validationClosure.snapshotId) {
      lines.push(line(`- **Snapshot ID:** ${validationClosure.snapshotId}`));
    }
    if (validationClosure.rollbackIntent) {
      lines.push(line(`- **Rollback Intent:** ${validationClosure.rollbackIntent}`));
    }
    if (validationClosure.metadataKey) {
      lines.push(line(`- **Metadata Key:** ${validationClosure.metadataKey}`));
    }
    if (validationClosure.writeTimestamp) {
      lines.push(line(`- **Write Timestamp:** ${validationClosure.writeTimestamp}`));
    }
    if (validationClosure.packageDirty !== undefined) {
      lines.push(line(`- **Package Dirty:** ${validationClosure.packageDirty ? 'Yes' : 'No'}`));
    }
    if (validationClosure.packageSaved !== undefined) {
      lines.push(line(`- **Package Saved:** ${validationClosure.packageSaved ? 'Yes' : 'No'}`));
    }
    lines.push(line(''));

    lines.push(line('### Pending User-Local Validation'));
    lines.push(line(''));
    lines.push(line('The following steps must be completed by the user in UE Editor.'));
    lines.push(line('OMUE automation does not perform compile, PIE, Automation, rollback, or package save.'));
    lines.push(line(''));
    for (const item of validationClosure.checklist) {
      const statusIcon = item.status === 'recorded_by_omue' ? '[Recorded]' : '[Pending]';
      lines.push(line(`- ${statusIcon} **${item.label}**: ${item.detail}`));
    }
    lines.push(line(''));
    lines.push(line('> No compile, PIE, Automation, rollback, or package save was triggered by this report generation.'));
    lines.push(line(''));
  } else {
    lines.push(line('No validation closure record is available. A write response with rollback payload and `requiresUserLocalValidation === true` must be present to produce a validation closure.'));
    lines.push(line(''));
  }

  // ── E88 Execution Handoff ──
  lines.push(line('## Execution Handoff'));
  lines.push(line(''));

  const writeResponse = getWriteResponse(session.sessionId);
  const capture = writeResponse?.snapshot?.capture;

  // Source Data
  lines.push(line('### Source Data'));
  lines.push(line(''));
  lines.push(line(`- **Session ID:** ${session.sessionId}`));
  lines.push(line(`- **Target Asset Path:** ${session.targetAssetPath}`));
  if (candidate) {
    lines.push(line(`- **Selected Candidate:** ${candidate.candidateId}`));
    lines.push(line(`  - Title: ${candidate.title}`));
    lines.push(line(`  - Source: ${candidate.source}`));
  }
  lines.push(line(''));

  // Preflight / Typed Payload
  lines.push(line('### Preflight & Typed Payload'));
  lines.push(line(''));
  if (writeResponse?.preflight?.checks) {
    const checkArray = writeResponse.preflight.checks;
    const passedCount = checkArray.filter(c => c.passed).length;
    const totalCount = checkArray.length;
    lines.push(line(`- **All Preflight Checks Passed:** ${writeResponse.preflight.passed ? 'Yes' : 'No'}`));
    lines.push(line(`- **Preflight Checks:** ${passedCount}/${totalCount} passed`));
    const failedChecks = checkArray.filter(c => !c.passed);
    if (failedChecks.length > 0 && failedChecks.length <= 10) {
      lines.push(line(''));
      lines.push(line('**Failed Checks:**'));
      for (const fc of failedChecks) {
        lines.push(line(`- \`${fc.checkId}\`: ${fc.message}`));
      }
    } else if (failedChecks.length > 10) {
      lines.push(line(`- **Failed Checks:** ${failedChecks.length} checks failed (see refusal reason for summary)`));
    }
    if (failedChecks.length === 0 && checkArray.length > 0) {
      lines.push(line('- All individual preflight checks passed.'));
    }
  } else if (execResult) {
    lines.push(line('- Preflight not recorded separately; see Execution Result.'));
  } else {
    lines.push(line('- No preflight data recorded.'));
  }
  if (capture && capture.kind === 'scratch_metadata_marker') {
    lines.push(line(`- **Operation Kind:** ${capture.operationKind}`));
    lines.push(line(`- **Target Asset Path:** ${capture.targetAssetPath}`));
    lines.push(line(`- **Metadata Key:** ${capture.metadata.key}`));
    lines.push(line(`- **Key Existed Before Write:** ${capture.metadata.keyExisted ? 'Yes' : 'No'}`));
    lines.push(line(`- **Requested Value:** ${capture.metadata.requestedValue}`));
    if (capture.metadata.previousValue !== undefined) {
      lines.push(line(`- **Previous Value:** ${capture.metadata.previousValue}`));
    }
  } else {
    lines.push(line('- No typed payload capture recorded.'));
  }
  lines.push(line(''));

  // Approval & Snapshot
  lines.push(line('### Approval & Snapshot'));
  lines.push(line(''));
  if (approval) {
    lines.push(line(`- **Approval ID:** ${approval.approvalId}`));
    lines.push(line(`- **Approved At:** ${approval.approvedAt}`));
    lines.push(line(`- **Snapshot Verified:** ${approval.snapshotVerified ? 'Yes' : 'No'}`));
  } else {
    lines.push(line('- No approval recorded.'));
  }
  if (writeResponse?.snapshot?.snapshotId) {
    lines.push(line(`- **Snapshot ID:** ${writeResponse.snapshot.snapshotId}`));
  } else if (rollbackPayload?.snapshotId) {
    lines.push(line(`- **Snapshot ID:** ${rollbackPayload.snapshotId}`));
  } else {
    lines.push(line('- No snapshot ID recorded.'));
  }
  lines.push(line(''));

  // Write Result & RequiresUserLocalValidation
  lines.push(line('### Write Execution'));
  lines.push(line(''));
  if (writeResponse) {
    lines.push(line(`- **Gate State:** ${writeResponse.gateState}`));
    lines.push(line(`- **Requires User-Local Validation:** ${writeResponse.requiresUserLocalValidation ? 'Yes' : 'No'}`));
    if (!writeResponse.success) {
      lines.push(line(`- **Write Result:** Refused`));
      if (writeResponse.refusalReason) {
        lines.push(line(`  - **Refusal Reason:** ${writeResponse.refusalReason}`));
      }
    } else {
      lines.push(line(`- **Write Result:** Accepted`));
      lines.push(line(`- **Package Dirty (by OMUE):** ${capture && 'packageDirty' in capture ? String(capture.packageDirty) : 'not recorded'}`));
      lines.push(line(`- **Package Saved (by OMUE):** ${capture && 'packageSaved' in capture ? String(capture.packageSaved) : 'not recorded'}`));
    }
    lines.push(line(`- **Message:** ${writeResponse.message}`));
  } else if (execResult) {
    lines.push(line(`- **Result:** ${execResult.success ? 'Accepted' : 'Refused'}`));
    lines.push(line(`- **Outcome:** ${execResult.outcome}`));
    lines.push(line(`- **Requires User-Local Validation:** ${execResult.requiresUserLocalValidation ? 'Yes' : 'No'}`));
  } else {
    lines.push(line('- No write execution recorded.'));
  }
  lines.push(line(''));

  // Rollback Payload
  lines.push(line('### Rollback Payload'));
  lines.push(line(''));
  if (rollbackPayload) {
    lines.push(line(`- **Intent:** ${rollbackPayload.intent}`));
    lines.push(line(`- **Metadata Key:** ${rollbackPayload.metadataKey}`));
    lines.push(line(`- **Key Existed Before:** ${rollbackPayload.keyExisted ? 'Yes' : 'No'}`));
    lines.push(line(`- **Package Dirty:** ${rollbackPayload.packageDirty ? 'Yes' : 'No'}`));
    lines.push(line(`- **Package Saved by Automation:** ${rollbackPayload.packageSaved ? 'Yes' : 'No'}`));
  } else {
    lines.push(line('- No rollback payload recorded.'));
  }
  lines.push(line(''));

  // Validation Closure Summary
  lines.push(line('### Validation Closure'));
  lines.push(line(''));
  if (validationClosure && (validationClosure.hasWriteResponse || validationClosure.hasRollbackPayload)) {
    lines.push(line(`- **Validation Status:** ${validationClosure.validationStatus}`));
    lines.push(line(`- **Checklist Items:** ${validationClosure.checklist.length}`));
    const pendingCount = validationClosure.checklist.filter(i => i.status === 'pending_user_local_validation').length;
    const recordedCount = validationClosure.checklist.filter(i => i.status === 'recorded_by_omue').length;
    lines.push(line(`- **Pending User Validation:** ${pendingCount} items`));
    lines.push(line(`- **Recorded by OMUE:** ${recordedCount} items`));
  } else {
    lines.push(line('- No validation closure available. A write response with `requiresUserLocalValidation === true` and rollback payload must be present.'));
  }
  lines.push(line(''));

  // Safety Boundaries
  lines.push(line('### Safety Boundaries'));
  lines.push(line(''));
  lines.push(line('- No production asset default write.'));
  lines.push(line('- No natural-language-to-mutation execution.'));
  lines.push(line('- No compile, PIE, or Automation triggered by OMUE automation.'));
  lines.push(line('- No rollback execution triggered by OMUE automation.'));
  lines.push(line('- No package save by OMUE automation.'));
  lines.push(line('- User-local validation is still required before completion.'));
  lines.push(line(''));

  // ── E89 Refusal & Safety Audit ──
  lines.push(line('## Refusal & Safety Audit'));
  lines.push(line(''));
  lines.push(line('This section audits the current write response and stored state against the supported safety checks.'));
  lines.push(line(''));
  const auditItems = getRefusalAudit(session.sessionId);
  if (auditItems.length > 0) {
    lines.push(line('| Safety Case | Status | Detail |'));
    lines.push(line('|---|---|---|'));
    for (const item of auditItems) {
      const statusLabel = item.status === 'enforced_by_preflight' ? '✅ Enforced (preflight)'
        : item.status === 'enforced_by_bridge' ? '✅ Enforced (bridge)'
        : item.status === 'residual_risk_user_local_only' ? '⚠️ Residual risk'
        : item.status === 'not_applicable' ? '➖ N/A'
        : '❓ Unknown';
      const detail = item.detail.length > 120 ? item.detail.slice(0, 117) + '...' : item.detail;
      lines.push(line(`| ${item.caseName} | ${statusLabel} | ${detail} |`));
    }
    lines.push(line(''));
    const residualRisks = auditItems.filter(i => i.status === 'residual_risk_user_local_only');
    if (residualRisks.length > 0) {
      lines.push(line('### Residual Risks (User-Local Validation Required)'));
      lines.push(line(''));
      for (const risk of residualRisks) {
        lines.push(line(`- **${risk.caseName}:** ${risk.detail}`));
      }
      lines.push(line(''));
      lines.push(line('These cases require additional bridge signals or active Editor checks and must currently be validated by the user.'));
      lines.push(line(''));
    }
    const enforcedCount = auditItems.filter(i => i.status === 'enforced_by_preflight' || i.status === 'enforced_by_bridge').length;
    const residualCount = residualRisks.length;
    lines.push(line(`**Audit Summary:** ${enforcedCount} cases enforced by automation, ${residualCount} residual risks pending user-local validation.`));
    lines.push(line(''));
  } else {
    lines.push(line('No audit data available. A repair session must exist to produce an audit.'));
    lines.push(line(''));
  }

  // Failure recovery guidance
  const latestRollback = rollbackHistory.length > 0 ? rollbackHistory[0] : undefined;
  const hasFailedValidation = validationRuns.some(r =>
    r.steps.some(s => s.status === 'manual_failed'),
  );
  const showRecovery =
    (execResult && !execResult.success) ||
    (execResult && execResult.rollbackRecommended) ||
    hasFailedValidation ||
    (latestRollback && !latestRollback.success);

  if (showRecovery) {
    lines.push(line('## Failure Recovery Guidance'));
    lines.push(line(''));
    lines.push(line('The repair workflow has encountered a condition that may require attention:'));
    lines.push(line(''));
    if (execResult && !execResult.success) {
      lines.push(line('- Execution result indicates failure.'));
    }
    if (execResult && execResult.rollbackRecommended) {
      lines.push(line('- Rollback is recommended by the execution result.'));
    }
    if (hasFailedValidation) {
      lines.push(line('- Validation run has failed or manual-fail decisions.'));
    }
    if (latestRollback && !latestRollback.success) {
      lines.push(line('- A previous rollback attempt failed.'));
    }
    if (execResult && !execResult.success && !latestRollback && rollbackPayload) {
      lines.push(line('- Rollback payload is recorded but has not been attempted after a failed/risky execution.'));
    }
    if (execResult && !execResult.success && !latestRollback && !rollbackPayload) {
      lines.push(line('- No typed rollback payload is recorded; user-local inspection or a future authorized recovery task is required.'));
    }
    lines.push(line(''));
    lines.push(line('Desktop does not automatically fix, compile, PIE, Automation, or verify UE assets.'));
    lines.push(line('Inspect UE Editor state and snapshot readiness before taking action.'));
    lines.push(line('All real UE rollback confirmation is marked PASS_PENDING_USER_LOCAL_VALIDATION.'));
    lines.push(line(''));
  }

  // Validation result
  lines.push(line('## Validation Result'));
  lines.push(line(''));
  lines.push(line('**PASS_PENDING_USER_LOCAL_VALIDATION**'));
  lines.push(line(''));
  lines.push(line('> This report is generated from renderer-local state. No UE asset writes, compile, PIE, Automation, or rollback are triggered by this report. All write/validation state is memory-only and requires user-local validation in UE Editor.'));
  lines.push(line(''));

  // User-local validation notes
  lines.push(line('## User-Local Validation Checklist'));
  lines.push(line(''));
  lines.push(line('- [ ] Verify UE asset state in Editor'));
  lines.push(line('- [ ] Confirm compile status'));
  lines.push(line('- [ ] Run PIE smoke test'));
  lines.push(line('- [ ] Run Automation tests'));
  lines.push(line('- [ ] Inspect asset visually'));
  lines.push(line('- [ ] Confirm rollback snapshot exists (if applicable)'));
  lines.push(line('- [ ] Run Desktop in real bridge mode to confirm status reflection'));
  lines.push(line(''));

  return {
    markdown: lines.join('\n'),
    generatedAt: now,
  };
}
