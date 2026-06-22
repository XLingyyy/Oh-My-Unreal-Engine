import type {
  AgentAssetSessionRecord,
  AgentLoopCloseReason,
  AgentLoopState,
  AgentProposalEvent,
  AgentProposalRequest,
  AgentProposalResult,
  AgentProposalStoredRecord,
  AgentSandboxCompileResultEvent,
  AgentSessionErrorRecord,
  AgentSessionErrorEvent,
  AgentSessionScope,
  ApprovePromoteRequest,
  ApprovePromoteResult,
  CancelSessionRequest,
  CancelSessionResult,
  CompileBlueprintRequest,
  CompileIssue,
  CompileStatus,
  DuplicateScratchRequest,
  DiscardSessionRequest,
  DiscardSessionResult,
  ListSessionsResult,
  ReversibleWriteRequest,
  RepairSessionRecord,
  ResumeSessionRequest,
  ResumeSessionResult,
  StartSessionRequest,
  StartSessionResult,
  SubscribeResult,
} from '@omue/shared-protocol';
import { AGENT_PROPOSAL_INHERITED_EVIDENCE_SUMMARY_MAX, isAssetSession, isProjectSession } from '@omue/shared-protocol';
import {
  deleteSession,
  isTerminalAgentLoopState,
  listSessions as listStoredSessions,
  loadSession,
  saveSession,
  scanAndMarkInterrupted,
} from './repair-session-store';
import {
  emitApprovalRequested,
  emitProgress,
  emitProposal,
  emitSandboxCompileResult,
  emitSessionClosed,
  emitSessionError,
} from './agent-loop-events';
import { mockCollectContext, isMockContextAllowed } from './agent-loop-mock-stubs';
import type {
  ProviderAuthorityResolver,
} from './settings/provider-authority';
import {
  requestAgentProposal,
  type RequestAgentProposalCapture,
} from './ai-blueprint-propose-fix-provider';
import { agentBridgeClient } from './agent-bridge-client';
import {
  aggregateProjectSnapshot,
  collectAssetContext,
} from './agent-context-snapshot';
import {
  buildInheritedEvidenceSummary,
  canCallExecutionAction,
  canEnterExecutionState,
  persistSessionErrorBeforeEmit,
  persistTerminalSessionErrorBeforeEmit,
  saveRecordAndEmitProgress,
  validateStartSessionRequest,
} from './agent-session-validation';

const REPAIR_SESSION_SCHEMA_VERSION_VALUE = 'omue.repairSession.v1' as const;
const DEFAULT_MAX_RETRIES = 3;
const COMPILE_IN_PROGRESS_MAX_RETRIES = 5;
const COMPILE_IN_PROGRESS_DELAY_MS = 500;
const COMPILE_STATUS_POLL_MAX_ATTEMPTS = 20;
const COMPILE_STATUS_POLL_DELAY_MS = 500;

type ProposalFeedbackKind =
  | 'validation_failed'
  | 'preflight_failed'
  | 'compile_failed';

function nowIso(): string {
  return new Date().toISOString();
}

function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function cloneJsonValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createSessionRecord(
  request: StartSessionRequest,
): RepairSessionRecord {
  const timestamp = nowIso();
  const sessionId = createId(request.scope === 'asset' ? 'repair' : 'project');

  if (request.scope === 'asset') {
    return {
      schemaVersion: REPAIR_SESSION_SCHEMA_VERSION_VALUE,
      sessionId,
      scope: 'asset',
      userIntent: request.userIntent,
      targetAssetPath: request.targetAssetPath,
      ...(request.parentSessionId ? { parentSessionId: request.parentSessionId } : {}),
      ...(request.inheritedEvidenceSummary ? { inheritedEvidenceSummary: request.inheritedEvidenceSummary } : {}),
      createdAt: timestamp,
      updatedAt: timestamp,
      currentState: 'draft',
      retryCount: 0,
      maxRetries: DEFAULT_MAX_RETRIES,
      proposals: [],
    } satisfies AgentAssetSessionRecord;
  }

  return {
    schemaVersion: REPAIR_SESSION_SCHEMA_VERSION_VALUE,
    sessionId,
    scope: 'project',
    userIntent: request.userIntent,
    createdAt: timestamp,
    updatedAt: timestamp,
    currentState: 'draft',
    retryCount: 0,
    maxRetries: DEFAULT_MAX_RETRIES,
    proposals: [],
  };
}

export class AgentLoopRuntime {
  private readonly assetLocks = new Map<string, string>();
  private providerAuthorityResolver: ProviderAuthorityResolver = async () => ({
    status: 'missing_provider',
    message: 'Provider authority has not been initialized.',
  });

  setProviderAuthorityResolver(resolver: ProviderAuthorityResolver): void {
    this.providerAuthorityResolver = resolver;
  }

  private async waitForBridgeIdle(): Promise<{ ready: true } | { ready: false; reason: string }> {
    for (let attempt = 0; attempt < COMPILE_STATUS_POLL_MAX_ATTEMPTS; attempt += 1) {
      let status: CompileStatus;
      try {
        status = await agentBridgeClient.getCompileStatus();
      } catch {
        return { ready: true };
      }

      if (!status.isCompiling) {
        return { ready: true };
      }

      await delay(COMPILE_STATUS_POLL_DELAY_MS);
    }

    return {
      ready: false,
      reason: `Bridge reports isCompiling=true for more than ${
        (COMPILE_STATUS_POLL_MAX_ATTEMPTS * COMPILE_STATUS_POLL_DELAY_MS) / 1000
      } seconds. UE Editor may be running a long compile.`,
    };
  }

  async startSession(rawRequest: unknown): Promise<StartSessionResult> {
    const validated = validateStartSessionRequest(rawRequest);
    if (!validated.ok) {
      return { ok: false, errorCode: 'invalid_request', message: validated.message };
    }
    const request = validated.request;

    const record = createSessionRecord(request);

    if (isAssetSession(record)) {
      const existingSessionId = this.assetLocks.get(record.targetAssetPath);
      if (existingSessionId) {
        return {
          ok: false,
          errorCode: 'asset_locked',
          message: 'A repair session is already active for this asset.',
          existingSessionId,
        };
      }
      if (record.parentSessionId) {
        const parent = await loadSession(record.parentSessionId);
        if (!parent) {
          return {
            ok: false,
            errorCode: 'invalid_request',
            message: 'parentSessionId references a session that does not exist.',
          };
        }
        if (!isProjectSession(parent)) {
          return {
            ok: false,
            errorCode: 'invalid_request',
            message: 'parentSessionId must reference a project scope session.',
          };
        }
        record.userIntent = parent.userIntent;
        const inheritedSummary = buildInheritedEvidenceSummary(parent);
        if (inheritedSummary) {
          record.inheritedEvidenceSummary = inheritedSummary;
        }
      }
      this.assetLocks.set(record.targetAssetPath, record.sessionId);
    }

    const saved = await saveSession(record);
    if (!saved.ok) {
      if (isAssetSession(record)) {
        this.releaseLock(record);
      }
      return saved;
    }

    void this.runSession(record).catch((err) => {
      void this.failSession(
        record.sessionId,
        'agent_loop_error',
        err instanceof Error ? err.message : 'Agent loop failed.',
        record.scope,
      );
    });

    return { ok: true, sessionId: record.sessionId };
  }

  async cancelSession(request: CancelSessionRequest): Promise<CancelSessionResult> {
    if (!isNonEmptyString(request?.sessionId)) {
      return {
        ok: false,
        errorCode: 'invalid_request',
        message: 'sessionId is required.',
      };
    }

    const record = await loadSession(request.sessionId);
    if (!record) {
      return { ok: false, errorCode: 'not_found', message: 'Repair session not found.' };
    }

    const closed = await this.closeSession(record, 'cancelled', 'Session cancelled by user.');
    return closed.ok ? { ok: true, sessionId: record.sessionId } : closed;
  }

  async approvePromote(request: ApprovePromoteRequest): Promise<ApprovePromoteResult> {
    if (!isNonEmptyString(request?.sessionId) || !isNonEmptyString(request?.approvalId)) {
      return {
        ok: false,
        errorCode: 'invalid_request',
        message: 'sessionId and approvalId are required.',
      };
    }

    const record = await loadSession(request.sessionId);
    if (!record) {
      return { ok: false, errorCode: 'not_found', message: 'Repair session not found.' };
    }

    if (!canCallExecutionAction(record.scope, 'approve')) {
      const error = await this.emitAndPersistError(
        record,
        'scope_execution_forbidden',
        'Project scope sessions cannot approve Promote actions.',
        false,
      );
      return { ok: false, errorCode: 'scope_execution_forbidden', message: error.message };
    }

    if (!isAssetSession(record)) {
      return { ok: false, errorCode: 'scope_execution_forbidden', message: 'Asset scope is required.' };
    }

    if (record.currentState !== 'awaiting_approval' || record.approval?.approvalId !== request.approvalId) {
      return {
        ok: false,
        errorCode: 'not_awaiting_approval',
        message: 'Repair session is not awaiting this approval.',
      };
    }

    record.approval = {
      ...record.approval,
      approvedAt: nowIso(),
      decision: 'approved',
      note: request.note,
    };
    const promoted = await this.transition(record, 'promoting');
    if (!promoted.ok) return promoted;

    const latestProposal = this.getLastProposal(record);
    const originalTypedPayload = latestProposal?.typedPayload;
    if (!originalTypedPayload) {
      await this.failSession(
        record.sessionId,
        'promote_failed',
        'Cannot promote without a typed fix payload.',
        record.scope,
      );
      return { ok: false, errorCode: 'store_error', message: 'Promote failed.' };
    }

    const writeRequest: ReversibleWriteRequest = {
      targetAssetPath: record.targetAssetPath,
      description: `Promote fix to original asset: ${record.targetAssetPath}`,
      operationKind: 'omue.fixCandidate.scratchFix',
      approval: this.createApproval(record),
      requireSnapshot: true,
      typedPayload: originalTypedPayload,
    };

    let applyResult;
    try {
      applyResult = await agentBridgeClient.writeReversible(writeRequest);
    } catch (error) {
      await this.failSession(record.sessionId, 'promote_failed', getErrorMessage(error), record.scope);
      return { ok: false, errorCode: 'store_error', message: 'Promote failed.' };
    }

    if (!applyResult.success) {
      await this.failSession(record.sessionId, 'promote_failed', applyResult.message, record.scope);
      return { ok: false, errorCode: 'store_error', message: 'Promote failed.' };
    }

    record.promote = {
      applyResultJson: JSON.stringify(applyResult),
      promotedAt: nowIso(),
    };

    const closed = await this.closeSession(record, 'done');
    return closed.ok ? { ok: true, sessionId: record.sessionId } : closed;
  }

  async rejectPromote(request: { sessionId: string; reason?: string }): Promise<CancelSessionResult> {
    if (!isNonEmptyString(request?.sessionId)) {
      return {
        ok: false,
        errorCode: 'invalid_request',
        message: 'sessionId is required.',
      };
    }

    const record = await loadSession(request.sessionId);
    if (!record) {
      return { ok: false, errorCode: 'not_found', message: 'Repair session not found.' };
    }

    if (!canCallExecutionAction(record.scope, 'reject')) {
      const error = await this.emitAndPersistError(
        record,
        'scope_execution_forbidden',
        'Project scope sessions cannot reject Promote actions.',
        false,
      );
      return { ok: false, errorCode: 'invalid_request', message: error.message };
    }

    const closed = await this.closeSession(
      record,
      'rejected',
      request.reason ?? 'Promotion rejected by user.',
    );
    return closed.ok ? { ok: true, sessionId: record.sessionId } : closed;
  }

  async resumeSession(request: ResumeSessionRequest): Promise<ResumeSessionResult> {
    if (!isNonEmptyString(request?.sessionId)) {
      return {
        ok: false,
        errorCode: 'invalid_request',
        message: 'sessionId is required.',
      };
    }

    const record = await loadSession(request.sessionId);
    if (!record) {
      return { ok: false, errorCode: 'not_found', message: 'Repair session not found.' };
    }
    if (isTerminalAgentLoopState(record.currentState)) {
      return {
        ok: false,
        errorCode: 'terminal_state',
        message: 'Terminal repair sessions cannot be resumed.',
      };
    }

    if (isAssetSession(record)) {
      const existingSessionId = this.assetLocks.get(record.targetAssetPath);
      if (existingSessionId && existingSessionId !== record.sessionId) {
        return {
          ok: false,
          errorCode: 'asset_locked',
          message: 'A repair session is already active for this asset.',
          existingSessionId,
        };
      }
      this.assetLocks.set(record.targetAssetPath, record.sessionId);
    }

    if (record.currentState === 'awaiting_approval' && isAssetSession(record)) {
      this.emitApproval(record);
      return { ok: true, sessionId: record.sessionId, currentState: record.currentState };
    }

    record.currentState = 'proposing';
    record.updatedAt = nowIso();
    const saved = await saveSession(record);
    if (!saved.ok) {
      if (isAssetSession(record)) {
        this.releaseLock(record);
      }
      return saved;
    }

    void this.runSession(record, {
      skipDiagnosing: Boolean(record.contextSnapshot),
      feedbackKind: 'compile_failed',
      feedbackReason: 'Resumed after an interrupted repair session.',
    }).catch((err) => {
      void this.failSession(
        record.sessionId,
        'agent_loop_error',
        err instanceof Error ? err.message : 'Agent loop resume failed.',
        record.scope,
      );
    });

    return { ok: true, sessionId: record.sessionId, currentState: record.currentState };
  }

  async discardSession(request: DiscardSessionRequest): Promise<DiscardSessionResult> {
    if (!isNonEmptyString(request?.sessionId)) {
      return {
        ok: false,
        errorCode: 'invalid_request',
        message: 'sessionId is required.',
      };
    }

    const record = await loadSession(request.sessionId);
    if (!record) {
      return { ok: false, errorCode: 'not_found', message: 'Repair session not found.' };
    }

    if (isAssetSession(record)) {
      this.releaseLock(record);
    }
    await deleteSession(record.sessionId);
    emitSessionClosed({ sessionId: record.sessionId, closeReason: 'cancelled', closedAt: nowIso() });
    return { ok: true, sessionId: record.sessionId };
  }

  async listSessions(): Promise<ListSessionsResult> {
    try {
      return { ok: true, sessions: await listStoredSessions() };
    } catch (err) {
      return {
        ok: false,
        errorCode: 'store_error',
        message: err instanceof Error ? err.message : 'Failed to list repair sessions.',
      };
    }
  }

  async subscribe(): Promise<SubscribeResult> {
    return {
      ok: true,
      message: 'Agent event subscription is exposed through preload on* callbacks.',
    };
  }

  async scanAndMarkInterrupted(): Promise<void> {
    try {
      await scanAndMarkInterrupted();
    } catch (err) {
      emitSessionError({
        sessionId: 'startup-scan',
        errorId: createId('error'),
        errorCode: 'store_error',
        message: err instanceof Error ? err.message : 'Failed to scan repair sessions.',
        scope: 'project',
        recoverable: true,
        createdAt: nowIso(),
        details: { phase: 'startup_scan', persistence: 'not_persisted' },
      });
    }
  }

  private async runSession(
    record: RepairSessionRecord,
    options?: {
      skipDiagnosing?: boolean;
      feedbackKind?: ProposalFeedbackKind;
      feedbackReason?: string;
    },
  ): Promise<void> {
    if (isProjectSession(record)) {
      await this.runProjectSession(record, options);
      return;
    }
    await this.runAssetSession(record, options);
  }

  private async runProjectSession(
    record: RepairSessionRecord,
    _options?: {
      skipDiagnosing?: boolean;
      feedbackKind?: ProposalFeedbackKind;
      feedbackReason?: string;
    },
  ): Promise<void> {
    if (!canEnterExecutionState(record.scope, 'diagnosing')) return;
    if (!(await this.transition(record, 'diagnosing')).ok) return;

    const snapshotResult = await aggregateProjectSnapshot(agentBridgeClient, 'unknown');
    if (!snapshotResult.ok) {
      const ctxError = await this.emitAndPersistError(
        record,
        snapshotResult.errorCode,
        snapshotResult.message,
        true,
        { phase: 'project_diagnosis', endpoints: snapshotResult.provenance.endpointsCalled },
      );
      await this.closeSession(record, 'escalated', ctxError.message);
      return;
    }

    const projectSnapshot = snapshotResult.snapshot;

    if (!(await this.transition(record, 'proposing')).ok) return;

    const compileIssues: CompileIssue[] = projectSnapshot.compileStatus.lastErrors;

    const request: AgentProposalRequest = {
      scope: 'project',
      userIntent: record.userIntent,
      ...(compileIssues.length > 0 ? { compileIssues } : {}),
      graphDetailJson: JSON.stringify(projectSnapshot),
    };
    const authority = await this.providerAuthorityResolver();
    if (authority.status !== 'ready' || !authority.config) {
      await this.failSession(record.sessionId, 'no_provider_config', `AI provider not configured: ${authority.status}`, record.scope);
      return;
    }

    const capture: RequestAgentProposalCapture = {};
    const proposalResult = await requestAgentProposal(request, authority.config, capture);
    if (!proposalResult.ok) {
      await this.handleProjectProposalFailure(record, proposalResult, capture);
      return;
    }

    const proposal = proposalResult.proposal;
    if (proposal.kind === 'fix') {
      const error = await this.emitAndPersistError(
        record,
        'scope_execution_forbidden',
        'Project scope session received a fix proposal; closing as escalated.',
        false,
      );
      record.lastProposalFailure = {
        errorCode: 'scope_execution_forbidden',
        message: error.message,
        rawLlmOutput: capture.rawText,
      };
      await this.closeSession(record, 'escalated', 'Project session received a fix proposal; closing.');
      return;
    }

    const stored: AgentProposalStoredRecord =
      proposal.kind === 'diagnosis'
        ? {
            proposalId: createId('proposal'),
            proposedAt: nowIso(),
            kind: 'diagnosis',
            summary: proposal.summary,
            evidenceSummary: proposal.evidenceSummary,
            confidence: proposal.confidence,
            risk: proposal.risk,
            candidateAssets: proposal.candidateAssets,
            suggestedNextSteps: proposal.suggestedNextSteps,
            typedPayload: null,
          }
        : {
            proposalId: createId('proposal'),
            proposedAt: nowIso(),
            kind: 'escalation',
            escalationReason: proposal.reason,
            suggestedHumanAction: proposal.suggestedHumanAction,
            typedPayload: null,
          };

    record.proposals.push(stored);
    const saveResult = await this.saveAndEmitProgress(record);
    if (!saveResult.ok) {
      await this.failOnSaveError(record, saveResult);
      return;
    }

    const event: AgentProposalEvent = {
      sessionId: record.sessionId,
      proposalId: stored.proposalId,
      proposedAt: stored.proposedAt,
      kind: stored.kind,
      proposal: proposal.kind === 'diagnosis' ? proposal : {
        kind: 'escalation',
        reason: proposal.reason,
        suggestedHumanAction: proposal.suggestedHumanAction,
      },
    };
    emitProposal(event);

    if (proposal.kind === 'escalation') {
      await this.closeSession(record, 'escalated', proposal.reason);
      return;
    }

    await this.closeSession(record, 'done', 'Project diagnosis complete.');
  }

  private async handleProjectProposalFailure(
    record: RepairSessionRecord,
    result: Extract<AgentProposalResult, { ok: false }>,
    capture: RequestAgentProposalCapture,
  ): Promise<void> {
    record.lastProposalFailure = {
      errorCode: result.errorCode,
      message: result.message,
      rawLlmOutput: capture.rawText,
    };
    const saveResult = await this.saveAndEmitProgress(record);
    if (!saveResult.ok) {
      await this.failOnSaveError(record, saveResult);
      return;
    }
    if (result.errorCode === 'llm_call_failed' || result.errorCode === 'timeout') {
      record.retryCount += 1;
      if (record.retryCount >= record.maxRetries) {
        await this.closeSession(record, 'escalated', result.message);
        return;
      }
      await this.runProjectSession(record);
      return;
    }
    await this.closeSession(record, 'escalated', result.message);
  }

  private async collectRealAssetContext(
    record: AgentAssetSessionRecord,
  ): Promise<
    | {
        compileIssues: CompileIssue[];
        blueprintSummary: import('@omue/shared-protocol').BlueprintAssetSummary;
        graphDetailJson?: string;
        messageLogJson?: string;
      }
    | null
  > {
    const result = await collectAssetContext(
      agentBridgeClient,
      record.targetAssetPath,
      'unknown',
    );
    if (!result.ok) {
      await this.emitAndPersistError(
        record,
        result.errorCode,
        result.message,
        result.recoverable,
        { phase: 'asset_diagnosis', targetAssetPath: record.targetAssetPath },
      );
      await this.closeSession(record, 'escalated', result.message);
      return null;
    }
    return result.context;
  }

  private async runAssetSession(
    record: AgentAssetSessionRecord,
    options?: {
      skipDiagnosing?: boolean;
      feedbackKind?: ProposalFeedbackKind;
      feedbackReason?: string;
    },
  ): Promise<void> {
    if (!options?.skipDiagnosing) {
      if (!canEnterExecutionState(record.scope, 'diagnosing')) return;
      if (!(await this.transition(record, 'diagnosing')).ok) return;
      const context = isMockContextAllowed()
        ? await mockCollectContext(record.targetAssetPath)
        : await this.collectRealAssetContext(record);
      if (context === null) return;
      record.contextSnapshot = {
        ...context,
        collectedAt: nowIso(),
      };
      const saveResult = await this.saveAndEmitProgress(record);
      if (!saveResult.ok) {
        await this.failOnSaveError(record, saveResult);
        return;
      }
    }

    if (await this.wasCancelled(record)) return;

    if (!canEnterExecutionState(record.scope, 'proposing')) return;
    if (!(await this.transition(record, 'proposing')).ok) return;
    const feedback = options?.feedbackReason
      ? { kind: options.feedbackKind ?? 'validation_failed', reason: options.feedbackReason }
      : undefined;
    const request = this.buildProposalRequest(record, feedback?.reason);
    const authority = await this.providerAuthorityResolver();
    if (authority.status !== 'ready' || !authority.config) {
      await this.failSession(record.sessionId, 'no_provider_config', `AI provider not configured: ${authority.status}`, record.scope);
      return;
    }

    const capture: RequestAgentProposalCapture = {};
    const proposalResult = await requestAgentProposal(request, authority.config, capture);
    if (!proposalResult.ok) {
      record.lastProposalFailure = {
        errorCode: proposalResult.errorCode,
        message: proposalResult.message,
        rawLlmOutput: capture.rawText,
      };
      if (proposalResult.errorCode === 'llm_call_failed' || proposalResult.errorCode === 'timeout') {
        await this.retryOrEscalate(record, 'validation_failed', proposalResult.message);
        return;
      }

      if (
        proposalResult.errorCode === 'llm_output_schema_invalid'
        || proposalResult.errorCode === 'llm_output_operation_not_supported'
        || proposalResult.errorCode === 'llm_output_target_mismatch'
      ) {
        await this.closeSession(record, 'escalated', proposalResult.message);
        return;
      }

      if (proposalResult.errorCode === 'scope_execution_forbidden') {
        await this.emitAndPersistError(
          record,
          'scope_execution_forbidden',
          'LLM produced an out-of-scope proposal; closing as escalated.',
          false,
        );
        await this.closeSession(record, 'escalated', proposalResult.message);
        return;
      }

      await this.failSession(record.sessionId, proposalResult.errorCode, proposalResult.message, record.scope);
      return;
    }

    const proposalId = createId('proposal');
    const proposalRecord: AgentProposalStoredRecord =
      proposalResult.proposal.kind === 'fix'
        ? {
            proposalId,
            proposedAt: nowIso(),
            kind: 'fix',
            summary: proposalResult.proposal.summary,
            diagnosisSummary: proposalResult.proposal.diagnosisSummary,
            evidenceSummary: proposalResult.proposal.evidenceSummary,
            confidence: proposalResult.proposal.confidence,
            risk: proposalResult.proposal.risk,
            typedPayload: proposalResult.proposal.typedPayload,
            feedback,
          }
        : proposalResult.proposal.kind === 'escalation'
          ? {
              proposalId,
              proposedAt: nowIso(),
              kind: 'escalation',
              escalationReason: proposalResult.proposal.reason,
              suggestedHumanAction: proposalResult.proposal.suggestedHumanAction,
              typedPayload: null,
              feedback,
            }
          : {
              proposalId,
              proposedAt: nowIso(),
              kind: 'diagnosis',
              summary: proposalResult.proposal.summary,
              evidenceSummary: proposalResult.proposal.evidenceSummary,
              confidence: proposalResult.proposal.confidence,
              risk: proposalResult.proposal.risk,
              candidateAssets: proposalResult.proposal.candidateAssets,
              suggestedNextSteps: proposalResult.proposal.suggestedNextSteps,
              typedPayload: null,
              feedback,
            };
    record.proposals.push(proposalRecord);
    {
      const saveResult = await this.saveAndEmitProgress(record);
      if (!saveResult.ok) {
        await this.failOnSaveError(record, saveResult);
        return;
      }
    }

    const eventProposal: AgentProposalEvent['proposal'] =
      proposalResult.proposal.kind === 'fix'
        ? {
            kind: 'fix',
            summary: proposalResult.proposal.summary,
            diagnosisSummary: proposalResult.proposal.diagnosisSummary,
            evidenceSummary: proposalResult.proposal.evidenceSummary,
            confidence: proposalResult.proposal.confidence,
            risk: proposalResult.proposal.risk,
            typedPayload: proposalResult.proposal.typedPayload,
          }
        : proposalResult.proposal.kind === 'escalation'
          ? {
              kind: 'escalation',
              reason: proposalResult.proposal.reason,
              suggestedHumanAction: proposalResult.proposal.suggestedHumanAction,
            }
          : {
              kind: 'diagnosis',
              summary: proposalResult.proposal.summary,
              evidenceSummary: proposalResult.proposal.evidenceSummary,
              confidence: proposalResult.proposal.confidence,
              risk: proposalResult.proposal.risk,
              candidateAssets: proposalResult.proposal.candidateAssets,
              suggestedNextSteps: proposalResult.proposal.suggestedNextSteps,
            };
    emitProposal({
      sessionId: record.sessionId,
      proposalId,
      proposedAt: proposalRecord.proposedAt,
      kind: proposalRecord.kind,
      proposal: eventProposal,
      typedPayloadJson: proposalRecord.typedPayload
        ? JSON.stringify(proposalRecord.typedPayload)
        : undefined,
      escalationReason: proposalRecord.escalationReason,
    });

    if (proposalResult.proposal.kind === 'escalation') {
      await this.closeSession(record, 'escalated', proposalResult.proposal.reason);
      return;
    }

    if (proposalResult.proposal.kind === 'diagnosis') {
      await this.emitAndPersistError(
        record,
        'scope_execution_forbidden',
        'Asset session received a project-style diagnosis; closing as escalated.',
        false,
      );
      await this.closeSession(record, 'escalated', 'Asset session received a project-style diagnosis.');
      return;
    }

    if (!canEnterExecutionState(record.scope, 'payload_validating')) return;
    if (!(await this.transition(record, 'payload_validating')).ok) return;
    if (!proposalResult.proposal.typedPayload) {
      await this.retryOrEscalate(record, 'validation_failed', 'Mock proposal did not include a typed payload.');
      return;
    }

    if (!canEnterExecutionState(record.scope, 'preflighting')) return;
    if (!(await this.transition(record, 'preflighting')).ok) return;
    if (await this.wasCancelled(record)) return;

    if (!canEnterExecutionState(record.scope, 'sandbox_duplicating')) return;
    if (!(await this.transition(record, 'sandbox_duplicating')).ok) return;
    const sandboxPath = this.deriveSandboxPath(record.targetAssetPath);
    const duplicateRequest: DuplicateScratchRequest = {
      sourceAssetPath: record.targetAssetPath,
      targetScratchPath: sandboxPath,
      approval: this.createApproval(record),
    };

    let duplicateResult;
    try {
      duplicateResult = await agentBridgeClient.duplicateScratch(duplicateRequest);
    } catch (error) {
      await this.failSession(record.sessionId, 'duplicate_failed', getErrorMessage(error), record.scope);
      return;
    }

    if (!duplicateResult.success) {
      await this.failSession(record.sessionId, 'duplicate_failed', duplicateResult.message, record.scope);
      return;
    }

    record.sandbox = {
      copyAssetPath: duplicateResult.scratchAssetPath,
      duplicatedAt: nowIso(),
      snapshotId: duplicateResult.snapshotId,
      cleanable: true,
    };
    {
      const saveResult = await this.saveAndEmitProgress(record);
      if (!saveResult.ok) {
        await this.failOnSaveError(record, saveResult);
        return;
      }
    }

    if (!canEnterExecutionState(record.scope, 'sandbox_applying')) return;
    if (!(await this.transition(record, 'sandbox_applying')).ok) return;
    const lastProposal = this.getLastProposal(record);
    const latestTypedPayload = lastProposal?.typedPayload;
    if (!latestTypedPayload) {
      await this.retryOrEscalate(
        record,
        'validation_failed',
        'Proposal typed payload missing before sandbox apply.',
      );
      return;
    }

    const sandboxTypedPayload = cloneJsonValue(latestTypedPayload);
    sandboxTypedPayload.payload.targetAssetPath = record.sandbox.copyAssetPath;

    const writeRequest: ReversibleWriteRequest = {
      targetAssetPath: record.sandbox.copyAssetPath,
      description: `Apply fix to sandbox: ${record.sandbox.copyAssetPath}`,
      operationKind: 'omue.fixCandidate.scratchFix',
      approval: this.createApproval(record),
      requireSnapshot: true,
      typedPayload: sandboxTypedPayload,
    };

    let applyResult;
    try {
      applyResult = await agentBridgeClient.sandboxApply(writeRequest);
    } catch (error) {
      await this.failSession(record.sessionId, 'apply_failed', getErrorMessage(error), record.scope);
      return;
    }

    if (!applyResult.success) {
      await this.failSession(record.sessionId, 'apply_failed', applyResult.message, record.scope);
      return;
    }

    record.sandbox = {
      ...record.sandbox,
      applyResultJson: JSON.stringify(applyResult),
    };
    {
      const saveResult = await this.saveAndEmitProgress(record);
      if (!saveResult.ok) {
        await this.failOnSaveError(record, saveResult);
        return;
      }
    }

    if (!canEnterExecutionState(record.scope, 'sandbox_compiling')) return;
    if (!(await this.transition(record, 'sandbox_compiling')).ok) return;
    const compileRequest: CompileBlueprintRequest = {
      assetPath: record.sandbox.copyAssetPath,
      approval: this.createApproval(record),
    };

    const idleResult = await this.waitForBridgeIdle();
    if (!idleResult.ready) {
      await this.failSession(
        record.sessionId,
        'compile_failed',
        `Sandbox compile refused: ${idleResult.reason}`,
        record.scope,
      );
      return;
    }

    let compileResult;
    let compileInProgressRetries = 0;

    while (true) {
      try {
        compileResult = await agentBridgeClient.compileBlueprint(compileRequest);
      } catch (error) {
        await this.failSession(record.sessionId, 'compile_failed', getErrorMessage(error), record.scope);
        return;
      }

      const isCompileInProgress = !compileResult.success
        && compileResult.refusalReason === 'compile_in_progress';

      if (!isCompileInProgress) {
        break;
      }

      compileInProgressRetries += 1;
      if (compileInProgressRetries >= COMPILE_IN_PROGRESS_MAX_RETRIES) {
        await this.failSession(
          record.sessionId,
          'compile_failed',
          `Sandbox compile refused: another Blueprint compile is still in progress after ${COMPILE_IN_PROGRESS_MAX_RETRIES} retries (${COMPILE_IN_PROGRESS_DELAY_MS}ms apart). UE Editor may be busy compiling other assets.`,
          record.scope,
        );
        return;
      }

      await delay(COMPILE_IN_PROGRESS_DELAY_MS);
    }

    record.sandbox = {
      ...record.sandbox,
      compileResultJson: JSON.stringify(compileResult),
    };
    {
      const saveResult = await this.saveAndEmitProgress(record);
      if (!saveResult.ok) {
        await this.failOnSaveError(record, saveResult);
        return;
      }
    }

    const compileEvent: AgentSandboxCompileResultEvent = {
      sessionId: record.sessionId,
      compileResultId: createId('compile'),
      completedAt: nowIso(),
      success: compileResult.success,
      errorsJson: JSON.stringify(compileResult.errors),
    };
    emitSandboxCompileResult(compileEvent);

    if (!compileResult.success) {
      const errorMessages = compileResult.errors
        .map((issue) => `${issue.code}: ${issue.message}`)
        .join('; ');
      await this.retryOrEscalate(
        record,
        'compile_failed',
        errorMessages.length > 0 ? `Sandbox compile failed: ${errorMessages}` : compileResult.message,
      );
      return;
    }

    const approvalId = createId('approval');
    record.approval = {
      requestedAt: nowIso(),
      approvalId,
    };
    if (!canEnterExecutionState(record.scope, 'awaiting_approval')) return;
    if (!(await this.transition(record, 'awaiting_approval')).ok) return;
    this.emitApproval(record);
  }

  private buildProposalRequest(record: AgentAssetSessionRecord, feedback?: string): AgentProposalRequest {
    const request: AgentProposalRequest = {
      scope: 'asset',
      userIntent: record.userIntent,
      targetAssetPath: record.targetAssetPath,
      compileIssues: record.contextSnapshot?.compileIssues ?? [],
      blueprintSummary: record.contextSnapshot?.blueprintSummary ?? {
        assetPath: record.targetAssetPath,
        displayName: record.targetAssetPath.split('/').pop() ?? record.targetAssetPath,
        assetClass: 'Blueprint',
        eligibility: 'unknown',
        dirtyState: 'clean',
        source: 'real_readonly_bridge',
      },
      graphDetailJson: record.contextSnapshot?.graphDetailJson,
      messageLogJson: record.contextSnapshot?.messageLogJson,
      previousAttempts: record.proposals.map((proposal) => ({
        proposalId: proposal.proposalId,
        feedback: proposal.feedback?.reason ?? proposal.escalationReason ?? '',
      })),
      feedback,
    };
    if (record.parentSessionId) {
      request.parentSessionId = record.parentSessionId;
    }
    if (record.inheritedEvidenceSummary) {
      request.inheritedEvidenceSummary = record.inheritedEvidenceSummary.length
        > AGENT_PROPOSAL_INHERITED_EVIDENCE_SUMMARY_MAX
        ? record.inheritedEvidenceSummary.slice(0, AGENT_PROPOSAL_INHERITED_EVIDENCE_SUMMARY_MAX)
        : record.inheritedEvidenceSummary;
    }
    return request;
  }

  private async retryOrEscalate(
    record: AgentAssetSessionRecord,
    kind: ProposalFeedbackKind,
    reason: string,
  ): Promise<void> {
    record.retryCount += 1;
    const lastProposal = record.proposals[record.proposals.length - 1];
    if (lastProposal) {
      lastProposal.feedback = { kind, reason };
    }

    if (record.retryCount >= record.maxRetries) {
      await this.closeSession(record, 'escalated', reason);
      return;
    }

    await this.runAssetSession(record, {
      skipDiagnosing: true,
      feedbackKind: kind,
      feedbackReason: reason,
    });
  }

  private async transition(
    record: RepairSessionRecord,
    state: AgentLoopState,
  ): Promise<CancelSessionResult> {
    if (!canEnterExecutionState(record.scope, state)) {
      const error = await this.emitAndPersistError(
        record,
        'scope_execution_forbidden',
        `Scope "${record.scope}" cannot enter state "${state}".`,
        false,
        undefined,
        { state },
      );
      return { ok: false, errorCode: 'invalid_request', message: error.message };
    }
    record.currentState = state;
    return this.saveAndEmitProgress(record);
  }

  private async saveAndEmitProgress(record: RepairSessionRecord): Promise<CancelSessionResult> {
    const result = await saveRecordAndEmitProgress(record, {
      save: saveSession,
      emitProgress,
      emitError: emitSessionError,
      now: nowIso,
      createErrorId: () => createId('error'),
    });
    return result.ok
      ? { ok: true, sessionId: record.sessionId }
      : result;
  }

  private async closeSession(
    record: RepairSessionRecord,
    closeReason: AgentLoopCloseReason,
    failureReason?: string,
  ): Promise<CancelSessionResult> {
    record.currentState =
      closeReason === 'done'
        ? 'done'
        : closeReason === 'escalated'
          ? 'escalated_done'
          : 'closed';
    record.closedAt = nowIso();
    record.closeReason = closeReason;
    record.failureReason = failureReason ?? record.failureReason;
    const saved = await this.saveAndEmitProgress(record);
    if (!saved.ok) return saved;

    if (isAssetSession(record)) {
      this.releaseLock(record);
    }
    emitSessionClosed({ sessionId: record.sessionId, closeReason, closedAt: record.closedAt ?? nowIso() });
    return { ok: true, sessionId: record.sessionId };
  }

  private buildErrorRecord(
    record: RepairSessionRecord,
    errorCode: string,
    message: string,
    recoverable: boolean,
    details?: unknown,
  ): AgentSessionErrorRecord {
    const error: AgentSessionErrorRecord = {
      errorId: createId('error'),
      sessionId: record.sessionId,
      scope: record.scope,
      errorCode,
      message,
      recoverable,
      createdAt: nowIso(),
    };
    if (details !== undefined) {
      error.details = details;
    }
    return error;
  }

  private async emitAndPersistError(
    record: RepairSessionRecord,
    errorCode: string,
    message: string,
    recoverable: boolean,
    details?: unknown,
    context?: { state?: AgentLoopState; phase?: string },
  ): Promise<AgentSessionErrorRecord> {
    const error: AgentSessionErrorRecord = {
      errorId: createId('error'),
      sessionId: record.sessionId,
      scope: record.scope,
      errorCode,
      message,
      recoverable,
      createdAt: nowIso(),
      ...(details !== undefined ? { details } : {}),
      ...(context?.state || context?.phase
        ? { context: { state: context.state, phase: context.phase } }
        : {}),
    };
    await persistSessionErrorBeforeEmit(record, error, {
      save: saveSession,
      emitError: emitSessionError,
      now: nowIso,
      createErrorId: () => createId('error'),
    });
    return error;
  }

  private async failSession(
    sessionId: string,
    errorCode: string,
    message: string,
    scope: AgentSessionScope,
  ): Promise<void> {
    const record = await loadSession(sessionId);
    if (!record) {
      emitSessionError({
        sessionId,
        errorId: createId('error'),
        errorCode,
        message,
        scope,
        recoverable: true,
        createdAt: nowIso(),
        details: { persistence: 'session_not_found' },
      });
      return;
    }

    const error: AgentSessionErrorEvent = {
      sessionId,
      errorId: createId('error'),
      errorCode,
      message,
      scope: record.scope,
      recoverable: true,
      createdAt: nowIso(),
    };
    const saved = await persistTerminalSessionErrorBeforeEmit(
      record,
      error,
      'escalated',
      message,
      {
        save: saveSession,
        emitProgress,
        emitError: emitSessionError,
        emitClosed: emitSessionClosed,
        now: nowIso,
        createErrorId: () => createId('error'),
      },
    );
    if (saved.ok && isAssetSession(record)) {
      this.releaseLock(record);
    }
  }

  private async failOnSaveError(
    record: RepairSessionRecord,
    result: { ok: false; errorCode: string; message: string },
  ): Promise<void> {
    // saveRecordAndEmitProgress already emitted a factual, non-persisted fallback.
    // A second save attempt would repeat the same storage failure and risk a loop.
    void record;
    void result;
  }

  private releaseLock(record: AgentAssetSessionRecord): void {
    const existingSessionId = this.assetLocks.get(record.targetAssetPath);
    if (existingSessionId === record.sessionId) {
      this.assetLocks.delete(record.targetAssetPath);
    }
  }

  private emitApproval(record: AgentAssetSessionRecord): void {
    const approvalId = record.approval?.approvalId;
    if (!approvalId) return;
    const lastProposal = this.getLastProposal(record);
    const typedPayload = lastProposal?.typedPayload;
    const diffPreview = {
      mode: 'real',
      targetAssetPath: record.targetAssetPath,
      sandboxAssetPath: record.sandbox?.copyAssetPath,
      operationKind: typedPayload?.payload.operationKind,
      beforeState: typedPayload?.payload.beforeState,
      afterState: typedPayload?.payload.afterState,
      display: typedPayload?.payload.display,
    };

    emitApprovalRequested({
      sessionId: record.sessionId,
      approvalId,
      requestedAt: record.approval?.requestedAt ?? nowIso(),
      sandboxCompileResultJson: record.sandbox?.compileResultJson,
      diffPreviewJson: JSON.stringify(diffPreview),
    });
  }

  private createApproval(record: AgentAssetSessionRecord): { approvalId: string; approvedAt: string; note?: string } {
    const approvalId = record.approval?.approvalId ?? createId('approval');
    const approvedAt = record.approval?.approvedAt ?? nowIso();
    const requestedAt = record.approval?.requestedAt ?? nowIso();
    const note = record.approval?.note;

    record.approval = {
      ...record.approval,
      requestedAt,
      approvalId,
      approvedAt,
    };

    return {
      approvalId,
      approvedAt,
      note,
    };
  }

  private getLastProposal(
    record: RepairSessionRecord,
  ): AgentProposalStoredRecord | undefined {
    return record.proposals[record.proposals.length - 1];
  }

  private deriveSandboxPath(targetAssetPath: string): string {
    const assetName = targetAssetPath.split('/').pop() || 'Unknown';
    return `/Game/Scratch/${assetName}_Sandbox`;
  }

  private async wasCancelled(record: RepairSessionRecord): Promise<boolean> {
    const latest = await loadSession(record.sessionId);
    return latest?.currentState === 'closed'
      && (latest.closeReason === 'cancelled' || latest.closeReason === 'rejected');
  }
}

export const agentLoopRuntime = new AgentLoopRuntime();
