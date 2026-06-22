const { app, BrowserWindow, ipcMain, nativeTheme } = require('electron');
const path = require('node:path');
const { createDefaultSettings } = require('@omue/shared-protocol');

const markerPrefix = 'OMUE_AGENT_REAL_SAFETY_UI ';
const userDataDir = process.env.OMUE_AGENT_SAFETY_SMOKE_USER_DATA;

if (userDataDir) {
  app.setPath('userData', path.resolve(userDataDir));
}

app.commandLine.appendSwitch('disable-gpu');

const settings = createDefaultSettings();
settings.assistant.defaultWorkMode = 'advanced-automation';
settings.assistant.repairBehaviors.autoRetryOnFailure = true;
settings.assistant.repairBehaviors.requireApproval = false;
settings.sandboxSecurity.defaultModificationMode = 'direct-write';
settings.sandboxSecurity.writeBackConfirmations = {
  sandboxApply: false,
  promote: false,
  rollback: false,
  bulkOperation: false,
};
settings.advanced.devToggles.bypassSandboxPromote = true;
settings.advanced.experimentalFeatures.enableMultiStepRepair = true;
settings.advanced.experimentalFeatures.enableAutoRollback = true;

ipcMain.handle('app:get-initial-theme', () =>
  nativeTheme.shouldUseDarkColors ? 'github-dark' : 'light');
ipcMain.handle('settings:get', () => ({
  ok: true,
  settings,
  safeStorageAvailable: false,
}));
ipcMain.handle('settings:get-provider-authority', () => ({
  ok: true,
  readiness: { status: 'missing_key', message: 'Safety smoke fixture' },
}));
ipcMain.handle('settings:update', () => ({ ok: true, settings }));
ipcMain.handle('settings:reset', () => ({ ok: true, settings }));
ipcMain.handle('settings:api-key:set', () => ({ ok: false, error: 'Unavailable in safety smoke' }));
ipcMain.handle('settings:api-key:clear', () => ({ ok: true }));
ipcMain.handle('settings:test-provider-connection', () => ({
  ok: false,
  error: 'Unavailable in safety smoke',
}));
ipcMain.handle('agent:list-sessions', () => ({ ok: true, sessions: [] }));
ipcMain.handle('agent:subscribe', () => ({ ok: true }));
for (const channel of [
  'agent:start-session',
  'agent:cancel-session',
  'agent:approve-promote',
  'agent:reject-promote',
  'agent:resume-session',
  'agent:discard-session',
]) {
  ipcMain.handle(channel, () => ({
    ok: false,
    errorCode: 'smoke_unavailable',
    message: 'Unavailable in Settings safety UI smoke',
  }));
}

function finish(state, exitCode) {
  console.log(`${markerPrefix}${JSON.stringify(state)}`);
  setTimeout(() => app.exit(exitCode), 50);
}

app.whenReady().then(() => {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    show: false,
    backgroundColor: '#1a1a2e',
    webPreferences: {
      preload: path.join(__dirname, '../dist/preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const timeout = setTimeout(async () => {
    let diagnostics = {};
    try {
      diagnostics = await win.webContents.executeJavaScript(`
        ({
          omueType: typeof window.omue,
          settingsType: typeof window.omue?.settings,
          agentType: typeof window.omue?.agent,
          rootText: document.querySelector('#root')?.textContent ?? '',
          buttons: Array.from(document.querySelectorAll('button')).map(button => ({
            text: button.textContent?.trim() ?? '',
            ariaLabel: button.getAttribute('aria-label'),
            title: button.getAttribute('title'),
            disabled: button.disabled,
          })),
        })
      `, true);
    } catch (error) {
      diagnostics = {
        diagnosticError: error instanceof Error ? error.message : String(error),
      };
    }
    finish({
      ok: false,
      error: 'Settings safety UI smoke timed out',
      diagnostics,
    }, 1);
  }, 30_000);

  win.webContents.once('did-finish-load', () => {
    win.webContents.executeJavaScript(`
      (async () => {
        const waitFor = async (predicate, label) => {
          const startedAt = Date.now();
          while (Date.now() - startedAt < 10000) {
            const value = predicate();
            if (value) return value;
            await new Promise(resolve => setTimeout(resolve, 50));
          }
          throw new Error('Timed out waiting for ' + label);
        };

        const settingsButton = await waitFor(
          () => document.querySelector('button[aria-label="Open settings"]'),
          'Settings button',
        );
        settingsButton.click();
        await waitFor(
          () => document.querySelector('.ue-settings-page'),
          'Settings page',
        );

        const inspectCategory = async (categoryId) => {
          const button = await waitFor(
            () => document.querySelector('#ue-settings-sidebar-item-' + categoryId),
            categoryId + ' category',
          );
          button.click();
          await new Promise(resolve => setTimeout(resolve, 50));
          const content = document.querySelector('.ue-settings-content');
          const enabledControls = Array.from(content.querySelectorAll(
            'input:not(:disabled), select:not(:disabled), textarea:not(:disabled), button:not(:disabled)'
          )).map(node => ({
            tag: node.tagName,
            type: node.getAttribute('type'),
            text: node.textContent?.trim() ?? '',
          }));
          return {
            text: content.textContent ?? '',
            enabledControls,
          };
        };

        const sandbox = await inspectCategory('sandboxSecurity');
        const assistant = await inspectCategory('assistant');
        const advanced = await inspectCategory('advanced');
        const allText = [sandbox.text, assistant.text, advanced.text].join('\\n');

        return {
          ok: true,
          sandboxEnabledControls: sandbox.enabledControls,
          assistantEnabledControls: assistant.enabledControls,
          advancedEnabledControls: advanced.enabledControls,
          hardSafetyCopyPresent:
            sandbox.text.includes('Sandbox is always enforced for asset execution')
            && sandbox.text.includes('Human approval is always required')
            && sandbox.text.includes('Promote always requires explicit confirmation')
            && sandbox.text.includes('Settings cannot disable or bypass'),
          unavailableCopyPresent:
            assistant.text.includes('Assistant behavior controls are unavailable')
            && advanced.text.includes('Advanced runtime controls are unavailable')
            && advanced.text.includes('Automation and automatic rollback are unavailable'),
          dangerousCopyRendered: /Direct write|Bypass sandbox|Advanced automation|Auto-retry on failure|Enable auto-rollback/i.test(allText),
        };
      })()
    `, true).then(state => {
      clearTimeout(timeout);
      const controls = [
        ...state.sandboxEnabledControls,
        ...state.assistantEnabledControls,
        ...state.advancedEnabledControls,
      ];
      const ok = state.ok
        && controls.length === 0
        && state.hardSafetyCopyPresent
        && state.unavailableCopyPresent
        && !state.dangerousCopyRendered;
      finish({ ...state, ok }, ok ? 0 : 1);
    }).catch(async error => {
      clearTimeout(timeout);
      let diagnostics = {};
      try {
        diagnostics = await win.webContents.executeJavaScript(`
          ({
            omueType: typeof window.omue,
            settingsType: typeof window.omue?.settings,
            agentType: typeof window.omue?.agent,
            rootText: document.querySelector('#root')?.textContent ?? '',
            buttons: Array.from(document.querySelectorAll('button')).map(button => ({
              text: button.textContent?.trim() ?? '',
              ariaLabel: button.getAttribute('aria-label'),
              title: button.getAttribute('title'),
              disabled: button.disabled,
            })),
          })
        `, true);
      } catch (diagnosticError) {
        diagnostics = {
          diagnosticError: diagnosticError instanceof Error
            ? diagnosticError.message
            : String(diagnosticError),
        };
      }
      finish({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        diagnostics,
      }, 1);
    });
  });

  void win.loadFile(path.join(__dirname, '../dist/renderer/index.html'));
});

app.on('window-all-closed', () => app.quit());
