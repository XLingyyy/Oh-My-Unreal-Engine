// E37 provider adapter types
// These are main-process-only types for the provider adapter layer.

export type AiExplainErrorCode =
  | 'INVALID_REQUEST'
  | 'REQUEST_TOO_LARGE'
  | 'PROVIDER_NOT_CONFIGURED'
  | 'MISSING_API_KEY'
  | 'INVALID_PROVIDER_CONFIG'
  | 'TIMEOUT'
  | 'NETWORK_ERROR'
  | 'PROVIDER_AUTH_ERROR'
  | 'PROVIDER_RATE_LIMITED'
  | 'PROVIDER_ERROR'
  | 'CONTENT_FILTERED'
  | 'MALFORMED_RESPONSE'
  | 'CANCELLED';

export type ExplanationFocus =
  | 'Overview'
  | 'Execution Flow'
  | 'Data Flow'
  | 'Risk Hotspots'
  | 'Node Summary';

// Renderer sends this via IPC (no API key)
export interface AiExplainRequest {
  requestId: string;
  briefMarkdown: string;
  focus: ExplanationFocus;
  source: 'blueprint-explanation-brief-v1';
  requestedAt: string;
}

export interface AiExplainSuccessResult {
  ok: true;
  requestId: string;
  createdAt: string;
  provider: string;
  model: string;
  contentMarkdown: string;
}

export interface AiExplainFailureResult {
  ok: false;
  requestId: string;
  createdAt: string;
  provider?: string;
  model?: string;
  error: {
    code: AiExplainErrorCode;
    message: string;
    retryable: boolean;
  };
}

export type AiExplainResult = AiExplainSuccessResult | AiExplainFailureResult;

// Internal type: main-process handler passes config + request to provider adapter
export interface AiProviderConfig {
  provider: string;
  baseUrl: string;
  model: string;
  apiKey: string;
  timeoutMs: number;
}

export interface AiProviderAdapterInput {
  request: AiExplainRequest;
  config: AiProviderConfig;
  signal?: AbortSignal;
}

const ALLOWED_FOCUSES: readonly ExplanationFocus[] = [
  'Overview',
  'Execution Flow',
  'Data Flow',
  'Risk Hotspots',
  'Node Summary',
];

const MAX_BRIEF_CHARS = 100000;
const MAX_BRIEF_LINES = 3000;

export interface ValidationError {
  code: AiExplainErrorCode;
  message: string;
  retryable: boolean;
}

/**
 * Validate the renderer request before making any network call.
 * Returns null if valid, or a ValidationError if invalid.
 */
export function validateExplainRequest(
  req: unknown,
  config: AiProviderConfig | null,
): ValidationError | null {
  const r = req as AiExplainRequest | null | undefined;

  // Provider config checks
  if (!config) {
    return {
      code: 'PROVIDER_NOT_CONFIGURED',
      message: 'AI provider is not configured. Please enter your provider settings and try again.',
      retryable: false,
    };
  }

  if (!config.apiKey || config.apiKey.trim().length === 0) {
    return {
      code: 'MISSING_API_KEY',
      message: 'API key is missing. Please enter your API key in Provider Settings.',
      retryable: false,
    };
  }

  if (!['openai', 'anthropic', 'deepseek'].includes(config.provider)) {
    return {
      code: 'INVALID_PROVIDER_CONFIG',
      message: `Provider configuration is invalid: provider "${config.provider}" is not supported. Use openai, anthropic, or deepseek.`,
      retryable: false,
    };
  }

  try {
    new URL(config.baseUrl);
  } catch {
    return {
      code: 'INVALID_PROVIDER_CONFIG',
      message: 'Provider configuration is invalid: baseUrl is not a valid URL.',
      retryable: false,
    };
  }

  if (!config.model || config.model.trim().length === 0) {
    return {
      code: 'INVALID_PROVIDER_CONFIG',
      message: 'Provider configuration is invalid: model is missing.',
      retryable: false,
    };
  }

  // Request field checks
  if (!r || typeof r !== 'object') {
    return {
      code: 'INVALID_REQUEST',
      message: 'Request validation failed: request is missing.',
      retryable: false,
    };
  }

  if (!r.requestId || typeof r.requestId !== 'string' || r.requestId.trim().length === 0) {
    return {
      code: 'INVALID_REQUEST',
      message: 'Request validation failed: requestId is missing or has an invalid value.',
      retryable: false,
    };
  }

  if (typeof r.briefMarkdown !== 'string') {
    return {
      code: 'INVALID_REQUEST',
      message: 'Request validation failed: briefMarkdown is missing.',
      retryable: false,
    };
  }

  if (r.briefMarkdown.length > MAX_BRIEF_CHARS) {
    return {
      code: 'REQUEST_TOO_LARGE',
      message: `Explanation brief is too large (${r.briefMarkdown.length} chars). Maximum is ${MAX_BRIEF_CHARS} chars.`,
      retryable: false,
    };
  }

  const lineCount = r.briefMarkdown.split('\n').length;
  if (lineCount > MAX_BRIEF_LINES) {
    return {
      code: 'REQUEST_TOO_LARGE',
      message: `Explanation brief is too large (${lineCount} lines). Maximum is ${MAX_BRIEF_LINES} lines.`,
      retryable: false,
    };
  }

  if (!ALLOWED_FOCUSES.includes(r.focus as ExplanationFocus)) {
    return {
      code: 'INVALID_REQUEST',
      message: 'Request validation failed: focus is missing or has an invalid value.',
      retryable: false,
    };
  }

  if (r.source !== 'blueprint-explanation-brief-v1') {
    return {
      code: 'INVALID_REQUEST',
      message: 'Request validation failed: source is missing or has an invalid value.',
      retryable: false,
    };
  }

  if (!r.requestedAt || isNaN(Date.parse(r.requestedAt))) {
    return {
      code: 'INVALID_REQUEST',
      message: 'Request validation failed: requestedAt is missing or has an invalid value.',
      retryable: false,
    };
  }

  return null;
}

export function checkBaseUrlQuery(baseUrl: string): string | null {
  try {
    const u = new URL(baseUrl);
    const suspicious = ['api_key', 'apikey', 'key', 'token', 'auth', 'authorization', 'access_token', 'secret', 'password', 'pass'];
    for (const [k] of u.searchParams) {
      if (suspicious.some(s => k === s || k.toLowerCase().includes(s.toLowerCase()))) {
        return `Base URL contains suspicious query parameter: ${k}`;
      }
    }
    return null;
  } catch {
    return 'Invalid base URL';
  }
}
