import { useDesktopCopy } from '../../i18n';
import type { AssistantSettings as AssistantSettingsState } from './settings/settingsTypes';

interface AssistantSettingsProps {
  settings: AssistantSettingsState;
  onUpdate: (patch: Partial<AssistantSettingsState>) => void;
}

export function AssistantSettings(_props: AssistantSettingsProps) {
  const { copy } = useDesktopCopy();
  const t = copy.ueAgentUi.settingsPage.assistant;

  return (
    <section className="ue-settings-section" data-settings-safety-surface="assistant-unavailable">
      <div className="ue-settings-field">
        <span className="ue-settings-label">{t.controlsUnavailable}</span>
        <p className="ue-settings-note">{t.runtimePolicyNotice}</p>
      </div>
      <div className="ue-settings-field">
        <span className="ue-settings-label">{t.currentBehaviorTitle}</span>
        <p className="ue-settings-note">{t.currentBehaviorNotice}</p>
      </div>
    </section>
  );
}
