import { BrowserWindow } from 'electron';
import type {
  AgentApprovalRequestedEvent,
  AgentProposalEvent,
  AgentSandboxCompileResultEvent,
  AgentSessionClosedEvent,
  AgentSessionErrorEvent,
  AgentProgressEvent,
} from '@omue/shared-protocol';

export const AGENT_EVENT_CHANNELS = {
  progress: 'agent:progress',
  proposal: 'agent:proposal',
  sandboxCompileResult: 'agent:sandbox-compile-result',
  approvalRequested: 'agent:approval-requested',
  sessionError: 'agent:session-error',
  sessionClosed: 'agent:session-closed',
} as const;

export function emitAgentEvent(channel: string, payload: unknown): void {
  const win = BrowserWindow.getAllWindows()[0];
  if (!win || win.isDestroyed()) return;
  win.webContents.send(channel, payload);
}

export function emitProgress(payload: AgentProgressEvent): void {
  emitAgentEvent(AGENT_EVENT_CHANNELS.progress, payload);
}

export function emitProposal(payload: AgentProposalEvent): void {
  emitAgentEvent(AGENT_EVENT_CHANNELS.proposal, payload);
}

export function emitSandboxCompileResult(payload: AgentSandboxCompileResultEvent): void {
  emitAgentEvent(AGENT_EVENT_CHANNELS.sandboxCompileResult, payload);
}

export function emitApprovalRequested(payload: AgentApprovalRequestedEvent): void {
  emitAgentEvent(AGENT_EVENT_CHANNELS.approvalRequested, payload);
}

export function emitSessionError(payload: AgentSessionErrorEvent): void {
  emitAgentEvent(AGENT_EVENT_CHANNELS.sessionError, payload);
}

export function emitSessionClosed(payload: AgentSessionClosedEvent): void {
  emitAgentEvent(AGENT_EVENT_CHANNELS.sessionClosed, payload);
}
