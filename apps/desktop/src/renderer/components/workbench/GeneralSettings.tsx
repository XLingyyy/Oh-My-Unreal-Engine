import { useDesktopCopy } from '../../i18n';
import type { GeneralSettings } from './settings/settingsTypes';
import { Switch } from './Switch';
import { SettingsRow } from './SettingsRow';

interface GeneralSettingsProps {
  settings: GeneralSettings;
  onUpdate: (patch: Partial<GeneralSettings>) => void;
}

const STARTUP_OPTIONS: Array<{ value: GeneralSettings['startupBehavior']; labelKey: string }> = [
  { value: 'new-session', labelKey: 'newSession' },
  { value: 'restore-last', labelKey: 'restoreLast' },
  { value: 'show-home', labelKey: 'showHome' },
];

export function GeneralSettings({ settings, onUpdate }: GeneralSettingsProps) {
  const { copy } = useDesktopCopy();
  const _t = copy.ueAgentUi.settingsPage.general;
  const t = _t as unknown as Record<string, string>;

  return (
    <section className="ue-settings-section">
      <div className="ue-settings-field">
        <span className="ue-settings-label">{t.startupBehavior}</span>
        <div className="ue-settings-radio-group">
          {STARTUP_OPTIONS.map(opt => (
            <label key={opt.value} className="ue-settings-radio-label">
              <input
                type="radio"
                name="startupBehavior"
                value={opt.value}
                checked={settings.startupBehavior === opt.value}
                onChange={() => onUpdate({ startupBehavior: opt.value })}
              />
              {t[opt.labelKey]}
            </label>
          ))}
        </div>
      </div>

      <SettingsRow
        title={t.checkUpdates}
        description={t.checkUpdatesDescription}
        control={
          <Switch
            checked={settings.checkForUpdates}
            onCheckedChange={value => onUpdate({ checkForUpdates: value })}
            ariaLabel={t.checkUpdates}
          />
        }
      />

      <SettingsRow
        title={t.crashReports}
        description={t.crashReportsDescription}
        control={
          <Switch
            checked={settings.crashReports}
            onCheckedChange={value => onUpdate({ crashReports: value })}
            ariaLabel={t.crashReports}
          />
        }
      />
    </section>
  );
}
