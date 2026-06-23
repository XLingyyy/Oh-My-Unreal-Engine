import { useDesktopCopy } from '../../i18n';
import type { GeneralSettings } from './settings/settingsTypes';
import { Switch } from './Switch';
import { SettingsRow } from './SettingsRow';
import { SettingsCapabilityStatus } from './SettingsCapabilityStatus';

interface GeneralSettingsProps {
  settings: GeneralSettings;
}

const STARTUP_OPTIONS: Array<{ value: GeneralSettings['startupBehavior']; labelKey: 'newSession' | 'restoreLast' | 'showHome' }> = [
  { value: 'new-session', labelKey: 'newSession' },
  { value: 'restore-last', labelKey: 'restoreLast' },
  { value: 'show-home', labelKey: 'showHome' },
];

export function GeneralSettings({ settings }: GeneralSettingsProps) {
  const { copy } = useDesktopCopy();
  const t = copy.ueAgentUi.settingsPage.general;
  const cap = copy.ueAgentUi.settingsPage.capability;

  return (
    <section className="ue-settings-section" data-settings-factual="general">
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
                disabled
                readOnly
                aria-readonly
              />
              {t[opt.labelKey]}
            </label>
          ))}
        </div>
        <SettingsCapabilityStatus
          kind="persisted-only"
          label={cap.persistedOnlyLabel}
          detail={<>{cap.persistedOnlyDetail} {t.startupPersistedOnlyReason}</>}
        />
      </div>

      <SettingsRow
        title={t.checkUpdates}
        description={t.checkUpdatesDescription}
        control={
          <Switch
            checked={settings.checkForUpdates}
            disabled
            ariaLabel={t.checkUpdates}
          />
        }
      />
      <SettingsCapabilityStatus
        kind="unavailable"
        label={cap.unavailableLabel}
        detail={t.updateUnavailableReason}
      />

      <SettingsRow
        title={t.crashReports}
        description={t.crashReportsDescription}
        control={
          <Switch
            checked={settings.crashReports}
            disabled
            ariaLabel={t.crashReports}
          />
        }
      />
      <SettingsCapabilityStatus
        kind="unavailable"
        label={cap.unavailableLabel}
        detail={t.crashReportUnavailableReason}
      />
    </section>
  );
}
