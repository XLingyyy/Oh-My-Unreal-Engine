import { ipcMain } from 'electron';
import type {
  ApprovePromoteRequest,
  ApprovePromoteResult,
  CancelSessionRequest,
  CancelSessionResult,
  DiscardSessionRequest,
  DiscardSessionResult,
  ListSessionsResult,
  RejectPromoteRequest,
  RejectPromoteResult,
  ResumeSessionRequest,
  ResumeSessionResult,
  StartSessionResult,
  SubscribeResult,
} from '@omue/shared-protocol';
import { agentLoopRuntime } from './agent-loop-runtime';
import { validateStartSessionRequest } from './agent-session-validation';

function sessionIdRequest<T extends { sessionId: string }>(value: unknown): T | null {
  return typeof value === 'object'
    && value !== null
    && !Array.isArray(value)
    && typeof (value as Record<string, unknown>).sessionId === 'string'
    && ((value as Record<string, unknown>).sessionId as string).trim().length > 0
    ? value as T
    : null;
}

export function registerAgentLoopShell(): void {
  ipcMain.handle('agent:start-session', async (_event, request: unknown): Promise<StartSessionResult> => {
    const validated = validateStartSessionRequest(request);
    if (!validated.ok) {
      return {
        ok: false,
        errorCode: 'invalid_request',
        message: validated.message,
      };
    }
    return agentLoopRuntime.startSession(validated.request);
  });

  ipcMain.handle('agent:cancel-session', async (_event, request: unknown): Promise<CancelSessionResult> => {
    const validated = sessionIdRequest<CancelSessionRequest>(request);
    if (!validated) {
      return {
        ok: false,
        errorCode: 'invalid_request',
        message: 'sessionId is required.',
      };
    }
    return agentLoopRuntime.cancelSession(validated);
  });

  ipcMain.handle('agent:approve-promote', async (_event, request: unknown): Promise<ApprovePromoteResult> => {
    const validated =
      typeof request === 'object'
      && request !== null
      && !Array.isArray(request)
      && typeof (request as Record<string, unknown>).sessionId === 'string'
      && typeof (request as Record<string, unknown>).approvalId === 'string'
        ? {
            sessionId: (request as Record<string, unknown>).sessionId as string,
            approvalId: (request as Record<string, unknown>).approvalId as string,
            note: typeof (request as Record<string, unknown>).note === 'string'
              ? ((request as Record<string, unknown>).note as string)
              : undefined,
          } satisfies ApprovePromoteRequest
        : null;
    if (!validated) {
      return {
        ok: false,
        errorCode: 'invalid_request',
        message: 'sessionId and approvalId are required.',
      };
    }
    return agentLoopRuntime.approvePromote(validated);
  });

  ipcMain.handle('agent:reject-promote', async (_event, request: unknown): Promise<RejectPromoteResult> => {
    const validated = sessionIdRequest<RejectPromoteRequest>(request);
    if (!validated) {
      return {
        ok: false,
        errorCode: 'invalid_request',
        message: 'sessionId is required.',
      };
    }
    return agentLoopRuntime.rejectPromote(validated);
  });

  ipcMain.handle('agent:list-sessions', async (): Promise<ListSessionsResult> => {
    return agentLoopRuntime.listSessions();
  });

  ipcMain.handle('agent:resume-session', async (_event, request: unknown): Promise<ResumeSessionResult> => {
    const validated = sessionIdRequest<ResumeSessionRequest>(request);
    if (!validated) {
      return {
        ok: false,
        errorCode: 'invalid_request',
        message: 'sessionId is required.',
      };
    }
    return agentLoopRuntime.resumeSession(validated);
  });

  ipcMain.handle('agent:discard-session', async (_event, request: unknown): Promise<DiscardSessionResult> => {
    const validated = sessionIdRequest<DiscardSessionRequest>(request);
    if (!validated) {
      return {
        ok: false,
        errorCode: 'invalid_request',
        message: 'sessionId is required.',
      };
    }
    return agentLoopRuntime.discardSession(validated);
  });

  ipcMain.handle('agent:subscribe', async (): Promise<SubscribeResult> => {
    return agentLoopRuntime.subscribe();
  });
}
