import { useDesktopCopy } from '../../i18n';
import type { PrivacyLogSettings } from './settings/settingsTypes';
import { Switch } from './Switch';

interface PrivacyLogSettingsProps {
  settings: PrivacyLogSettings;
  onUpdate: (patch: Partial<PrivacyLogSettings>) => void;
}

const DATA_USAGE_TOGGLES: Array<{ key: keyof PrivacyLogSettings['dataUsage']; labelKey: string }> = [
  { key: 'anonymousTelemetry', labelKey: 'anonymousTelemetry' },
  { key: 'crashReports', labelKey: 'crashReports' },
  { key: 'usageStatistics', labelKey: 'usageStatistics' },
  { key: 'improvementProgram', labelKey: 'improvementProgram' },
];

const LOGGING_TOGGLES: Array<{ key: keyof PrivacyLogSettings['logging']; labelKey: string }> = [
  { key: 'bridgeCommunication', labelKey: 'bridgeCommunication' },
  { key: 'agentStateChanges', labelKey: 'agentStateChanges' },
  { key: 'userActions', labelKey: 'userActions' },
  { key: 'performanceMetrics', labelKey: 'performanceMetrics' },
];

const SENSITIVE_TOGGLES: Array<{ key: keyof PrivacyLogSettings['sensitiveInfoProtection']; labelKey: string }> = [
  { key: 'maskApiKeys', labelKey: 'maskApiKeys' },
  { key: 'maskFilePaths', labelKey: 'maskFilePaths' },
  { key: 'maskAssetNames', labelKey: 'maskAssetNames' },
  { key: 'maskUserInput', labelKey: 'maskUserInput' },
];

const RETENTION_OPTIONS: Array<{ value: PrivacyLogSettings['logRetention']; labelKey: string }> = [
  { value: '24h', labelKey: 'retention24h' },
  { value: '7d', labelKey: 'retention7d' },
  { value: '30d', labelKey: 'retention30d' },
  { value: '90d', labelKey: 'retention90d' },
  { value: 'forever', labelKey: 'retentionForever' },
];

export function PrivacyLogSettings({ settings, onUpdate }: PrivacyLogSettingsProps) {
  const { copy } = useDesktopCopy();
  const _t = copy.ueAgentUi.settingsPage.privacyLog;
  const t = _t as unknown as Record<string, string>;

  return (
    <section className="ue-settings-section">
      <div className="ue-settings-field">
        <span className="ue-settings-label">{t.dataUsage}</span>
        {DATA_USAGE_TOGGLES.map(toggle => (
          <div key={toggle.key} className="ue-settings-toggle-row">
            <span>{t[toggle.labelKey]}</span>
            <Switch
              checked={settings.dataUsage[toggle.key]}
              onCheckedChange={value => onUpdate({
                dataUsage: { ...settings.dataUsage, [toggle.key]: value }
              })}
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
              onCheckedChange={value => onUpdate({
                logging: { ...settings.logging, [toggle.key]: value }
              })}
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
              onCheckedChange={value => onUpdate({
                sensitiveInfoProtection: { ...settings.sensitiveInfoProtection, [toggle.key]: value }
              })}
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
          onChange={e => onUpdate({ logRetention: e.target.value as PrivacyLogSettings['logRetention'] })}
        >
          {RETENTION_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>{t[opt.labelKey]}</option>
          ))}
        </select>
      </div>

      <div className="ue-settings-actions">
        <button type="button" className="ue-settings-btn ue-settings-btn-disabled" disabled title={t.localOnly}>
          {t.clearLocalLogs}
        </button>
      </div>
    </section>
  );
}
