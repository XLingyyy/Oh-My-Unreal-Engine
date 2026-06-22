/**
 * Language preference coordination helpers.
 *
 * Pure logic, no React, no DOM, no I18n dependency. The Renderer wires the
 * `setLanguage` setter and a `persist` adapter around the existing Settings
 * IPC update path; the helper coordinates the optimistic switch and the
 * failure rollback so the Shell and Settings page can stay thin.
 */

export type UiLanguage = 'en' | 'zh-CN';

export interface UiLanguageWriteResult {
  ok: boolean;
  error?: string;
}

export interface PersistUiLanguageChangeArgs {
  previousLanguage: UiLanguage;
  nextLanguage: UiLanguage;
  setLanguage: (language: UiLanguage) => void;
  persist: (language: UiLanguage) => Promise<UiLanguageWriteResult>;
}

/**
 * Switch the UI language optimistically and persist the change.
 *
 * Order:
 *   1. `setLanguage(nextLanguage)` — the UI is updated immediately.
 *   2. `persist(nextLanguage)` — the caller's Settings IPC adapter is invoked.
 *   3. On a failed result OR a thrown exception, `setLanguage(previousLanguage)`
 *      is invoked to roll the UI back, and the failure result is returned.
 *
 * The helper never writes to Settings itself; the persist callback is the
 * single source of truth for persistence and may return `{ ok: false, error }`
 * for any reason (validation, IPC failure, storage failure, etc.).
 */
export async function persistUiLanguageChange(
  args: PersistUiLanguageChangeArgs,
): Promise<UiLanguageWriteResult> {
  const { previousLanguage, nextLanguage, setLanguage, persist } = args;
  setLanguage(nextLanguage);

  try {
    const result = await persist(nextLanguage);
    if (result.ok) {
      return result;
    }
    setLanguage(previousLanguage);
    return { ok: false, error: result.error };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to persist language change';
    setLanguage(previousLanguage);
    return { ok: false, error: message };
  }
}
