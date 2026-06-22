import type { SettingsState, DeepPartial } from '@omue/shared-protocol';

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function deepMerge<T>(target: T, patch: DeepPartial<T>): T {
  if (!isPlainObject(target) || !isPlainObject(patch)) {
    return (patch as T) ?? target;
  }
  const result: Record<string, unknown> = { ...target } as Record<string, unknown>;
  for (const key of Object.keys(patch)) {
    const patchVal = (patch as Record<string, unknown>)[key];
    const targetVal = result[key];
    if (isPlainObject(patchVal) && isPlainObject(targetVal)) {
      result[key] = deepMerge(targetVal, patchVal);
    } else if (isPlainObject(patchVal)) {
      result[key] = deepMerge({}, patchVal);
    } else if (patchVal !== undefined) {
      result[key] = patchVal;
    }
  }
  return result as T;
}

export function deepMergeSettings(target: SettingsState, patch: DeepPartial<SettingsState>): SettingsState {
  return deepMerge(target, patch);
}
