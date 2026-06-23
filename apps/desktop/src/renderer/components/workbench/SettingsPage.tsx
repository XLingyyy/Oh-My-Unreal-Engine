import { useEffect, useRef, useState } from 'react';
import { useDesktopCopy } from '../../i18n';
import type { SettingsState, SettingsCategoryId } from './settings/settingsTypes';
import { SettingsSidebar } from './SettingsSidebar';
import { GeneralSettings } from './GeneralSettings';
import { ModelProviderSettings } from './ModelProviderSettings';
import { AssistantSettings } from './AssistantSettings';
import { AppearanceSettings } from './AppearanceSettings';
import { LanguageSettings } from './LanguageSettings';
import { UEConnectionSettings } from './UEConnectionSettings';
import { SandboxSecuritySettings } from './SandboxSecuritySettings';
import { PrivacyLogSettings } from './PrivacyLogSettings';
import { AdvancedSettings } from './AdvancedSettings';
import type { UeConnectionView } from './workbenchStatusViewModel';
import type { ProviderReadiness } from '../../../main/settings/provider-authority';
import type { AppearancePatch } from './appearancePreferenceState';

interface SettingsPageProps {
  settings: SettingsState;
  initialCategory: SettingsCategoryId;
  onUpdateCategory: (category: any, values: any) => void;
  onUpdateLanguage?: (
    patch: Partial<import('./settings/settingsTypes').LanguageSettings>,
  ) => Promise<{ ok: boolean; error?: string }> | void;
  uiLanguageUpdating?: boolean;
  onUpdateAppearance?: (
    patch: AppearancePatch,
  ) => Promise<{ ok: boolean; error?: string }>;
  appearanceUpdating?: boolean;
  onResetSettings: () => void | Promise<{ ok: boolean; error?: string }>;
  onRefreshSettings: () => Promise<{ ok: boolean; error?: string }>;
  onBack: () => void;
  themeNames: string[];
  themeLabels: Record<string, string>;
  safeStorageAvailable: boolean;
  loading: boolean;
  error: string | null;
  connectionView: UeConnectionView;
  providerReadiness: ProviderReadiness;
}

const CATEGORIES: Array<{ id: SettingsCategoryId; labelKey: string }> = [
  { id: 'general', labelKey: 'general' },
  { id: 'modelProviders', labelKey: 'modelProviders' },
  { id: 'assistant', labelKey: 'assistant' },
  { id: 'appearance', labelKey: 'appearance' },
  { id: 'language', labelKey: 'language' },
  { id: 'ueConnection', labelKey: 'ueConnection' },
  { id: 'sandboxSecurity', labelKey: 'sandboxSecurity' },
  { id: 'privacyLog', labelKey: 'privacyLog' },
  { id: 'advanced', labelKey: 'advanced' },
];

export function SettingsPage({
  settings,
  initialCategory,
  onUpdateCategory,
  onUpdateLanguage,
  uiLanguageUpdating,
  onUpdateAppearance,
  appearanceUpdating,
  onResetSettings,
  onRefreshSettings,
  onBack,
  themeNames,
  themeLabels,
  safeStorageAvailable,
  loading,
  error,
  connectionView,
  providerReadiness,
}: SettingsPageProps) {
  const { copy } = useDesktopCopy();
  const t = copy.ueAgentUi.settingsPage;
  const [activeCategory, setActiveCategory] = useState<SettingsCategoryId>(initialCategory);
  const contentRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    setActiveCategory(initialCategory);
  }, [initialCategory]);

  useEffect(() => {
    const node = contentRef.current;
    if (node) {
      node.scrollTop = 0;
    }
  }, [activeCategory]);

  const categories = CATEGORIES.map(cat => ({
    ...cat,
    iconId: cat.id,
    label: t.categories[cat.id],
  }));

  const renderCategoryContent = () => {
    switch (activeCategory) {
      case 'general':
        return (
          <GeneralSettings
            settings={settings.general}
          />
        );
      case 'modelProviders':
        return (
          <ModelProviderSettings
            settings={settings.modelProviders}
            onUpdate={patch => onUpdateCategory('modelProviders', patch)}
            onRefreshSettings={onRefreshSettings}
            safeStorageAvailable={safeStorageAvailable}
            providerReadiness={providerReadiness}
          />
        );
      case 'assistant':
        return (
          <AssistantSettings
            settings={settings.assistant}
            onUpdate={patch => onUpdateCategory('assistant', patch)}
          />
        );
      case 'appearance':
        return (
          <AppearanceSettings
            settings={settings.appearance}
            onUpdate={patch => onUpdateAppearance?.(patch)}
            updating={appearanceUpdating}
            themeNames={themeNames}
            themeLabels={themeLabels}
          />
        );
      case 'language':
        return (
          <LanguageSettings
            settings={settings.language}
            onUpdate={patch => {
              if (onUpdateLanguage && patch.uiLanguage !== undefined) {
                return onUpdateLanguage(patch);
              }
              onUpdateCategory('language', patch);
              return undefined;
            }}
            uiLanguageUpdating={uiLanguageUpdating}
          />
        );
      case 'ueConnection':
        return (
          <UEConnectionSettings
            settings={settings.ueConnection}
            connectionView={connectionView}
          />
        );
      case 'sandboxSecurity':
        return (
          <SandboxSecuritySettings
            settings={settings.sandboxSecurity}
            onUpdate={patch => onUpdateCategory('sandboxSecurity', patch)}
          />
        );
      case 'privacyLog':
        return (
          <PrivacyLogSettings
            settings={settings.privacyLog}
          />
        );
      case 'advanced':
        return (
          <AdvancedSettings
            settings={settings.advanced}
            onUpdate={patch => onUpdateCategory('advanced', patch)}
          />
        );
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div className="ue-settings-page">
        <div className="ue-settings-loading">
          {copy.common.loading}
        </div>
      </div>
    );
  }

  return (
    <div className="ue-settings-page">
      <div className="ue-settings-header">
        <div className="ue-settings-header-left">
          <button type="button" className="ue-settings-btn ue-settings-btn-ghost" onClick={onBack}>
            {t.backToChat}
          </button>
          <h1 className="ue-settings-header-title">{t.title}</h1>
        </div>
        <div className="ue-settings-header-actions">
          {error && (
            <span className="ue-settings-error-banner">{error}</span>
          )}
          <button type="button" className="ue-settings-btn ue-settings-btn-ghost" onClick={onResetSettings}>
            {t.resetToDefaults}
          </button>
        </div>
      </div>
      <div className="ue-settings-layout">
        <SettingsSidebar
          categories={categories}
          activeCategory={activeCategory}
          onSelect={setActiveCategory}
        />
        <main ref={contentRef} className="ue-settings-content">
          <h2 className="ue-settings-category-title">{t.categories[activeCategory]}</h2>
          {renderCategoryContent()}
        </main>
      </div>
    </div>
  );
}
