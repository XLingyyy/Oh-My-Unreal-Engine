const { app, BrowserWindow, ipcMain, nativeTheme } = require('electron');
const path = require('node:path');

const desktopDir = path.resolve(__dirname, '..');
const userDataDir = process.env.OMUE_AGENT_RECOVERY_SMOKE_USER_DATA;
const debugPort = process.env.OMUE_AGENT_RECOVERY_SMOKE_DEBUG_PORT;

if (!userDataDir || !debugPort) {
  throw new Error('Recovery smoke runner requires isolated user data and a debug port.');
}

app.setPath('userData', path.resolve(userDataDir));
app.commandLine.appendSwitch('remote-debugging-port', debugPort);
app.commandLine.appendSwitch('remote-allow-origins', '*');

const { agentLoopRuntime } = require('../dist/main/agent-loop-runtime.js');
const { registerAgentLoopShell } = require('../dist/main/agent-loop-shell.js');
const {
  registerAiBlueprintExplanationShell,
} = require('../dist/main/ai-blueprint-explanation-shell.js');
const {
  registerAiBlueprintProposeFixShell,
} = require('../dist/main/ai-blueprint-propose-fix-shell.js');
const { registerSettingsHandlers } = require('../dist/main/settings/index.js');

registerAiBlueprintExplanationShell();
registerAiBlueprintProposeFixShell();
const settingsRuntime = registerSettingsHandlers();
agentLoopRuntime.setProviderAuthorityResolver(settingsRuntime.resolveProviderAuthority);
registerAgentLoopShell();

ipcMain.handle('app:get-initial-theme', () =>
  nativeTheme.shouldUseDarkColors ? 'github-dark' : 'light');

app.whenReady().then(async () => {
  await agentLoopRuntime.scanAndMarkInterrupted();
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    show: false,
    backgroundColor: '#1a1a2e',
    webPreferences: {
      preload: path.join(desktopDir, 'dist/preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  await win.loadFile(path.join(desktopDir, 'dist/renderer/index.html'));
});

app.on('window-all-closed', () => app.quit());
