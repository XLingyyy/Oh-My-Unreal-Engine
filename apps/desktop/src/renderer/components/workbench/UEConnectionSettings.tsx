import { useDesktopCopy } from '../../i18n';
import type { UEConnectionSettings as UEConnectionSettingsState } from './settings/settingsTypes';
import type { UeConnectionView } from './workbenchStatusViewModel';
import { Switch } from './Switch';
import { SettingsCapabilityStatus } from './SettingsCapabilityStatus';

interface UEConnectionSettingsProps {
  settings: UEConnectionSettingsState;
  connectionView: UeConnectionView;
}

const BRIDGE_TOGGLES: Array<{ key: keyof Pick<UEConnectionSettingsState, 'scanOnStartup' | 'watchAssetChanges' | 'autoScan' | 'taskRelatedOnly'>; labelKey: string }> = [
  { key: 'scanOnStartup', labelKey: 'scanOnStartup' },
  { key: 'watchAssetChanges', labelKey: 'watchAssetChanges' },
  { key: 'autoScan', labelKey: 'autoScan' },
  { key: 'taskRelatedOnly', labelKey: 'taskRelatedOnly' },
];

function healthStatusClass(
  status: UeConnectionView['healthStatus'],
): string {
  switch (status) {
    case 'connected':
      return 'ue-settings-status-dot-connected';
    case 'degraded':
      return 'ue-settings-status-dot-warning';
    case 'disconnected':
      return 'ue-settings-status-dot-disconnected';
    case 'connecting':
      return 'ue-settings-status-dot-connecting';
    case 'mock':
      return 'ue-settings-status-dot-mock';
    default:
      return 'ue-settings-status-dot-disconnected';
  }
}

function healthStatusLabel(
  status: UeConnectionView['healthStatus'],
  t: {
    connected: string;
    disconnected: string;
    degraded: string;
    connecting: string;
    mockBridge: string;
  },
): string {
  switch (status) {
    case 'connected':
      return t.connected;
    case 'degraded':
      return t.degraded;
    case 'disconnected':
      return t.disconnected;
    case 'connecting':
      return t.connecting;
    case 'mock':
      return t.mockBridge;
    default:
      return t.disconnected;
  }
}

export function UEConnectionSettings({ settings, connectionView }: UEConnectionSettingsProps) {
  const { copy } = useDesktopCopy();
  const t = copy.ueAgentUi.settingsPage.ueConnection;
  const cap = copy.ueAgentUi.settingsPage.capability;
  const isMock = connectionView.isMock;

  return (
    <section className="ue-settings-section" data-settings-factual="ueConnection">
      <div className="ue-settings-field">
        <span className="ue-settings-label">{t.bridgeStatus}</span>
        <span className="ue-settings-bridge-status">
          <span className={`ue-settings-status-dot ${healthStatusClass(connectionView.healthStatus)}`} />
          {healthStatusLabel(connectionView.healthStatus, t)}
        </span>
      </div>

      <div className="ue-settings-field">
        <label className="ue-settings-label">{t.endpoint}</label>
        <input
          type="text"
          className="ue-settings-input"
          value={connectionView.endpoint}
          readOnly
          aria-readonly
        />
      </div>

      <div className="ue-settings-field">
        <span className="ue-settings-label">{t.healthStatus}</span>
        <span className="ue-settings-bridge-status">
          {connectionView.lastCheckedAt
            ? t.lastCheckedAt(connectionView.lastCheckedAt)
            : t.neverChecked}
        </span>
        <SettingsCapabilityStatus
          kind="read-only"
          label={cap.readOnlyLabel}
          detail={isMock ? t.mockRuntimeFactReason : <>{cap.readOnlyDetail} {t.runtimeFactReason}</>}
        />
      </div>

      <div className="ue-settings-field">
        <span className="ue-settings-label">{t.projectPath}</span>
        <input
          type="text"
          className="ue-settings-input"
          placeholder={t.projectPathPlaceholder}
          value={settings.projectPath}
          readOnly
          aria-readonly
        />
      </div>

      <div className="ue-settings-field">
        <span className="ue-settings-label">{t.enginePath}</span>
        <input
          type="text"
          className="ue-settings-input"
          placeholder={t.enginePathPlaceholder}
          value={settings.enginePath}
          readOnly
          aria-readonly
        />
      </div>

      <div className="ue-settings-field">
        <label className="ue-settings-label">{t.host}</label>
        <input
          type="text"
          className="ue-settings-input"
          value={settings.host}
          readOnly
          aria-readonly
        />
      </div>

      <div className="ue-settings-field">
        <label className="ue-settings-label">{t.port}</label>
        <input
          type="text"
          className="ue-settings-input"
          value={String(settings.port)}
          readOnly
          aria-readonly
        />
      </div>

      {BRIDGE_TOGGLES.map(toggle => (
        <div key={toggle.key} className="ue-settings-toggle-row">
          <span>{t[toggle.labelKey as keyof typeof t] as string}</span>
          <Switch
            checked={settings[toggle.key]}
            disabled
            ariaLabel={t[toggle.labelKey as keyof typeof t] as string}
          />
        </div>
      ))}

      <SettingsCapabilityStatus
        kind="persisted-only"
        label={cap.persistedOnlyLabel}
        detail={<>{cap.persistedOnlyDetail} {t.storedValuesReason}</>}
      />

      <div className="ue-settings-actions">
        <button
          type="button"
          className="ue-settings-btn ue-settings-btn-disabled"
          disabled
          title={isMock ? t.mockIndicator : t.reconnectUnavailable}
        >
          {isMock ? t.reconnect : t.reconnectUnavailable}
        </button>
        <button
          type="button"
          className="ue-settings-btn ue-settings-btn-disabled"
          disabled
          title={isMock ? t.mockIndicator : t.testConnectionUnavailable}
        >
          {isMock ? t.testConnection : t.testConnectionUnavailable}
        </button>
      </div>
      <SettingsCapabilityStatus
        kind="unavailable"
        label={cap.unavailableLabel}
        detail={isMock ? t.mockIndicator : `${t.reconnectUnavailableReason} ${t.testConnectionUnavailableReason}`}
      />
    </section>
  );
}
