// Real HTTP Bridge Client — Phase D / Phase F / Phase G2 / Phase H2
//
// Implements BridgeClient via native fetch to a local OmueUnrealBridge
// HTTP server. Currently consumes:
//   GET /health               → BridgeHealth
//   GET /context/project       → ProjectContext (required)
//   GET /context/current-asset → CurrentAssetData (enhancement)
//   GET /logs/recent?count=50  → RecentLogsData (enhancement)
//   GET /compile/status        → CompileStatus (enhancement, Phase H2)
//   GET /context/blueprint-summary → BlueprintSummaryData (enhancement, K2a)
//   GET /context/blueprint-graphs   → BlueprintGraphsData   (enhancement, K2b-1)
//
// compileStatus and blueprint are filled with empty/unknown defaults
// when their endpoints are unreachable or not yet implemented.
// blueprintSummary and blueprintGraphs degrade to undefined when
// their endpoints are unreachable.

import type { BridgeClient, BridgeHealth } from './bridge-client';
import type {
  OmueContextSnapshot,
  ProjectContext,
  HealthData,
  CurrentAssetData,
  RecentLogsData,
  CompileStatus,
  BlueprintSummaryData,
  BlueprintGraphsData,
  BlueprintGraphDetailData,
  BehaviorTreeDiagnosticResponse,
  BridgeCapabilityDiscovery,
  ReversibleWriteRequest,
  ReversibleWriteResponse,
  RollbackRequest,
  RollbackResponse,
  DuplicateScratchRequest,
  DuplicateScratchResponse,
  CompileBlueprintRequest,
  CompileBlueprintResponse,
} from '@omue/shared-protocol';
import {
  DEFAULT_BRIDGE_BASE_URL,
  DEFAULT_BRIDGE_TIMEOUT_MS,
  BRIDGE_ENDPOINT,
  BridgeErrorCode,
} from './http-bridge-client.contract';
import type {
  HttpBridgeClientOptions,
  BridgeErrorCodeValue,
  BridgeClientError,
} from './http-bridge-client.contract';
import {
  buildContextSnapshot,
  COMPILE_STATUS_UNKNOWN,
} from '../../shared/context-snapshot-builder';

// ── Error class ─────────────────────────────────────────────────

class RealBridgeClientError extends Error implements BridgeClientError {
  code: BridgeErrorCodeValue;
  endpoint?: string;
  statusCode?: number;
  isRetryable: boolean;
  occurredAt: string;

  constructor(
    code: BridgeErrorCodeValue,
    message: string,
    opts?: {
      endpoint?: string;
      statusCode?: number;
      cause?: unknown;
      isRetryable?: boolean;
    },
  ) {
    super(message);
    this.name = 'BridgeClientError';
    this.code = code;
    this.endpoint = opts?.endpoint;
    this.statusCode = opts?.statusCode;
    this.cause = opts?.cause;
    this.isRetryable = opts?.isRetryable ?? true;
    this.occurredAt = new Date().toISOString();
  }
}

// ── RealHttpBridgeClient ─────────────────────────────────────────

export class RealHttpBridgeClient implements BridgeClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private lastHealthVersion = 'unknown';

  constructor(options?: Partial<HttpBridgeClientOptions>) {
    this.baseUrl = options?.baseUrl ?? DEFAULT_BRIDGE_BASE_URL;
    this.timeoutMs = options?.timeoutMs ?? DEFAULT_BRIDGE_TIMEOUT_MS;
  }

  // ── BridgeClient implementation ─────────────────────────────

  async getHealth(): Promise<BridgeHealth> {
    const data = await this.requestJson<HealthData>(BRIDGE_ENDPOINT.health);

    this.lastHealthVersion = data.bridgeVersion;

    const connectionStatus = data.status === 'ok' ? 'connected' : 'error';

    return {
      connectionStatus,
      serviceName: 'OMUE Unreal Bridge',
      version: data.bridgeVersion,
      message: `Bridge ok, editorStatus: ${data.editorStatus}`,
      checkedAt: new Date().toISOString(),
    };
  }

  async getContextSnapshot(): Promise<OmueContextSnapshot> {
    // ── Required: project context ─────────────────────────────
    const projectData = await this.requestJson<ProjectContext>(
      BRIDGE_ENDPOINT.contextProject,
    );

    // ── Enhancement: current asset (Phase F) ─────────────────
    // Failure is non-fatal — we degrade to empty and log.
    let currentAssetData: CurrentAssetData | undefined;
    try {
      currentAssetData = await this.requestJson<CurrentAssetData>(
        BRIDGE_ENDPOINT.contextCurrentAsset,
      );
    } catch (e) {
      console.warn('[OMUE] Failed to fetch /context/current-asset, degrading', e);
    }

    // ── Enhancement: recent logs (Phase G2) ──────────────────
    // Failure is non-fatal — we degrade to empty and log.
    let logsData: RecentLogsData | undefined;
    try {
      logsData = await this.requestJson<RecentLogsData>(
        `${BRIDGE_ENDPOINT.logsRecent}?count=50`,
      );
    } catch (e) {
      console.warn('[OMUE] Failed to fetch /logs/recent, degrading', e);
    }

    // ── Enhancement: compile status (Phase H2) ───────────────
    // Failure is non-fatal — we degrade to COMPILE_STATUS_UNKNOWN.
    // The UE bridge Phase H1 endpoint returns conservative defaults
    // (unknown / false / 0 / []); Desktop does NOT guess from logs.
    let compileStatusData: CompileStatus = COMPILE_STATUS_UNKNOWN;
    try {
      compileStatusData = await this.requestJson<CompileStatus>(
        BRIDGE_ENDPOINT.compileStatus,
      );
    } catch (e) {
      console.warn('[OMUE] Failed to fetch /compile/status, degrading', e);
    }

    // ── Enhancement: blueprint summary (K2a) ─────────────────
    // Failure is non-fatal — we degrade to undefined.
    // K2a only returns top-level metadata (name, class, status,
    // graph/variable/function/macro counts and names). It does NOT
    // include nodes, pins, or links.
    let blueprintSummaryData: BlueprintSummaryData | undefined;
    try {
      blueprintSummaryData = await this.requestJson<BlueprintSummaryData>(
        BRIDGE_ENDPOINT.contextBlueprintSummary,
      );
    } catch (e) {
      console.warn('[OMUE] Failed to fetch /context/blueprint-summary, degrading', e);
    }

    // ── Enhancement: blueprint graphs (K2b-1) ────────────────
    // Failure is non-fatal — we degrade to undefined.
    // K2b-1 only returns graph-level summary (graphId, name, kind,
    // nodeCount, linkCount, isEntryGraph) plus variable/function/event/
    // macro summaries. It does NOT include nodes, pins, or links arrays.
    let blueprintGraphsData: BlueprintGraphsData | undefined;
    try {
      blueprintGraphsData = await this.requestJson<BlueprintGraphsData>(
        BRIDGE_ENDPOINT.contextBlueprintGraphs,
      );
    } catch (e) {
      console.warn('[OMUE] Failed to fetch /context/blueprint-graphs, degrading', e);
    }

    const now = new Date().toISOString();

    // /context/project is required; the enhancement endpoints
    // (current-asset, logs/recent, compile/status, blueprint-summary,
    // blueprint-graphs) degrade gracefully via buildContextSnapshot.
    return buildContextSnapshot({
      project: projectData,
      currentAssetData,
      logsData,
      compileStatusData,
      blueprintSummaryData,
      blueprintGraphsData,
      bridgeVersion: this.lastHealthVersion,
      now,
    });
  }

  // ── Graph detail (K2b-2c) ──────────────────────────────────

  /**
   * 按需请求单 Graph 节点/引脚/连线详情。
   * 不在 getContextSnapshot() 中自动调用；由用户点击 graph 触发。
   */
  async getBlueprintGraphDetail(graphId: string): Promise<BlueprintGraphDetailData> {
    const encoded = encodeURIComponent(graphId);
    return this.requestJson<BlueprintGraphDetailData>(
      `${BRIDGE_ENDPOINT.contextBlueprintGraphDetail}?graphId=${encoded}`,
    );
  }

  async getBehaviorTreeDiagnostic(assetPath: string): Promise<BehaviorTreeDiagnosticResponse> {
    const encoded = encodeURIComponent(assetPath);
    return this.requestJson<BehaviorTreeDiagnosticResponse>(
      `${BRIDGE_ENDPOINT.contextBehaviorTreeDiagnostic}?assetPath=${encoded}`,
    );
  }

  async getCapabilities(): Promise<BridgeCapabilityDiscovery> {
    return this.requestJson<BridgeCapabilityDiscovery>(
      BRIDGE_ENDPOINT.capabilities,
    );
  }

  // ── Reversible write (E71) ────────────────────────────────────

  async writeReversible(request: ReversibleWriteRequest): Promise<ReversibleWriteResponse> {
    return this.requestJson<ReversibleWriteResponse>(
      BRIDGE_ENDPOINT.writeScratch,
      { method: 'POST', body: JSON.stringify(request) },
    );
  }

  async sandboxApply(request: ReversibleWriteRequest): Promise<ReversibleWriteResponse> {
    return this.requestJson<ReversibleWriteResponse>(
      BRIDGE_ENDPOINT.writeScratchSandboxApply,
      { method: 'POST', body: JSON.stringify(request) },
    );
  }

  async rollbackReversible(request: RollbackRequest): Promise<RollbackResponse> {
    return this.requestJson<RollbackResponse>(
      BRIDGE_ENDPOINT.writeScratchRollback,
      { method: 'POST', body: JSON.stringify(request) },
    );
  }

  async duplicateScratch(request: DuplicateScratchRequest): Promise<DuplicateScratchResponse> {
    return this.requestJson<DuplicateScratchResponse>(
      BRIDGE_ENDPOINT.writeScratchDuplicate,
      { method: 'POST', body: JSON.stringify(request) },
    );
  }

  async compileBlueprint(request: CompileBlueprintRequest): Promise<CompileBlueprintResponse> {
    return this.requestJson<CompileBlueprintResponse>(
      BRIDGE_ENDPOINT.compileBlueprint,
      { method: 'POST', body: JSON.stringify(request) },
    );
  }

  // ── Private helpers ──────────────────────────────────────────

  /**
   * Send a GET request to the bridge, parse the ApiResponse envelope,
   * and return the `data` payload.
   *
   * Throws RealBridgeClientError on network failure, timeout, non-2xx,
   * invalid JSON, or success===false.
   */
  private async requestJson<T>(
    endpoint: string,
    options?: { method?: string; body?: string },
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    const method = options?.method ?? 'GET';
    const extraHeaders: Record<string, string> = {};
    if (options?.body) {
      extraHeaders['Content-Type'] = 'application/json';
    }

    const fetchInit: RequestInit = {
      signal: controller.signal,
      method,
      headers: { Accept: 'application/json', ...extraHeaders },
    };
    if (options?.body) {
      fetchInit.body = options.body;
    }

    console.debug('[OMUE] Bridge request', {
      url,
      endpoint,
      timeoutMs: this.timeoutMs,
      method,
      hasBody: !!options?.body,
    });

    try {
      const response = await fetch(url, fetchInit);
      clearTimeout(timeoutId);

      console.debug('[OMUE] Bridge response', {
        endpoint,
        status: response.status,
        ok: response.ok,
      });

      if (!response.ok) {
        throw new RealBridgeClientError(
          BridgeErrorCode.SERVER_ERROR,
          `Bridge returned HTTP ${response.status} for ${endpoint}`,
          { endpoint, statusCode: response.status },
        );
      }

      let body: unknown;
      try {
        body = await response.json();
      } catch {
        throw new RealBridgeClientError(
          BridgeErrorCode.INVALID_RESPONSE,
          `Response from ${endpoint} is not valid JSON`,
          { endpoint, statusCode: response.status },
        );
      }

      const apiResponse = body as {
        success: boolean;
        data?: T;
        error?: { code: string; message: string };
      };

      if (apiResponse.success === true && apiResponse.data !== undefined) {
        return apiResponse.data;
      }

      if (
        apiResponse.data !== undefined
        && (
          endpoint === BRIDGE_ENDPOINT.writeScratch
          || endpoint === BRIDGE_ENDPOINT.writeScratchRollback
          || endpoint === BRIDGE_ENDPOINT.writeScratchDuplicate
          || endpoint === BRIDGE_ENDPOINT.writeScratchSandboxApply
          || endpoint === BRIDGE_ENDPOINT.compileBlueprint
        )
      ) {
        return apiResponse.data;
      }

      throw new RealBridgeClientError(
        BridgeErrorCode.CONTEXT_UNAVAILABLE,
        apiResponse.error?.message ?? `Bridge returned success=false for ${endpoint}`,
        { endpoint, statusCode: response.status },
      );
    } catch (err) {
      clearTimeout(timeoutId);

      // Re-throw already-wrapped errors unchanged.
      if (err instanceof RealBridgeClientError) {
        console.error('[OMUE] Bridge request failed', {
          endpoint,
          url,
          code: err.code,
          statusCode: err.statusCode,
          message: err.message,
          cause: err.cause,
        });
        throw err;
      }

      // Log the raw error before re-classifying, so CORS / Private
      // Network Access / net::ERR_* details aren't lost.
      console.error('[OMUE] Bridge request failed (raw)', {
        endpoint,
        url,
        error: err,
        errorName: err instanceof Error ? err.name : undefined,
        errorMessage: err instanceof Error ? err.message : String(err),
        errorConstructor: err?.constructor?.name,
      });

      if (err instanceof DOMException && err.name === 'AbortError') {
        throw new RealBridgeClientError(
          BridgeErrorCode.REQUEST_TIMEOUT,
          `Request to ${endpoint} timed out after ${this.timeoutMs}ms`,
          { endpoint },
        );
      }

      // fetch throws TypeError for network errors (connection refused, DNS failure)
      if (err instanceof TypeError) {
        throw new RealBridgeClientError(
          BridgeErrorCode.BRIDGE_UNREACHABLE,
          `Bridge unreachable at ${this.baseUrl}${endpoint}`,
          { endpoint, cause: err },
        );
      }

      throw new RealBridgeClientError(
        BridgeErrorCode.UNKNOWN_ERROR,
        err instanceof Error ? err.message : `Unknown error requesting ${endpoint}`,
        { endpoint, cause: err },
      );
    }
  }
}
