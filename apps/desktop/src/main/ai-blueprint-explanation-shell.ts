import { ipcMain } from 'electron';
import { validateExplainRequest, checkBaseUrlQuery } from './ai-blueprint-explanation-provider-types';
import { requestAiExplanation } from './ai-blueprint-explanation-provider';
import type {
  AiExplainRequest,
  AiExplainResult,
  AiExplainFailureResult,
  AiProviderConfig as E37AiProviderConfig,
} from './ai-blueprint-explanation-provider-types';

// ── E28 shell types (unchanged) ──

interface ShellStatus {
  mode: 'shell-only';
  networkEnabled: false;
  providerConfigured: boolean;
  message: string;
}

interface CheckShellRequest {
  briefMarkdown: string;
  focus: string;
  source?: string;
}

interface CheckShellResult {
  ok: boolean;
  requestId: string;
  createdAt: string;
  message: string;
  validatedFields: string[];
  missingFields: string[];
}

// ── E29 provider config types ──

interface AiProviderConfig {
  provider: string;
  baseUrl: string;
  model: string;
  apiKey: string;
  timeoutMs: number;
  updatedAt: string;
}

interface AiProviderStatus {
  configured: boolean;
  provider?: string;
  baseUrl?: string;
  model?: string;
  timeoutMs?: number;
  updatedAt?: string;
  apiKeyConfigured: boolean;
  missingFields: string[];
  mode: 'memory-only';
}

interface AiProviderConfigInput {
  provider: string;
  baseUrl: string;
  model: string;
  apiKey: string;
  timeoutMs?: number;
}

interface AiProviderConfigResult {
  ok: boolean;
  message: string;
  missingFields?: string[];
}

const DEFAULT_TIMEOUT_MS = 30000;
const MIN_TIMEOUT_MS = 5000;
const MAX_TIMEOUT_MS = 120000;

// ── E29 in-memory config (module-level, lost on restart) ──

let providerConfig: AiProviderConfig | null = null;

export function getAiProviderConfig(): E37AiProviderConfig | null {
  return providerConfig
    ? {
        provider: providerConfig.provider,
        baseUrl: providerConfig.baseUrl,
        model: providerConfig.model,
        apiKey: providerConfig.apiKey,
        timeoutMs: providerConfig.timeoutMs,
      }
    : null;
}

export function registerAiBlueprintExplanationShell(): void {
  // ── E28 handlers (unchanged) ──

  ipcMain.handle('ai:blueprint-explanation:get-status', (): ShellStatus => {
    return {
      mode: 'shell-only',
      networkEnabled: false,
      providerConfigured: providerConfig !== null,
      message: providerConfig
        ? 'Memory-only provider configuration is active; network access remains disabled'
        : 'Explanation shell is available, but no real provider is enabled',
    };
  });

  ipcMain.handle('ai:blueprint-explanation:check-shell', (_event, request: unknown): CheckShellResult => {
    const validatedFields: string[] = [];
    const missingFields: string[] = [];

    const req = request as CheckShellRequest | null | undefined;

    if (req?.briefMarkdown && typeof req.briefMarkdown === 'string' && req.briefMarkdown.length > 0) {
      validatedFields.push('briefMarkdown');
    } else {
      missingFields.push('briefMarkdown');
    }

    if (req?.focus && typeof req.focus === 'string' && req.focus.length > 0) {
      validatedFields.push('focus');
    } else {
      missingFields.push('focus');
    }

    const requestId = `shell-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    return {
      ok: missingFields.length === 0,
      requestId,
      createdAt: new Date().toISOString(),
      message:
        missingFields.length === 0
          ? 'Explanation shell is ready; real provider access is disabled'
          : `Shell check incomplete; missing fields: ${missingFields.join(', ')}`,
      validatedFields,
      missingFields,
    };
  });

  // ── E29 provider config handlers ──

  ipcMain.handle('ai:blueprint-explanation:get-provider-status', (): AiProviderStatus => {
    if (!providerConfig) {
      return {
        configured: false,
        apiKeyConfigured: false,
        missingFields: ['provider', 'baseUrl', 'model', 'apiKey'],
        mode: 'memory-only',
      };
    }

    const missingFields: string[] = [];
    if (!providerConfig.provider) missingFields.push('provider');
    if (!providerConfig.baseUrl) missingFields.push('baseUrl');
    if (!providerConfig.model) missingFields.push('model');
    if (!providerConfig.apiKey) missingFields.push('apiKey');

    let safeBaseUrl: string;
    try {
      const u = new URL(providerConfig.baseUrl);
      safeBaseUrl = u.origin + u.pathname;
    } catch {
      safeBaseUrl = providerConfig.baseUrl;
    }

    return {
      configured: true,
      provider: providerConfig.provider,
      baseUrl: safeBaseUrl,
      model: providerConfig.model,
      timeoutMs: providerConfig.timeoutMs,
      updatedAt: providerConfig.updatedAt,
      apiKeyConfigured: providerConfig.apiKey.length > 0,
      missingFields,
      mode: 'memory-only',
    };
  });

  ipcMain.handle('ai:blueprint-explanation:save-provider-config', (_event, input: unknown): AiProviderConfigResult => {
    const data = input as AiProviderConfigInput | null | undefined;
    const missingFields: string[] = [];

    if (!data?.provider || typeof data.provider !== 'string' || data.provider.trim().length === 0) {
      missingFields.push('provider');
    }
    if (!data?.baseUrl || typeof data.baseUrl !== 'string' || data.baseUrl.trim().length === 0) {
      missingFields.push('baseUrl');
    } else {
      try {
        new URL(data.baseUrl);
      } catch {
        return { ok: false, message: 'Invalid base URL format' };
      }
    }
    if (!data?.model || typeof data.model !== 'string' || data.model.trim().length === 0) {
      missingFields.push('model');
    }
    if (!data?.apiKey || typeof data.apiKey !== 'string' || data.apiKey.trim().length === 0) {
      missingFields.push('apiKey');
    }

    if (missingFields.length > 0) {
      return { ok: false, message: `Missing required fields: ${missingFields.join(', ')}`, missingFields };
    }

    let timeoutMs = DEFAULT_TIMEOUT_MS;
    if (typeof data!.timeoutMs === 'number' && !isNaN(data!.timeoutMs)) {
      timeoutMs = Math.max(MIN_TIMEOUT_MS, Math.min(MAX_TIMEOUT_MS, data!.timeoutMs));
    }

    const trimmedBaseUrl = data!.baseUrl.trim();
    const queryErr = checkBaseUrlQuery(trimmedBaseUrl);
    if (queryErr) {
      return { ok: false, message: queryErr };
    }

    providerConfig = {
      provider: data!.provider.trim(),
      baseUrl: trimmedBaseUrl,
      model: data!.model.trim(),
      apiKey: data!.apiKey,
      timeoutMs,
      updatedAt: new Date().toISOString(),
    };

    return { ok: true, message: 'Provider config saved (memory only, lost on restart)' };
  });

  ipcMain.handle('ai:blueprint-explanation:clear-provider-config', (): { ok: boolean; message: string } => {
    const hadConfig = providerConfig !== null;
    providerConfig = null;
    return {
      ok: true,
      message: hadConfig ? 'Provider config cleared' : 'No config to clear',
    };
  });

  // ── E37 real provider request handler ──

  ipcMain.handle('ai:blueprint-explanation:request-explanation', async (_event, request: unknown): Promise<AiExplainResult> => {
    // Build config from in-memory state
    const config = getAiProviderConfig();

    // Check baseUrl query params
    if (config) {
      const queryErr = checkBaseUrlQuery(config.baseUrl);
      if (queryErr) {
        const failResult: AiExplainFailureResult = {
          ok: false,
          requestId: (request as AiExplainRequest)?.requestId ?? `err-${Date.now()}`,
          createdAt: new Date().toISOString(),
          provider: config.provider,
          model: config.model,
          error: {
            code: 'INVALID_PROVIDER_CONFIG',
            message: queryErr,
            retryable: false,
          },
        };
        return failResult;
      }
    }

    // Validate
    const validationError = validateExplainRequest(request, config);
    if (validationError) {
      const failResult: AiExplainFailureResult = {
        ok: false,
        requestId: (request as AiExplainRequest)?.requestId ?? `err-${Date.now()}`,
        createdAt: new Date().toISOString(),
        provider: config?.provider,
        model: config?.model,
        error: {
          code: validationError.code,
          message: validationError.message,
          retryable: validationError.retryable,
        },
      };
      return failResult;
    }

    // Make the real provider call
    const typedRequest = request as AiExplainRequest;
    return requestAiExplanation(typedRequest, config!);
  });
}
