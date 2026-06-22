import { useCallback, useEffect, useState } from 'react';
import { nextTheme, type ThemeName } from '../theme/themes';

const DEFAULT_THEME: ThemeName = 'ue-agent';

export function useTheme() {
  const [theme, setThemeState] = useState<ThemeName>(DEFAULT_THEME);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const setTheme = useCallback((next: ThemeName) => {
    setThemeState(next);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState(current => nextTheme(current));
  }, []);

  return { theme, setTheme, toggleTheme };
}
