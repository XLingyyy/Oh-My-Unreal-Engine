import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BridgeClient } from '../../services';
import {
  useAgentWorkbenchState,
  isInterruptedState,
  type DrawerItem,
} from '../../hooks/useAgentWorkbenchState';
import { useTheme } from '../../hooks/useTheme';
import { useCommandPalette, type CommandPaletteCommand } from '../../hooks/useCommandPalette';
import { DrawerPanel } from './DrawerPanel';
import { CommandPalette } from './CommandPalette';
import { TopBar } from './TopBar';
import { LeftRail } from './LeftRail';
import { ProjectExplorer } from './ProjectExplorer';
import { ChatPanel } from './ChatPanel';
import { RightInspector } from './RightInspector';
import { SettingsPage } from './SettingsPage';
import { isThemeName, type ThemeName } from '../../theme/themes';
import { THEME_ORDER, THEME_LABELS } from '../../theme/themes';
import { useSettings } from '../../hooks/useSettings';
import { useWorkbenchResponsiveState } from './useWorkbenchResponsiveState';
import { useDesktopCopy } from '../../i18n';
import type { LanguageSettings, SettingsCategoryId } from './settings/settingsTypes';
import { persistUiLanguageChange, type UiLanguage } from './languagePreferenceState';

interface AgentWorkbenchShellProps {
  client: BridgeClient;
  isMockClient: boolean;
}

function focusChatInput(): void {
  document.querySelector<HTMLInputElement>('[data-workbench-chat-input]')?.focus();
}

const DRAWER_COMMANDS: Array<[DrawerItem, string]> = [
  ['session-notes', 'Open drawer: Session Notes'],
  ['queue', 'Open drawer: Queue'],
  ['questions', 'Open drawer: Questions'],
  ['handoff', 'Open drawer: Handoff'],
  ['closure', 'Open drawer: Closure'],
  ['change-plan', 'Open drawer: Change Plan'],
  ['bp-change-workspace', 'Open drawer: BP Change WS'],
];

const THEME_STORAGE_KEY = 'omue.ui.theme';

export function AgentWorkbenchShell({ client, isMockClient }: AgentWorkbenchShellProps) {
  const { theme, setTheme } = useTheme();
  const { copy, lang, setLang } = useDesktopCopy();
  const { settings, providerReadiness, safeStorageAvailable, loading: settingsLoading, error: settingsError, updateSettings, updateCategory, resetSettings, refreshSettings, applyPersistedTheme } = useSettings();
  const state = useAgentWorkbenchState(client, isMockClient, providerReadiness);
  const [activeView, setActiveView] = useState<'chat' | 'settings'>('chat');
  const [settingsCategory, setSettingsCategory] = useState<SettingsCategoryId>('general');
  const [languageUpdatePending, setLanguageUpdatePending] = useState(false);
  const responsive = useWorkbenchResponsiveState();
  const prevThemeRef = useRef<ThemeName>(theme);
  const selectedSession = state.agent.selectedSession;
  const interruptedSessionId =
    isInterruptedState(selectedSession?.currentState ?? 'draft')
      ? selectedSession?.sessionId
      : state.agent.sessionGroups.interrupted[0]?.sessionId;

  const inspectorUsesDrawer = responsive.layout === 'inspectorDrawer' || responsive.layout === 'compact';
  const explorerIsOverlay = responsive.layout === 'compact' && responsive.projectExplorerCollapsed === false;
  const openSettings = useCallback((category: SettingsCategoryId = 'general') => {
    setSettingsCategory(category);
    setActiveView('settings');
  }, []);

  const commands = useMemo<CommandPaletteCommand[]>(() => {
    const list: CommandPaletteCommand[] = [
      { id: 'new-session', label: 'New repair session', group: 'Session', run: focusChatInput },
      {
        id: 'resume-interrupted',
        label: 'Resume interrupted session',
        group: 'Session',
        disabled: !interruptedSessionId,
        run: () => { if (interruptedSessionId) void state.agent.resumeSession(interruptedSessionId); },
      },
      {
        id: 'refresh-context',
        label: 'Refresh context',
        group: 'Session',
        run: state.bridge.refreshContext,
      },
    ];

    for (const [item, label] of DRAWER_COMMANDS) {
      list.push({
        id: `drawer-${item}`,
        label,
        group: 'Drawer',
        run: () => state.drawer.openDrawer(item),
      });
    }

    list.push(
      { id: 'open-settings', label: 'Open settings', group: 'Settings', run: () => openSettings() },
      { id: 'focus-chat-input', label: 'Focus chat input', group: 'Session', run: focusChatInput },
    );

    return list;
  }, [
    interruptedSessionId,
    state.agent,
    state.bridge.refreshContext,
    state.drawer,
    openSettings,
  ]);

  const palette = useCommandPalette(commands);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (responsive.inspectorDrawerOpen) {
          responsive.setInspectorDrawerOpen(false);
          return;
        }
        if (state.drawer.isDrawerOpen) state.drawer.closeDrawer();
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [responsive, state.drawer]);

  useEffect(() => {
    let cancelled = false;

    try {
      const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
      if (storedTheme && isThemeName(storedTheme)) {
        if (storedTheme !== theme) {
          setTheme(storedTheme);
        }
        return undefined;
      }

      void window.omue.getInitialTheme()
        .then(initialTheme => {
          if (cancelled) {
            return;
          }

          const preferredTheme = initialTheme === 'light' ? 'light' : 'ue-agent';
          if (preferredTheme !== theme) {
            setTheme(preferredTheme);
          }
        })
        .catch(() => {
          if (!cancelled && theme !== 'ue-agent') {
            setTheme('ue-agent');
          }
        });
    } catch {
      if (theme !== 'ue-agent') {
        setTheme('ue-agent');
      }
    }

    return () => {
      cancelled = true;
    };
  }, [setTheme, theme]);

  useEffect(() => {
    if (settingsLoading) return;

    applyPersistedTheme(persistedTheme => {
      prevThemeRef.current = theme;
      if (persistedTheme !== theme) {
        setTheme(persistedTheme);
      }
    });
  }, [settingsLoading, applyPersistedTheme, theme, setTheme]);

  useEffect(() => {
    if (settingsLoading || languageUpdatePending) return;
    const persistedLanguage = settings.language.uiLanguage;
    if (persistedLanguage !== lang) {
      setLang(persistedLanguage);
    }
  }, [
    settingsLoading,
    languageUpdatePending,
    settings.language.uiLanguage,
    lang,
    setLang,
  ]);

  const handleSetTheme = useCallback(async (next: string) => {
    const nextTheme = next as ThemeName;
    prevThemeRef.current = theme;
    setTheme(nextTheme);
    const result = await updateCategory('appearance', { theme: nextTheme });
    if (!result.ok) {
      setTheme(prevThemeRef.current);
    }
  }, [theme, setTheme, updateCategory]);

  const handleUpdateLanguage = useCallback(async (patch: Partial<LanguageSettings>): Promise<{ ok: boolean; error?: string }> => {
    if (patch.uiLanguage === undefined) {
      const result = await updateCategory('language', patch);
      return { ok: result.ok, ...(result.error ? { error: result.error } : {}) };
    }
    setLanguageUpdatePending(true);
    try {
      const previousLanguage: UiLanguage = lang;
      const nextLanguage: UiLanguage = patch.uiLanguage;
      const result = await persistUiLanguageChange({
        previousLanguage,
        nextLanguage,
        setLanguage: setLang,
        persist: async next => {
          const writeResult = await updateCategory('language', { ...patch, uiLanguage: next });
          return { ok: writeResult.ok, ...(writeResult.error ? { error: writeResult.error } : {}) };
        },
      });
      return result;
    } finally {
      setLanguageUpdatePending(false);
    }
  }, [lang, setLang, updateCategory]);

  const handleResetSettings = useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
    const result = await resetSettings();
    if (result.ok) {
      setLang('zh-CN');
    }
    return { ok: result.ok, ...(result.error ? { error: result.error } : {}) };
  }, [resetSettings, setLang]);

  const handleBackToChat = useCallback(() => {
    void refreshSettings().finally(() => {
      setActiveView('chat');
    });
  }, [refreshSettings]);

  const snapshot = state.bridge.snapshot;
  const explorerVisibleInline =
    responsive.layout === 'full' || responsive.layout === 'narrow';
  const showExplorerOverlay = explorerIsOverlay;

  const renderProjectExplorer = () => {
    if (showExplorerOverlay) {
      return (
        <>
          <div
            className="wb-explorer-overlay-backdrop"
            onClick={() => responsive.setProjectExplorerCollapsed(true)}
            aria-hidden="true"
          />
          <div
            className="ue-explorer ue-explorer-overlay"
            role="dialog"
            aria-label={copy.ueAgentUi.projectExplorer.overlayLabel}
          >
            <ProjectExplorer
              currentAsset={state.composer.currentAsset}
              openAssets={state.composer.openAssets}
              selectedAssetPath={state.composer.state.targetAssetPath}
              onSelectAsset={state.composer.selectAssetTarget}
            />
          </div>
        </>
      );
    }
    if (explorerVisibleInline) {
      return (
        <ProjectExplorer
          currentAsset={state.composer.currentAsset}
          openAssets={state.composer.openAssets}
          selectedAssetPath={state.composer.state.targetAssetPath}
          onSelectAsset={state.composer.selectAssetTarget}
        />
      );
    }
    return null;
  };

  const renderRightInspector = () => {
    if (inspectorUsesDrawer) {
      if (!responsive.inspectorDrawerOpen) {
        return null;
      }
      return (
        <>
          <div
            className="wb-inspector-overlay-backdrop"
            onClick={() => responsive.setInspectorDrawerOpen(false)}
            aria-hidden="true"
          />
          <aside
            className="ue-inspector ue-inspector-overlay"
            aria-label={copy.ueAgentUi.rightInspector.overlayLabel}
          >
            <RightInspector
              evidenceItems={state.inspector.evidence.items}
              evidenceMode={state.inspector.evidence.mode}
              changeItems={state.inspector.changes.items}
              changesMode={state.inspector.changes.mode}
              logEntries={state.inspector.logs.entries}
              logsMode={state.inspector.logs.mode}
            />
          </aside>
        </>
      );
    }
    return (
      <RightInspector
        evidenceItems={state.inspector.evidence.items}
        evidenceMode={state.inspector.evidence.mode}
        changeItems={state.inspector.changes.items}
        changesMode={state.inspector.changes.mode}
        logEntries={state.inspector.logs.entries}
        logsMode={state.inspector.logs.mode}
      />
    );
  };

  const topBarExplorerProps =
    responsive.layout === 'compact'
      ? {
          onToggleExplorer: () => responsive.toggleProjectExplorer(),
          explorerVisible: !responsive.projectExplorerCollapsed,
        }
      : {};
  return (
    <div className="workbench-root" data-theme={theme}>
      <TopBar
        onOpenSettings={() => openSettings()}
        projectName={snapshot?.project.projectName ?? 'MyProject'}
        engineVersion={snapshot?.project.engineVersion ?? '5.4'}
        agentBadge={state.status.topBarAgentBadge}
        bpBadge={state.status.bpBadge}
        sandboxIndicator={state.status.sandboxIndicator}
        scope={state.status.scope}
        {...topBarExplorerProps}
      />

      <div className={`workbench-body workbench-body-${responsive.layout}`}>
        <LeftRail
          activeView={activeView}
          onChangeView={view => {
            if (view === 'settings') {
              openSettings();
            } else {
              setActiveView(view);
            }
          }}
        />
        {activeView === 'chat' ? (
          <>
            {renderProjectExplorer()}
            <ChatPanel
              state={state}
              client={client}
              isMockClient={isMockClient}
              providerReady={providerReadiness.status === 'ready'}
              diagnosisModel={providerReadiness.diagnosisModel}
              onOpenSettings={() => openSettings('modelProviders')}
              onBeforeStartSession={refreshSettings}
            />
            {renderRightInspector()}
          </>
        ) : (
          <SettingsPage
            settings={settings}
            initialCategory={settingsCategory}
            onUpdateCategory={updateCategory}
            onUpdateLanguage={handleUpdateLanguage}
            uiLanguageUpdating={languageUpdatePending}
            onResetSettings={handleResetSettings}
            onRefreshSettings={refreshSettings}
            onBack={handleBackToChat}
            themeNames={THEME_ORDER}
            themeLabels={THEME_LABELS}
            onSetTheme={handleSetTheme}
            safeStorageAvailable={safeStorageAvailable}
            loading={settingsLoading}
            error={settingsError}
            connectionView={state.status.ueConnection}
            providerReadiness={providerReadiness}
          />
        )}
      </div>

      {inspectorUsesDrawer && (
        <button
          type="button"
          className="wb-inspector-floating-toggle"
          onClick={() => responsive.toggleInspectorDrawer()}
          aria-label={
            responsive.inspectorDrawerOpen
              ? copy.ueAgentUi.rightInspector.floatingCloseAria
              : copy.ueAgentUi.rightInspector.floatingOpenAria
          }
          aria-expanded={responsive.inspectorDrawerOpen}
        >
          {responsive.inspectorDrawerOpen ? '×' : 'ⓘ'}
        </button>
      )}

      <DrawerPanel state={state} client={client} />
      <CommandPalette
        isOpen={palette.isOpen}
        query={palette.query}
        setQuery={palette.setQuery}
        commands={palette.filteredCommands}
        selectedIndex={palette.selectedIndex}
        setSelectedIndex={palette.setSelectedIndex}
        onClose={palette.close}
        onSelectNext={palette.selectNext}
        onSelectPrevious={palette.selectPrevious}
        onRunSelected={palette.runSelected}
      />
    </div>
  );
}
