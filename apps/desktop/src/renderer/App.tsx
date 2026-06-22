import { useMemo, useState } from 'react';
import { createBridgeClient, MockBridgeClient } from './services';
import { DesktopI18nContext, desktopCopy, type DesktopLanguage } from './i18n';
import { AgentWorkbenchShell } from './components/workbench/AgentWorkbenchShell';

export function App() {
  const client = useMemo(() => createBridgeClient(), []);
  const isMockClient = client instanceof MockBridgeClient;
  const [lang, setLang] = useState<DesktopLanguage>('zh-CN');
  const copy = desktopCopy[lang];
  const i18nValue = useMemo(() => ({ lang, copy, setLang }), [lang, copy]);

  return (
    <DesktopI18nContext.Provider value={i18nValue}>
      <AgentWorkbenchShell client={client} isMockClient={isMockClient} />
    </DesktopI18nContext.Provider>
  );
}
