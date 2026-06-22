export type ThemeName = 'ue-agent' | 'github-dark' | 'vscode-dark' | 'light';

export const THEME_ORDER: ThemeName[] = ['ue-agent', 'github-dark', 'vscode-dark', 'light'];

export const THEME_LABELS: Record<ThemeName, string> = {
  'ue-agent': 'UE Agent (Recommended)',
  'github-dark': 'GitHub Dark',
  'vscode-dark': 'VS Code Dark',
  light: 'Light',
};

export function isThemeName(value: string | null | undefined): value is ThemeName {
  return value === 'ue-agent' || value === 'github-dark' || value === 'vscode-dark' || value === 'light';
}

export function nextTheme(current: ThemeName): ThemeName {
  const currentIndex = THEME_ORDER.indexOf(current);
  return THEME_ORDER[(currentIndex + 1) % THEME_ORDER.length];
}
