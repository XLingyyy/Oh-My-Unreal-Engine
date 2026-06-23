import { useDesktopCopy } from '../../i18n';
import type { PrivacyLogSettings } from './settings/settingsTypes';
import { Switch } from './Switch';
import { SettingsCapabilityStatus } from './SettingsCapabilityStatus';

interface PrivacyLogSettingsProps {
  settings: PrivacyLogSettings;
}

const DATA_USAGE_TOGGLES: Array<{ key: keyof PrivacyLogSettings['dataUsage']; labelKey: 'anonymousTelemetry' | 'crashReports' | 'usageStatistics' | 'improvementProgram' }> = [
  { key: 'anonymousTelemetry', labelKey: 'anonymousTelemetry' },
  { key: 'crashReports', labelKey: 'crashReports' },
  { key: 'usageStatistics', labelKey: 'usageStatistics' },
  { key: 'improvementProgram', labelKey: 'improvementProgram' },
];

const LOGGING_TOGGLES: Array<{ key: keyof PrivacyLogSettings['logging']; labelKey: 'bridgeCommunication' | 'agentStateChanges' | 'userActions' | 'performanceMetrics' }> = [
  { key: 'bridgeCommunication', labelKey: 'bridgeCommunication' },
  { key: 'agentStateChanges', labelKey: 'agentStateChanges' },
  { key: 'userActions', labelKey: 'userActions' },
  { key: 'performanceMetrics', labelKey: 'performanceMetrics' },
];

const SENSITIVE_TOGGLES: Array<{ key: keyof PrivacyLogSettings['sensitiveInfoProtection']; labelKey: 'maskApiKeys' | 'maskFilePaths' | 'maskAssetNames' | 'maskUserInput' }> = [
  { key: 'maskApiKeys', labelKey: 'maskApiKeys' },
  { key: 'maskFilePaths', labelKey: 'maskFilePaths' },
  { key: 'maskAssetNames', labelKey: 'maskAssetNames' },
  { key: 'maskUserInput', labelKey: 'maskUserInput' },
];

const RETENTION_OPTIONS: Array<{ value: PrivacyLogSettings['logRetention']; labelKey: 'retention24h' | 'retention7d' | 'retention30d' | 'retention90d' | 'retentionForever' }> = [
  { value: '24h', labelKey: 'retention24h' },
  { value: '7d', labelKey: 'retention7d' },
  { value: '30d', labelKey: 'retention30d' },
  { value: '90d', labelKey: 'retention90d' },
  { value: 'forever', labelKey: 'retentionForever' },
];

export function PrivacyLogSettings({ settings }: PrivacyLogSettingsProps) {
  const { copy } = useDesktopCopy();
  const t = copy.ueAgentUi.settingsPage.privacyLog;
  const cap = copy.ueAgentUi.settingsPage.capability;

  return (
    <section className="ue-settings-section" data-settings-factual="privacyLog">
      <SettingsCapabilityStatus
        kind="persisted-only"
        label={cap.persistedOnlyLabel}
        detail={<>{cap.persistedOnlyDetail} {t.persistedOnlyReason}</>}
      />

      <div className="ue-settings-field">
        <span className="ue-settings-label">{t.dataUsage}</span>
        {DATA_USAGE_TOGGLES.map(toggle => (
          <div key={toggle.key} className="ue-settings-toggle-row">
            <span>{t[toggle.labelKey]}</span>
            <Switch
              checked={settings.dataUsage[toggle.key]}
              disabled
              ariaLabel={t[toggle.labelKey]}
            />
          </div>
        ))}
      </div>

      <div className="ue-settings-field">
        <span className="ue-settings-label">{t.logging}</span>
        {LOGGING_TOGGLES.map(toggle => (
          <div key={toggle.key} className="ue-settings-toggle-row">
            <span>{t[toggle.labelKey]}</span>
            <Switch
              checked={settings.logging[toggle.key]}
              disabled
              ariaLabel={t[toggle.labelKey]}
            />
          </div>
        ))}
      </div>

      <div className="ue-settings-field">
        <span className="ue-settings-label">{t.sensitiveInfoProtection}</span>
        {SENSITIVE_TOGGLES.map(toggle => (
          <div key={toggle.key} className="ue-settings-toggle-row">
            <span>{t[toggle.labelKey]}</span>
            <Switch
              checked={settings.sensitiveInfoProtection[toggle.key]}
              disabled
              ariaLabel={t[toggle.labelKey]}
            />
          </div>
        ))}
      </div>

      <div className="ue-settings-field">
        <label className="ue-settings-label">{t.logRetention}</label>
        <select
          className="ue-settings-select"
          value={settings.logRetention}
          disabled
        >
          {RETENTION_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>{t[opt.labelKey]}</option>
          ))}
        </select>
      </div>

      <div className="ue-settings-actions">
        <button type="button" className="ue-settings-btn ue-settings-btn-disabled" disabled>
          {t.clearLocalLogs}
        </button>
      </div>
      <SettingsCapabilityStatus
        kind="unavailable"
        label={cap.unavailableLabel}
        detail={t.clearLogsUnavailableReason}
      />
    </section>
  );
}
