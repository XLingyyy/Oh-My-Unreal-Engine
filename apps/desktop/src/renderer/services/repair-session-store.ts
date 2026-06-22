import type {
  FixApproval,
  FixCandidate,
  FixCandidateRanking,
  FixExecutionResult,
  FixPreview,
  RepairSession,
  RepairSessionStatus,
  ReversibleWriteResponse,
  ValidationRunPlan,
  ValidationStepKind,
  ValidationStepStatus,
} from '@omue/shared-protocol';

// ── Renderer-local repair session store (E74) ──
//
// Pure in-memory state management for repair sessions.
// No persistence, no side effects, no bridge calls.
//
// E76 additions: FixPreview and FixApproval local state.

const NOW = new Date();
const DAY_MS = 86400000;

function daysAgo(n: number): string {
  return new Date(NOW.getTime() - n * DAY_MS).toISOString();
}

// ── Store state ──

interface RepairSessionStoreState {
  sessions: RepairSession[];
  selectedSessionId: string | null;
  // E76: renderer-local FixPreview keyed by candidateId
  previews: Record<string, FixPreview>;
  // E76: renderer-local FixApproval keyed by sessionId
  approvals: Record<string, FixApproval>;
  // E77: execution result keyed by sessionId
  executionResults: Record<string, FixExecutionResult>;
  // E77: last reversible write response summary keyed by sessionId
  lastWriteResponseSummary: Record<string, string>;
  // E77: rollback attempt result keyed by sessionId
  rollbackResults: Record<string, FixExecutionResult>;
  // E78: validation runs keyed by runId
  validationRuns: Record<string, ValidationRunPlan>;
  // E78: manual decisions keyed by runId then stepId
  validationDecisions: Record<string, Record<string, 'pass' | 'fail'>>;
  // E79: rollback history keyed by sessionId
  rollbackHistory: Record<string, RollbackHistoryRecord[]>;
  // E86-fix: full write response keyed by sessionId
  lastWriteResponse: Record<string, ReversibleWriteResponse>;
  // E87: validation closure records keyed by sessionId
  validationClosures: Record<string, ValidationClosureRecord>;
}

// ── E79: Rollback History Record ──

interface RollbackHistoryRecord {
  recordId: string;
  sessionId: string;
  originalExecutionId?: string;
  rollbackRequestId: string;
  snapshotId?: string;
  targetAssetPath: string;
  candidateId?: string;
  reason: string;
  success: boolean;
  outcome: string;
  details: string;
  attemptedAt: string;
  completedAt: string;
  requiresUserLocalValidation: boolean;
}

// ── E89: Refusal & Safety Audit Item ──

export interface RefusalAuditItem {
  caseName: string;
  status: 'enforced_by_preflight' | 'enforced_by_bridge' | 'residual_risk_user_local_only' | 'not_applicable' | 'unknown';
  detail: string;
  checkId?: string;
  dataSource: string;
}

export function getRefusalAudit(sessionId: string): RefusalAuditItem[] {
  const session = state.sessions.find(s => s.sessionId === sessionId);
  if (!session) return [];

  const writeResponse = state.lastWriteResponse[sessionId];
  const approval = state.approvals[sessionId];
  const rollbackPayload = getRollbackPayload(sessionId);
  const execResult = state.executionResults[sessionId];
  const checks = writeResponse?.preflight?.checks ?? [];

  const findCheck = (id: string) => checks.find(c => c.checkId === id);
  const anyCheckPassed = (id: string) => !!findCheck(id)?.passed;
  const writeRefused = !!writeResponse && !writeResponse.success;

  const items: RefusalAuditItem[] = [];

  // 1. Missing typed payload
  const typedPayloadCheck = findCheck('typed_payload_present');
  items.push({
    caseName: 'Missing typed payload',
    status: typedPayloadCheck
      ? (typedPayloadCheck.passed ? 'enforced_by_preflight' : 'enforced_by_preflight')
      : (writeResponse ? 'enforced_by_preflight' : (execResult ? 'not_applicable' : 'unknown')),
    detail: typedPayloadCheck
      ? typedPayloadCheck.message
      : (writeResponse ? 'Checked via bridge preflight typed_payload_present' : 'No write response recorded'),
    checkId: 'typed_payload_present',
    dataSource: typedPayloadCheck ? 'preflight.checks' : (writeResponse ? 'writeResponse.refusalReason' : 'N/A'),
  });

  // 2. Invalid typed payload
  const invalidPayload = writeRefused && (writeResponse.refusalReason === 'typed_payload_invalid');
  items.push({
    caseName: 'Invalid typed payload',
    status: invalidPayload ? 'enforced_by_preflight' : (typedPayloadCheck?.passed ? 'enforced_by_preflight' : 'not_applicable'),
    detail: invalidPayload
      ? (writeResponse.message)
      : (typedPayloadCheck?.passed ? 'Payload validated and passed all preflight checks' : 'No typed payload present or not checked'),
    checkId: 'typed_payload_invalid',
    dataSource: 'writeResponse.refusalReason / preflight.checks',
  });

  // 3. Natural-language-only description without typed payload
  const hasTypedPayload = !!findCheck('typed_payload_present')?.passed;
  const hasDescription = !!execResult || !!writeResponse;
  items.push({
    caseName: 'Natural-language-only description without typed payload',
    status: writeRefused && writeResponse.refusalReason === 'typed_payload_missing'
      ? 'enforced_by_preflight'
      : (hasTypedPayload ? 'enforced_by_preflight' : 'residual_risk_user_local_only'),
    detail: writeRefused && writeResponse.refusalReason === 'typed_payload_missing'
      ? 'Refused: description present but typedPayload missing — NL-to-mutation not supported'
      : (hasTypedPayload
        ? 'Typed payload attached — description is display/audit only; bridge validates typed payload, never description text'
        : 'No write response recorded; this case requires user-local vigilance to ensure description is never used for mutation inference'),
    checkId: 'typed_payload_present',
    dataSource: 'writeResponse.refusalReason / preflight.checks',
  });

  // 4. Missing approval
  const approvalCheck = findCheck('approval_metadata_present');
  items.push({
    caseName: 'Missing approval',
    status: approvalCheck
      ? 'enforced_by_preflight'
      : (approval ? 'enforced_by_preflight' : (execResult ? 'enforced_by_preflight' : 'unknown')),
    detail: approvalCheck
      ? approvalCheck.message
      : (approval ? `Approval ${approval.approvalId} recorded at ${approval.approvedAt}` : 'No execution/approval data'),
    checkId: 'approval_metadata_present',
    dataSource: 'preflight.checks / store.approvals',
  });

  // 5. Approval not matching expected execution context – not represented today
  items.push({
    caseName: 'Approval not matching expected execution context',
    status: anyCheckPassed('approval_metadata_present') ? 'residual_risk_user_local_only' : 'not_applicable',
    detail: 'Approval is validated for presence (non-empty approvalId and approvedAt) but not yet matched against the exact execution target and operation.',
    checkId: undefined,
    dataSource: 'Residual risk — no structured enforcement',
  });

  // 6. Non-canonical or non-scratch target asset
  const allowlistCheck = findCheck('target_path_allowlisted');
  const canonicalCheck = findCheck('e85_canonical_target');
  items.push({
    caseName: 'Non-canonical or non-scratch target asset',
    status: (allowlistCheck && !allowlistCheck.passed) || (canonicalCheck && !canonicalCheck.passed)
      ? 'enforced_by_preflight'
      : (allowlistCheck?.passed && canonicalCheck?.passed ? 'enforced_by_bridge' : 'unknown'),
    detail: allowlistCheck
      ? (allowlistCheck.passed
        ? (canonicalCheck
          ? (canonicalCheck.passed ? `Canonical target confirmed: ${session.targetAssetPath}` : canonicalCheck.message)
          : `Allowlisted: ${allowlistCheck.message}`)
        : allowlistCheck.message)
      : 'No target-path check recorded',
    checkId: canonicalCheck ? 'e85_canonical_target' : 'target_path_allowlisted',
    dataSource: 'preflight.checks',
  });

  // 7. Target asset missing / cannot be loaded
  const targetExistsCheck = findCheck('target_blueprint_exists');
  items.push({
    caseName: 'Target asset missing / cannot be loaded',
    status: targetExistsCheck
      ? (targetExistsCheck.passed ? 'enforced_by_bridge' : 'enforced_by_preflight')
      : 'residual_risk_user_local_only',
    detail: targetExistsCheck
      ? targetExistsCheck.message
      : 'No target_blueprint_exists check recorded; user must confirm target asset exists in UE Editor',
    checkId: 'target_blueprint_exists',
    dataSource: 'preflight.checks',
  });

  // 8. Missing snapshot requirement
  const snapshotCheck = findCheck('request_require_snapshot');
  items.push({
    caseName: 'Missing snapshot requirement',
    status: snapshotCheck
      ? (snapshotCheck.passed ? 'enforced_by_preflight' : 'enforced_by_preflight')
      : 'unknown',
    detail: snapshotCheck
      ? snapshotCheck.message
      : 'No requireSnapshot check recorded',
    checkId: 'request_require_snapshot',
    dataSource: 'preflight.checks',
  });

  // 9. Missing before-state capture
  items.push({
    caseName: 'Missing before-state capture',
    status: writeResponse?.snapshot?.capture?.kind === 'scratch_metadata_marker'
      ? 'enforced_by_bridge'
      : (writeResponse ? 'residual_risk_user_local_only' : 'not_applicable'),
    detail: writeResponse?.snapshot?.capture?.kind === 'scratch_metadata_marker'
      ? `Before-state captured for key "${writeResponse.snapshot.capture.metadata.key}": keyExisted=${writeResponse.snapshot.capture.metadata.keyExisted}`
      : (writeResponse
        ? 'Before-state capture was not performed because the write was refused before asset mutation, or the response format does not include a capture'
        : 'No write response recorded'),
    checkId: undefined,
    dataSource: writeResponse?.snapshot?.capture ? 'writeResponse.snapshot.capture' : 'N/A',
  });

  // 10. Before-state mismatch – not represented today
  items.push({
    caseName: 'Before-state mismatch',
    status: 'residual_risk_user_local_only',
    detail: 'Typed payload beforeState.kind is currently limited to "missing_or_absent_allowed", so no value comparison is performed. Future value-based payloads require bridge-level verification against actual UE metadata.',
    checkId: undefined,
    dataSource: 'Residual risk — no structured enforcement',
  });

  // 11. Rollback payload unavailable / rollback not ready
  items.push({
    caseName: 'Rollback payload unavailable / rollback not ready',
    status: rollbackPayload
      ? 'enforced_by_bridge'
      : (writeResponse ? 'enforced_by_preflight' : 'not_applicable'),
    detail: rollbackPayload
      ? `Rollback payload present: intent=${rollbackPayload.intent}, key=${rollbackPayload.metadataKey}, snapshotId=${rollbackPayload.snapshotId}`
      : (writeResponse
        ? 'No rollback payload in write response; write was refused or bridge did not provide one'
        : 'No write response recorded'),
    checkId: undefined,
    dataSource: rollbackPayload ? 'writeResponse.snapshot.capture.rollback' : 'N/A',
  });

  // 12. Package dirty/saved facts unknown or unsafe
  const pkgDirty = writeResponse?.snapshot?.capture &&
    'packageDirty' in writeResponse.snapshot.capture
    ? writeResponse.snapshot.capture.packageDirty
    : undefined;
  const pkgSaved = writeResponse?.snapshot?.capture &&
    'packageSaved' in writeResponse.snapshot.capture
    ? writeResponse.snapshot.capture.packageSaved
    : undefined;
  items.push({
    caseName: 'Package dirty/saved facts unknown or unsafe',
    status: pkgDirty !== undefined && pkgSaved !== undefined
      ? 'enforced_by_bridge'
      : (writeResponse ? 'residual_risk_user_local_only' : 'not_applicable'),
    detail: pkgDirty !== undefined && pkgSaved !== undefined
      ? `packageDirty=${String(pkgDirty)}, packageSaved=${String(pkgSaved)}. OMUE automation does NOT save packages; user must verify in UE Editor.`
      : (writeResponse
        ? 'Package dirty/saved facts not available from write response'
        : 'No write response recorded'),
    checkId: undefined,
    dataSource: 'writeResponse.snapshot.capture.packageDirty/packageSaved',
  });

  // 13. Compile/PIE/Automation/editor-busy state
  const hasEditorBusyCheck = findCheck('editor_busy');
  items.push({
    caseName: 'Compile/PIE/Automation/editor-busy state',
    status: hasEditorBusyCheck
      ? (hasEditorBusyCheck.passed ? 'enforced_by_preflight' : 'enforced_by_preflight')
      : 'residual_risk_user_local_only',
    detail: hasEditorBusyCheck
      ? hasEditorBusyCheck.message
      : 'Write preflight does not currently check an editor-busy signal. The user must ensure Unreal Editor is idle before executing writes.',
    checkId: 'editor_busy',
    dataSource: hasEditorBusyCheck ? 'preflight.checks' : 'Residual risk — no structured enforcement',
  });

  return items;
}

// ── E87: Validation Closure Record ──

interface ValidationClosureChecklistItem {
  label: string;
  status: 'recorded_by_omue' | 'pending_user_local_validation';
  detail: string;
}

interface ValidationClosureRecord {
  sessionId: string;
  targetAssetPath: string;
  snapshotId: string | undefined;
  rollbackIntent: string | undefined;
  metadataKey: string | undefined;
  writeTimestamp: string | undefined;
  packageDirty: boolean | undefined;
  packageSaved: boolean | undefined;
  validationStatus: 'pending_user_local_validation';
  checklist: ValidationClosureChecklistItem[];
  hasWriteResponse: boolean;
  hasRollbackPayload: boolean;
}

export function deriveValidationClosure(sessionId: string): ValidationClosureRecord | null {
  const session = state.sessions.find(s => s.sessionId === sessionId);
  if (!session) return null;

  const writeResponse = state.lastWriteResponse[sessionId];
  const rollbackPayload = getRollbackPayload(sessionId);

  const hasWriteResponse = !!writeResponse;
  const hasRollbackPayload = !!rollbackPayload;

  if (!hasWriteResponse && !hasRollbackPayload) {
    state = {
      ...state,
      validationClosures: {
        ...state.validationClosures,
        [sessionId]: {
          sessionId,
          targetAssetPath: session.targetAssetPath,
          snapshotId: undefined,
          rollbackIntent: undefined,
          metadataKey: undefined,
          writeTimestamp: undefined,
          packageDirty: undefined,
          packageSaved: undefined,
          validationStatus: 'pending_user_local_validation',
          checklist: [],
          hasWriteResponse: false,
          hasRollbackPayload: false,
        },
      },
    };
    return state.validationClosures[sessionId];
  }

  if (writeResponse && writeResponse.requiresUserLocalValidation !== true) {
    return null;
  }

  const snapshotId = writeResponse?.snapshot?.snapshotId ?? rollbackPayload?.snapshotId;
  const rollbackIntent = rollbackPayload?.intent;
  const metadataKey = rollbackPayload?.metadataKey;
  const writeTimestamp = rollbackPayload?.writeTimestamp;
  const packageDirty = rollbackPayload?.packageDirty;
  const packageSaved = rollbackPayload?.packageSaved;

  const checklist: ValidationClosureChecklistItem[] = [
    {
      label: 'Confirm scratch Blueprint exists',
      status: 'pending_user_local_validation',
      detail: `Verify ${session.targetAssetPath} is present in UE Content Browser.`,
    },
    {
      label: 'Inspect metadata marker state after write',
      status: 'pending_user_local_validation',
      detail: `In UE Editor, inspect metadata on ${session.targetAssetPath} to confirm marker was written.`,
    },
  ];

  if (rollbackPayload) {
    checklist.push({
      label: 'Confirm rollback payload details',
      status: 'recorded_by_omue',
      detail: `Intent: ${rollbackPayload.intent}, Key: ${rollbackPayload.metadataKey}, Previous: ${rollbackPayload.previousValue ?? 'N/A'}, Requested: ${rollbackPayload.requestedValue}. Recorded in the write response.`,
    });
  }

  checklist.push(
    {
      label: 'Manually compile or observe compile status',
      status: 'pending_user_local_validation',
      detail: 'Compile in UE Editor only by explicit user action outside OMUE automation.',
    },
    {
      label: 'Optionally run PIE/Automation',
      status: 'pending_user_local_validation',
      detail: 'Run PIE or Automation tests in UE Editor only by separate user action outside OMUE automation.',
    },
    {
      label: 'Confirm no package save from OMUE automation',
      status: 'recorded_by_omue',
      detail: packageSaved !== undefined
        ? `OMUE reports packageSaved=${String(packageSaved)}. No package save was triggered by OMUE automation.`
        : 'No write response data available; package save status not confirmed by OMUE.',
    },
  );

  const record: ValidationClosureRecord = {
    sessionId,
    targetAssetPath: session.targetAssetPath,
    snapshotId,
    rollbackIntent,
    metadataKey,
    writeTimestamp,
    packageDirty,
    packageSaved,
    validationStatus: 'pending_user_local_validation',
    checklist,
    hasWriteResponse,
    hasRollbackPayload,
  };

  state = {
    ...state,
    validationClosures: { ...state.validationClosures, [sessionId]: record },
  };

  return record;
}

export function getValidationClosure(sessionId: string): ValidationClosureRecord | undefined {
  return state.validationClosures[sessionId];
}

// ── Deterministic mock fixtures ──

const MOCK_CANDIDATES_A: FixCandidate[] = [
  {
    candidateId: 'fc-001',
    source: 'deterministic_rule',
    title: 'Add bCommentBubbleVisible to BP_OMUE_Scratch_Fixture',
    description:
      'Set the bCommentBubbleVisible property to true on the existing Root Variable so that the variable comment bubble is always shown in the Blueprint Editor.',
    targetAssetPath: '/Game/Scratch/BP_OMUE_Scratch_Fixture',
    proposedChange:
      'Modify non-functional property: bCommentBubbleVisible = false → true on Root Variable',
    evidenceLinks: [
      {
        sourceType: 'diagnosis_report',
        sourceLabel: 'Diagnosis: variable comment bubble not visible',
        relevantAssetPath: '/Game/Scratch/BP_OMUE_Scratch_Fixture',
        confidence: 'high',
      },
    ],
    ranking: 'high',
    confidence: 'high',
    knownLimitations: [
      'Changes are cosmetic only — no runtime behavior impact.',
      'Requires scratch asset — never a production asset.',
    ],
  },
  {
    candidateId: 'fc-002',
    source: 'manual',
    title: 'Update Tooltip on Scratch Variable',
    description:
      'Set a user-friendly tooltip text on an existing variable for documentation purposes.',
    targetAssetPath: '/Game/Scratch/BP_OMUE_Scratch_Fixture',
    proposedChange:
      'Modify non-functional property: Tooltip = "" → "Controls the base damage multiplier."',
    evidenceLinks: [
      {
        sourceType: 'manual',
        sourceLabel: 'User requested documentation improvement',
        relevantAssetPath: '/Game/Scratch/BP_OMUE_Scratch_Fixture',
        confidence: 'medium',
      },
    ],
    ranking: 'medium',
    confidence: 'medium',
    knownLimitations: [
      'Manual proposal — no automated evidence verification.',
    ],
  },
];

const MOCK_CANDIDATES_B: FixCandidate[] = [
  {
    candidateId: 'fc-003',
    source: 'deterministic_rule',
    title: 'Change Category on Scratch Node Comment',
    description:
      'Update a node comment category property to group related nodes in the graph.',
    targetAssetPath: '/Game/Scratch/BP_OMUE_Scratch_Fixture',
    proposedChange:
      'Modify non-functional property: NodeComment.Category = "" → "Setup"',
    evidenceLinks: [
      {
        sourceType: 'graph_detail',
        sourceLabel: 'Graph Detail: ungrouped nodes in EventGraph',
        relevantAssetPath: '/Game/Scratch/BP_OMUE_Scratch_Fixture',
        confidence: 'medium',
      },
    ],
    ranking: 'low',
    confidence: 'medium',
    knownLimitations: ['Category property is editor-only metadata.'],
  },
];

const MOCK_SESSIONS: RepairSession[] = [
  {
    sessionId: 'rs-001',
    createdAt: daysAgo(1),
    updatedAt: daysAgo(0),
    status: 'active',
    diagnosisCaseId: 'diag-042',
    targetAssetPath: '/Game/Scratch/BP_OMUE_Scratch_Fixture',
    fixCandidates: MOCK_CANDIDATES_A,
    selectedCandidateId: 'fc-001',
    changePlanId: 'plan-001',
    metadata: { workflow: 'local-planning' },
  },
  {
    sessionId: 'rs-002',
    createdAt: daysAgo(5),
    updatedAt: daysAgo(3),
    status: 'completed',
    diagnosisCaseId: 'diag-038',
    targetAssetPath: '/Game/Scratch/BP_OMUE_Scratch_Fixture',
    fixCandidates: MOCK_CANDIDATES_B,
    selectedCandidateId: 'fc-003',
    changePlanId: 'plan-002',
    metadata: { workflow: 'local-planning' },
  },
  {
    sessionId: 'rs-003',
    createdAt: daysAgo(10),
    updatedAt: daysAgo(10),
    status: 'abandoned',
    diagnosisCaseId: 'diag-030',
    targetAssetPath: '/Game/Scratch/BP_OMUE_Scratch_Fixture',
    fixCandidates: [],
    selectedCandidateId: undefined,
    metadata: { workflow: 'local-planning' },
  },
];

// ── Store state ──

// ── Store helpers ──

let state: RepairSessionStoreState = {
  sessions: MOCK_SESSIONS,
  selectedSessionId: 'rs-001',
  previews: {},
  approvals: {},
  executionResults: {},
  lastWriteResponseSummary: {},
  rollbackResults: {},
  validationRuns: {},
  validationDecisions: {},
  rollbackHistory: {},
  lastWriteResponse: {},
  validationClosures: {},
};

export function getRepairSessionState(): RepairSessionStoreState {
  return { ...state, sessions: [...state.sessions] };
}

export function getSessions(): RepairSession[] {
  return [...state.sessions];
}

export function getSelectedSession(): RepairSession | null {
  return state.sessions.find(s => s.sessionId === state.selectedSessionId) ?? null;
}

export function selectSession(sessionId: string): void {
  state = {
    ...state,
    selectedSessionId: sessionId,
  };
}

export function createMockSession(diagnosisCaseId: string, targetAssetPath: string): RepairSession {
  const newSession: RepairSession = {
    sessionId: `rs-new-${Date.now()}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: 'active',
    diagnosisCaseId,
    targetAssetPath,
    fixCandidates: [],
    metadata: { workflow: 'local-planning' },
  };
  state = {
    ...state,
    sessions: [...state.sessions, newSession],
    selectedSessionId: newSession.sessionId,
  };
  return newSession;
}

export function selectCandidate(sessionId: string, candidateId: string): void {
  state = {
    ...state,
    sessions: state.sessions.map(s => {
      if (s.sessionId !== sessionId) return s;
      return {
        ...s,
        selectedCandidateId: candidateId,
        updatedAt: new Date().toISOString(),
      };
    }),
  };
}

export function updateSessionStatus(sessionId: string, status: RepairSessionStatus): void {
  state = {
    ...state,
    sessions: state.sessions.map(s => {
      if (s.sessionId !== sessionId) return s;
      return { ...s, status, updatedAt: new Date().toISOString() };
    }),
  };
}

// ── Summary helpers ──

export function summarizeCandidatesBySource(sessions: RepairSession[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const s of sessions) {
    for (const c of s.fixCandidates) {
      counts[c.source] = (counts[c.source] ?? 0) + 1;
    }
  }
  return counts;
}

export function summarizeCandidatesByRanking(sessions: RepairSession[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const s of sessions) {
    for (const c of s.fixCandidates) {
      counts[c.ranking] = (counts[c.ranking] ?? 0) + 1;
    }
  }
  return counts;
}

export function summarizeCandidatesByStatus(sessions: RepairSession[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const s of sessions) {
    const key = s.status;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

// ── E76: FixPreview helpers ──

export function generatePreview(
  sessionId: string,
  candidateId: string,
): FixPreview | null {
  const session = state.sessions.find(s => s.sessionId === sessionId);
  if (!session) return null;
  const candidate = session.fixCandidates.find(c => c.candidateId === candidateId);
  if (!candidate) return null;

  const preview: FixPreview = {
    previewId: `fp-${Date.now()}`,
    candidateId,
    beforeState: `${candidate.targetAssetPath} — ${candidate.proposedChange} (before)`,
    afterState: `${candidate.targetAssetPath} — ${candidate.proposedChange} (after)`,
    diffMarkdown: [
      `## Patch Preview: ${candidate.title}`,
      '',
      `**Session:** ${sessionId}`,
      `**Candidate:** ${candidate.candidateId}`,
      `**Target:** ${candidate.targetAssetPath}`,
      '',
      '```diff',
      `- ${candidate.proposedChange}`,
      `+ ${candidate.proposedChange}`,
      '```',
      '',
      '### Evidence',
      ...candidate.evidenceLinks.map(el => `- [${el.sourceType}] ${el.sourceLabel}`),
      '',
      '---',
      '',
      '> **Preview-only:** This patch preview is generated deterministically from the selected fix candidate. It is not executable. No UE asset is modified.',
    ].join('\n'),
  };

  state = {
    ...state,
    previews: { ...state.previews, [candidateId]: preview },
  };
  return preview;
}

export function getPreview(candidateId: string): FixPreview | undefined {
  return state.previews[candidateId];
}

// ── E76: FixApproval helpers ──

export function recordApproval(
  sessionId: string,
  candidateId: string,
  approvalText: string,
  warningsAccepted: string[],
  snapshotVerified: boolean,
  targetAssetVerified: boolean,
): FixApproval | null {
  const session = state.sessions.find(s => s.sessionId === sessionId);
  if (!session) return null;

  const approval: FixApproval = {
    approvalId: `fa-${Date.now()}`,
    sessionId,
    candidateId,
    approvedAt: new Date().toISOString(),
    approvedBy: 'user',
    approvalText,
    warningsAccepted,
    snapshotVerified,
    targetAssetVerified,
  };

  state = {
    ...state,
    approvals: { ...state.approvals, [sessionId]: approval },
    sessions: state.sessions.map(s => {
      if (s.sessionId !== sessionId) return s;
      return { ...s, fixApproval: approval, updatedAt: new Date().toISOString() };
    }),
  };
  return approval;
}

export function getApproval(sessionId: string): FixApproval | undefined {
  return state.approvals[sessionId];
}

// ── E76: Execution readiness helpers ──

function hasPreviewForSession(sessionId: string): boolean {
  const session = state.sessions.find(s => s.sessionId === sessionId);
  if (!session || !session.selectedCandidateId) return false;
  return hasPreviewForCandidate(session.selectedCandidateId);
}

export function hasPreviewForCandidate(candidateId: string): boolean {
  return candidateId in state.previews;
}

export function hasApprovalForSession(sessionId: string): boolean {
  return sessionId in state.approvals;
}

export function isExecutionReady(sessionId: string): boolean {
  return hasPreviewForSession(sessionId) && hasApprovalForSession(sessionId);
}

export function getExecutionReadiness(sessionId: string): {
  hasPreview: boolean;
  hasApproval: boolean;
  executionReady: boolean;
} {
  const hasPrev = hasPreviewForSession(sessionId);
  const hasAppr = hasApprovalForSession(sessionId);
  return {
    hasPreview: hasPrev,
    hasApproval: hasAppr,
    executionReady: hasPrev && hasAppr,
  };
}

// ── E77: Execution result recording helpers ──

export function recordExecutionResult(
  sessionId: string,
  result: FixExecutionResult,
): void {
  state = {
    ...state,
    executionResults: { ...state.executionResults, [sessionId]: result },
    sessions: state.sessions.map(s => {
      if (s.sessionId !== sessionId) return s;
      let newStatus: RepairSessionStatus = s.status;
      if (result.success) {
        newStatus = 'validating';
      } else if (result.outcome === 'preflight_failed') {
        newStatus = 'active';
      }
      return {
        ...s,
        executionResult: result,
        status: newStatus,
        updatedAt: new Date().toISOString(),
      };
    }),
  };

  queueValidationRunForSession(sessionId);
}

export function getExecutionResult(sessionId: string): FixExecutionResult | undefined {
  return state.executionResults[sessionId];
}

export function hasExecutionResult(sessionId: string): boolean {
  return sessionId in state.executionResults;
}

export function setWriteResponseSummary(sessionId: string, summary: string): void {
  state = {
    ...state,
    lastWriteResponseSummary: { ...state.lastWriteResponseSummary, [sessionId]: summary },
  };
}

export function getWriteResponseSummary(sessionId: string): string | undefined {
  return state.lastWriteResponseSummary[sessionId];
}

export function setWriteResponse(sessionId: string, response: ReversibleWriteResponse): void {
  state = {
    ...state,
    lastWriteResponse: { ...state.lastWriteResponse, [sessionId]: response },
  };
}

export function getWriteResponse(sessionId: string): ReversibleWriteResponse | undefined {
  return state.lastWriteResponse[sessionId];
}

export function getRollbackPayload(sessionId: string): import('@omue/shared-protocol').ScratchMetadataRollbackPayload | undefined {
  const writeResponse = state.lastWriteResponse[sessionId];
  const capture = writeResponse?.snapshot?.capture;
  if (capture?.kind === 'scratch_metadata_marker' && capture.rollback) {
    return capture.rollback;
  }
  return undefined;
}

export function recordRollbackResult(
  sessionId: string,
  result: FixExecutionResult,
): void {
  state = {
    ...state,
    rollbackResults: { ...state.rollbackResults, [sessionId]: result },
    sessions: state.sessions.map(s => {
      if (s.sessionId !== sessionId) return s;
      return {
        ...s,
        status: result.success ? 'rolled_back' : s.status,
        updatedAt: new Date().toISOString(),
      };
    }),
  };
}

export function getRollbackResult(sessionId: string): FixExecutionResult | undefined {
  return state.rollbackResults[sessionId];
}

export function hasRollbackResult(sessionId: string): boolean {
  return sessionId in state.rollbackResults;
}

// ── E78: Validation run queue helpers ──

const DEFAULT_VALIDATION_STEP_KINDS: { kind: ValidationStepKind; nameSuffix: string; detailSuffix: string; initialStatus: ValidationStepStatus }[] = [
  { kind: 'compile_check', nameSuffix: 'Compile Check', detailSuffix: 'Read-only compile status from UE Editor. Desktop does not trigger compile.', initialStatus: 'pending_user_local_validation' },
  { kind: 'pie_placeholder', nameSuffix: 'PIE Smoke Test', detailSuffix: 'Run PIE in UE Editor to verify behavior. Pending local validation.', initialStatus: 'pending_user_local_validation' },
  { kind: 'automation_placeholder', nameSuffix: 'Automation Test', detailSuffix: 'Run Automation tests in UE Editor. Pending local validation.', initialStatus: 'pending_user_local_validation' },
  { kind: 'manual_inspection', nameSuffix: 'Manual Inspection', detailSuffix: 'Visually inspect the changed asset in UE Editor.', initialStatus: 'pending_user_local_validation' },
  { kind: 'rollback_confirmation', nameSuffix: 'Rollback Readiness', detailSuffix: 'Verify rollback snapshot exists before proceeding.', initialStatus: 'pending_user_local_validation' },
  { kind: 'desktop_real_mode_confirmation', nameSuffix: 'Desktop Real-Mode Verification', detailSuffix: 'Run Desktop in real bridge mode against UE Editor to confirm status reflection.', initialStatus: 'pending_user_local_validation' },
];

export function queueValidationRunForSession(sessionId: string): ValidationRunPlan | undefined {
  const session = state.sessions.find(s => s.sessionId === sessionId);
  if (!session) return undefined;

  const existingRunId = session.validationRunId;
  if (existingRunId && state.validationRuns[existingRunId]) {
    return state.validationRuns[existingRunId];
  }

  const execResult = state.executionResults[sessionId];
  const candidate = session.selectedCandidateId
    ? session.fixCandidates.find(c => c.candidateId === session.selectedCandidateId)
    : undefined;

  const now = new Date().toISOString();
  const runId = `validation-${sessionId}-${Date.now()}`;

  const steps = DEFAULT_VALIDATION_STEP_KINDS.map((def, i) => ({
    id: `${runId}-step-${i}`,
    kind: def.kind as ValidationStepKind,
    name: candidate ? `${candidate.title} — ${def.nameSuffix}` : def.nameSuffix,
    status: def.initialStatus as ValidationStepStatus,
    detail: execResult
      ? `Execution outcome: ${execResult.outcome}. ${def.detailSuffix}`
      : def.detailSuffix,
    artifacts: [],
  }));

  const title = candidate
    ? `Validation — ${candidate.title}`
    : `Validation — ${session.targetAssetPath}`;

  const run: ValidationRunPlan = {
    id: runId,
    title,
    description: `Validation run for repair session ${sessionId}. Target: ${session.targetAssetPath}. Execution ${execResult ? (execResult.success ? 'succeeded' : 'failed') : 'not yet executed'}.`,
    steps,
    createdAt: now,
    updatedAt: now,
  };

  const newValidationRuns = { ...state.validationRuns, [runId]: run };
  const newSessions = state.sessions.map(s => {
    if (s.sessionId !== sessionId) return s;
    return { ...s, validationRunId: runId, updatedAt: now };
  });

  state = { ...state, validationRuns: newValidationRuns, sessions: newSessions };
  return run;
}

export function getValidationRuns(): ValidationRunPlan[] {
  return Object.values(state.validationRuns);
}

export function getValidationRun(runId: string): ValidationRunPlan | undefined {
  return state.validationRuns[runId];
}

export function recordValidationStepDecision(
  runId: string,
  stepId: string,
  decision: 'pass' | 'fail' | undefined,
): void {
  const run = state.validationRuns[runId];
  if (!run) return;

  const existingDecisions = state.validationDecisions[runId] ?? {};
  const newDecisions: Record<string, 'pass' | 'fail'> = decision
    ? { ...existingDecisions, [stepId]: decision }
    : (() => {
        const next = { ...existingDecisions };
        delete next[stepId];
        return next;
      })();

  const updatedSteps = run.steps.map(s => {
    if (s.id !== stepId) return s;
    const stepDecision = decision;
    const newStatus: ValidationStepStatus = stepDecision
      ? (stepDecision === 'pass' ? 'manual_passed' : 'manual_failed')
      : s.status;
    return { ...s, status: newStatus };
  });

  state = {
    ...state,
    validationDecisions: { ...state.validationDecisions, [runId]: newDecisions },
    validationRuns: {
      ...state.validationRuns,
      [runId]: { ...run, steps: updatedSteps, updatedAt: new Date().toISOString() },
    },
  };
}

export function getValidationRunDecisions(runId: string): Record<string, 'pass' | 'fail'> {
  return state.validationDecisions[runId] ?? {};
}

// ── E79: Rollback history helpers ──

let e79RollbackCounter = 0;

export function recordRollbackHistory(
  sessionId: string,
  params: {
    rollbackRequestId: string;
    snapshotId?: string;
    targetAssetPath: string;
    candidateId?: string;
    reason: string;
    success: boolean;
    outcome: string;
    details: string;
    originalExecutionId?: string;
  },
): RollbackHistoryRecord {
  e79RollbackCounter++;
  const now = new Date().toISOString();
  const record: RollbackHistoryRecord = {
    recordId: `rollback-${sessionId}-${e79RollbackCounter}-${Date.now()}`,
    sessionId,
    originalExecutionId: params.originalExecutionId,
    rollbackRequestId: params.rollbackRequestId,
    snapshotId: params.snapshotId,
    targetAssetPath: params.targetAssetPath,
    candidateId: params.candidateId,
    reason: params.reason,
    success: params.success,
    outcome: params.outcome,
    details: params.details,
    attemptedAt: now,
    completedAt: now,
    requiresUserLocalValidation: true,
  };

  const existing = state.rollbackHistory[sessionId] ?? [];
  const newHistory: Record<string, RollbackHistoryRecord[]> = {
    ...state.rollbackHistory,
    [sessionId]: [record, ...existing],
  };

  // Update session status based on rollback success
  const newSessions = state.sessions.map(s => {
    if (s.sessionId !== sessionId) return s;
    return {
      ...s,
      rollbackRecordId: record.recordId,
      status: params.success ? 'rolled_back' as RepairSessionStatus : s.status,
      updatedAt: now,
    };
  });

  state = {
    ...state,
    rollbackHistory: newHistory,
    sessions: newSessions,
  };

  return record;
}

export function getRollbackHistory(sessionId?: string): RollbackHistoryRecord[] {
  if (sessionId) {
    return state.rollbackHistory[sessionId] ?? [];
  }
  return Object.values(state.rollbackHistory).flat();
}

export function getLatestRollbackRecord(sessionId: string): RollbackHistoryRecord | undefined {
  const history = state.rollbackHistory[sessionId];
  if (!history || history.length === 0) return undefined;
  return history[0];
}

export function hasRollbackHistory(sessionId: string): boolean {
  return (state.rollbackHistory[sessionId]?.length ?? 0) > 0;
}
