import { useDesktopCopy } from '../../i18n';
import type { AppearanceSettings } from './settings/settingsTypes';
import { Switch } from './Switch';

interface AppearanceSettingsProps {
  settings: AppearanceSettings;
  onUpdate: (patch: Partial<AppearanceSettings>) => void;
  themeNames: string[];
  themeLabels: Record<string, string>;
  onSetTheme?: (theme: string) => void;
}

const ACCENT_OPTIONS = [
  { value: 'blue', labelKey: 'blue', swatchClass: 'ue-settings-accent-swatch--blue' },
  { value: 'purple', labelKey: 'purple', swatchClass: 'ue-settings-accent-swatch--purple' },
  { value: 'green', labelKey: 'green', swatchClass: 'ue-settings-accent-swatch--green' },
];

const DENSITY_OPTIONS: Array<{ value: AppearanceSettings['density']; labelKey: string }> = [
  { value: 'compact', labelKey: 'compact' },
  { value: 'comfortable', labelKey: 'comfortable' },
  { value: 'spacious', labelKey: 'spacious' },
];

const FONT_SIZE_OPTIONS: Array<{ value: AppearanceSettings['fontSize']; labelKey: string }> = [
  { value: 'small', labelKey: 'small' },
  { value: 'medium', labelKey: 'medium' },
  { value: 'large', labelKey: 'large' },
];

const LAYOUT_TOGGLES: Array<{ key: keyof AppearanceSettings['layouts']; labelKey: string }> = [
  { key: 'showLeftRail', labelKey: 'showLeftRail' },
  { key: 'showProjectExplorer', labelKey: 'showProjectExplorer' },
  { key: 'showRightInspector', labelKey: 'showRightInspector' },
  { key: 'showStatusBar', labelKey: 'showStatusBar' },
];

const CHAT_TOGGLES: Array<{ key: keyof AppearanceSettings['chatDisplay']; labelKey: string }> = [
  { key: 'showTimestamps', labelKey: 'showTimestamps' },
  { key: 'showAvatars', labelKey: 'showAvatars' },
  { key: 'codeSyntaxHighlight', labelKey: 'codeSyntaxHighlight' },
  { key: 'collapseLongMessages', labelKey: 'collapseLongMessages' },
  { key: 'showActionButtons', labelKey: 'showActionButtons' },
];

export function AppearanceSettings({ settings, onUpdate, themeNames, themeLabels, onSetTheme }: AppearanceSettingsProps) {
  const { copy } = useDesktopCopy();
  const _t = copy.ueAgentUi.settingsPage.appearance;
  const t = _t as unknown as Record<string, string>;

  return (
    <section className="ue-settings-section">
      <div className="ue-settings-field">
        <label className="ue-settings-label">{t.theme}</label>
        <select
          className="ue-settings-select"
          value={settings.theme}
          onChange={e => {
            onUpdate({ theme: e.target.value as AppearanceSettings['theme'] });
            onSetTheme?.(e.target.value);
          }}
        >
          {themeNames.map(name => (
            <option key={name} value={name}>{themeLabels[name] ?? name}</option>
          ))}
        </select>
      </div>

      <div className="ue-settings-field">
        <label className="ue-settings-label">{t.accentColor}</label>
        <div className="ue-settings-accent-group">
          {ACCENT_OPTIONS.map(opt => (
            <label key={opt.value} className="ue-settings-accent-label">
              <input
                type="radio"
                name="accentColor"
                value={opt.value}
                checked={settings.accentColor === opt.value}
                onChange={() => onUpdate({ accentColor: opt.value })}
              />
              <span className={`ue-settings-accent-swatch ${opt.swatchClass}`} />
              <span>{t[opt.labelKey]}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="ue-settings-field">
        <label className="ue-settings-label">{t.density}</label>
        <select
          className="ue-settings-select"
          value={settings.density}
          onChange={e => onUpdate({ density: e.target.value as AppearanceSettings['density'] })}
        >
          {DENSITY_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>{t[opt.labelKey]}</option>
          ))}
        </select>
      </div>

      <div className="ue-settings-field">
        <label className="ue-settings-label">{t.fontSize}</label>
        <select
          className="ue-settings-select"
          value={settings.fontSize}
          onChange={e => onUpdate({ fontSize: e.target.value as AppearanceSettings['fontSize'] })}
        >
          {FONT_SIZE_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>{t[opt.labelKey]}</option>
          ))}
        </select>
      </div>

      <div className="ue-settings-field">
        <span className="ue-settings-label">{t.layouts}</span>
        {LAYOUT_TOGGLES.map(toggle => (
          <div key={toggle.key} className="ue-settings-toggle-row">
            <span>{t[toggle.labelKey]}</span>
            <Switch
              checked={settings.layouts[toggle.key]}
              onCheckedChange={value => onUpdate({
                layouts: { ...settings.layouts, [toggle.key]: value }
              })}
              ariaLabel={t[toggle.labelKey]}
            />
          </div>
        ))}
      </div>

      <div className="ue-settings-field">
        <span className="ue-settings-label">{t.chatDisplay}</span>
        {CHAT_TOGGLES.map(toggle => (
          <div key={toggle.key} className="ue-settings-toggle-row">
            <span>{t[toggle.labelKey]}</span>
            <Switch
              checked={settings.chatDisplay[toggle.key]}
              onCheckedChange={value => onUpdate({
                chatDisplay: { ...settings.chatDisplay, [toggle.key]: value }
              })}
              ariaLabel={t[toggle.labelKey]}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
