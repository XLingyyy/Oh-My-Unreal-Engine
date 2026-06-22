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

export type InspectorPanelMode = 'real' | 'mock' | 'empty' | 'degraded';

export interface InspectorPanelData<T> {
  items: T[];
  mode: InspectorPanelMode;
}

export type EvidencePanelData = InspectorPanelData<EvidenceItem>;
export type ChangesPanelData = InspectorPanelData<ChangeItem>;
export type LogsPanelData = Omit<InspectorPanelData<AgentUiLogEntry>, 'items'> & {
  entries: AgentUiLogEntry[];
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

function resolveMode(
  isMockClient: boolean,
  hasRealDataSource: boolean,
  bridgeError: string | null,
): InspectorPanelMode {
  if (isMockClient) return 'mock';
  if (bridgeError && !hasRealDataSource) return 'degraded';
  if (hasRealDataSource) return 'real';
  return 'empty';
}

function hasRealDataSource(input: InspectorDataAdapterInput): boolean {
  return input.selectedSession !== null || input.snapshot !== null;
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
      mode: 'mock',
    };
  }

  const items: EvidenceItem[] = [];
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
    }

    if (isAssetSession(session) && session.contextSnapshot) {
      const ctx = session.contextSnapshot;
      if (ctx.compileIssues && ctx.compileIssues.length > 0) {
        for (const issue of ctx.compileIssues) {
          items.push(mapCompileIssueToEvidence(issue, assetName, session.targetAssetPath));
        }
      }

      if (ctx.blueprintSummary && ctx.blueprintSummary.dirtyState === 'Dirty') {
        items.push({
          id: `evidence-bp-dirty-${assetName}`,
          assetName,
          assetPath: session.targetAssetPath,
          status: 'warning',
          finding: `Blueprint ${assetName} has uncommitted changes`,
        });
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
    }

    if (snapshot.currentAsset && snapshot.currentAsset.isDirty) {
      items.push({
        id: `evidence-asset-dirty-${snapshot.currentAsset.assetName}`,
        assetName: snapshot.currentAsset.assetName,
        assetPath: snapshot.currentAsset.assetPath,
        status: 'warning',
        finding: `Asset ${snapshot.currentAsset.assetName} has uncommitted changes`,
      });
    }
  }

  return {
    items,
    mode: resolveMode(input.isMockClient, hasRealDataSource(input), input.bridgeError),
  };
}

function adaptChangeItems(input: InspectorDataAdapterInput): ChangesPanelData {
  if (input.isMockClient) {
    return {
      items: buildMockChangeItems(input.mockChangeTexts),
      mode: 'mock',
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

  return {
    items,
    mode: resolveMode(input.isMockClient, hasRealDataSource(input), input.bridgeError),
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
      mode: 'mock',
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

  return {
    entries,
    mode: resolveMode(input.isMockClient, hasRealDataSource(input), input.bridgeError),
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
