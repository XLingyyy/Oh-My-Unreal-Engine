import { useDesktopCopy } from '../../i18n';
import type { SandboxSecuritySettings as SandboxSecuritySettingsState } from './settings/settingsTypes';

interface SandboxSecuritySettingsProps {
  settings: SandboxSecuritySettingsState;
  onUpdate: (patch: Partial<SandboxSecuritySettingsState>) => void;
}

export function SandboxSecuritySettings(_props: SandboxSecuritySettingsProps) {
  const { copy } = useDesktopCopy();
  const t = copy.ueAgentUi.settingsPage.sandboxSecurity;

  return (
    <section className="ue-settings-section" data-settings-safety-surface="hard-gates">
      <div className="ue-settings-field">
        <span className="ue-settings-label">{t.hardSafetyTitle}</span>
        <p className="ue-settings-note">{t.settingsCannotOverride}</p>
      </div>

      <div className="ue-settings-field" role="list" aria-label={t.hardSafetyTitle}>
        <div className="ue-settings-toggle-row" role="listitem">
          <span>{t.sandboxAlwaysEnforced}</span>
          <strong>{t.enforced}</strong>
        </div>
        <div className="ue-settings-toggle-row" role="listitem">
          <span>{t.approvalAlwaysRequired}</span>
          <strong>{t.required}</strong>
        </div>
        <div className="ue-settings-toggle-row" role="listitem">
          <span>{t.promoteConfirmationRequired}</span>
          <strong>{t.required}</strong>
        </div>
      </div>

      <div className="ue-settings-field">
        <span className="ue-settings-label">{t.legacyCompatibilityTitle}</span>
        <p className="ue-settings-note">{t.legacyCompatibilityNotice}</p>
      </div>
    </section>
  );
}
