import { contextBridge, ipcRenderer } from 'electron';
import type {
  SettingsGetRequest,
  SettingsGetResult,
  SettingsUpdateRequest,
  SettingsUpdateResult,
  SettingsResetRequest,
  SettingsResetResult,
  ApiKeySetRequest,
  ApiKeySetResult,
  ApiKeyClearRequest,
  ApiKeyClearResult,
  TestProviderConnectionRequest,
  TestProviderConnectionResult,
} from '@omue/shared-protocol';

export interface SettingsApi {
  get(req?: SettingsGetRequest): Promise<SettingsGetResult>;
  update(req: SettingsUpdateRequest): Promise<SettingsUpdateResult>;
  reset(req?: SettingsResetRequest): Promise<SettingsResetResult>;
  apiKey: {
    set(req: ApiKeySetRequest): Promise<ApiKeySetResult>;
    clear(req: ApiKeyClearRequest): Promise<ApiKeyClearResult>;
  };
  getProviderAuthority(): Promise<ProviderReadinessResult>;
  testProviderConnection(req: TestProviderConnectionRequest): Promise<TestProviderConnectionResult>;
}

export type ProviderAuthorityStatus =
  | 'ready'
  | 'missing_provider'
  | 'missing_key'
  | 'vault_unavailable'
  | 'vault_corrupt'
  | 'invalid_config';

export interface ProviderReadiness {
  status: ProviderAuthorityStatus;
  providerId?: string;
  displayName?: string;
  diagnosisModel?: string;
  message?: string;
}

export type ProviderReadinessResult =
  | { ok: true; readiness: ProviderReadiness }
  | { ok: false; error: string };

export const settingsApi: SettingsApi = {
  get: (req?: SettingsGetRequest) => ipcRenderer.invoke('settings:get', req ?? {}),
  update: (req: SettingsUpdateRequest) => ipcRenderer.invoke('settings:update', req),
  reset: (req?: SettingsResetRequest) => ipcRenderer.invoke('settings:reset', req ?? {}),
  apiKey: {
    set: (req: ApiKeySetRequest) => ipcRenderer.invoke('settings:api-key:set', req),
    clear: (req: ApiKeyClearRequest) => ipcRenderer.invoke('settings:api-key:clear', req),
  },
  getProviderAuthority: () => ipcRenderer.invoke('settings:get-provider-authority'),
  testProviderConnection: (req: TestProviderConnectionRequest) =>
    ipcRenderer.invoke('settings:test-provider-connection', req),
};
