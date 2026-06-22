import { useDesktopCopy } from '../../i18n';
import type { AdvancedSettings as AdvancedSettingsState } from './settings/settingsTypes';

interface AdvancedSettingsProps {
  settings: AdvancedSettingsState;
  onUpdate: (patch: Partial<AdvancedSettingsState>) => void;
}

export function AdvancedSettings(_props: AdvancedSettingsProps) {
  const { copy } = useDesktopCopy();
  const t = copy.ueAgentUi.settingsPage.advanced;

  return (
    <section className="ue-settings-section" data-settings-safety-surface="advanced-unavailable">
      <div className="ue-settings-field">
        <span className="ue-settings-label">{t.controlsUnavailable}</span>
        <p className="ue-settings-note">{t.runtimePolicyNotice}</p>
      </div>
      <div className="ue-settings-field">
        <span className="ue-settings-label">{t.automationUnavailable}</span>
        <p className="ue-settings-note">{t.automationUnavailableNotice}</p>
      </div>
    </section>
  );
}
