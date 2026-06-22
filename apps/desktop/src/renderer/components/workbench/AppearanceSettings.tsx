import { useDesktopCopy } from '../../i18n';
import type { AppearanceSettings } from './settings/settingsTypes';
import type { AppearancePatch } from './appearancePreferenceState';
import { Switch } from './Switch';

interface AppearanceSettingsProps {
  settings: AppearanceSettings;
  onUpdate: (patch: AppearancePatch) => void | Promise<{ ok: boolean; error?: string }>;
  updating?: boolean;
  themeNames: string[];
  themeLabels: Record<string, string>;
}

export function AppearanceSettings({
  settings,
  onUpdate,
  updating = false,
  themeNames,
  themeLabels,
}: AppearanceSettingsProps) {
  const { copy } = useDesktopCopy();
  const t = copy.ueAgentUi.settingsPage.appearance;
  const accentOptions: Array<{
    value: string;
    label: string;
    swatchClass: string;
  }> = [
    { value: 'blue', label: t.blue, swatchClass: 'ue-settings-accent-swatch--blue' },
    { value: 'purple', label: t.purple, swatchClass: 'ue-settings-accent-swatch--purple' },
    { value: 'green', label: t.green, swatchClass: 'ue-settings-accent-swatch--green' },
  ];
  const densityOptions: Array<{
    value: AppearanceSettings['density'];
    label: string;
  }> = [
    { value: 'compact', label: t.compact },
    { value: 'comfortable', label: t.comfortable },
    { value: 'spacious', label: t.spacious },
  ];
  const fontSizeOptions: Array<{
    value: AppearanceSettings['fontSize'];
    label: string;
  }> = [
    { value: 'small', label: t.small },
    { value: 'medium', label: t.medium },
    { value: 'large', label: t.large },
  ];
  const layoutToggles: Array<{
    key: 'showLeftRail' | 'showProjectExplorer' | 'showRightInspector';
    label: string;
  }> = [
    { key: 'showLeftRail', label: t.showLeftRail },
    { key: 'showProjectExplorer', label: t.showProjectExplorer },
    { key: 'showRightInspector', label: t.showRightInspector },
  ];
  const chatToggles: Array<{
    key: keyof AppearanceSettings['chatDisplay'];
    label: string;
  }> = [
    { key: 'showTimestamps', label: t.showTimestamps },
    { key: 'showAvatars', label: t.showAvatars },
    { key: 'codeSyntaxHighlight', label: t.codeSyntaxHighlight },
    { key: 'collapseLongMessages', label: t.collapseLongMessages },
    { key: 'showActionButtons', label: t.showActionButtons },
  ];

  return (
    <section className="ue-settings-section" aria-busy={updating}>
      <div className="ue-settings-field">
        <label className="ue-settings-label">{t.theme}</label>
        <select
          className="ue-settings-select"
          value={settings.theme}
          disabled={updating}
          onChange={e => onUpdate({ theme: e.target.value as AppearanceSettings['theme'] })}
        >
          {themeNames.map(name => (
            <option key={name} value={name}>{themeLabels[name] ?? name}</option>
          ))}
        </select>
      </div>

      <div className="ue-settings-field">
        <label className="ue-settings-label">{t.accentColor}</label>
        <div className="ue-settings-accent-group">
          {accentOptions.map(opt => (
            <label key={opt.value} className="ue-settings-accent-label">
              <input
                type="radio"
                name="accentColor"
                value={opt.value}
                disabled={updating}
                checked={settings.accentColor === opt.value}
                onChange={() => onUpdate({ accentColor: opt.value })}
              />
              <span className={`ue-settings-accent-swatch ${opt.swatchClass}`} />
              <span>{opt.label}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="ue-settings-field">
        <label className="ue-settings-label">{t.density}</label>
        <select
          className="ue-settings-select"
          value={settings.density}
          disabled={updating}
          onChange={e => onUpdate({ density: e.target.value as AppearanceSettings['density'] })}
        >
          {densityOptions.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      <div className="ue-settings-field">
        <label className="ue-settings-label">{t.fontSize}</label>
        <select
          className="ue-settings-select"
          value={settings.fontSize}
          disabled={updating}
          onChange={e => onUpdate({ fontSize: e.target.value as AppearanceSettings['fontSize'] })}
        >
          {fontSizeOptions.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      <div className="ue-settings-field">
        <span className="ue-settings-label">{t.layouts}</span>
        {layoutToggles.map(toggle => (
          <div key={toggle.key} className="ue-settings-toggle-row">
            <span>{toggle.label}</span>
            <Switch
              checked={settings.layouts[toggle.key]}
              disabled={updating}
              onCheckedChange={value => onUpdate({
                layouts: { [toggle.key]: value }
              })}
              ariaLabel={toggle.label}
            />
          </div>
        ))}
      </div>

      <div className="ue-settings-field">
        <span className="ue-settings-label">{t.chatDisplay}</span>
        {chatToggles.map(toggle => (
          <div key={toggle.key} className="ue-settings-toggle-row">
            <span>{toggle.label}</span>
            <Switch
              checked={settings.chatDisplay[toggle.key]}
              disabled={updating}
              onCheckedChange={value => onUpdate({
                chatDisplay: { [toggle.key]: value }
              })}
              ariaLabel={toggle.label}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
