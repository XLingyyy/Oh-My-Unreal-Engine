import { useCallback, useEffect, useMemo, useState } from 'react';
import type { BridgeClient } from '../../services';
import {
  useAgentWorkbenchState,
  isInterruptedState,
} from '../../hooks/useAgentWorkbenchState';
import {
  DRAWER_ITEM_IDS,
  type DrawerItem,
} from '../../hooks/drawerNavigation';
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
import { THEME_ORDER, THEME_LABELS } from '../../theme/themes';
import { useSettings } from '../../hooks/useSettings';
import { useWorkbenchResponsiveState } from './useWorkbenchResponsiveState';
import { useDesktopCopy } from '../../i18n';
import type {
  AppearanceSettings,
  LanguageSettings,
  SettingsCategoryId,
} from './settings/settingsTypes';
import { persistUiLanguageChange, type UiLanguage } from './languagePreferenceState';
import {
  normalizeAppearanceAccent,
  persistAppearanceChange,
  type AppearancePatch,
} from './appearancePreferenceState';

interface AgentWorkbenchShellProps {
  client: BridgeClient;
  isMockClient: boolean;
}

function focusChatInput(): void {
  document.querySelector<HTMLInputElement>('[data-workbench-chat-input]')?.focus();
}

export function AgentWorkbenchShell({ client, isMockClient }: AgentWorkbenchShellProps) {
  const { theme, setTheme } = useTheme();
  const { copy, lang, setLang } = useDesktopCopy();
  const {
    settings,
    providerReadiness,
    safeStorageAvailable,
    loading: settingsLoading,
    error: settingsError,
    updateCategory,
    resetSettings,
    refreshSettings,
  } = useSettings();
  const state = useAgentWorkbenchState(client, isMockClient, providerReadiness);
  const [activeView, setActiveView] = useState<'chat' | 'settings'>('chat');
  const [settingsCategory, setSettingsCategory] = useState<SettingsCategoryId>('general');
  const [languageUpdatePending, setLanguageUpdatePending] = useState(false);
  const [appearancePreview, setAppearancePreview] =
    useState<AppearanceSettings>(settings.appearance);
  const [appearanceUpdatePending, setAppearanceUpdatePending] = useState(false);
  const responsive = useWorkbenchResponsiveState();
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
    const commandCopy = copy.ueAgentUi.commandPalette;
    const drawerLabels = copy.ueAgentUi.drawer.items;
    const list: CommandPaletteCommand[] = [
      {
        id: 'new-session',
        label: commandCopy.commands.newSession,
        group: commandCopy.groups.session,
        keywords: ['new', 'session', 'draft'],
        run: () => {
          setActiveView('chat');
          state.agent.handleNewSession();
        },
      },
      {
        id: 'resume-interrupted',
        label: commandCopy.commands.resumeInterrupted,
        group: commandCopy.groups.session,
        keywords: ['resume', 'interrupted', 'session'],
        disabled: !interruptedSessionId,
        disabledReason: !interruptedSessionId
          ? commandCopy.disabledReasons.resumeUnavailable
          : undefined,
        run: () => { if (interruptedSessionId) void state.agent.resumeSession(interruptedSessionId); },
      },
      {
        id: 'refresh-context',
        label: commandCopy.commands.refreshContext,
        group: commandCopy.groups.session,
        keywords: ['refresh', 'context', 'snapshot'],
        disabled: state.bridge.isRefreshing,
        disabledReason: state.bridge.isRefreshing
          ? commandCopy.disabledReasons.refreshInProgress
          : undefined,
        run: state.bridge.refreshContext,
      },
    ];

    for (const item of DRAWER_ITEM_IDS) {
      const drawerLabel = drawerLabels[item];
      list.push({
        id: `drawer-${item}`,
        label: commandCopy.commands.openDrawer(drawerLabel),
        group: commandCopy.groups.drawer,
        keywords: ['drawer', item, drawerLabel],
        disabled: !state.bridge.snapshot,
        disabledReason: !state.bridge.snapshot
          ? commandCopy.disabledReasons.contextRequired
          : undefined,
        run: () => state.drawer.openDrawer(item),
      });
    }

    list.push(
      {
        id: 'open-settings',
        label: commandCopy.commands.openSettings,
        group: commandCopy.groups.settings,
        keywords: ['open', 'settings'],
        run: () => openSettings(),
      },
      {
        id: 'focus-chat-input',
        label: commandCopy.commands.focusChatInput,
        group: commandCopy.groups.session,
        keywords: ['focus', 'chat', 'input'],
        disabled: activeView !== 'chat',
        disabledReason: activeView !== 'chat'
          ? commandCopy.disabledReasons.chatViewRequired
          : undefined,
        run: focusChatInput,
      },
    );

    return list;
  }, [
    interruptedSessionId,
    activeView,
    copy.ueAgentUi.commandPalette,
    copy.ueAgentUi.drawer.items,
    state.agent.handleNewSession,
    state.agent.resumeSession,
    state.bridge.isRefreshing,
    state.bridge.refreshContext,
    state.bridge.snapshot,
    state.drawer.openDrawer,
    openSettings,
  ]);

  const palette = useCommandPalette(commands);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (palette.isOpen) return;
        if (responsive.inspectorDrawerOpen) {
          responsive.setInspectorDrawerOpen(false);
          return;
        }
        if (state.drawer.isDrawerOpen) state.drawer.closeDrawer();
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [palette.isOpen, responsive, state.drawer]);

  useEffect(() => {
    if (settingsLoading || appearanceUpdatePending) return;
    setAppearancePreview(settings.appearance);
    if (settings.appearance.theme !== theme) {
      setTheme(settings.appearance.theme);
    }
  }, [
    settingsLoading,
    appearanceUpdatePending,
    settings.appearance,
    theme,
    setTheme,
  ]);

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

  const handleUpdateAppearance = useCallback(async (
    patch: AppearancePatch,
  ): Promise<{ ok: boolean; error?: string }> => {
    if (appearanceUpdatePending) {
      return { ok: false, error: 'Appearance update already in progress' };
    }

    const current = appearancePreview;
    setAppearanceUpdatePending(true);
    try {
      return await persistAppearanceChange({
        current,
        patch,
        apply: next => {
          setAppearancePreview(next);
          setTheme(next.theme);
        },
        persist: async nextPatch => {
          const result = await updateCategory('appearance', nextPatch);
          return {
            ok: result.ok,
            ...(result.error ? { error: result.error } : {}),
          };
        },
      });
    } finally {
      setAppearanceUpdatePending(false);
    }
  }, [
    appearancePreview,
    appearanceUpdatePending,
    setTheme,
    updateCategory,
  ]);

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
  const explorerEnabled = appearancePreview.layouts.showProjectExplorer;
  const inspectorEnabled = appearancePreview.layouts.showRightInspector;
  const explorerVisibleInline =
    responsive.layout === 'full' || responsive.layout === 'narrow';
  const showExplorerOverlay = explorerIsOverlay && explorerEnabled;

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
              targetAssetPath={state.composer.state.targetAssetPath}
              manualTargetAssetPath={state.composer.targetChoice}
              isRefreshing={state.bridge.isRefreshing}
              refreshError={state.bridge.error}
              onRefresh={state.bridge.refreshContext}
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
          targetAssetPath={state.composer.state.targetAssetPath}
          manualTargetAssetPath={state.composer.targetChoice}
          isRefreshing={state.bridge.isRefreshing}
          refreshError={state.bridge.error}
          onRefresh={state.bridge.refreshContext}
          onSelectAsset={state.composer.selectAssetTarget}
        />
      );
    }
    return null;
  };

  const renderRightInspector = () => {
    if (inspectorUsesDrawer) {
      if (!inspectorEnabled || !responsive.inspectorDrawerOpen) {
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
              evidence={state.inspector.evidence}
              changes={state.inspector.changes}
              logs={state.inspector.logs}
            />
          </aside>
        </>
      );
    }
    return (
      <RightInspector
        evidence={state.inspector.evidence}
        changes={state.inspector.changes}
        logs={state.inspector.logs}
      />
    );
  };

  const topBarExplorerProps =
    responsive.layout === 'compact' && explorerEnabled
      ? {
          onToggleExplorer: () => responsive.toggleProjectExplorer(),
          explorerVisible: !responsive.projectExplorerCollapsed,
        }
      : {};
  return (
    <div
      className="workbench-root"
      tabIndex={-1}
      data-theme={appearancePreview.theme}
      data-accent={normalizeAppearanceAccent(appearancePreview.accentColor)}
      data-density={appearancePreview.density}
      data-font-size={appearancePreview.fontSize}
      data-show-left-rail={String(appearancePreview.layouts.showLeftRail)}
      data-show-project-explorer={String(appearancePreview.layouts.showProjectExplorer)}
      data-show-right-inspector={String(appearancePreview.layouts.showRightInspector)}
      data-show-timestamps={String(appearancePreview.chatDisplay.showTimestamps)}
      data-show-avatars={String(appearancePreview.chatDisplay.showAvatars)}
      data-syntax-highlight={String(appearancePreview.chatDisplay.codeSyntaxHighlight)}
      data-collapse-long={String(appearancePreview.chatDisplay.collapseLongMessages)}
      data-show-actions={String(appearancePreview.chatDisplay.showActionButtons)}
    >
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
              presentation={{
                ...appearancePreview.chatDisplay,
                language: lang,
                timeFormat: settings.language.timeFormat,
              }}
            />
            {renderRightInspector()}
          </>
        ) : (
          <SettingsPage
            settings={{ ...settings, appearance: appearancePreview }}
            initialCategory={settingsCategory}
            onUpdateCategory={updateCategory}
            onUpdateLanguage={handleUpdateLanguage}
            uiLanguageUpdating={languageUpdatePending}
            onUpdateAppearance={handleUpdateAppearance}
            appearanceUpdating={appearanceUpdatePending}
            onResetSettings={handleResetSettings}
            onRefreshSettings={refreshSettings}
            onBack={handleBackToChat}
            themeNames={THEME_ORDER}
            themeLabels={THEME_LABELS}
            safeStorageAvailable={safeStorageAvailable}
            loading={settingsLoading}
            error={settingsError}
            connectionView={state.status.ueConnection}
            providerReadiness={providerReadiness}
          />
        )}
      </div>

      {inspectorUsesDrawer && inspectorEnabled && (
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

      <DrawerPanel
        state={state}
        client={client}
        isMockClient={isMockClient}
        isCommandPaletteOpen={palette.isOpen}
      />
      <CommandPalette
        isOpen={palette.isOpen}
        dialogLabel={copy.ueAgentUi.commandPalette.dialogLabel}
        searchPlaceholder={copy.ueAgentUi.commandPalette.searchPlaceholder}
        emptyLabel={copy.ueAgentUi.commandPalette.empty}
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
