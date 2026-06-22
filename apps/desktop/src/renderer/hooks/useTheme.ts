import { useCallback, useEffect, useState } from 'react';
import { isThemeName, nextTheme, type ThemeName } from '../theme/themes';

const THEME_STORAGE_KEY = 'omue.ui.theme';
const DEFAULT_THEME: ThemeName = 'github-dark';

function readStoredTheme(): ThemeName | null {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemeName(stored) ? stored : null;
  } catch {
    return null;
  }
}

function persistTheme(theme: ThemeName): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Theme persistence is best-effort only.
  }
}

function applyTheme(theme: ThemeName): void {
  document.documentElement.dataset.theme = theme;
}

export function useTheme() {
  const [theme, setThemeState] = useState<ThemeName>(() => readStoredTheme() ?? DEFAULT_THEME);

  useEffect(() => {
    let disposed = false;
    const stored = readStoredTheme();
    if (stored) {
      applyTheme(stored);
      return;
    }

    const loadInitialTheme = async () => {
      try {
        const initial = await window.omue.getInitialTheme();
        if (!disposed && isThemeName(initial)) {
          setThemeState(initial);
          applyTheme(initial);
          persistTheme(initial);
        }
      } catch {
        if (!disposed) {
          applyTheme(DEFAULT_THEME);
        }
      }
    };

    void loadInitialTheme();
    return () => {
      disposed = true;
    };
  }, []);

  useEffect(() => {
    applyTheme(theme);
    persistTheme(theme);
  }, [theme]);

  const setTheme = useCallback((next: ThemeName) => {
    setThemeState(next);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState(current => nextTheme(current));
  }, []);

  return { theme, setTheme, toggleTheme };
}
