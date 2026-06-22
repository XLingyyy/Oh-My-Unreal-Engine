export { getDefaultSettings } from './defaultSettings';
export { deepMergeSettings, deepMerge, isPlainObject } from './settingsMerge';
export {
  validateSettings,
  validateSettingsState,
  normalizeSettingsSafety,
  sanitizeSettingsFile,
  validateResetKeys,
  isSettingsCategoryId,
  SETTINGS_CATEGORY_KEYS,
} from './settingsSchema';
export type { ValidationError, ValidationResult } from './settingsSchema';
export {
  isSafeStorageAvailable,
  setApiKey,
  getApiKey,
  clearApiKeyEntries,
  isVaultCorrupt,
  setVaultIoAdapters,
  getVaultIoAdapters,
  type VaultIoAdapters,
} from './apiKeyVault';
export type { VaultSetResult, VaultClearResult, VaultError } from './apiKeyVault';
export { loadSettings, writeSettings } from './settingsStore';
export {
  setSettingsIoAdapters,
  getSettingsIoAdapters,
  type SettingsIoAdapters,
} from './settingsStore';
export { registerSettingsHandlers } from './settings-shell';
export type {
  RegisterSettingsHandlersOptions,
  RegisteredSettingsRuntime,
} from './settings-shell';
export {
  createSettingsMutationService,
  stripProviderApiKeyRef,
  isValidPersistedApiKeyRef,
  withProviderApiKeyRef,
  type SettingsMutationService,
  type SettingsMutationServiceDeps,
  type SettingsSessionState,
  type VaultPort,
  type MutationFailureInjects,
  type SettingsValidationFailure,
  type ResetKeysValidationFailure,
  type SettingsWriteOutcome,
  type ApiKeySetOutcome,
  type ApiKeyClearOutcome,
} from './settingsMutationService';
export {
  createProviderAuthorityResolver,
  resolveProviderAuthority,
  toProviderReadiness,
  type ProviderAuthority,
  type ProviderAuthorityStatus,
  type ProviderAuthorityDeps,
  type ProviderAuthorityResolver,
  type ProviderAuthoritySettingsPort,
  type ProviderAuthorityVaultPort,
  type ProviderReadiness,
} from './provider-authority';
