/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Set to "real" to use RealHttpBridgeClient instead of MockBridgeClient */
  readonly VITE_OMUE_BRIDGE_MODE?: string;
  /** Override the default bridge base URL (default: http://127.0.0.1:21805) */
  readonly VITE_OMUE_BRIDGE_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface AiBlueprintExplanationShellStatus {
  readonly mode: 'shell-only';
  readonly networkEnabled: false;
  readonly providerConfigured: boolean;
  readonly message: string;
}

interface AiBlueprintExplanationShellRequest {
  briefMarkdown: string;
  focus: string;
  source?: string;
}

interface AiBlueprintExplanationShellResult {
  readonly ok: boolean;
  readonly requestId: string;
  readonly createdAt: string;
  readonly message: string;
  readonly validatedFields: string[];
  readonly missingFields: string[];
}

interface AiProviderConfigInput {
  provider: string;
  baseUrl: string;
  model: string;
  apiKey: string;
  timeoutMs?: number;
}

interface AiProviderStatus {
  readonly configured: boolean;
  readonly provider?: string;
  readonly baseUrl?: string;
  readonly model?: string;
  readonly timeoutMs?: number;
  readonly updatedAt?: string;
  readonly apiKeyConfigured: boolean;
  readonly missingFields: readonly string[];
  readonly mode: 'memory-only';
}

interface AiProviderConfigResult {
  readonly ok: boolean;
  readonly message: string;
  readonly missingFields?: readonly string[];
}

type OmueThemeName = 'github-dark' | 'vscode-dark' | 'light';

// E37 real provider adapter types

type AiExplainErrorCode =
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

interface AiExplainRequest {
  requestId: string;
  briefMarkdown: string;
  focus: 'Overview' | 'Execution Flow' | 'Data Flow' | 'Risk Hotspots' | 'Node Summary';
  source: 'blueprint-explanation-brief-v1';
  requestedAt: string;
}

interface AiExplainSuccessResult {
  readonly ok: true;
  readonly requestId: string;
  readonly createdAt: string;
  readonly provider: string;
  readonly model: string;
  readonly contentMarkdown: string;
}

interface AiExplainFailureResult {
  readonly ok: false;
  readonly requestId: string;
  readonly createdAt: string;
  readonly provider?: string;
  readonly model?: string;
  readonly error: {
    readonly code: AiExplainErrorCode;
    readonly message: string;
    readonly retryable: boolean;
  };
}

type AiExplainResult = AiExplainSuccessResult | AiExplainFailureResult;

interface SettingsApi {
  get(req?: Record<string, unknown>): Promise<{ ok: true; settings: import('@omue/shared-protocol').SettingsState; safeStorageAvailable: boolean } | { ok: false; error: string }>;
  update(req: { patch: Record<string, unknown> }): Promise<{ ok: true; settings: import('@omue/shared-protocol').SettingsState } | { ok: false; error: string }>;
  reset(req?: { keys?: string[] }): Promise<{ ok: true; settings: import('@omue/shared-protocol').SettingsState } | { ok: false; error: string }>;
  apiKey: {
    set(req: { providerInstanceId: string; apiKeyPlaintext: string }): Promise<{ ok: boolean; apiKeyRef: string; persisted: boolean; error?: string }>;
    clear(req: { providerInstanceId: string }): Promise<{ ok: boolean; error?: string }>;
  };
  getProviderAuthority(): Promise<
    | { ok: true; readiness: ProviderReadiness }
    | { ok: false; error: string }
  >;
  testProviderConnection(req: { providerInstanceId: string; baseUrl: string; model: string; apiKeyPlaintextForTest?: string }): Promise<{ ok: boolean; latencyMs?: number; models?: string[]; error?: string }>;
}

type ProviderAuthorityStatus =
  | 'ready'
  | 'missing_provider'
  | 'missing_key'
  | 'vault_unavailable'
  | 'vault_corrupt'
  | 'invalid_config';

interface ProviderReadiness {
  status: ProviderAuthorityStatus;
  providerId?: string;
  displayName?: string;
  diagnosisModel?: string;
  message?: string;
}

interface OmueApi {
  readonly platform: string;
  readonly versions: { readonly electron: string; readonly node: string };
  readonly settings: SettingsApi;
  getInitialTheme(): Promise<OmueThemeName>;
  readonly aiBlueprintExplanation: {
    getStatus(): Promise<AiBlueprintExplanationShellStatus>;
    checkShell(request: AiBlueprintExplanationShellRequest): Promise<AiBlueprintExplanationShellResult>;
    getProviderStatus(): Promise<AiProviderStatus>;
    saveProviderConfig(config: AiProviderConfigInput): Promise<AiProviderConfigResult>;
    clearProviderConfig(): Promise<{ readonly ok: boolean; readonly message: string }>;
    requestExplanation(request: AiExplainRequest): Promise<AiExplainResult>;
  };
  readonly agent: {
    startSession(
      request: import('@omue/shared-protocol').StartSessionRequest,
    ): Promise<import('@omue/shared-protocol').StartSessionResult>;
    cancelSession(
      request: import('@omue/shared-protocol').CancelSessionRequest,
    ): Promise<import('@omue/shared-protocol').CancelSessionResult>;
    approvePromote(
      request: import('@omue/shared-protocol').ApprovePromoteRequest,
    ): Promise<import('@omue/shared-protocol').ApprovePromoteResult>;
    rejectPromote(
      request: import('@omue/shared-protocol').RejectPromoteRequest,
    ): Promise<import('@omue/shared-protocol').RejectPromoteResult>;
    listSessions(): Promise<import('@omue/shared-protocol').ListSessionsResult>;
    resumeSession(
      request: import('@omue/shared-protocol').ResumeSessionRequest,
    ): Promise<import('@omue/shared-protocol').ResumeSessionResult>;
    discardSession(
      request: import('@omue/shared-protocol').DiscardSessionRequest,
    ): Promise<import('@omue/shared-protocol').DiscardSessionResult>;
    subscribe(): Promise<import('@omue/shared-protocol').SubscribeResult>;
    onProgress(handler: (payload: import('@omue/shared-protocol').AgentProgressEvent) => void): () => void;
    onProposal(handler: (payload: import('@omue/shared-protocol').AgentProposalEvent) => void): () => void;
    onSandboxCompileResult(
      handler: (payload: import('@omue/shared-protocol').AgentSandboxCompileResultEvent) => void,
    ): () => void;
    onApprovalRequested(
      handler: (payload: import('@omue/shared-protocol').AgentApprovalRequestedEvent) => void,
    ): () => void;
    onSessionError(
      handler: (payload: import('@omue/shared-protocol').AgentSessionErrorEvent) => void,
    ): () => void;
    onSessionClosed(
      handler: (payload: import('@omue/shared-protocol').AgentSessionClosedEvent) => void,
    ): () => void;
  };
}

interface Window {
  readonly omue: OmueApi;
}
