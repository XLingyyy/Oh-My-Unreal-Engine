import { useDesktopCopy } from '../../i18n';
import type { LanguageSettings } from './settings/settingsTypes';

interface LanguageSettingsProps {
  settings: LanguageSettings;
  onUpdate: (patch: Partial<LanguageSettings>) => void | Promise<{ ok: boolean; error?: string }>;
  uiLanguageUpdating?: boolean;
}

interface UiLanguageOption {
  value: LanguageSettings['uiLanguage'];
  label: string;
}

interface ReplyLanguageOption {
  value: LanguageSettings['assistantReplyLanguage'];
  label: string;
}

interface TerminologyOption {
  value: LanguageSettings['terminologyDisplay'];
  label: string;
}

interface TimeFormatOption {
  value: LanguageSettings['timeFormat'];
  label: string;
}

export function LanguageSettings({ settings, onUpdate, uiLanguageUpdating }: LanguageSettingsProps) {
  const { copy } = useDesktopCopy();
  const t = copy.ueAgentUi.settingsPage.language;

  const uiLanguageOptions: UiLanguageOption[] = [
    { value: 'zh-CN', label: t.simplifiedChinese },
    { value: 'en', label: t.english },
  ];

  const replyLanguageOptions: ReplyLanguageOption[] = [
    { value: 'follow-ui', label: t.followUI },
    { value: 'zh-CN', label: t.simplifiedChinese },
    { value: 'en', label: t.english },
  ];

  const terminologyOptions: TerminologyOption[] = [
    { value: 'english', label: t.englishTerms },
    { value: 'chinese', label: t.chineseTerms },
    { value: 'mixed-ue', label: t.mixedUETerms },
  ];

  const timeFormatOptions: TimeFormatOption[] = [
    { value: '24h', label: t.format24h },
    { value: '12h', label: t.format12h },
  ];

  return (
    <section className="ue-settings-section">
      <div className="ue-settings-field">
        <label className="ue-settings-label">{t.uiLanguage}</label>
        <select
          className="ue-settings-select"
          value={settings.uiLanguage}
          disabled={Boolean(uiLanguageUpdating)}
          aria-busy={uiLanguageUpdating || undefined}
          onChange={e => {
            const next = e.target.value as LanguageSettings['uiLanguage'];
            void onUpdate({ uiLanguage: next });
          }}
        >
          {uiLanguageOptions.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      <div className="ue-settings-field">
        <label className="ue-settings-label">{t.assistantReplyLanguage}</label>
        <select
          className="ue-settings-select"
          value={settings.assistantReplyLanguage}
          onChange={e => onUpdate({ assistantReplyLanguage: e.target.value as LanguageSettings['assistantReplyLanguage'] })}
        >
          {replyLanguageOptions.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      <div className="ue-settings-field">
        <span className="ue-settings-label">{t.terminologyDisplay}</span>
        <div className="ue-settings-radio-group">
          {terminologyOptions.map(opt => (
            <label key={opt.value} className="ue-settings-radio-label">
              <input
                type="radio"
                name="terminologyDisplay"
                value={opt.value}
                checked={settings.terminologyDisplay === opt.value}
                onChange={() => onUpdate({ terminologyDisplay: opt.value })}
              />
              {opt.label}
            </label>
          ))}
        </div>
      </div>

      <div className="ue-settings-field">
        <span className="ue-settings-label">{t.codeAndApiLanguage}</span>
        <span className="ue-settings-readonly-value">{t.alwaysEnglish}</span>
      </div>

      <div className="ue-settings-field">
        <span className="ue-settings-label">{t.timeFormat}</span>
        <div className="ue-settings-radio-group">
          {timeFormatOptions.map(opt => (
            <label key={opt.value} className="ue-settings-radio-label">
              <input
                type="radio"
                name="timeFormat"
                value={opt.value}
                checked={settings.timeFormat === opt.value}
                onChange={() => onUpdate({ timeFormat: opt.value })}
              />
              {opt.label}
            </label>
          ))}
        </div>
      </div>
    </section>
  );
}
