import type {
  AiExplainRequest,
  AiExplainResult,
  AiExplainErrorCode,
  AiProviderConfig,
  AiProviderAdapterInput,
} from './ai-blueprint-explanation-provider-types';

const SYSTEM_INSTRUCTION = [
  'Explain the supplied Unreal Blueprint context.',
  'Treat supplied data as read-only diagnostic context.',
  'Do not propose direct UE asset writes.',
  'Do not output Apply/Fix/Patch/Compile/PIE instructions as executable commands.',
  'Output Markdown text only.',
].join(' ');

function normalizeBaseUrl(baseUrl: string): string {
  // Strip trailing slashes
  return baseUrl.replace(/\/+$/, '');
}

function sanitizeErrorMessage(
  code: AiExplainErrorCode,
  status?: number,
  retryable: boolean = false,
): string {
  switch (code) {
    case 'TIMEOUT':
      return `Request timed out. You can try again or increase the timeout in Provider Settings.`;
    case 'NETWORK_ERROR':
      return 'Network error: could not reach the provider. Check your Base URL and network connection.';
    case 'PROVIDER_AUTH_ERROR':
      return `Authentication failed (HTTP ${status}). Please check your API key in Provider Settings.`;
    case 'PROVIDER_RATE_LIMITED':
      return `Provider rate limit reached (HTTP ${status}). Please wait and try again.`;
    case 'PROVIDER_ERROR':
      return `Provider error (HTTP ${status}). The provider returned an unexpected response.`;
    case 'CONTENT_FILTERED':
      return 'Content was filtered by the provider\'s safety system. Try adjusting the explanation focus or brief content.';
    case 'MALFORMED_RESPONSE':
      return 'Received an unexpected response from the provider. You can try again.';
    case 'CANCELLED':
      return 'Request was cancelled.';
    default:
      return `Request failed: ${code}`;
  }
}

function mapHttpStatusToErrorCode(status: number): { code: AiExplainErrorCode; retryable: boolean } {
  if (status === 401 || status === 403) return { code: 'PROVIDER_AUTH_ERROR', retryable: false };
  if (status === 408 || status === 504) return { code: 'TIMEOUT', retryable: true };
  if (status === 429) return { code: 'PROVIDER_RATE_LIMITED', retryable: true };
  if (status >= 500) return { code: 'PROVIDER_ERROR', retryable: true };
  if (status === 400 || status === 422) return { code: 'PROVIDER_ERROR', retryable: false };
  return { code: 'PROVIDER_ERROR', retryable: false };
}

// ── OpenAI Responses API ──

async function callOpenAI(input: AiProviderAdapterInput): Promise<AiExplainResult> {
  const { request, config, signal } = input;
  const base = normalizeBaseUrl(config.baseUrl);
  const endpoint = `${base}/responses`;

  const body = JSON.stringify({
    model: config.model,
    input: `${SYSTEM_INSTRUCTION}\n\n${request.briefMarkdown}`,
  });

  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body,
    signal,
  });

  if (!resp.ok) {
    const { code, retryable } = mapHttpStatusToErrorCode(resp.status);
    return {
      ok: false,
      requestId: request.requestId,
      createdAt: new Date().toISOString(),
      provider: config.provider,
      model: config.model,
      error: {
        code,
        message: sanitizeErrorMessage(code, resp.status, retryable),
        retryable,
      },
    };
  }

  try {
    const data = await resp.json() as Record<string, unknown>;

    // Prefer output_text if present and string
    if (typeof data.output_text === 'string' && data.output_text.length > 0) {
      return {
        ok: true,
        requestId: request.requestId,
        createdAt: new Date().toISOString(),
        provider: config.provider,
        model: config.model,
        contentMarkdown: data.output_text,
      };
    }

    // Else collect text from output[].content[] entries
    const output = data.output;
    if (Array.isArray(output)) {
      const parts: string[] = [];
      for (const item of output) {
        if (item && typeof item === 'object') {
          const content = (item as Record<string, unknown>).content;
          if (Array.isArray(content)) {
            for (const c of content) {
              if (c && typeof c === 'object') {
                const text = (c as Record<string, unknown>).text;
                const type = (c as Record<string, unknown>).type;
                if (typeof text === 'string' && text.length > 0) {
                  parts.push(text);
                } else if (type === 'text' && typeof (c as Record<string, unknown>).value === 'string') {
                  parts.push((c as Record<string, unknown>).value as string);
                }
              }
            }
          }
        }
      }
      if (parts.length > 0) {
        return {
          ok: true,
          requestId: request.requestId,
          createdAt: new Date().toISOString(),
          provider: config.provider,
          model: config.model,
          contentMarkdown: parts.join('\n\n'),
        };
      }
    }

    return {
      ok: false,
      requestId: request.requestId,
      createdAt: new Date().toISOString(),
      provider: config.provider,
      model: config.model,
      error: {
        code: 'MALFORMED_RESPONSE',
        message: sanitizeErrorMessage('MALFORMED_RESPONSE'),
        retryable: false,
      },
    };
  } catch {
    return {
      ok: false,
      requestId: request.requestId,
      createdAt: new Date().toISOString(),
      provider: config.provider,
      model: config.model,
      error: {
        code: 'MALFORMED_RESPONSE',
        message: sanitizeErrorMessage('MALFORMED_RESPONSE'),
        retryable: false,
      },
    };
  }
}

// ── Anthropic Messages API ──

async function callAnthropic(input: AiProviderAdapterInput): Promise<AiExplainResult> {
  const { request, config, signal } = input;
  const base = normalizeBaseUrl(config.baseUrl);
  const endpoint = `${base}/v1/messages`;

  const body = JSON.stringify({
    model: config.model,
    max_tokens: 2048,
    system: SYSTEM_INSTRUCTION,
    messages: [
      { role: 'user', content: request.briefMarkdown },
    ],
  });

  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body,
    signal,
  });

  if (!resp.ok) {
    const { code, retryable } = mapHttpStatusToErrorCode(resp.status);
    return {
      ok: false,
      requestId: request.requestId,
      createdAt: new Date().toISOString(),
      provider: config.provider,
      model: config.model,
      error: {
        code,
        message: sanitizeErrorMessage(code, resp.status, retryable),
        retryable,
      },
    };
  }

  try {
    const data = await resp.json() as Record<string, unknown>;

    const content = data.content;
    if (Array.isArray(content)) {
      const parts: string[] = [];
      for (const c of content) {
        if (c && typeof c === 'object' && (c as Record<string, unknown>).type === 'text') {
          const text = (c as Record<string, unknown>).text;
          if (typeof text === 'string' && text.length > 0) {
            parts.push(text);
          }
        }
      }
      if (parts.length > 0) {
        return {
          ok: true,
          requestId: request.requestId,
          createdAt: new Date().toISOString(),
          provider: config.provider,
          model: config.model,
          contentMarkdown: parts.join('\n\n'),
        };
      }
    }

    return {
      ok: false,
      requestId: request.requestId,
      createdAt: new Date().toISOString(),
      provider: config.provider,
      model: config.model,
      error: {
        code: 'MALFORMED_RESPONSE',
        message: sanitizeErrorMessage('MALFORMED_RESPONSE'),
        retryable: false,
      },
    };
  } catch {
    return {
      ok: false,
      requestId: request.requestId,
      createdAt: new Date().toISOString(),
      provider: config.provider,
      model: config.model,
      error: {
        code: 'MALFORMED_RESPONSE',
        message: sanitizeErrorMessage('MALFORMED_RESPONSE'),
        retryable: false,
      },
    };
  }
}

// ── DeepSeek Chat Completions API ──

async function callDeepSeek(input: AiProviderAdapterInput): Promise<AiExplainResult> {
  const { request, config, signal } = input;
  const base = normalizeBaseUrl(config.baseUrl);
  const endpoint = `${base}/chat/completions`;

  const body = JSON.stringify({
    model: config.model,
    messages: [
      { role: 'system', content: SYSTEM_INSTRUCTION },
      { role: 'user', content: request.briefMarkdown },
    ],
    stream: false,
  });

  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body,
    signal,
  });

  if (!resp.ok) {
    const { code, retryable } = mapHttpStatusToErrorCode(resp.status);
    return {
      ok: false,
      requestId: request.requestId,
      createdAt: new Date().toISOString(),
      provider: config.provider,
      model: config.model,
      error: {
        code,
        message: sanitizeErrorMessage(code, resp.status, retryable),
        retryable,
      },
    };
  }

  try {
    const data = await resp.json() as Record<string, unknown>;

    let contentText = '';
    const choices = data.choices as Array<Record<string, unknown>> | undefined;
    if (choices && choices.length > 0) {
      const message = choices[0].message as Record<string, unknown> | undefined;
      if (message && typeof message.content === 'string') {
        contentText = message.content;
      }
    }

    if (contentText.length > 0) {
      return {
        ok: true,
        requestId: request.requestId,
        createdAt: new Date().toISOString(),
        provider: config.provider,
        model: config.model,
        contentMarkdown: contentText,
      };
    }

    return {
      ok: false,
      requestId: request.requestId,
      createdAt: new Date().toISOString(),
      provider: config.provider,
      model: config.model,
      error: {
        code: 'MALFORMED_RESPONSE',
        message: sanitizeErrorMessage('MALFORMED_RESPONSE'),
        retryable: false,
      },
    };
  } catch {
    return {
      ok: false,
      requestId: request.requestId,
      createdAt: new Date().toISOString(),
      provider: config.provider,
      model: config.model,
      error: {
        code: 'MALFORMED_RESPONSE',
        message: sanitizeErrorMessage('MALFORMED_RESPONSE'),
        retryable: false,
      },
    };
  }
}

// ── Main request handler ──

export async function requestAiExplanation(
  request: AiExplainRequest,
  config: AiProviderConfig,
): Promise<AiExplainResult> {
  const timeoutMs = config.timeoutMs;
  const controller = new AbortController();

  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  const input: AiProviderAdapterInput = {
    request,
    config,
    signal: controller.signal,
  };

  try {
    let result: AiExplainResult;

    switch (config.provider) {
      case 'openai':
        result = await callOpenAI(input);
        break;
      case 'anthropic':
        result = await callAnthropic(input);
        break;
      case 'deepseek':
        result = await callDeepSeek(input);
        break;
      default:
        result = {
          ok: false,
          requestId: request.requestId,
          createdAt: new Date().toISOString(),
          provider: config.provider,
          model: config.model,
          error: {
            code: 'INVALID_PROVIDER_CONFIG',
            message: `Unsupported provider: ${config.provider}`,
            retryable: false,
          },
        };
    }

    return result;
  } catch (err: unknown) {
    const isAborted = controller.signal.aborted;
    // If aborted and not from an HTTP error, it's a timeout
    if (isAborted && !(err instanceof TypeError || (err as Error)?.message?.includes('abort'))) {
      // Network fetch aborted by AbortController (timeout or cancel)
    }

    if (err instanceof DOMException && err.name === 'AbortError') {
      return {
        ok: false,
        requestId: request.requestId,
        createdAt: new Date().toISOString(),
        provider: config.provider,
        model: config.model,
        error: {
          code: 'TIMEOUT',
          message: sanitizeErrorMessage('TIMEOUT'),
          retryable: true,
        },
      };
    }

    // Network error
    if (err instanceof TypeError || (err instanceof Error && err.message.includes('fetch'))) {
      return {
        ok: false,
        requestId: request.requestId,
        createdAt: new Date().toISOString(),
        provider: config.provider,
        model: config.model,
        error: {
          code: 'NETWORK_ERROR',
          message: sanitizeErrorMessage('NETWORK_ERROR'),
          retryable: true,
        },
      };
    }

    return {
      ok: false,
      requestId: request.requestId,
      createdAt: new Date().toISOString(),
      provider: config.provider,
      model: config.model,
      error: {
        code: 'NETWORK_ERROR',
        message: sanitizeErrorMessage('NETWORK_ERROR'),
        retryable: true,
      },
    };
  } finally {
    clearTimeout(timeoutId);
  }
}
