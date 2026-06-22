export type ThemeName = 'ue-agent' | 'github-dark' | 'vscode-dark' | 'light';

export type UILanguage = 'en' | 'zh-CN';
export type AssistantReplyLanguage = 'follow-ui' | 'en' | 'zh-CN';
export type TerminologyDisplay = 'english' | 'chinese' | 'mixed-ue';

export type SettingsCategoryId =
  | 'general'
  | 'modelProviders'
  | 'assistant'
  | 'appearance'
  | 'language'
  | 'ueConnection'
  | 'sandboxSecurity'
  | 'privacyLog'
  | 'advanced';

export interface ProviderInstance {
  instanceId: string;
  enabled: boolean;
  displayName: string;
  kind: string;
  baseUrl: string;
  defaultModel: string;
  apiKeyRef?: string;
  chatModel: string;
  diagnosisModel: string;
  summaryModel: string;
  advanced: ProviderAdvancedConfig;
}

export interface ProviderAdvancedConfig {
  timeout: number;
  retries: number;
  streaming: boolean;
  temperature: number;
  maxTokens: number;
  reasoningEffort: string;
  proxy: string;
}

export interface GeneralSettings {
  startupBehavior: 'new-session' | 'restore-last' | 'show-home';
  checkForUpdates: boolean;
  crashReports: boolean;
}

export interface ModelProviderSettings {
  providers: ProviderInstance[];
}

export interface AssistantSettings {
  name: string;
  defaultWorkMode: 'read-only-diagnosis' | 'diagnosis-suggestions' | 'sandbox-repair' | 'advanced-automation';
  responseStyle: 'concise' | 'detailed' | 'technical';
  evidenceRequirement: 'minimal' | 'standard' | 'thorough';
  autoScanScope: 'current-asset' | 'open-assets' | 'project';
  lowEvidenceBehavior: 'ask-user' | 'proceed-cautiously' | 'block';
  repairBehaviors: {
    autoCollectEvidence: boolean;
    autoRetryOnFailure: boolean;
    suggestAlternatives: boolean;
    requireApproval: boolean;
    notifyOnComplete: boolean;
    logVerbose: boolean;
  };
}

export interface AppearanceSettings {
  theme: ThemeName;
  accentColor: string;
  density: 'compact' | 'comfortable' | 'spacious';
  fontSize: 'small' | 'medium' | 'large';
  layouts: {
    showLeftRail: boolean;
    showProjectExplorer: boolean;
    showRightInspector: boolean;
    showStatusBar: boolean;
  };
  chatDisplay: {
    showTimestamps: boolean;
    showAvatars: boolean;
    codeSyntaxHighlight: boolean;
    collapseLongMessages: boolean;
    showActionButtons: boolean;
  };
}

export interface LanguageSettings {
  uiLanguage: UILanguage;
  assistantReplyLanguage: AssistantReplyLanguage;
  terminologyDisplay: TerminologyDisplay;
  timeFormat: '24h' | '12h';
}

export interface UEConnectionSettings {
  projectPath: string;
  enginePath: string;
  host: string;
  port: number;
  scanOnStartup: boolean;
  watchAssetChanges: boolean;
  autoScan: boolean;
  taskRelatedOnly: boolean;
}

export interface SandboxSecuritySettings {
  defaultModificationMode: 'sandbox-always' | 'ask-each-time' | 'direct-write';
  writeBackConfirmations: {
    sandboxApply: boolean;
    promote: boolean;
    rollback: boolean;
    bulkOperation: boolean;
  };
  sandboxLocation: string;
  rollbackStrategy: 'automatic-snapshot' | 'manual-only' | 'ask-each-time';
  riskPolicy: 'cautious' | 'balanced' | 'advanced';
  protectedContent: {
    blueprints: boolean;
    behaviorTrees: boolean;
    blackboards: boolean;
    assets: boolean;
    projectSettings: boolean;
  };
  protectedPaths: string[];
}

export interface PrivacyLogSettings {
  dataUsage: {
    anonymousTelemetry: boolean;
    crashReports: boolean;
    usageStatistics: boolean;
    improvementProgram: boolean;
  };
  logging: {
    bridgeCommunication: boolean;
    agentStateChanges: boolean;
    userActions: boolean;
    performanceMetrics: boolean;
  };
  sensitiveInfoProtection: {
    maskApiKeys: boolean;
    maskFilePaths: boolean;
    maskAssetNames: boolean;
    maskUserInput: boolean;
  };
  logRetention: '24h' | '7d' | '30d' | '90d' | 'forever';
}

export interface AdvancedSettings {
  developerMode: boolean;
  devToggles: {
    showRawBridgePayload: boolean;
    enableVerboseLogging: boolean;
    showMockScenarioControls: boolean;
    enableDevTools: boolean;
    bypassSandboxPromote: boolean;
    showExperimentalUi: boolean;
  };
  agentExecutionLimits: {
    maxRetries: number;
    maxCompileRetries: number;
    maxProposalCandidates: number;
    sessionTimeoutMinutes: number;
  };
  experimentalFeatures: {
    enableAutoScan: boolean;
    enableMultiStepRepair: boolean;
    enableAutoRollback: boolean;
  };
}

export interface SettingsState {
  general: GeneralSettings;
  modelProviders: ModelProviderSettings;
  assistant: AssistantSettings;
  appearance: AppearanceSettings;
  language: LanguageSettings;
  ueConnection: UEConnectionSettings;
  sandboxSecurity: SandboxSecuritySettings;
  privacyLog: PrivacyLogSettings;
  advanced: AdvancedSettings;
}

export interface SettingsGetRequest {
  keys?: (keyof SettingsState)[];
}

export type SettingsGetResult =
  | { ok: true; settings: SettingsState; safeStorageAvailable: boolean }
  | { ok: false; error: string };

export interface SettingsUpdateRequest {
  patch: DeepPartial<SettingsState>;
}

export type SettingsUpdateResult =
  | { ok: true; settings: SettingsState }
  | { ok: false; settings: SettingsState; error: string };

export interface SettingsResetRequest {
  keys?: (keyof SettingsState)[];
}

export type SettingsResetResult =
  | { ok: true; settings: SettingsState }
  | { ok: false; settings: SettingsState; error: string };

export interface ApiKeySetRequest {
  providerInstanceId: string;
  apiKeyPlaintext: string;
}

export type ApiKeySetResult =
  | { ok: true; apiKeyRef: string; persisted: boolean }
  | { ok: false; error: string };

export interface ApiKeyClearRequest {
  providerInstanceId: string;
}

export type ApiKeyClearResult =
  | { ok: true }
  | { ok: false; error: string };

export interface TestProviderConnectionRequest {
  providerInstanceId: string;
  baseUrl: string;
  model: string;
  apiKeyPlaintextForTest?: string;
}

export type TestProviderConnectionResult =
  | { ok: true; latencyMs: number; models: string[] }
  | { ok: false; error: string; latencyMs?: number };

export type DeepPartial<T> = T extends object
  ? { [P in keyof T]?: DeepPartial<T[P]> }
  : T;
