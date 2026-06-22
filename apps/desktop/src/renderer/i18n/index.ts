import { createContext, useContext } from 'react';
import type { DesktopLanguage, DesktopCopy } from './types';
import { en } from './dict-en';
import { zhCN } from './dict-zh';

export type { DesktopLanguage, DesktopCopy };

export const DESKTOP_LANGUAGE_OPTIONS: { value: DesktopLanguage; langLabel: string }[] = [
  { value: 'en', langLabel: 'English' },
  { value: 'zh-CN', langLabel: '简体中文' },
];

export const desktopCopy: Record<DesktopLanguage, DesktopCopy> = {
  en,
  'zh-CN': zhCN,
};

// ── React context ──

export interface DesktopI18nContextValue {
  lang: DesktopLanguage;
  copy: DesktopCopy;
  setLang: (lang: DesktopLanguage) => void;
}

export const DesktopI18nContext = createContext<DesktopI18nContextValue>({
  lang: 'zh-CN',
  copy: desktopCopy['zh-CN'],
  setLang: () => {},
});

export function useDesktopCopy(): DesktopI18nContextValue {
  return useContext(DesktopI18nContext);
}
