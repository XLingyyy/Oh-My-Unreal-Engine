import type {
  AgentAssetSessionRecord,
  AgentUiLogEntry,
  ChangeItem,
  ChangeItemChange,
  CompileIssue,
  EvidenceItem,
  LogEntry,
  LogVerbosity,
  OmueContextSnapshot,
  RepairSessionRecord,
} from '@omue/shared-protocol';
import { isAssetSession } from '@omue/shared-protocol';
import { buildMockChangeItems, buildMockEvidenceItems, buildMockLogEntries } from './mockInspectorData';
import type { UeAgentUiCopy } from '../../i18n/types';

export type InspectorSourceKind =
  | 'live'
  | 'cache'
  | 'mock'
  | 'unavailable';

export interface InspectorPanelData<T> {
  items: T[];
  source: InspectorSourceKind;
  updatedAt: string | null;
}

export type EvidencePanelData = InspectorPanelData<EvidenceItem>;
export type ChangesPanelData = InspectorPanelData<ChangeItem>;
export type LogsPanelData = Omit<InspectorPanelData<AgentUiLogEntry>, 'items'> & {
  entries: AgentUiLogEntry[];
  source: InspectorSourceKind;
  updatedAt: string | null;
};

export interface InspectorData {
  evidence: EvidencePanelData;
  changes: ChangesPanelData;
  logs: LogsPanelData;
}

export type ChatStreamEventLike =
  | {
      id: string;
      kind: 'state';
      sessionId: string;
      createdAt: string;
      currentState: string;
      retryCount: number;
    }
  | {
      id: string;
      kind: 'proposal';
      sessionId: string;
      createdAt: string;
      proposalId: string;
      proposalKind?: 'diagnosis' | 'fix' | 'escalation';
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
    }
  | {
      id: string;
      kind: 'closed';
      sessionId: string;
      createdAt: string;
      closeReason: string;
    };

export interface InspectorDataAdapterInput {
  selectedSession: RepairSessionRecord | null;
  selectedEvents: readonly ChatStreamEventLike[];
  snapshot: OmueContextSnapshot | null;
  isMockClient: boolean;
  bridgeError: string | null;
  mockEvidenceTexts: UeAgentUiCopy['rightInspector']['evidence']['texts'];
  mockChangeTexts: UeAgentUiCopy['rightInspector']['changes']['texts'];
  mockLogTexts: UeAgentUiCopy['rightInspector']['logs']['texts'];
}

function resolveSource(
  isMockClient: boolean,
  hasRealDataSource: boolean,
  bridgeError: string | null,
): InspectorSourceKind {
  if (isMockClient) return 'mock';
  if (hasRealDataSource && !bridgeError) return 'live';
  if (hasRealDataSource && bridgeError) return 'cache';
  return 'unavailable';
}

function hasRealDataSource(input: InspectorDataAdapterInput): boolean {
  return input.selectedSession !== null || input.snapshot !== null;
}

function isValidTimestamp(ts: string | undefined | null): ts is string {
  if (typeof ts !== 'string' || ts.length === 0) return false;
  const parsed = Date.parse(ts);
  return !Number.isNaN(parsed) && isFinite(parsed);
}

function latestValidTimestamp(candidates: (string | undefined | null)[]): string | null {
  let best: string | null = null;
  let bestMs = -Infinity;
  for (const c of candidates) {
    if (!isValidTimestamp(c)) continue;
    const ms = Date.parse(c);
    if (ms > bestMs) {
      bestMs = ms;
      best = c;
    }
  }
  return best;
}

function resolveEvidenceUpdatedAt(
  input: InspectorDataAdapterInput,
  sessionHasItems: boolean,
  snapshotHasItems: boolean,
): string | null {
  if (sessionHasItems) {
    const t = input.selectedSession?.updatedAt;
    return isValidTimestamp(t) ? t : null;
  }
  if (!sessionHasItems && snapshotHasItems) {
    const t = input.snapshot?.capturedAt;
    return isValidTimestamp(t) ? t : null;
  }
  const candidates: (string | undefined | null)[] = [];
  if (input.selectedSession?.updatedAt) {
    candidates.push(input.selectedSession.updatedAt);
  }
  if (input.snapshot?.capturedAt) {
    candidates.push(input.snapshot.capturedAt);
  }
  return latestValidTimestamp(candidates);
}

function resolveChangesUpdatedAt(input: InspectorDataAdapterInput): string | null {
  if (!input.selectedSession?.updatedAt) return null;
  return isValidTimestamp(input.selectedSession.updatedAt) ? input.selectedSession.updatedAt : null;
}

function resolveLogsUpdatedAt(entries: { timestamp: string }[]): string | null {
  const candidates = entries.map(e => e.timestamp);
  return latestValidTimestamp(candidates);
}

function targetAssetName(session: RepairSessionRecord | null): string {
  if (!session) return 'Unknown';
  if (isAssetSession(session)) {
    const path = session.targetAssetPath;
    return path.split('/').pop() ?? path;
  }
  return 'Project';
}

function mapCompileIssueToEvidence(
  issue: CompileIssue,
  assetName: string,
  assetPath: string,
): EvidenceItem {
  return {
    id: `evidence-compile-${assetName}-${issue.code}-${issue.message.slice(0, 20)}`,
    assetName,
    assetPath,
    status: issue.severity === 'error' ? 'error' : 'warning',
    finding: issue.message,
  };
}

function adaptEvidenceItems(input: InspectorDataAdapterInput): EvidencePanelData {
  if (input.isMockClient) {
    return {
      items: buildMockEvidenceItems(input.mockEvidenceTexts),
      source: 'mock',
      updatedAt: null,
    };
  }

  const items: EvidenceItem[] = [];
  let sessionHasItems = false;
  let snapshotHasItems = false;
  const session = input.selectedSession;
  const snapshot = input.snapshot;

  if (session) {
    const assetName = targetAssetName(session);
    const assetPath = isAssetSession(session) ? session.targetAssetPath : '';

    if (session.errors && session.errors.length > 0) {
      for (const error of session.errors) {
        items.push({
          id: `evidence-error-${error.errorId}`,
          assetName,
          assetPath,
          status: 'error',
          finding: error.message,
        });
      }
      sessionHasItems = true;
    }

    if (isAssetSession(session) && session.contextSnapshot) {
      const ctx = session.contextSnapshot;
      if (ctx.compileIssues && ctx.compileIssues.length > 0) {
        for (const issue of ctx.compileIssues) {
          items.push(mapCompileIssueToEvidence(issue, assetName, session.targetAssetPath));
        }
        sessionHasItems = true;
      }

      if (ctx.blueprintSummary && ctx.blueprintSummary.dirtyState === 'Dirty') {
        items.push({
          id: `evidence-bp-dirty-${assetName}`,
          assetName,
          assetPath: session.targetAssetPath,
          status: 'warning',
          finding: `Blueprint ${assetName} has uncommitted changes`,
        });
        sessionHasItems = true;
      }
    }
  }

  if (snapshot && items.length === 0) {
    const compileStatus = snapshot.compileStatus;
    if (compileStatus && compileStatus.lastErrors && compileStatus.lastErrors.length > 0) {
      const assetName = snapshot.currentAsset?.assetName ?? 'Project';
      const assetPath = snapshot.currentAsset?.assetPath ?? '';
      for (const issue of compileStatus.lastErrors) {
        items.push(mapCompileIssueToEvidence(issue, assetName, assetPath));
      }
      snapshotHasItems = true;
    }

    if (snapshot.currentAsset && snapshot.currentAsset.isDirty) {
      items.push({
        id: `evidence-asset-dirty-${snapshot.currentAsset.assetName}`,
        assetName: snapshot.currentAsset.assetName,
        assetPath: snapshot.currentAsset.assetPath,
        status: 'warning',
        finding: `Asset ${snapshot.currentAsset.assetName} has uncommitted changes`,
      });
      snapshotHasItems = true;
    }
  }

  const source = resolveSource(input.isMockClient, hasRealDataSource(input), input.bridgeError);
  const updatedAt = source === 'mock' || source === 'unavailable'
    ? null
    : resolveEvidenceUpdatedAt(input, sessionHasItems, snapshotHasItems);

  return {
    items,
    source,
    updatedAt,
  };
}

function adaptChangeItems(input: InspectorDataAdapterInput): ChangesPanelData {
  if (input.isMockClient) {
    return {
      items: buildMockChangeItems(input.mockChangeTexts),
      source: 'mock',
      updatedAt: null,
    };
  }

  const items: ChangeItem[] = [];
  const session = input.selectedSession;

  if (session && isAssetSession(session)) {
    const assetSession = session as AgentAssetSessionRecord;
    const targetAsset = assetSession.targetAssetPath;

    if (assetSession.proposals && assetSession.proposals.length > 0) {
      const fixProposal = assetSession.proposals.find(p => p.kind === 'fix');
      if (fixProposal) {
        const changes: ChangeItemChange[] = fixProposal.summary
          ? [{ kind: 'modify', summary: fixProposal.summary }]
          : [];
        items.push({
          id: `change-preview-${fixProposal.proposalId}`,
          stage: 'preview',
          targetAsset,
          changes,
          status: 'pending',
          rollbackable: true,
        });
      }
    }

    if (assetSession.sandbox && assetSession.sandbox.applyResultJson) {
      items.push({
        id: `change-sandbox-${assetSession.sessionId}`,
        stage: 'sandbox-applied',
        targetAsset,
        changes: [{ kind: 'modify', summary: 'Sandbox apply completed' }],
        status: 'applied',
        rollbackable: true,
        appliedAt: assetSession.sandbox.duplicatedAt,
      });
    }

    if (assetSession.promote) {
      items.push({
        id: `change-promoted-${assetSession.sessionId}`,
        stage: 'promoted',
        targetAsset,
        changes: [{ kind: 'modify', summary: 'Promoted to canonical asset' }],
        status: 'applied',
        rollbackable: true,
        appliedAt: assetSession.promote.promotedAt,
      });
    }
  }

  const source = resolveSource(input.isMockClient, hasRealDataSource(input), input.bridgeError);
  const updatedAt = source === 'mock' || source === 'unavailable' ? null : resolveChangesUpdatedAt(input);

  return {
    items,
    source,
    updatedAt,
  };
}

function mapVerbosityToLevel(verbosity: LogVerbosity): AgentUiLogEntry['level'] {
  switch (verbosity) {
    case 'fatal':
    case 'error':
      return 'error';
    case 'warning':
      return 'warn';
    case 'display':
    case 'log':
      return 'info';
    case 'verbose':
    case 'very_verbose':
      return 'debug';
    default:
      return 'info';
  }
}

function mapCategoryToSource(category: string): AgentUiLogEntry['source'] {
  const lower = category.toLowerCase();
  if (lower.includes('compile') || lower.includes('blueprint')) {
    return 'compile';
  }
  if (lower.includes('pie') || lower.includes('play')) {
    return 'pie';
  }
  return 'bridge';
}

function mapLogEntry(entry: LogEntry): AgentUiLogEntry {
  return {
    id: `log-bridge-${entry.timestamp}-${entry.category}-${entry.message.slice(0, 20)}`,
    level: mapVerbosityToLevel(entry.verbosity),
    source: mapCategoryToSource(entry.category),
    message: entry.message,
    timestamp: entry.timestamp,
  };
}

function mapSessionEventToLog(entry: ChatStreamEventLike): AgentUiLogEntry | null {
  const base = {
    id: `log-event-${entry.id}`,
    timestamp: entry.createdAt,
  };

  if (entry.kind === 'state') {
    return {
      ...base,
      level: 'info',
      source: 'agent-state',
      message: `Session state: ${entry.currentState}`,
    };
  }

  if (entry.kind === 'proposal') {
    return {
      ...base,
      level: 'info',
      source: 'tool-call',
      message: `Proposal ${entry.proposalKind ?? 'unknown'}: ${entry.proposalId}`,
    };
  }

  if (entry.kind === 'compile') {
    return {
      ...base,
      level: entry.success ? 'info' : 'error',
      source: 'compile',
      message: entry.success ? 'Sandbox compile succeeded' : 'Sandbox compile failed',
      ...(entry.errorsJson ? { payload: entry.errorsJson } : {}),
    };
  }

  if (entry.kind === 'approval') {
    return {
      ...base,
      level: 'info',
      source: 'agent-state',
      message: `Approval requested: ${entry.approvalId}`,
    };
  }

  if (entry.kind === 'error') {
    return {
      ...base,
      level: 'error',
      source: 'agent-state',
      message: entry.message,
    };
  }

  if (entry.kind === 'closed') {
    return {
      ...base,
      level: 'info',
      source: 'agent-state',
      message: `Session closed: ${entry.closeReason}`,
    };
  }

  return null;
}

function adaptLogEntries(input: InspectorDataAdapterInput): LogsPanelData {
  if (input.isMockClient) {
    return {
      entries: buildMockLogEntries(input.mockLogTexts),
      source: 'mock',
      updatedAt: null,
    };
  }

  const entries: AgentUiLogEntry[] = [];

  if (input.snapshot && input.snapshot.recentLogs.length > 0) {
    for (const logEntry of input.snapshot.recentLogs) {
      entries.push(mapLogEntry(logEntry));
    }
  }

  if (input.selectedEvents.length > 0) {
    for (const event of input.selectedEvents) {
      const mapped = mapSessionEventToLog(event);
      if (mapped) {
        entries.push(mapped);
      }
    }
  }

  entries.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  const source = resolveSource(input.isMockClient, hasRealDataSource(input), input.bridgeError);
  const updatedAt = source === 'mock' || source === 'unavailable' ? null : resolveLogsUpdatedAt(entries);

  return {
    entries,
    source,
    updatedAt,
  };
}

export function buildInspectorData(input: InspectorDataAdapterInput): InspectorData {
  return {
    evidence: adaptEvidenceItems(input),
    changes: adaptChangeItems(input),
    logs: adaptLogEntries(input),
  };
}

export {
  adaptEvidenceItems,
  adaptChangeItems,
  adaptLogEntries,
};
