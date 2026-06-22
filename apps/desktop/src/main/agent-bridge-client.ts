import type {
  BlueprintGraphsData,
  BlueprintSummaryData,
  CompileBlueprintRequest,
  CompileBlueprintResponse,
  CompileStatus,
  CurrentAssetData,
  DuplicateScratchRequest,
  DuplicateScratchResponse,
  ProjectContext,
  RecentLogsData,
  ReversibleWriteRequest,
  ReversibleWriteResponse,
} from '@omue/shared-protocol';
import {
  BRIDGE_ENDPOINT,
  BridgeErrorCode,
  DEFAULT_BRIDGE_BASE_URL,
  DEFAULT_BRIDGE_TIMEOUT_MS,
} from '../renderer/services/http-bridge-client.contract';

class AgentBridgeClientError extends Error {
  code: string;
  endpoint?: string;
  statusCode?: number;

  constructor(
    code: string,
    message: string,
    options?: {
      endpoint?: string;
      statusCode?: number;
      cause?: unknown;
    },
  ) {
    super(message);
    this.name = 'AgentBridgeClientError';
    this.code = code;
    this.endpoint = options?.endpoint;
    this.statusCode = options?.statusCode;
    this.cause = options?.cause;
  }
}

export class AgentBridgeClient {
  constructor(
    private readonly baseUrl = DEFAULT_BRIDGE_BASE_URL,
    private readonly timeoutMs = DEFAULT_BRIDGE_TIMEOUT_MS,
  ) {}

  async duplicateScratch(
    request: DuplicateScratchRequest,
  ): Promise<DuplicateScratchResponse> {
    return this.requestJson<DuplicateScratchResponse>(
      BRIDGE_ENDPOINT.writeScratchDuplicate,
      request,
    );
  }

  async writeReversible(
    request: ReversibleWriteRequest,
  ): Promise<ReversibleWriteResponse> {
    return this.requestJson<ReversibleWriteResponse>(
      BRIDGE_ENDPOINT.writeScratch,
      request,
    );
  }

  async sandboxApply(
    request: ReversibleWriteRequest,
  ): Promise<ReversibleWriteResponse> {
    return this.requestJson<ReversibleWriteResponse>(
      BRIDGE_ENDPOINT.writeScratchSandboxApply,
      request,
    );
  }

  async compileBlueprint(
    request: CompileBlueprintRequest,
  ): Promise<CompileBlueprintResponse> {
    return this.requestJson<CompileBlueprintResponse>(
      BRIDGE_ENDPOINT.compileBlueprint,
      request,
    );
  }

  async getCompileStatus(): Promise<CompileStatus> {
    return this.requestJson<CompileStatus>(
      BRIDGE_ENDPOINT.compileStatus,
      undefined,
      'GET',
    );
  }

  async getProjectContext(): Promise<ProjectContext> {
    return this.requestJson<ProjectContext>(
      BRIDGE_ENDPOINT.contextProject,
      undefined,
      'GET',
    );
  }

  async getCurrentAsset(): Promise<CurrentAssetData> {
    return this.requestJson<CurrentAssetData>(
      BRIDGE_ENDPOINT.contextCurrentAsset,
      undefined,
      'GET',
    );
  }

  async getRecentLogs(): Promise<RecentLogsData> {
    return this.requestJson<RecentLogsData>(
      `${BRIDGE_ENDPOINT.logsRecent}?count=50`,
      undefined,
      'GET',
    );
  }

  async getBlueprintSummary(): Promise<BlueprintSummaryData> {
    return this.requestJson<BlueprintSummaryData>(
      BRIDGE_ENDPOINT.contextBlueprintSummary,
      undefined,
      'GET',
    );
  }

  async getBlueprintGraphs(): Promise<BlueprintGraphsData> {
    return this.requestJson<BlueprintGraphsData>(
      BRIDGE_ENDPOINT.contextBlueprintGraphs,
      undefined,
      'GET',
    );
  }

  private async requestJson<T>(
    endpoint: string,
    body?: unknown,
    method: 'GET' | 'POST' = 'POST',
  ): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const headers: Record<string, string> = {
        Accept: 'application/json',
      };
      if (body !== undefined) {
        headers['Content-Type'] = 'application/json';
      }

      const requestInit: RequestInit = {
        method,
        headers: {
          ...headers,
        },
        signal: controller.signal,
      };

      if (body !== undefined) {
        requestInit.body = JSON.stringify(body);
      }

      const response = await fetch(`${this.baseUrl}${endpoint}`, requestInit);

      if (!response.ok) {
        throw new AgentBridgeClientError(
          BridgeErrorCode.SERVER_ERROR,
          `Bridge returned HTTP ${response.status} for ${endpoint}.`,
          { endpoint, statusCode: response.status },
        );
      }

      let parsed: unknown;
      try {
        parsed = await response.json();
      } catch (cause) {
        throw new AgentBridgeClientError(
          BridgeErrorCode.INVALID_RESPONSE,
          `Bridge returned invalid JSON for ${endpoint}.`,
          { endpoint, statusCode: response.status, cause },
        );
      }

      const apiResponse = parsed as {
        success?: boolean;
        data?: T;
        error?: {
          code?: string;
          message?: string;
        };
      };

      if (apiResponse.data !== undefined) {
        return apiResponse.data;
      }

      throw new AgentBridgeClientError(
        apiResponse.error?.code ?? BridgeErrorCode.CONTEXT_UNAVAILABLE,
        apiResponse.error?.message ?? `Bridge response missing data for ${endpoint}.`,
        { endpoint, statusCode: response.status },
      );
    } catch (error) {
      if (error instanceof AgentBridgeClientError) {
        throw error;
      }

      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new AgentBridgeClientError(
          BridgeErrorCode.REQUEST_TIMEOUT,
          `Bridge request to ${endpoint} timed out after ${this.timeoutMs}ms.`,
          { endpoint, cause: error },
        );
      }

      if (error instanceof TypeError) {
        throw new AgentBridgeClientError(
          BridgeErrorCode.BRIDGE_UNREACHABLE,
          `Bridge unreachable at ${this.baseUrl}${endpoint}.`,
          { endpoint, cause: error },
        );
      }

      throw new AgentBridgeClientError(
        BridgeErrorCode.UNKNOWN_ERROR,
        error instanceof Error ? error.message : `Unknown bridge error for ${endpoint}.`,
        { endpoint, cause: error },
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

const agentBridgeBaseUrl = process.env.OMUE_AGENT_BRIDGE_BASE_URL ?? DEFAULT_BRIDGE_BASE_URL;
export const agentBridgeClient = new AgentBridgeClient(agentBridgeBaseUrl);
