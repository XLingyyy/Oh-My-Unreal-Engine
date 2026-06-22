import type { AppearanceSettings } from './settings/settingsTypes';

export type AppearancePatch =
  Partial<Omit<AppearanceSettings, 'layouts' | 'chatDisplay'>>
  & {
    layouts?: Partial<AppearanceSettings['layouts']>;
    chatDisplay?: Partial<AppearanceSettings['chatDisplay']>;
  };

export type AppearanceAccent = 'blue' | 'purple' | 'green';

export function normalizeAppearanceAccent(value: string): AppearanceAccent {
  if (value === 'purple' || value === 'green') {
    return value;
  }
  return 'blue';
}

export function mergeAppearanceSettings(
  current: AppearanceSettings,
  patch: AppearancePatch,
): AppearanceSettings {
  return {
    ...current,
    ...patch,
    layouts: {
      ...current.layouts,
      ...(patch.layouts ?? {}),
    },
    chatDisplay: {
      ...current.chatDisplay,
      ...(patch.chatDisplay ?? {}),
    },
  };
}

export async function persistAppearanceChange({
  current,
  patch,
  apply,
  persist,
}: {
  current: AppearanceSettings;
  patch: AppearancePatch;
  apply: (next: AppearanceSettings) => void;
  persist: (patch: AppearancePatch) => Promise<{ ok: boolean; error?: string }>;
}): Promise<{ ok: boolean; error?: string }> {
  const next = mergeAppearanceSettings(current, patch);
  apply(next);

  try {
    const result = await persist(patch);
    if (result.ok) {
      return { ok: true };
    }
    apply(current);
    return {
      ok: false,
      ...(result.error ? { error: result.error } : {}),
    };
  } catch (error) {
    apply(current);
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Appearance update failed',
    };
  }
}
