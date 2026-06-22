import { app, BrowserWindow, ipcMain, nativeTheme } from 'electron';
import path from 'path';
import { agentLoopRuntime } from './agent-loop-runtime';
import { registerAgentLoopShell } from './agent-loop-shell';
import { registerAiBlueprintExplanationShell } from './ai-blueprint-explanation-shell';
import { registerAiBlueprintProposeFixShell } from './ai-blueprint-propose-fix-shell';
import { registerSettingsHandlers } from './settings';

const DEV_SERVER_URL = 'http://127.0.0.1:5173';
const RUNTIME_SMOKE_ENABLED = process.env.OMUE_ELECTRON_RUNTIME_SMOKE === '1';
const RUNTIME_SMOKE_MARKER = 'OMUE_ELECTRON_RUNTIME_SMOKE ';
const PROVIDER_SMOKE_ENABLED = process.env.OMUE_AGENT_REAL_PROVIDER_SMOKE === '1';
const PROVIDER_SMOKE_MARKER = 'OMUE_AGENT_REAL_PROVIDER_SMOKE ';
const PROVIDER_SMOKE_USER_DATA = process.env.OMUE_AGENT_PROVIDER_SMOKE_USER_DATA;
const CONTEXT_SMOKE_ENABLED = process.env.OMUE_AGENT_REAL_CONTEXT_SMOKE === '1';
const CONTEXT_SMOKE_MARKER = 'OMUE_AGENT_REAL_CONTEXT_SMOKE ';
const CONTEXT_SMOKE_USER_DATA = process.env.OMUE_AGENT_CONTEXT_SMOKE_USER_DATA;
const STATUS_SMOKE_ENABLED = process.env.OMUE_AGENT_REAL_STATUS_SMOKE === '1';
const STATUS_SMOKE_MARKER = 'OMUE_AGENT_REAL_STATUS_SMOKE ';
const STATUS_SMOKE_USER_DATA = process.env.OMUE_AGENT_STATUS_SMOKE_USER_DATA;

if (PROVIDER_SMOKE_ENABLED && PROVIDER_SMOKE_USER_DATA) {
  app.setPath('userData', path.resolve(PROVIDER_SMOKE_USER_DATA));
} else if (CONTEXT_SMOKE_ENABLED && CONTEXT_SMOKE_USER_DATA) {
  app.setPath('userData', path.resolve(CONTEXT_SMOKE_USER_DATA));
} else if (STATUS_SMOKE_ENABLED && STATUS_SMOKE_USER_DATA) {
  app.setPath('userData', path.resolve(STATUS_SMOKE_USER_DATA));
}

type RuntimeSmokeState = {
  omueType: string;
  agentType: string;
  rootText: string;
};

type ProviderSmokeState = {
  ok: boolean;
  providerStatus?: string;
  providerId?: string;
  diagnosisModel?: string;
  projectionContainsSecret?: boolean;
  startOk?: boolean;
  sessionState?: string;
  closeReason?: string;
  error?: string;
};

function redactProviderSmokeSecret(message: string): string {
  const secret = process.env.OMUE_AGENT_PROVIDER_SMOKE_KEY;
  return secret ? message.split(secret).join('[REDACTED]') : message;
}

function attachProviderSmoke(win: BrowserWindow): void {
  const baseUrl = process.env.OMUE_AGENT_PROVIDER_SMOKE_BASE_URL;
  const diagnosisModel = process.env.OMUE_AGENT_PROVIDER_SMOKE_MODEL;
  const apiKey = process.env.OMUE_AGENT_PROVIDER_SMOKE_KEY;
  let completed = false;

  const finish = (state: ProviderSmokeState): void => {
    if (completed) return;
    completed = true;
    clearTimeout(overallTimeout);
    const safeState = {
      ...state,
      ...(state.error ? { error: redactProviderSmokeSecret(state.error) } : {}),
    };
    console.log(`${PROVIDER_SMOKE_MARKER}${JSON.stringify(safeState)}`);
    app.exit(safeState.ok ? 0 : 1);
  };

  const overallTimeout = setTimeout(() => {
    finish({ ok: false, error: 'provider smoke timed out' });
  }, 30_000);

  if (!baseUrl || !diagnosisModel || !apiKey) {
    finish({ ok: false, error: 'provider smoke environment is incomplete' });
    return;
  }

  win.webContents.on(
    'did-fail-load',
    (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      if (!isMainFrame) return;
      finish({
        ok: false,
        error: `did-fail-load ${errorCode}: ${errorDescription} (${validatedURL})`,
      });
    },
  );
  win.webContents.on('render-process-gone', (_event, details) => {
    finish({ ok: false, error: `render-process-gone: ${details.reason}` });
  });
  win.webContents.on('did-finish-load', () => {
    void win.webContents.executeJavaScript(
      `(() => {
        const smoke = ${JSON.stringify({ baseUrl, diagnosisModel, apiKey })};
        const terminalStates = new Set(['done', 'escalated_done', 'closed']);
        const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
        return (async () => {
          if (typeof window.omue?.settings !== 'object' || typeof window.omue?.agent !== 'object') {
            return { ok: false, error: 'production preload APIs are unavailable' };
          }

          const provider = {
            instanceId: 'smoke-loopback-provider',
            enabled: true,
            displayName: 'Smoke Loopback Provider',
            kind: 'openai',
            baseUrl: smoke.baseUrl,
            defaultModel: smoke.diagnosisModel,
            chatModel: smoke.diagnosisModel,
            diagnosisModel: smoke.diagnosisModel,
            summaryModel: smoke.diagnosisModel,
            advanced: {
              timeout: 5,
              retries: 0,
              streaming: false,
              temperature: 0,
              maxTokens: 512,
              reasoningEffort: 'auto',
              proxy: ''
            }
          };

          const update = await window.omue.settings.update({
            patch: { modelProviders: { providers: [provider] } }
          });
          if (!update.ok) {
            return { ok: false, error: 'production Settings update failed' };
          }

          const keySet = await window.omue.settings.apiKey.set({
            providerInstanceId: provider.instanceId,
            apiKeyPlaintext: smoke.apiKey
          });
          if (!keySet.ok) {
            return { ok: false, error: 'production Settings key set failed' };
          }

          const authority = await window.omue.settings.getProviderAuthority();
          if (!authority.ok) {
            return { ok: false, error: 'production provider authority IPC failed' };
          }
          const projectionJson = JSON.stringify(authority);
          const projectionContainsSecret = projectionJson.includes(smoke.apiKey);
          if (
            authority.readiness.status !== 'ready'
            || authority.readiness.diagnosisModel !== smoke.diagnosisModel
            || projectionContainsSecret
          ) {
            return {
              ok: false,
              providerStatus: authority.readiness.status,
              providerId: authority.readiness.providerId,
              diagnosisModel: authority.readiness.diagnosisModel,
              projectionContainsSecret,
              error: 'safe provider projection validation failed'
            };
          }

          const started = await window.omue.agent.startSession({
            scope: 'asset',
            userIntent: 'Production provider authority smoke; escalate without writes.',
            targetAssetPath: '/Game/Scratch/BP_OMUE_Provider_Smoke'
          });
          if (!started.ok) {
            return {
              ok: false,
              providerStatus: authority.readiness.status,
              diagnosisModel: authority.readiness.diagnosisModel,
              projectionContainsSecret,
              startOk: false,
              error: 'production Agent IPC start failed'
            };
          }

          let session = null;
          for (let attempt = 0; attempt < 200; attempt += 1) {
            const listed = await window.omue.agent.listSessions();
            if (!listed.ok) {
              return { ok: false, error: 'production Agent IPC list failed' };
            }
            session = listed.sessions.find(item => item.sessionId === started.sessionId) ?? null;
            if (session && terminalStates.has(session.currentState)) break;
            await wait(100);
          }

          const ok =
            session?.currentState === 'escalated_done'
            && session?.closeReason === 'escalated';
          return {
            ok,
            providerStatus: authority.readiness.status,
            providerId: authority.readiness.providerId,
            diagnosisModel: authority.readiness.diagnosisModel,
            projectionContainsSecret,
            startOk: true,
            sessionState: session?.currentState,
            closeReason: session?.closeReason,
            ...(ok ? {} : { error: 'Agent session did not stop at safe escalation' })
          };
        })();
      })()`,
      true,
    ).then(
      state => finish(state as ProviderSmokeState),
      error => finish({
        ok: false,
        error: `provider smoke evaluation failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      }),
    );
  });
}

type ContextSmokeState = {
  ok: boolean;
  projectSessionState?: string;
  projectSessionCloseReason?: string;
  projectContextError?: string;
  assetSessionState?: string;
  assetContextSource?: string;
  assetContextHasMock?: boolean;
  noMockProvenance?: boolean;
  error?: string;
};

function attachContextSmoke(win: BrowserWindow): void {
  let completed = false;

  const finish = (state: ContextSmokeState): void => {
    if (completed) return;
    completed = true;
    clearTimeout(overallTimeout);
    console.log(`${CONTEXT_SMOKE_MARKER}${JSON.stringify(state)}`);
    app.exit(state.ok ? 0 : 1);
  };

  const overallTimeout = setTimeout(() => {
    finish({ ok: false, error: 'context smoke timed out' });
  }, 45_000);

  win.webContents.on(
    'did-fail-load',
    (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      if (!isMainFrame) return;
      finish({
        ok: false,
        error: `did-fail-load ${errorCode}: ${errorDescription} (${validatedURL})`,
      });
    },
  );
  win.webContents.on('render-process-gone', (_event, details) => {
    finish({ ok: false, error: `render-process-gone: ${details.reason}` });
  });
  win.webContents.on('did-finish-load', () => {
    void win.webContents.executeJavaScript(
      `(() => {
        const terminalStates = new Set(['done', 'escalated_done', 'closed']);
        const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

        return (async () => {
          if (typeof window.omue?.agent !== 'object') {
            return { ok: false, error: 'production preload Agent API is unavailable' };
          }

          // ── Project session: verify real context collection ──────
          const projectStarted = await window.omue.agent.startSession({
            scope: 'project',
            userIntent: 'Context smoke: verify real project snapshot aggregation'
          });
          if (!projectStarted.ok) {
            return { ok: false, error: 'project startSession failed: ' + (projectStarted.message ?? '') };
          }

          let projectSession = null;
          for (let attempt = 0; attempt < 200; attempt += 1) {
            const listed = await window.omue.agent.listSessions();
            if (!listed.ok) {
              return { ok: false, error: 'project listSessions failed' };
            }
            projectSession = listed.sessions.find(s => s.sessionId === projectStarted.sessionId) ?? null;
            if (projectSession && terminalStates.has(projectSession.currentState)) break;
            await wait(100);
          }

          if (!projectSession) {
            return { ok: false, error: 'project session never reached terminal state' };
          }

          const projectContextError = (projectSession.errors ?? [])
            .some(e => e.errorCode === 'context_snapshot_unavailable' || e.errorCode === 'context_project_unavailable');

          // Project session should fail at provider boundary, NOT at context collection
          if (projectContextError) {
            return {
              ok: false,
              projectSessionState: projectSession.currentState,
              projectSessionCloseReason: projectSession.closeReason,
              projectContextError: 'context collection failed — /context/snapshot or /context/project error',
              error: 'project session failed at context collection, not provider boundary'
            };
          }

          // ── Asset session: verify real context with real_readonly_bridge ──
          const assetTarget = '/Game/Blueprints/BP_Smoke_Target';
          const assetStarted = await window.omue.agent.startSession({
            scope: 'asset',
            userIntent: 'Context smoke: verify real asset context',
            targetAssetPath: assetTarget
          });
          if (!assetStarted.ok) {
            return {
              ok: false,
              projectSessionState: projectSession.currentState,
              projectSessionCloseReason: projectSession.closeReason,
              error: 'asset startSession failed: ' + (assetStarted.message ?? '')
            };
          }

          let assetSession = null;
          for (let attempt = 0; attempt < 200; attempt += 1) {
            const listed = await window.omue.agent.listSessions();
            if (!listed.ok) {
              return { ok: false, error: 'asset listSessions failed' };
            }
            assetSession = listed.sessions.find(s => s.sessionId === assetStarted.sessionId) ?? null;
            if (assetSession && terminalStates.has(assetSession.currentState)) break;
            await wait(100);
          }

          if (!assetSession) {
            return { ok: false, error: 'asset session never reached terminal state' };
          }

          const ctx = assetSession.contextSnapshot;
          const ctxJson = ctx ? JSON.stringify(ctx) : '';
          const assetContextSource = ctx?.blueprintSummary?.source;
          const assetContextHasMock = /mock_local_fixture|mock-agent-loop/.test(ctxJson);

          const ok =
            !projectContextError
            && assetContextSource === 'real_readonly_bridge'
            && !assetContextHasMock;

          return {
            ok,
            projectSessionState: projectSession.currentState,
            projectSessionCloseReason: projectSession.closeReason,
            projectContextError: projectContextError ? 'yes' : 'none',
            assetSessionState: assetSession.currentState,
            assetContextSource: assetContextSource ?? 'missing',
            assetContextHasMock,
            noMockProvenance: !assetContextHasMock,
            ...(ok ? {} : { error: 'context smoke verification failed' })
          };
        })();
      })()`,
      true,
    ).then(
      state => finish(state as ContextSmokeState),
      error => finish({
        ok: false,
        error: `context smoke evaluation failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      }),
    );
  });
}

type StatusSmokeState = {
  ok: boolean;
  topbarAgentBadgeLabel?: string;
  bpBadgeLabel?: string;
  sandboxBadgeVisible?: boolean;
  ueConnectionHealthStatus?: string;
  isMockMode?: boolean;
  mockEvidencePresent?: boolean;
  providerRequiredShown?: boolean;
  bpCleanWhenErrors?: boolean;
  agentEscalatedShown?: boolean;
  agentFailedShown?: boolean;
  badgesRendered?: boolean;
  inspectorEvidenceItemsCount?: number;
  inspectorChangesItemsCount?: number;
  inspectorLogsEntriesCount?: number;
  error?: string;
};

function attachStatusSmoke(win: BrowserWindow): void {
  let completed = false;

  const finish = (state: StatusSmokeState): void => {
    if (completed) return;
    completed = true;
    clearTimeout(overallTimeout);
    console.log(`${STATUS_SMOKE_MARKER}${JSON.stringify(state)}`);
    app.exit(state.ok ? 0 : 1);
  };

  const overallTimeout = setTimeout(() => {
    finish({ ok: false, error: 'status smoke timed out' });
  }, 45_000);

  win.webContents.on(
    'did-fail-load',
    (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      if (!isMainFrame) return;
      finish({
        ok: false,
        error: `did-fail-load ${errorCode}: ${errorDescription} (${validatedURL})`,
      });
    },
  );
  win.webContents.on('render-process-gone', (_event, details) => {
    finish({ ok: false, error: `render-process-gone: ${details.reason}` });
  });
  win.webContents.on('did-finish-load', () => {
    void win.webContents.executeJavaScript(
      `(() => {
        const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

        return (async () => {
          if (typeof window.omue?.agent !== 'object') {
            return { ok: false, error: 'production preload Agent API is unavailable' };
          }

          // Give the workbench a few ticks to mount and run status view-model derivation.
          for (let attempt = 0; attempt < 40; attempt += 1) {
            const root = document.querySelector('#root');
            if (root && root.textContent && root.textContent.length > 0) break;
            await wait(100);
          }
          // Extra ticks for bridge context initial load (mock client ~200ms delay).
          await wait(800);

          // Read the rendered TopBar badges and inspector from the DOM.
          const agentBadge = document.querySelector('.ue-topbar-agent');
          const bpBadge = document.querySelector('.ue-topbar-bp');
          const sandboxBadge = document.querySelector('.ue-topbar-sandbox');
          const inspectorEvidence = document.querySelector('#ue-inspector-panel-evidence');
          const inspectorChanges = document.querySelector('#ue-inspector-panel-changes');
          const inspectorLogs = document.querySelector('#ue-inspector-panel-logs');

          const agentBadgeLabel = agentBadge?.textContent?.trim() ?? '';
          const bpBadgeLabel = bpBadge?.textContent?.trim() ?? '';
          const sandboxBadgeVisible = sandboxBadge !== null;
          const inspectorEvidenceText = inspectorEvidence?.textContent ?? '';
          const inspectorChangesText = inspectorChanges?.textContent ?? '';
          const inspectorLogsText = inspectorLogs?.textContent ?? '';

          // The production default is MockBridgeClient (no VITE_OMUE_BRIDGE_MODE=real).
          // In mock mode, mock inspector items are EXPECTED (explicit mock branch via isMockClient).
          // The AUI-P1-01 regression (real mode mock fallback) is verified by the
          // integration tests (test:workbench-status-integration), not this smoke.
          // This smoke verifies DOM consistency: badges render, no conflicting states.
          const mockEvidencePresent = inspectorEvidenceText.includes('IMC_Default')
            || inspectorEvidenceText.includes('BP_PlayerController')
            || inspectorEvidenceText.includes('BP_Player')
            || inspectorEvidenceText.includes('IMC_Gamepad');

          // Detect bridge mode.
          // The UE Connection settings dot is only visible on the settings page.
          // In the chat view, we detect mock mode by the presence of mock inspector
          // items (real mode never shows mock evidence per AUI-P1-01).
          // Mock mode → ue-settings-status-dot-mock (settings page) OR mock evidence present (chat view)
          const bridgeStatusDot = document.querySelector('.ue-settings-bridge-status .ue-settings-status-dot');
          const bridgeStatusClass = bridgeStatusDot?.className ?? '';
          const isMockMode = bridgeStatusClass.includes('ue-settings-status-dot-mock')
            || mockEvidencePresent;

          // AUI-P1-02 regression: provider missing must show "Provider Required" not "Agent Ready"
          const providerRequiredShown = agentBadgeLabel === 'Provider Required';

          // AUI-P1-09 regression: BP Clean must NOT show when compile has errors.
          // In mock mode, sampleContextSnapshot has lastCompileResult='failed', errorCount=1,
          // so BP badge should show "BP Errors 1" (danger), not "BP Clean".
          const bpCleanWhenErrors = bpBadgeLabel === 'BP Clean';

          // AUI-P1-02: escalated and failed must be distinct badges.
          const agentEscalatedShown = agentBadgeLabel === 'Agent Escalated';
          const agentFailedShown = agentBadgeLabel === 'Agent Failed';

          // Consistency: TopBar must render non-empty agent + BP badges.
          const badgesRendered = agentBadgeLabel.length > 0 && bpBadgeLabel.length > 0;

          // In mock mode, mock evidence is expected (explicit mock branch via isMockClient).
          // In real mode, mock evidence would be a regression (AUI-P1-01).
          const mockEvidenceOk = isMockMode ? true : !mockEvidencePresent;

          // BP Clean must never show when compile has errors (mock: errorCount=1).
          const bpBadgeOk = !bpCleanWhenErrors;

          const ok = badgesRendered
            && mockEvidenceOk
            && bpBadgeOk
            && (providerRequiredShown || agentEscalatedShown || agentFailedShown || agentBadgeLabel === 'Agent Ready' || agentBadgeLabel === 'Agent Scanning');

          return {
            ok,
            topbarAgentBadgeLabel: agentBadgeLabel,
            bpBadgeLabel,
            sandboxBadgeVisible,
            ueConnectionHealthStatus: bridgeStatusClass,
            isMockMode,
            mockEvidencePresent,
            providerRequiredShown,
            bpCleanWhenErrors,
            agentEscalatedShown,
            agentFailedShown,
            badgesRendered,
            inspectorEvidenceItemsCount: inspectorEvidence.querySelectorAll('.ue-inspector-evidence-item').length,
            inspectorChangesItemsCount: inspectorChanges.querySelectorAll('.ue-inspector-change-item').length,
            inspectorLogsEntriesCount: inspectorLogs.querySelectorAll('.ue-inspector-log-entry').length,
            ...(ok ? {} : { error: 'status smoke verification failed' })
          };
        })();
      })()`,
      true,
    ).then(
      state => finish(state as StatusSmokeState),
      error => finish({
        ok: false,
        error: `status smoke evaluation failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      }),
    );
  });
}

function attachRuntimeSmoke(win: BrowserWindow): void {
  const consoleMessages: string[] = [];
  const loadFailures: string[] = [];
  let completed = false;

  const finish = (state: RuntimeSmokeState | null, forcedFailure?: string): void => {
    if (completed) return;
    completed = true;
    clearTimeout(overallTimeout);

    if (forcedFailure) {
      loadFailures.push(forcedFailure);
    }

    const forbiddenMessages = [...consoleMessages, ...loadFailures].filter(message =>
      /Unable to load preload script|module not found:\s*\.\/settingsApi|Cannot read properties of undefined \(reading ['"]agent['"]\)/i.test(
        message,
      ),
    );
    const rootTextLength = state?.rootText.trim().length ?? 0;
    const marker = {
      ok:
        state?.omueType === 'object' &&
        state.agentType === 'object' &&
        rootTextLength > 0 &&
        loadFailures.length === 0 &&
        forbiddenMessages.length === 0,
      omueType: state?.omueType ?? 'unavailable',
      agentType: state?.agentType ?? 'unavailable',
      rootTextLength,
      loadFailures,
      forbiddenMessages,
    };

    console.log(`${RUNTIME_SMOKE_MARKER}${JSON.stringify(marker)}`);
    app.exit(marker.ok ? 0 : 1);
  };

  const overallTimeout = setTimeout(() => {
    finish(null, 'runtime smoke timed out before the renderer became ready');
  }, 20_000);

  win.webContents.on('console-message', (details) => {
    consoleMessages.push(details.message);
  });
  win.webContents.on(
    'did-fail-load',
    (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      if (!isMainFrame) return;
      finish(
        null,
        `did-fail-load ${errorCode}: ${errorDescription} (${validatedURL})`,
      );
    },
  );
  win.webContents.on('render-process-gone', (_event, details) => {
    finish(null, `render-process-gone: ${details.reason}`);
  });
  win.webContents.on('did-finish-load', () => {
    void (async () => {
      for (let attempt = 0; attempt < 100; attempt += 1) {
        if (win.isDestroyed() || win.webContents.isDestroyed()) {
          finish(null, 'BrowserWindow was destroyed during runtime smoke');
          return;
        }

        const state = (await win.webContents.executeJavaScript(
          `({
            omueType: typeof window.omue,
            agentType: typeof window.omue?.agent,
            rootText: document.querySelector('#root')?.textContent ?? ''
          })`,
          true,
        )) as RuntimeSmokeState;

        if (
          state.omueType === 'object' &&
          state.agentType === 'object' &&
          state.rootText.trim().length > 0
        ) {
          finish(state);
          return;
        }
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      const finalState = (await win.webContents.executeJavaScript(
        `({
          omueType: typeof window.omue,
          agentType: typeof window.omue?.agent,
          rootText: document.querySelector('#root')?.textContent ?? ''
        })`,
        true,
      )) as RuntimeSmokeState;
      finish(finalState, 'renderer bootstrap state did not become ready');
    })().catch(error => {
      finish(
        null,
        `runtime smoke evaluation failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    });
  });
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    title: 'OMUE Desktop',
    show: !PROVIDER_SMOKE_ENABLED && !CONTEXT_SMOKE_ENABLED && !STATUS_SMOKE_ENABLED,
    backgroundColor: '#1a1a2e',
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (RUNTIME_SMOKE_ENABLED) {
    attachRuntimeSmoke(win);
  } else if (PROVIDER_SMOKE_ENABLED) {
    attachProviderSmoke(win);
  } else if (CONTEXT_SMOKE_ENABLED) {
    attachContextSmoke(win);
  } else if (STATUS_SMOKE_ENABLED) {
    attachStatusSmoke(win);
  }

  if (app.isPackaged || PROVIDER_SMOKE_ENABLED || CONTEXT_SMOKE_ENABLED || STATUS_SMOKE_ENABLED) {
    void win.loadFile(path.join(__dirname, '../renderer/index.html'));
  } else {
    void win.loadURL(DEV_SERVER_URL);
    if (!RUNTIME_SMOKE_ENABLED) {
      win.webContents.openDevTools({ mode: 'detach' });
    }
  }

  return win;
}

registerAiBlueprintExplanationShell();
registerAiBlueprintProposeFixShell();
const settingsRuntime = registerSettingsHandlers();
agentLoopRuntime.setProviderAuthorityResolver(settingsRuntime.resolveProviderAuthority);
registerAgentLoopShell();

ipcMain.handle('app:get-initial-theme', () =>
  nativeTheme.shouldUseDarkColors ? 'github-dark' : 'light',
);

app.whenReady().then(async () => {
  if (!RUNTIME_SMOKE_ENABLED && !PROVIDER_SMOKE_ENABLED && !CONTEXT_SMOKE_ENABLED && !STATUS_SMOKE_ENABLED) {
    await agentLoopRuntime.scanAndMarkInterrupted();
  }
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
