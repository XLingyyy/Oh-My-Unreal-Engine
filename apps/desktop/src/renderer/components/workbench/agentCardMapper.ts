import type {
  AgentApprovalRequestedEvent,
  AgentCard,
  AgentCardAction,
  AgentCardActionId,
  AgentCardData,
  AgentCardKind,
  AgentLoopState,
  AgentProposal,
  AgentProposalEvent,
  AgentSandboxCompileResultEvent,
  AgentSessionScope,
  AgentSessionClosedEvent,
  AgentSessionErrorEvent,
  CompletionTone,
  FailureData,
  RepairSessionRecord,
  SafeScratchBlueprintMutationAfterState,
  SafeScratchBlueprintMutationBeforeState,
  StartSessionRequest,
  TypedFixPayload,
} from '@omue/shared-protocol';
import { isAssetSession, isProjectSession } from '@omue/shared-protocol';

const CARD_STAGE_ORDER = {
  'user-intent': 0,
  'scan-status': 1,
  diagnosis: 2,
  'fix-plan': 3,
  'change-preview': 4,
  'validation-result': 5,
  'project-candidates': 6,
  failure: 7,
  completion: 8,
} as const;

type CardKind = keyof typeof CARD_STAGE_ORDER;

const TIME_BOUND_KEYS = new Set([
  'createdAt',
  'updatedAt',
  'receivedAt',
  'timestamp',
  'closedAt',
  'requestedAt',
  'approvedAt',
  'proposedAt',
  'duplicatedAt',
  'promotedAt',
  'collectedAt',
  'capturedAt',
  'lastUpdated',
]);

const UI_TEMP_KEYS = new Set([
  'cardId',
  '__v',
  'collapsed',
  'isOpen',
  'isHovered',
  'isFocused',
  'isExpanded',
  'isLoading',
  'isAnyLoading',
  'loadingActionId',
  'disabled',
  'actionId',
  'payload',
  'sessionId',
]);

export interface ChatStreamEventLike {
  id: string;
  kind: string;
  sessionId: string;
  createdAt: string;
  [key: string]: unknown;
}

export interface MapperEvent {
  id: string;
  kind: string;
  sessionId: string;
  createdAt: string;
  errorCode?: string;
  message?: string;
  scope?: 'asset' | 'project';
  recoverable?: boolean;
  details?: unknown;
  errorId?: string;
  proposalId?: string;
  proposalKind?: 'diagnosis' | 'fix' | 'escalation';
  proposal?: AgentProposal;
  typedPayloadJson?: string;
  escalationReason?: string;
  success?: boolean;
  errorsJson?: string;
  compileResultId?: string;
  approvalId?: string;
  approval?: { approvalId: string; requestedAt: string; diffPreview: unknown };
  currentState?: AgentLoopState;
  retryCount?: number;
  closeReason?: AgentSessionClosedEvent['closeReason'];
}

export type AgentRendererEvent =
  | {
      id: string;
      kind: 'proposal';
      sessionId: string;
      createdAt: string;
      proposalId: string;
      proposalKind?: 'diagnosis' | 'fix' | 'escalation';
      proposal?: AgentProposal;
      typedPayloadJson?: string;
      escalationReason?: string;
    }
  | {
      id: string;
      kind: 'compile';
      sessionId: string;
      createdAt: string;
      compileResultId: string;
      success: boolean;
      errorsJson?: string;
    }
  | {
      id: string;
      kind: 'approval';
      sessionId: string;
      createdAt: string;
      approvalId: string;
      approval: {
        approvalId: string;
        requestedAt: string;
        diffPreview: AgentRendererDiffPreview | null;
      };
    }
  | {
      id: string;
      kind: 'error';
      sessionId: string;
      createdAt: string;
      errorId: string;
      errorCode: string;
      message: string;
      scope: 'asset' | 'project';
      recoverable: boolean;
      details?: unknown;
    }
  | {
      id: string;
      kind: 'closed';
      sessionId: string;
      createdAt: string;
      closeReason: AgentSessionClosedEvent['closeReason'];
    };

export type AgentProtocolEventInput =
  | { kind: 'proposal'; payload: AgentProposalEvent }
  | { kind: 'compile'; payload: AgentSandboxCompileResultEvent }
  | { kind: 'approval'; payload: AgentApprovalRequestedEvent }
  | { kind: 'error'; payload: AgentSessionErrorEvent }
  | { kind: 'closed'; payload: AgentSessionClosedEvent };

export interface AdaptAgentProtocolEventResult {
  event: AgentRendererEvent;
  approval?: {
    approvalId: string;
    requestedAt: string;
    diffPreview: AgentRendererDiffPreview | null;
  };
  compatibilityError?: AgentSessionErrorEvent;
}

export type AgentRendererDiffPreview = {
  mode: 'real';
  targetAssetPath: string;
  sandboxAssetPath?: string;
  operationKind: 'set_blueprint_metadata_marker' | 'set_blueprint_variable_default';
  beforeState: SafeScratchBlueprintMutationBeforeState;
  afterState: SafeScratchBlueprintMutationAfterState;
  display: { summary: string; note?: string };
};

function rendererEventId(prefix: string, sessionId: string, discriminator: string): string {
  return `${prefix}-${sessionId}-${discriminator}`;
}

export function adaptAgentProtocolEvent(
  input: AgentProtocolEventInput,
): AdaptAgentProtocolEventResult {
  switch (input.kind) {
    case 'proposal': {
      const payload = input.payload;
      return {
        event: {
          id: rendererEventId('proposal', payload.sessionId, payload.proposalId),
          kind: 'proposal',
          sessionId: payload.sessionId,
          createdAt: payload.proposedAt,
          proposalId: payload.proposalId,
          proposalKind: payload.kind,
          proposal: payload.proposal,
          typedPayloadJson: payload.typedPayloadJson,
          escalationReason: payload.escalationReason,
        },
      };
    }
    case 'compile': {
      const payload = input.payload;
      return {
        event: {
          id: rendererEventId('compile', payload.sessionId, payload.compileResultId),
          kind: 'compile',
          sessionId: payload.sessionId,
          createdAt: payload.completedAt,
          compileResultId: payload.compileResultId,
          success: payload.success,
          errorsJson: payload.errorsJson,
        },
      };
    }
    case 'approval': {
      const payload = input.payload;
      let diffPreview: AgentRendererDiffPreview | null = null;
      let compatibilityError: AgentSessionErrorEvent | undefined;
      if (payload.diffPreviewJson) {
        try {
          diffPreview = JSON.parse(payload.diffPreviewJson) as AgentRendererDiffPreview;
        } catch (error) {
          compatibilityError = {
            sessionId: payload.sessionId,
            errorId: `diff-parse-${payload.sessionId}-${payload.approvalId}`,
            errorCode: 'diff_preview_parse_failed',
            message: error instanceof Error ? error.message : String(error),
            scope: 'asset',
            recoverable: false,
            createdAt: payload.requestedAt,
            details: { compatibilitySource: 'approval.requestedAt' },
          };
        }
      }
      const approval = {
        approvalId: payload.approvalId,
        requestedAt: payload.requestedAt,
        diffPreview,
      };
      return {
        event: {
          id: rendererEventId('approval', payload.sessionId, payload.approvalId),
          kind: 'approval',
          sessionId: payload.sessionId,
          createdAt: payload.requestedAt,
          approvalId: payload.approvalId,
          approval,
        },
        approval,
        ...(compatibilityError ? { compatibilityError } : {}),
      };
    }
    case 'error': {
      const payload = input.payload;
      return {
        event: {
          id: rendererEventId('error', payload.sessionId, payload.errorId),
          kind: 'error',
          sessionId: payload.sessionId,
          createdAt: payload.createdAt,
          errorId: payload.errorId,
          errorCode: payload.errorCode,
          message: payload.message,
          scope: payload.scope,
          recoverable: payload.recoverable,
          details: payload.details,
        },
      };
    }
    case 'closed': {
      const payload = input.payload;
      return {
        event: {
          id: rendererEventId('closed', payload.sessionId, `${payload.closeReason}-${payload.sessionId}`),
          kind: 'closed',
          sessionId: payload.sessionId,
          createdAt: payload.closedAt,
          closeReason: payload.closeReason,
        },
      };
    }
  }
}

export interface AgentCardActionContext {
  cardId: string;
  cardKind: AgentCardKind;
  sessionId: string;
  sessionScope: AgentSessionScope;
  currentState: AgentLoopState;
  pendingApprovalId?: string;
  actionTargets: AgentCardActionTargets;
}

export type AgentCardActionTargets = Partial<Record<AgentCardActionId, string>>;

export interface ResolveAgentCardActionTargetsInput {
  cards: readonly AgentCard[];
  sessionId: string;
  sessionScope: AgentSessionScope;
  currentState: AgentLoopState;
  pendingApproval?: { approvalId: string } | null;
}

function isTerminalActionState(state: AgentLoopState): boolean {
  return state === 'done' || state === 'escalated_done' || state === 'closed';
}

function findLatestCardId(
  cards: readonly AgentCard[],
  predicate: (card: AgentCard) => boolean,
): string | undefined {
  let target: AgentCard | undefined;
  for (const card of cards) {
    if (!predicate(card)) continue;
    if (!target || compareAgentCardOrder(target, card) < 0) {
      target = card;
    }
  }
  return target?.id;
}

function compareAgentCardOrder(a: AgentCard, b: AgentCard): number {
  const stageA = CARD_STAGE_ORDER[a.kind] ?? 99;
  const stageB = CARD_STAGE_ORDER[b.kind] ?? 99;
  if (stageA !== stageB) return stageA - stageB;
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
  if (a.id !== b.id) return a.id < b.id ? -1 : 1;
  return 0;
}

export function resolveAgentCardActionTargets({
  cards,
  sessionId,
  sessionScope,
  currentState,
  pendingApproval,
}: ResolveAgentCardActionTargetsInput): AgentCardActionTargets {
  const sessionCards = cards.filter(card => card.sessionId === sessionId);
  const targets: AgentCardActionTargets = {};
  const isTerminal = isTerminalActionState(currentState);

  if (sessionScope === 'asset') {
    if (!isTerminal) {
      const cancelTarget = findLatestCardId(
        sessionCards,
        card => card.kind === 'fix-plan' || card.kind === 'change-preview',
      );
      if (cancelTarget) {
        targets.cancel = cancelTarget;
      }
    }

    const latestValidation = findLatestCardId(
      sessionCards,
      card => card.kind === 'validation-result',
    );
    if (isTerminal && latestValidation) {
      targets.discard = latestValidation;
    }

    if (currentState === 'awaiting_approval' && pendingApproval) {
      const approvalCardId = `approval:${sessionId}:${pendingApproval.approvalId}`;
      const hasApprovalCard = sessionCards.some(
        card => card.kind === 'change-preview' && card.id === approvalCardId,
      );
      if (hasApprovalCard) {
        targets.approve = approvalCardId;
        targets.reject = approvalCardId;
      }

      const promoteTarget = findLatestCardId(
        sessionCards,
        card => (
          card.kind === 'validation-result' &&
          card.data.passed &&
          card.data.recommendation === 'promote'
        ),
      );
      if (promoteTarget) {
        targets.promote = promoteTarget;
      }
    }
  }

  if (sessionScope === 'project') {
    const candidatesTarget = findLatestCardId(
      sessionCards,
      card => card.kind === 'project-candidates',
    );
    if (candidatesTarget) {
      targets['select-target-asset'] = candidatesTarget;
      targets['continue-diagnosis'] = candidatesTarget;
    }
  }

  return targets;
}

export function isAgentCardActionEnabled(
  context: AgentCardActionContext,
  actionId: AgentCardActionId,
): boolean {
  if (context.actionTargets[actionId] !== context.cardId) {
    return false;
  }
  const canApprove =
    context.sessionScope === 'asset' &&
    context.currentState === 'awaiting_approval' &&
    typeof context.pendingApprovalId === 'string';

  switch (actionId) {
    case 'approve':
    case 'reject':
      return (
        context.cardKind === 'change-preview' &&
        canApprove &&
        context.cardId === `approval:${context.sessionId}:${context.pendingApprovalId}`
      );
    case 'promote':
      return context.cardKind === 'validation-result' && canApprove;
    case 'cancel':
      return (
        (context.cardKind === 'fix-plan' || context.cardKind === 'change-preview') &&
        !isTerminalActionState(context.currentState)
      );
    case 'discard':
      return context.cardKind === 'validation-result' && isTerminalActionState(context.currentState);
    case 'select-target-asset':
    case 'continue-diagnosis':
      return context.cardKind === 'project-candidates' && context.sessionScope === 'project';
    default:
      return false;
  }
}

export function createAgentCardActionHandler(
  context: AgentCardActionContext,
  onAction?: (action: AgentCardAction) => void,
): (action: AgentCardAction) => void {
  return action => {
    if (action.cardId !== context.cardId) return;
    if (!isAgentCardActionEnabled(context, action.actionId)) return;
    onAction?.(action);
  };
}

export function getVisiblePendingApproval<T>(
  session: Pick<RepairSessionRecord, 'sessionId' | 'scope' | 'currentState'> | null,
  approvalsBySession: Readonly<Record<string, T>>,
): T | undefined {
  if (
    !session ||
    session.scope !== 'asset' ||
    session.currentState !== 'awaiting_approval'
  ) {
    return undefined;
  }
  return approvalsBySession[session.sessionId];
}

function clearPendingApprovalForSession<T>(
  approvalsBySession: Readonly<Record<string, T>>,
  sessionId: string,
): Record<string, T> {
  if (!(sessionId in approvalsBySession)) {
    return approvalsBySession;
  }
  const next = { ...approvalsBySession };
  delete next[sessionId];
  return next;
}

export type PendingApprovalTransition<T> =
  | { type: 'requested'; sessionId: string; approval: T }
  | { type: 'approve-succeeded'; sessionId: string }
  | { type: 'reject-succeeded'; sessionId: string }
  | { type: 'session-closed'; sessionId: string };

export function reducePendingApprovals<T>(
  approvalsBySession: Readonly<Record<string, T>>,
  transition: PendingApprovalTransition<T>,
): Record<string, T> {
  if (transition.type === 'requested') {
    return {
      ...approvalsBySession,
      [transition.sessionId]: transition.approval,
    };
  }
  return clearPendingApprovalForSession(approvalsBySession, transition.sessionId);
}

export type AgentCardActionIntent = 'confirm-promote' | 'direct';

export function resolveAgentCardActionIntent(
  actionId: AgentCardActionId,
): AgentCardActionIntent {
  return actionId === 'approve' || actionId === 'promote'
    ? 'confirm-promote'
    : 'direct';
}

interface InternalFact {
  id: string;
  cardKind: CardKind;
  createdAt: string;
  sessionId: string;
  title: string;
  data: AgentCardData;
  diagnostics?: { legacyParseFailed?: boolean };
}

export interface MapperDiagnostics {
  hasLegacyProposalParseFailed: boolean;
  factIds: string[];
}

export interface BuildAgentCardsResult {
  cards: AgentCard[];
  diagnostics: MapperDiagnostics;
}

export type FailureRecoveryMode = 'resume' | 'retry-new' | 'none';

type SafeFailureDetailPrimitive = string | number | boolean | null;
export type SafeFailureDetailValue =
  | SafeFailureDetailPrimitive
  | SafeFailureDetailValue[]
  | { [key: string]: SafeFailureDetailValue };
export type SafeFailureDetails = Record<string, SafeFailureDetailValue>;

const FAILURE_DETAIL_TOP_LEVEL_KEYS = [
  'phase',
  'endpoint',
  'endpoints',
  'statusCode',
  'persistence',
  'state',
  'operation',
  'method',
  'reason',
  'retryCount',
  'attempt',
  'maxAttempts',
  'recoverableAttempts',
  'targetAssetPath',
  'saveErrorCode',
  'saveMessage',
  'compatibilitySource',
  'context',
  'diagnostics',
  'metadata',
];

const FAILURE_DETAIL_MAX_DEPTH = 3;
const FAILURE_DETAIL_MAX_KEYS = 12;
const FAILURE_DETAIL_MAX_ARRAY = 8;
const FAILURE_DETAIL_MAX_STRING = 240;
const FAILURE_DETAIL_MAX_VALUES = 24;

function failureDetailKeyWords(key: string): string[] {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .map(word => word.toLowerCase())
    .filter(Boolean);
}

function isSecretFailureDetailKey(key: string): boolean {
  const words = new Set(failureDetailKeyWords(key));
  if (
    ['authorization', 'auth', 'token', 'secret', 'password', 'credential', 'cookie', 'key']
      .some(word => words.has(word))
  ) {
    return true;
  }
  const hasProviderOrLlm = words.has('provider') || words.has('llm');
  const hasOutputOrResponse = words.has('output') || words.has('response');
  return (
    (words.has('raw') && (hasProviderOrLlm || hasOutputOrResponse))
    || (hasProviderOrLlm && hasOutputOrResponse)
  );
}

function scrubEndpoint(value: string): string {
  try {
    const url = new URL(value);
    url.username = '';
    url.password = '';
    url.search = '';
    url.hash = '';
    return url.toString().replace(/\/$/, value.endsWith('/') ? '/' : '');
  } catch {
    const withoutUserInfo = value
      .replace(
        /^([A-Za-z][A-Za-z0-9+.-]*:\/\/|\/\/)[^/?#@\s]+@/,
        '$1',
      )
      .replace(/^[^/?#@\s]+@(?=[^/?#@\s]+(?:[/:?#]|$))/, '');
    const queryIndex = withoutUserInfo.search(/[?#]/);
    return queryIndex >= 0
      ? withoutUserInfo.slice(0, queryIndex)
      : withoutUserInfo;
  }
}

function scrubCredentialBearingUrls(value: string): string {
  return value.replace(
    /\bhttps?:\/\/[^\s<>"']+/gi,
    candidate => {
      const trailing = candidate.match(/[),.;!?]+$/)?.[0] ?? '';
      const url = trailing ? candidate.slice(0, -trailing.length) : candidate;
      return `${scrubEndpoint(url)}${trailing}`;
    },
  );
}

function truncateFailureDetail(value: string): string {
  if (value.length <= FAILURE_DETAIL_MAX_STRING) return value;
  return `${value.slice(0, FAILURE_DETAIL_MAX_STRING - 1)}…`;
}

function redactFailureDetailText(value: string): string {
  return scrubCredentialBearingUrls(value)
    .replace(
      /\b(?:proxy-)?authorization\s*[:=]\s*(?:[A-Za-z][A-Za-z0-9_-]*\s+)?[^\s,;]+/gi,
      '[redacted]',
    )
    .replace(
      /\b(?:api[-_ ]?key|access[-_ ]?token|refresh[-_ ]?token|auth[-_ ]?token|token|client[-_ ]?secret|secret|password|credential)\s*[:=]\s*[^\s,;]+/gi,
      '[redacted]',
    )
    .replace(/\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi, '[redacted]')
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/gi, '[redacted]');
}

function sanitizeFailureDetailValue(
  value: unknown,
  key: string,
  depth: number,
  budget: { values: number },
): SafeFailureDetailValue | undefined {
  if (budget.values >= FAILURE_DETAIL_MAX_VALUES || depth > FAILURE_DETAIL_MAX_DEPTH) {
    return undefined;
  }
  if (value === null) {
    budget.values += 1;
    return null;
  }
  if (typeof value === 'string') {
    budget.values += 1;
    const scrubbed = /endpoint|url/i.test(key) ? scrubEndpoint(value) : value;
    return truncateFailureDetail(redactFailureDetailText(scrubbed));
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return undefined;
    budget.values += 1;
    return value;
  }
  if (typeof value === 'boolean') {
    budget.values += 1;
    return value;
  }
  if (Array.isArray(value)) {
    const items: SafeFailureDetailValue[] = [];
    for (const item of value.slice(0, FAILURE_DETAIL_MAX_ARRAY)) {
      const sanitized = sanitizeFailureDetailValue(item, key, depth + 1, budget);
      if (sanitized !== undefined) items.push(sanitized);
      if (budget.values >= FAILURE_DETAIL_MAX_VALUES) break;
    }
    return items.length > 0 ? items : undefined;
  }
  if (!isPlainObject(value)) return undefined;

  const result: Record<string, SafeFailureDetailValue> = {};
  const keys = Object.keys(value)
    .filter(childKey => !isSecretFailureDetailKey(childKey))
    .sort()
    .slice(0, FAILURE_DETAIL_MAX_KEYS);
  for (const childKey of keys) {
    const sanitized = sanitizeFailureDetailValue(
      value[childKey],
      childKey,
      depth + 1,
      budget,
    );
    if (sanitized !== undefined) {
      result[childKey] = sanitized;
    }
    if (budget.values >= FAILURE_DETAIL_MAX_VALUES) break;
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

export function sanitizeFailureDetails(details: unknown): SafeFailureDetails | undefined {
  if (!isPlainObject(details)) return undefined;
  const budget = { values: 0 };
  const result: SafeFailureDetails = {};
  for (const key of FAILURE_DETAIL_TOP_LEVEL_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(details, key)) continue;
    if (isSecretFailureDetailKey(key)) continue;
    const sanitized = sanitizeFailureDetailValue(details[key], key, 0, budget);
    if (sanitized !== undefined) {
      result[key] = sanitized;
    }
    if (budget.values >= FAILURE_DETAIL_MAX_VALUES) break;
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

export function buildReplacementSessionRequest(
  session: RepairSessionRecord,
): StartSessionRequest {
  if (isAssetSession(session)) {
    return {
      scope: 'asset',
      userIntent: session.userIntent,
      targetAssetPath: session.targetAssetPath,
      ...(session.parentSessionId ? { parentSessionId: session.parentSessionId } : {}),
      ...(session.inheritedEvidenceSummary
        ? { inheritedEvidenceSummary: session.inheritedEvidenceSummary }
        : {}),
    };
  }
  return {
    scope: 'project',
    userIntent: session.userIntent,
  };
}

export function resolveFailureRecoveryMode(
  session: RepairSessionRecord,
  recoverable: boolean,
): FailureRecoveryMode {
  if (session.currentState === 'interrupted') return 'resume';
  if (
    recoverable
    && (
      session.currentState === 'done'
      || session.currentState === 'escalated_done'
      || session.currentState === 'closed'
    )
  ) {
    return 'retry-new';
  }
  return 'none';
}

export function buildAgentCards(
  session: RepairSessionRecord,
  events: MapperEvent[],
): AgentCard[] {
  return buildAgentCardsWithDiagnostics(session, events).cards;
}

export function buildAgentCardsWithDiagnostics(
  session: RepairSessionRecord,
  events: MapperEvent[],
): BuildAgentCardsResult {
  const facts = mapFacts(session, events);
  const deduped = dedupeFacts(facts);
  const cards = factsToCards(deduped);
  const diagnostics: MapperDiagnostics = {
    hasLegacyProposalParseFailed: deduped.some(fact => fact.diagnostics?.legacyParseFailed === true),
    factIds: cards.map(card => card.id),
  };
  return { cards, diagnostics };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function stableStringify(value: unknown, options?: { excludeTime?: boolean }): string {
  const excludeTime = options?.excludeTime ?? false;
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(item => stableStringify(item, options)).join(',')}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter(key => !(excludeTime && TIME_BOUND_KEYS.has(key)))
    .filter(key => !(excludeTime && UI_TEMP_KEYS.has(key)))
    .sort();
  return `{${keys.map(key => `${JSON.stringify(key)}:${stableStringify(obj[key], options)}`).join(',')}}`;
}

export function stableHash(input: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0xdeadbeef;
  for (let i = 0; i < input.length; i += 1) {
    const c = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x85ebca6b) >>> 0;
  }
  return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
}

export { normalizeAgentProposalEvent } from './agentEventCompatibility';

void isProjectSession;

function mapFacts(
  session: RepairSessionRecord,
  events: MapperEvent[],
): InternalFact[] {
  const facts: InternalFact[] = [];

  facts.push(buildUserIntentFact(session));
  facts.push(lifecycleFact(session, events));

  const persistedProposalIds = new Set(session.proposals.map(p => p.proposalId));
  const persistedErrorIds = new Set((session.errors ?? []).map(e => e.errorId));

  for (const error of session.errors ?? []) {
    const stored: AgentSessionErrorEvent = {
      sessionId: error.sessionId,
      errorId: error.errorId,
      errorCode: error.errorCode,
      message: error.message,
      scope: error.scope,
      recoverable: error.recoverable,
      createdAt: error.createdAt,
      details: error.details,
    };
    facts.push(structuredErrorFact(stored));
  }

  for (const proposal of session.proposals) {
    facts.push(...proposalFacts(session, proposal));
  }

  for (const event of events) {
    if (event.kind === 'state' && event.currentState) {
      continue;
    }
    if (event.errorId) {
      if (persistedErrorIds.has(event.errorId)) {
        continue;
      }
      const errorEvent: AgentSessionErrorEvent = {
        sessionId: event.sessionId,
        errorId: event.errorId,
        errorCode: event.errorCode ?? 'unknown_error',
        message: event.message ?? '',
        scope: event.scope ?? session.scope,
        recoverable: event.recoverable ?? false,
        createdAt: event.createdAt,
        details: event.details,
      };
      facts.push(structuredErrorFact(errorEvent));
      continue;
    }
    if (event.errorCode && event.message) {
      facts.push(streamErrorFact(event, session));
      continue;
    }
    if (event.compileResultId) {
      const compileEvent: AgentSandboxCompileResultEvent = {
        sessionId: event.sessionId,
        compileResultId: event.compileResultId,
        completedAt: event.createdAt,
        success: event.success ?? false,
        errorsJson: event.errorsJson,
      };
      facts.push(compileFact(compileEvent, session));
      continue;
    }
    if (event.closeReason) {
      const closedEvent: AgentSessionClosedEvent = {
        sessionId: event.sessionId,
        closeReason: event.closeReason,
        closedAt: event.createdAt,
      };
      facts.push(closedFact(closedEvent, session, event.createdAt));
      continue;
    }
    if (event.approvalId && event.approval) {
      facts.push(approvalFact(event));
      continue;
    }
    if (event.proposalId || event.proposalKind || event.typedPayloadJson || event.escalationReason || event.proposal) {
      if (event.proposalId && persistedProposalIds.has(event.proposalId)) {
        continue;
      }
      const proposalEvent: AgentProposalEvent = {
        sessionId: event.sessionId,
        proposalId: event.proposalId ?? `proposal-${event.id}`,
        proposedAt: event.createdAt,
        kind: event.proposalKind,
        proposal: event.proposal,
        typedPayloadJson: event.typedPayloadJson,
        escalationReason: event.escalationReason,
      };
      facts.push(...proposalEventFacts(proposalEvent, event.createdAt));
    }
  }

  return facts;
}

function buildUserIntentFact(session: RepairSessionRecord): InternalFact {
  if (isAssetSession(session)) {
    const data: AgentCardData = {
      kind: 'user-intent',
      data: {
        userIntent: session.userIntent,
        scope: 'asset',
        targetAssetPath: session.targetAssetPath,
        ...(session.parentSessionId ? { parentSessionId: session.parentSessionId } : {}),
        ...(session.inheritedEvidenceSummary ? { inheritedEvidenceSummary: session.inheritedEvidenceSummary } : {}),
      },
    };
    return {
      id: `user-intent:${session.sessionId}`,
      cardKind: 'user-intent',
      createdAt: session.createdAt,
      sessionId: session.sessionId,
      title: 'Asset intent',
      data,
    };
  }

  const data: AgentCardData = {
    kind: 'user-intent',
    data: {
      userIntent: session.userIntent,
      scope: 'project',
      ...(session.parentSessionId ? { parentSessionId: session.parentSessionId } : {}),
    },
  };
  return {
    id: `user-intent:${session.sessionId}`,
    cardKind: 'user-intent',
    createdAt: session.createdAt,
    sessionId: session.sessionId,
    title: 'Project intent',
    data,
  };
}

const PROJECT_LIFECYCLE_STATES: AgentLoopState[] = [
  'draft',
  'diagnosing',
  'proposing',
];

const ASSET_LIFECYCLE_STATES: AgentLoopState[] = [
  'draft',
  'diagnosing',
  'proposing',
  'payload_validating',
  'preflighting',
  'sandbox_duplicating',
  'sandbox_applying',
  'sandbox_compiling',
  'awaiting_approval',
  'promoting',
];

function terminalLifecycleLabel(
  session: RepairSessionRecord,
  events: MapperEvent[],
): string | null {
  const closeReason = session.closeReason
    ?? events
      .filter(event => event.closeReason)
      .slice()
      .sort((a, b) => (
        a.createdAt === b.createdAt
          ? a.id.localeCompare(b.id)
          : a.createdAt.localeCompare(b.createdAt)
      ))
      .at(-1)
      ?.closeReason;
  if (closeReason === 'done') return 'done';
  if (closeReason === 'escalated') return 'escalated';
  if (closeReason === 'rejected') return 'rejected';
  if (closeReason === 'cancelled') return 'cancelled';
  if (closeReason === 'interrupted') return 'interrupted';
  if (session.currentState === 'done') return 'done';
  if (session.currentState === 'escalated_done') return 'escalated';
  if (session.currentState === 'interrupted') return 'interrupted';
  if (session.currentState === 'closed') return 'failed';
  return null;
}

function deriveScannedResources(session: RepairSessionRecord): number {
  const resources = new Set<string>();
  const snapshotAssetPath = session.contextSnapshot?.blueprintSummary.assetPath;
  if (snapshotAssetPath) resources.add(snapshotAssetPath);
  for (const issue of session.contextSnapshot?.compileIssues ?? []) {
    if (issue.file) resources.add(issue.file);
  }
  for (const proposal of session.proposals) {
    for (const candidate of proposal.candidateAssets ?? []) {
      if (candidate.assetPath) resources.add(candidate.assetPath);
    }
  }
  return resources.size;
}

function computeLifecycleSteps(
  session: RepairSessionRecord,
  events: MapperEvent[],
): Array<{ label: string; state: 'done' | 'current' | 'pending' }> {
  const order = session.scope === 'project'
    ? PROJECT_LIFECYCLE_STATES
    : ASSET_LIFECYCLE_STATES;
  const observedStates = events
    .filter(event => event.kind === 'state' && event.currentState)
    .map(event => event.currentState as AgentLoopState);
  if (order.includes(session.currentState)) {
    observedStates.push(session.currentState);
  }
  const highestObservedIndex = observedStates.reduce(
    (highest, state) => Math.max(highest, order.indexOf(state)),
    -1,
  );
  const currentIndex = order.indexOf(session.currentState);
  const terminalLabel = terminalLifecycleLabel(session, events);
  const steps: Array<{ label: string; state: 'done' | 'current' | 'pending' }> =
    order.map((label, index) => {
    if (terminalLabel) {
      return {
        label,
        state: index <= highestObservedIndex ? 'done' as const : 'pending' as const,
      };
    }
    return {
      label,
      state: index < currentIndex
        ? 'done' as const
        : index === currentIndex
          ? 'current' as const
          : 'pending' as const,
    };
    });
  if (terminalLabel) {
    steps.push({ label: terminalLabel, state: 'current' });
  }
  return steps;
}

function lifecycleFact(
  session: RepairSessionRecord,
  events: MapperEvent[],
): InternalFact {
  const durationMs = Date.parse(session.updatedAt) - Date.parse(session.createdAt);
  return {
    id: `scan:${session.sessionId}:lifecycle`,
    cardKind: 'scan-status',
    createdAt: session.createdAt,
    sessionId: session.sessionId,
    title: session.scope === 'project'
      ? 'Project diagnosis progress'
      : 'Asset repair progress',
    data: {
      kind: 'scan-status',
      data: {
        steps: computeLifecycleSteps(session, events),
        scannedResources: deriveScannedResources(session),
        ...(Number.isFinite(durationMs) && durationMs > 0 ? { durationMs } : {}),
      },
    },
  };
}

function approvalFact(event: MapperEvent): InternalFact {
  const approval = event.approval;
  const idPrefix = `approval:${event.sessionId}:${event.approvalId}`;
  return {
    id: idPrefix,
    cardKind: 'change-preview',
    createdAt: event.createdAt,
    sessionId: event.sessionId,
    title: 'Approval requested',
    data: {
      kind: 'change-preview',
      data: {
        targetAsset: '(approval pending)',
        willAdd: [],
        willNotChange: [],
        risk: 'low',
        rollbackable: true,
        executionLocation: 'sandbox-copy',
        verification: [],
      },
    },
  };
}

function proposalFacts(
  session: RepairSessionRecord,
  proposal: RepairSessionRecord['proposals'][number],
): InternalFact[] {
  const facts: InternalFact[] = [];
  const idPrefix = `proposal:${session.sessionId}:${proposal.proposalId}`;

  if (proposal.kind === 'fix' && proposal.typedPayload) {
    const typed = proposal.typedPayload;
    facts.push({
      id: `${idPrefix}:diagnosis`,
      cardKind: 'diagnosis',
      createdAt: proposal.proposedAt,
      sessionId: session.sessionId,
      title: 'Diagnosis',
      data: {
        kind: 'diagnosis',
        data: {
          conclusion: proposal.summary ?? typed.payload.display.summary,
          reason: proposal.diagnosisSummary ?? proposal.evidenceSummary ?? '',
          impact: '',
          confidence: proposal.confidence ?? 'medium',
          risk: proposal.risk ?? 'low',
          evidenceCount: 0,
        },
      },
    });
    facts.push({
      id: `${idPrefix}:fix-plan`,
      cardKind: 'fix-plan',
      createdAt: proposal.proposedAt,
      sessionId: session.sessionId,
      title: 'Fix plan',
      data: {
        kind: 'fix-plan',
        data: {
          target: typed.payload.targetAssetPath,
          summary: proposal.summary ?? typed.payload.display.summary,
          steps: [{ label: typed.payload.display.summary, code: typed.payload.display.note }],
          willModify: [typed.payload.operationKind],
          willNotModify: [],
          verification: [],
        },
      },
    });
    facts.push({
      id: `${idPrefix}:change-preview`,
      cardKind: 'change-preview',
      createdAt: proposal.proposedAt,
      sessionId: session.sessionId,
      title: 'Change preview',
      data: {
        kind: 'change-preview',
        data: {
          targetAsset: typed.payload.targetAssetPath,
          willAdd: [typed.payload.operationKind],
          willNotChange: [],
          risk: proposal.risk ?? 'low',
          rollbackable: true,
          executionLocation: 'sandbox-copy',
          verification: [],
        },
      },
    });
  } else if (proposal.kind === 'diagnosis') {
    facts.push({
      id: `${idPrefix}:diagnosis`,
      cardKind: 'diagnosis',
      createdAt: proposal.proposedAt,
      sessionId: session.sessionId,
      title: 'Diagnosis',
      data: {
        kind: 'diagnosis',
        data: {
          conclusion: proposal.summary ?? '',
          reason: proposal.evidenceSummary ?? '',
          impact: '',
          confidence: proposal.confidence ?? 'medium',
          risk: proposal.risk ?? 'low',
          evidenceCount: (proposal.candidateAssets ?? []).length,
        },
      },
    });
    facts.push({
      id: `${idPrefix}:candidates`,
      cardKind: 'project-candidates',
      createdAt: proposal.proposedAt,
      sessionId: session.sessionId,
      title: 'Candidate assets',
      data: {
        kind: 'project-candidates',
        data: {
          candidates: proposal.candidateAssets ?? [],
          summary: proposal.summary ?? '',
          suggestedNextSteps: proposal.suggestedNextSteps ?? [],
        },
      },
    });
  } else if (proposal.kind === 'escalation') {
    const failureData: FailureData = {
      errorCode: 'agent_escalation',
      message: proposal.escalationReason ?? 'Agent escalated.',
      recoverable: true,
      scope: session.scope,
      createdAt: proposal.proposedAt,
    };
    facts.push({
      id: `${idPrefix}:escalation`,
      cardKind: 'failure',
      createdAt: proposal.proposedAt,
      sessionId: session.sessionId,
      title: 'Escalation',
      data: { kind: 'failure', data: failureData },
    });
  }

  return facts;
}

function proposalEventFacts(event: AgentProposalEvent, createdAt: string): InternalFact[] {
  const facts: InternalFact[] = [];
  const idPrefix = `proposal-event:${event.sessionId}:${event.proposalId}`;

  if (event.proposal) {
    const proposal = event.proposal;
    if (proposal.kind === 'fix') {
      const typed = proposal.typedPayload;
      facts.push({
        id: `${idPrefix}:diagnosis`,
        cardKind: 'diagnosis',
        createdAt,
        sessionId: event.sessionId,
        title: 'Diagnosis',
        data: {
          kind: 'diagnosis',
          data: {
            conclusion: proposal.summary,
            reason: proposal.diagnosisSummary ?? proposal.evidenceSummary,
            impact: '',
            confidence: proposal.confidence,
            risk: proposal.risk,
            evidenceCount: 0,
          },
        },
      });
      facts.push({
        id: `${idPrefix}:fix-plan`,
        cardKind: 'fix-plan',
        createdAt,
        sessionId: event.sessionId,
        title: 'Fix plan',
        data: {
          kind: 'fix-plan',
          data: {
            target: typed.payload.targetAssetPath,
            summary: proposal.summary,
            steps: [{ label: typed.payload.display.summary, code: typed.payload.display.note }],
            willModify: [typed.payload.operationKind],
            willNotModify: [],
            verification: [],
          },
        },
      });
      facts.push({
        id: `${idPrefix}:change-preview`,
        cardKind: 'change-preview',
        createdAt,
        sessionId: event.sessionId,
        title: 'Change preview',
        data: {
          kind: 'change-preview',
          data: {
            targetAsset: typed.payload.targetAssetPath,
            willAdd: [typed.payload.operationKind],
            willNotChange: [],
            risk: proposal.risk,
            rollbackable: true,
            executionLocation: 'sandbox-copy',
            verification: [],
          },
        },
      });
    } else if (proposal.kind === 'diagnosis') {
      facts.push({
        id: `${idPrefix}:diagnosis`,
        cardKind: 'diagnosis',
        createdAt,
        sessionId: event.sessionId,
        title: 'Diagnosis',
        data: {
          kind: 'diagnosis',
          data: {
            conclusion: proposal.summary,
            reason: proposal.evidenceSummary,
            impact: '',
            confidence: proposal.confidence,
            risk: proposal.risk,
            evidenceCount: proposal.candidateAssets.length,
          },
        },
      });
      facts.push({
        id: `${idPrefix}:candidates`,
        cardKind: 'project-candidates',
        createdAt,
        sessionId: event.sessionId,
        title: 'Candidate assets',
        data: {
          kind: 'project-candidates',
          data: {
            candidates: proposal.candidateAssets,
            summary: proposal.summary,
            suggestedNextSteps: proposal.suggestedNextSteps,
          },
        },
      });
    } else if (proposal.kind === 'escalation') {
      const failureData: FailureData = {
        errorCode: 'agent_escalation',
        message: proposal.reason,
        recoverable: true,
        scope: 'project',
        createdAt,
      };
      facts.push({
        id: `${idPrefix}:escalation`,
        cardKind: 'failure',
        createdAt,
        sessionId: event.sessionId,
        title: 'Escalation',
        data: { kind: 'failure', data: failureData },
      });
    }
    return facts;
  }

  if (event.typedPayloadJson) {
    try {
      const typedPayload = JSON.parse(event.typedPayloadJson) as TypedFixPayload;
      facts.push({
        id: `${idPrefix}:fix-plan`,
        cardKind: 'fix-plan',
        createdAt,
        sessionId: event.sessionId,
        title: 'Fix plan',
        data: {
          kind: 'fix-plan',
          data: {
            target: typedPayload.payload.targetAssetPath,
            summary: typedPayload.payload.display.summary,
            steps: [{ label: typedPayload.payload.display.summary, code: typedPayload.payload.display.note }],
            willModify: [typedPayload.payload.operationKind],
            willNotModify: [],
            verification: [],
          },
        },
      });
    } catch {
      const failureData: FailureData = {
        errorCode: 'legacy_proposal_parse_failed',
        message: 'Legacy proposal JSON parse failed.',
        recoverable: false,
        scope: 'asset',
        createdAt,
      };
      facts.push({
        id: `${idPrefix}:legacy-parse-failed`,
        cardKind: 'failure',
        createdAt,
        sessionId: event.sessionId,
        title: 'Legacy proposal parse failed',
        diagnostics: { legacyParseFailed: true },
        data: { kind: 'failure', data: failureData },
      });
    }
    return facts;
  }

  if (event.escalationReason) {
    const failureData: FailureData = {
      errorCode: 'agent_escalation',
      message: event.escalationReason,
      recoverable: true,
      scope: 'project',
      createdAt,
    };
    facts.push({
      id: `${idPrefix}:escalation`,
      cardKind: 'failure',
      createdAt,
      sessionId: event.sessionId,
      title: 'Escalation',
      data: { kind: 'failure', data: failureData },
    });
  }

  return facts;
}

function compileFact(
  event: AgentSandboxCompileResultEvent,
  session: RepairSessionRecord,
): InternalFact {
  const label = event.success ? 'Sandbox validation passed' : 'Sandbox validation failed';
  return {
    id: `validation:${event.sessionId}:${event.compileResultId}`,
    cardKind: 'validation-result',
    createdAt: event.completedAt,
    sessionId: session.sessionId,
    title: label,
    data: {
      kind: 'validation-result',
      data: {
        passed: event.success,
        checks: event.success
          ? [{ label: 'Sandbox compile succeeded', passed: true }]
          : [
              { label: 'Sandbox compile succeeded', passed: false },
              { label: 'No new compile warnings', passed: !event.errorsJson },
            ],
        resultSummary: event.errorsJson ?? 'Sandbox compile succeeded.',
        recommendation: event.success ? 'promote' : 'regenerate',
      },
    },
  };
}

function structuredErrorFact(event: AgentSessionErrorEvent): InternalFact {
  const createdAt = event.createdAt;
  const details = sanitizeFailureDetails(event.details);
  const data: FailureData = {
    errorCode: event.errorCode,
    message: event.message,
    recoverable: event.recoverable,
    scope: event.scope,
    createdAt,
    ...(details ? { details } : {}),
  };
  return {
    id: `failure:${event.sessionId}:${event.errorId}`,
    cardKind: 'failure',
    createdAt,
    sessionId: event.sessionId,
    title: event.errorCode,
    data: { kind: 'failure', data },
  };
}

function streamErrorFact(event: MapperEvent, session: RepairSessionRecord): InternalFact {
  const createdAt = event.createdAt;
  const details = sanitizeFailureDetails(event.details);
  const idSource = stableStringify({
    kind: event.kind,
    sessionId: event.sessionId,
    errorCode: event.errorCode,
    message: event.message,
    scope: event.scope,
    recoverable: event.recoverable,
  }, { excludeTime: true });
  const fallbackId = `failure:${event.sessionId}:${stableHash(idSource)}`;
  const data: FailureData = {
    errorCode: event.errorCode ?? 'unknown_error',
    message: event.message ?? '',
    recoverable: event.recoverable ?? true,
    scope: event.scope ?? session.scope,
    createdAt,
    ...(details ? { details } : {}),
  };
  return {
    id: fallbackId,
    cardKind: 'failure',
    createdAt,
    sessionId: event.sessionId,
    title: event.errorCode ?? 'error',
    data: { kind: 'failure', data },
  };
}

function closedFact(
  event: AgentSessionClosedEvent,
  session: RepairSessionRecord,
  createdAt: string,
): InternalFact {
  const tone: CompletionTone = event.closeReason === 'done'
    ? 'success'
    : event.closeReason === 'rejected' || event.closeReason === 'cancelled'
      ? 'closed'
      : 'warning';
  const terminalState = event.closeReason === 'done'
    ? 'done'
    : event.closeReason === 'escalated'
      ? 'escalated_done'
      : event.closeReason === 'interrupted'
        ? 'interrupted'
        : 'closed';
  const title = event.closeReason === 'done'
    ? 'Session completed'
    : event.closeReason === 'escalated'
      ? 'Session escalated'
      : event.closeReason === 'rejected'
        ? 'Session rejected'
        : event.closeReason === 'cancelled'
          ? 'Session cancelled'
          : 'Session interrupted';
  return {
    id: `completion:${event.sessionId}:${event.closeReason}`,
    cardKind: 'completion',
    createdAt,
    sessionId: session.sessionId,
    title,
    data: {
      kind: 'completion',
      data: {
        tone,
        message: title,
        sessionId: event.sessionId,
        closeReason: event.closeReason,
        terminalState,
      },
    },
  };
}

function dedupeFacts(facts: InternalFact[]): InternalFact[] {
  const seen = new Set<string>();
  const deduped: InternalFact[] = [];
  for (const fact of facts) {
    if (seen.has(fact.id)) continue;
    seen.add(fact.id);
    deduped.push(fact);
  }
  return deduped;
}

function factsToCards(facts: InternalFact[]): AgentCard[] {
  return facts
    .slice()
    .sort((a, b) => {
      const stageA = CARD_STAGE_ORDER[a.cardKind] ?? 99;
      const stageB = CARD_STAGE_ORDER[b.cardKind] ?? 99;
      if (stageA !== stageB) return stageA - stageB;
      if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
      if (a.id !== b.id) return a.id < b.id ? -1 : 1;
      return 0;
    })
    .map(fact => buildCard(fact));
}

function buildCard(fact: InternalFact): AgentCard {
  const base = {
    id: fact.id,
    title: fact.title,
    createdAt: fact.createdAt,
    sessionId: fact.sessionId,
  };
  return {
    ...base,
    ...fact.data,
  } as AgentCard;
}

void isProjectSession;
