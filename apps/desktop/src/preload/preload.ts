import { contextBridge, ipcRenderer } from 'electron';
import { settingsApi } from './settingsApi';

function subscribeToAgentEvent(
  channel: string,
  cb: (event: unknown) => void,
): () => void {
  const listener = (_event: Electron.IpcRendererEvent, payload: unknown) => cb(payload);
  ipcRenderer.on(channel, listener);
  return () => {
    ipcRenderer.off(channel, listener);
  };
}

contextBridge.exposeInMainWorld('omue', {
  settings: settingsApi,
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    node: process.versions.node,
  },
  getInitialTheme: () => ipcRenderer.invoke('app:get-initial-theme'),
  aiBlueprintExplanation: {
    getStatus: () => ipcRenderer.invoke('ai:blueprint-explanation:get-status'),
    checkShell: (request: unknown) =>
      ipcRenderer.invoke('ai:blueprint-explanation:check-shell', request),
    getProviderStatus: () =>
      ipcRenderer.invoke('ai:blueprint-explanation:get-provider-status'),
    saveProviderConfig: (config: unknown) =>
      ipcRenderer.invoke('ai:blueprint-explanation:save-provider-config', config),
    clearProviderConfig: () =>
      ipcRenderer.invoke('ai:blueprint-explanation:clear-provider-config'),
    requestExplanation: (request: unknown) =>
      ipcRenderer.invoke('ai:blueprint-explanation:request-explanation', request),
  },
  aiBlueprintProposeFix: {
    requestProposal: (request: unknown) =>
      ipcRenderer.invoke('ai:blueprint-propose-fix:request-proposal', request),
  },
  agent: {
    startSession: (request: unknown) =>
      ipcRenderer.invoke('agent:start-session', request),
    cancelSession: (request: unknown) =>
      ipcRenderer.invoke('agent:cancel-session', request),
    approvePromote: (request: unknown) =>
      ipcRenderer.invoke('agent:approve-promote', request),
    rejectPromote: (request: unknown) =>
      ipcRenderer.invoke('agent:reject-promote', request),
    listSessions: () =>
      ipcRenderer.invoke('agent:list-sessions'),
    resumeSession: (request: unknown) =>
      ipcRenderer.invoke('agent:resume-session', request),
    discardSession: (request: unknown) =>
      ipcRenderer.invoke('agent:discard-session', request),
    subscribe: () =>
      ipcRenderer.invoke('agent:subscribe'),
    onProgress: (cb: (event: unknown) => void) =>
      subscribeToAgentEvent('agent:progress', cb),
    onProposal: (cb: (event: unknown) => void) =>
      subscribeToAgentEvent('agent:proposal', cb),
    onSandboxCompileResult: (cb: (event: unknown) => void) =>
      subscribeToAgentEvent('agent:sandbox-compile-result', cb),
    onApprovalRequested: (cb: (event: unknown) => void) =>
      subscribeToAgentEvent('agent:approval-requested', cb),
    onSessionError: (cb: (event: unknown) => void) =>
      subscribeToAgentEvent('agent:session-error', cb),
    onSessionClosed: (cb: (event: unknown) => void) =>
      subscribeToAgentEvent('agent:session-closed', cb),
  },
});
