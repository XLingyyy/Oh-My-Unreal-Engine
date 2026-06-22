// ── 统一入口 ──────────────────────────────────────────────────
//
// 桌面端通过以下方式导入：
//   import type { OmueContextSnapshot, LogEntry, ... } from '@omue/shared-protocol';
//   import { sampleContextSnapshot } from '@omue/shared-protocol';
//

// 类型
export type { ProjectContext, EditorStatus } from './types/project-context.js';
export type { AssetContext } from './types/asset-context.js';
export type {
  WriteRefusalReason,
  OperationApproval,
  SnapshotStatus,
  RollbackStatus,
  WritePreflightCheckResult,
  OperationGateState,
  ReversibleWriteRequest,
  ReversibleWriteResponse,
  RollbackRequest,
  RollbackResponse,
} from './types/reversible-write.js';
export {
  SAFE_SCRATCH_BLUEPRINT_MUTATION_SCHEMA_VERSION,
  TYPED_PAYLOAD_PREFLIGHT_CHECK_IDS,
  TYPED_PAYLOAD_REFUSAL_REASONS,
  DEFAULT_SAFE_SCRATCH_ALLOWLIST_PREFIXES,
} from './types/typed-fix-payload.js';
export type {
  SafeScratchBlueprintMutationOperationKind,
  SafeScratchBlueprintMutationAssetKind,
  SafeScratchBlueprintMutationBeforeState,
  SafeScratchBlueprintMetadataAfterState,
  SafeScratchBlueprintVariableDefaultAfterState,
  SafeScratchBlueprintMutationAfterState,
  SafeScratchBlueprintMutationDisplay,
  SafeScratchBlueprintMutationPayload,
  TypedFixPayload,
  TypedPayloadPreflightCheckId,
  TypedPayloadRefusalReason,
  TypedPayloadPreflightCheckRow,
  TypedPayloadValidationResult,
  ScratchMetadataBeforeAfterState,
  ScratchMetadataWriteCapture,
  ScratchMetadataRollbackIntent,
  ScratchMetadataRollbackPayload,
  ScratchVariableDefaultWriteCapture,
  ScratchVariableDefaultRollbackIntent,
  ScratchVariableDefaultRollbackPayload,
} from './types/typed-fix-payload.js';
export type {
  FixCandidateSource,
  FixCandidateRanking,
  FixCandidateConfidence,
  EvidenceLink,
  FixCandidate,
  RepairSessionStatus,
  RepairSession,
  FixPreview,
  FixApproval,
  FixExecutionResult,
} from './types/fix-candidate.js';
export type {
  OperationKind,
  PreflightSeverity,
  CapabilityStatus,
  PreflightCheckId,
  WritePreflightIssue,
  WritePreflightResult,
  WritePreflightRequest,
  BridgeWriteCapability,
  BridgeCapabilityDiscovery,
} from './types/capability-discovery.js';
export type {
  BlueprintExportStatus,
  BlueprintVariable,
  BlueprintParam,
  BlueprintFunction,
  BlueprintEvent,
  BlueprintType,
  BlueprintContext,
} from './types/blueprint-context.js';
export type { LogEntry, LogVerbosity } from './types/log-entry.js';
export type {
  CompileResult,
  CompileIssueSeverity,
  CompileIssue,
  CompileStatus,
} from './types/compile-status.js';
export type {
  DuplicateScratchRequest,
  DuplicateScratchResponse,
  CompileBlueprintRequest,
  CompileBlueprintResponse,
} from './types/sandbox-endpoints.js';
export type {
  GraphSummary,
  VariableSummary,
  FunctionSummary,
  MacroSummary,
  BlueprintSummary,
  BlueprintSummaryData,
} from './types/blueprint-summary.js';
export type {
  GraphKind,
  BlueprintExportMeta,
  BlueprintMetadata,
  BlueprintGraphInfo,
  BlueprintVariableDef,
  BlueprintParamDef,
  BlueprintFunctionDef,
  BlueprintEventDef,
  BlueprintMacroDef,
  BlueprintGraphExport,
  BlueprintGraphsData,
} from './types/blueprint-graph.js';
export type {
  NodeType,
  NodeInfo,
  PinDirection,
  PinKind,
  PinInfo,
  LinkInfo,
  GraphDetailTruncationReason,
  GraphDetailTruncation,
  GraphDetail,
  BlueprintGraphDetailData,
} from './types/blueprint-graph-detail.js';
export type {
  PlayMode,
  EditorRuntimeStatus,
} from './types/editor-runtime-status.js';
export type {
  PlanSafetyClassification,
  PlanSource,
  AssetSource,
  AssetEligibility,
  BlueprintInventorySourceKind,
  BlueprintInventoryHealth,
  BlueprintInventoryEntry,
  BlueprintInventoryState,
  SafetyStatus,
  BlueprintAssetSummary,
  ChangePlanOperation,
  BlueprintChangePlan,
  OperationKind as BpChangeOperationKind,
  OperationTargetArea as BpChangeOperationTargetArea,
} from './types/blueprint-change-plan.js';
export type {
  AgentSessionScope,
  AgentProposal,
  AgentProposalRequest,
  AgentProposalResult,
  AgentProposalErrorCode,
  AgentCandidateAsset,
  ConfidenceLevel,
  RiskLevel,
} from './types/agent-proposal.js';
export {
  AGENT_PROPOSAL_SUMMARY_MAX,
  AGENT_PROPOSAL_DIAGNOSIS_SUMMARY_MAX,
  AGENT_PROPOSAL_EVIDENCE_SUMMARY_MAX,
  AGENT_PROPOSAL_INHERITED_EVIDENCE_SUMMARY_MAX,
  AGENT_PROPOSAL_CANDIDATE_MAX,
  AGENT_USER_INTENT_MAX,
} from './types/agent-proposal.js';
export {
  REPAIR_SESSION_SCHEMA_VERSION,
  AGENT_PROPOSAL_PROPOSAL_KINDS,
} from './types/agent-loop.js';
export type {
  AgentProposalStoredKind,
  AgentProposalStoredRecord,
  AgentLoopState,
  AgentLoopTerminalState,
  AgentLoopCloseReason,
  RepairSessionRecordBase,
  AgentAssetSessionRecord,
  AgentProjectSessionRecord,
  RepairSessionRecord,
  StartSessionRequest,
  StartSessionResult,
  StartSessionErrorCode,
  CancelSessionRequest,
  CancelSessionResult,
  ApprovePromoteRequest,
  ApprovePromoteResult,
  RejectPromoteRequest,
  RejectPromoteResult,
  ListSessionsResult,
  ResumeSessionRequest,
  ResumeSessionResult,
  DiscardSessionRequest,
  DiscardSessionResult,
  SubscribeResult,
  AgentProgressEvent,
  AgentProposalEvent,
  AgentSandboxCompileResultEvent,
  AgentApprovalRequestedEvent,
  AgentSessionErrorRecord,
  AgentSessionErrorEvent,
  AgentSessionErrorStoredRecord,
  AgentSessionClosedEvent,
} from './types/agent-loop.js';
export { isAssetSession, isProjectSession } from './types/agent-loop.js';
export type {
  EvidenceSourceKind,
  EvidenceSource,
  EvidenceSeverity,
  EvidenceConfidence,
  ConfidenceAnnotation,
  EvidenceSnippet,
  AssetReference,
  GraphReference,
  NodeReference,
  PinReference,
  EvidenceReference,
  EvidenceChainItem,
  EvidenceChain,
} from './types/evidence-chain.js';
export type {
  OmueContextSnapshot,
  ContextSource,
  ContextAvailability,
} from './types/context-snapshot.js';
export type {
  BehaviorTreeAssetInfo,
  BehaviorTreeNodeKind,
  BehaviorTreeNodeEntry,
  BlackboardKeyDefinition,
  BehaviorTreeDiagnosticWarning,
  BehaviorTreeDiagnosticResponse,
} from './types/behavior-tree-diagnostic.js';
export type {
  ValidationStepKind,
  ValidationStepStatus,
  ValidationArtifact,
  ValidationResult,
  ValidationUserDecision,
  ValidationStep,
  ValidationRunPlan,
  ValidationLocalExecutionState,
} from './types/validation-run.js';
export type {
  ScanStatusStep,
  ScanStatusData,
  UserIntentData,
  DiagnosisData,
  FixPlanStep,
  FixPlanData,
  ChangePreviewData,
  ValidationCheck,
  ValidationResultData,
  ProjectCandidatesData,
  FailureData,
  CompletionTone,
  CompletionData,
  AgentCardData,
  AgentCardBase,
  AgentCard,
  EvidenceItem,
  ChangeItemChange,
  ChangeItem,
  AgentUiLogEntry,
  ProjectAssetNode,
  AgentCardActionId,
  AgentCardAction,
  AgentCardKind,
} from './types/ue-agent-ui.js';
export type {
  ApiSuccessResponse,
  ApiErrorResponse,
  ApiResponse,
  ErrorCode,
  EditorConnectionStatus,
  HealthData,
  HealthResponse,
  ContextSnapshotResponse,
  ProjectContextResponse,
  CurrentAssetData,
  CurrentAssetResponse,
  RecentLogsData,
  RecentLogsResponse,
  CompileStatusResponse,
  BlueprintSummaryResponse,
  BlueprintGraphsResponse,
  BlueprintGraphDetailResponse,
  RuntimeStatusResponse,
  BlueprintExportData,
  BlueprintExportResponse,
  SnapshotQueryParams,
  RecentLogsQueryParams,
  BlueprintExportQueryParams,
  BlueprintGraphDetailQueryParams,
} from './types/api.js';
export type {
  ThemeName,
  UILanguage,
  AssistantReplyLanguage,
  TerminologyDisplay,
  SettingsCategoryId,
  ProviderInstance,
  ProviderAdvancedConfig,
  GeneralSettings,
  ModelProviderSettings,
  AssistantSettings,
  AppearanceSettings,
  LanguageSettings,
  UEConnectionSettings,
  SandboxSecuritySettings,
  PrivacyLogSettings,
  AdvancedSettings,
  SettingsState,
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
  DeepPartial,
} from './types/settings.js';

// Provider instance ID validation (shared single source)
export { PROVIDER_INSTANCE_ID_PATTERN, validateProviderInstanceId } from './provider-validation.js';

// Generic injectable retry helper for file rename (no I/O, no Electron dependency)
export {
  runRenameWithRetry,
  type RenameFn,
  type SleepFn,
  type RenameRetryOptions,
  type RenameRetryResult,
} from './rename-retry.js';

// Strict vault-ref format helpers (provider + timestamp, no prefix collisions)
export {
  VAULT_REF_PREFIX,
  MEM_VAULT_REF_PREFIX,
  VAULT_REF_TIMESTAMP_PATTERN,
  VAULT_REF_PATTERN,
  parseVaultRef,
  buildVaultRef,
  buildMemVaultRef,
  refBelongsToProvider,
  refIsMemOnly,
  type ParsedVaultRef,
  type InvalidVaultRef,
} from './vault-ref.js';

// Pure settings save/clear/refresh outcome logic (shared by hook + validation)
export {
  computeRefreshOutcome,
  computeApiKeySaveOutcome,
  computeApiKeyClearOutcome,
  type SettingsApi,
  type SettingsApiResolver,
  type RefreshOutcomeKind,
  type RefreshOutcome,
  type ApiKeySaveKind,
  type ApiKeySaveOutcome,
  type ApiKeySaveContext,
  type ApiKeyClearKind,
  type ApiKeyClearOutcome,
} from './settings-outcome.js';

// 默认设置（单一来源，供 Main 与 Renderer 共享）
export { DEFAULT_PROVIDERS, createDefaultSettings } from './defaults.js';

// Mock 数据
export { sampleContextSnapshot } from './mocks/sample-context-snapshot.js';
