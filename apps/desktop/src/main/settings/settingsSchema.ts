import type { DeepPartial, SettingsState, SettingsCategoryId } from '@omue/shared-protocol';
import { validateProviderInstanceId, parseVaultRef, refIsMemOnly, refBelongsToProvider } from '@omue/shared-protocol';

export interface ValidationError {
  path: string;
  message: string;
}

export type ValidationResult = { ok: true } | { ok: false; errors: ValidationError[] };

type LeafChecker = (value: unknown, path: string) => string | null;

type SchemaNode =
  | { kind: 'leaf'; check: LeafChecker }
  | { kind: 'object'; fields: Record<string, SchemaNode> }
  | { kind: 'array'; item: SchemaNode };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && !Number.isNaN(value);
}

function enumChecker<T extends string>(allowed: readonly T[]): LeafChecker {
  return (value, path) => (allowed.includes(value as T) ? null : `Must be one of: ${allowed.join(', ')}`);
}

const boolCheck: LeafChecker = (v, path) => (isBoolean(v) ? null : `${path} must be boolean`);
const strCheck: LeafChecker = (v, path) => (isString(v) ? null : `${path} must be string`);

function numRange(min: number, max: number): LeafChecker {
  return (v, path) => (!isNumber(v) ? `${path} must be number` : v < min || v > max ? `${path} must be between ${min} and ${max}` : null);
}

function nonEmptyStr(maxLen: number): LeafChecker {
  return (v, path) => (!isString(v) ? `${path} must be string`
    : v.length === 0 ? `${path} must not be empty`
    : v.length > maxLen ? `${path} too long`
    : null);
}

/**
 * Leaf-level format check for `apiKeyRef`. Validates the ref parses via the
 * shared `parseVaultRef` (which rejects `mem-vault-*` and malformed refs)
 * and that the parsed `providerInstanceId` shape is sane. The strict
 * cross-field owner check ("parsed provider id must equal the same
 * provider object's `instanceId`") runs in `sanitizeSettingsFile` after
 * the recursive walk, where the full provider object is in hand.
 */
function apiKeyRefLeafCheck(v: unknown, path: string): string | null {
  if (v === undefined || v === null) return null;
  if (!isString(v)) return `${path} must be string`;
  if (v.length === 0) return null;
  if (refIsMemOnly(v)) {
    return `${path} must not be a mem-vault-* session ref in persisted settings`;
  }
  const parsed = parseVaultRef(v);
  if (!parsed.ok) return `${path} has invalid apiKeyRef format: ${parsed.reason}`;
  return null;
}

const THEME_NAMES = ['ue-agent', 'github-dark', 'vscode-dark', 'light'] as const;
const STARTUP_BEHAVIORS = ['new-session', 'restore-last', 'show-home'] as const;
const WORK_MODES = ['read-only-diagnosis', 'diagnosis-suggestions', 'sandbox-repair', 'advanced-automation'] as const;
const RESPONSE_STYLES = ['concise', 'detailed', 'technical'] as const;
const EVIDENCE_REQS = ['minimal', 'standard', 'thorough'] as const;
const SCAN_SCOPES = ['current-asset', 'open-assets', 'project'] as const;
const LOW_EVIDENCE = ['ask-user', 'proceed-cautiously', 'block'] as const;
const UI_LANGS = ['en', 'zh-CN'] as const;
const REPLY_LANGS = ['follow-ui', 'en', 'zh-CN'] as const;
const TERM_STYLES = ['english', 'chinese', 'mixed-ue'] as const;
const TIME_FORMATS = ['24h', '12h'] as const;
const DENSITIES = ['compact', 'comfortable', 'spacious'] as const;
const FONT_SIZES = ['small', 'medium', 'large'] as const;
const MOD_MODES = ['sandbox-always', 'ask-each-time', 'direct-write'] as const;
const ROLLBACK_STRATS = ['automatic-snapshot', 'manual-only', 'ask-each-time'] as const;
const RISK_POLICIES = ['cautious', 'balanced', 'advanced'] as const;
const RETENTIONS = ['24h', '7d', '30d', '90d', 'forever'] as const;

type SchemaObject = { kind: 'object'; fields: Record<string, SchemaNode> };

const obj = (fields: Record<string, SchemaNode>): SchemaObject => ({ kind: 'object', fields });
const leaf = (check: LeafChecker): SchemaNode => ({ kind: 'leaf', check });
const arr = (item: SchemaNode): SchemaNode => ({ kind: 'array', item });

const PROVIDER_SCHEMA: SchemaObject = obj({
  instanceId: leaf((v, path) => {
    const err = validateProviderInstanceId(v);
    return err ? `${path}: ${err}` : null;
  }),
  enabled: leaf(boolCheck),
  displayName: leaf(nonEmptyStr(256)),
  kind: leaf(nonEmptyStr(64)),
  baseUrl: leaf(strCheck),
  defaultModel: leaf(strCheck),
  apiKeyRef: leaf(apiKeyRefLeafCheck),
  chatModel: leaf(strCheck),
  diagnosisModel: leaf(strCheck),
  summaryModel: leaf(strCheck),
  advanced: obj({
    timeout: leaf(numRange(1, 600)),
    retries: leaf(numRange(0, 20)),
    streaming: leaf(boolCheck),
    temperature: leaf(numRange(0, 2)),
    maxTokens: leaf(numRange(1, 2000000)),
    reasoningEffort: leaf(strCheck),
    proxy: leaf(strCheck),
  }),
});

const SETTINGS_SCHEMA: SchemaObject = obj({
  general: obj({
    startupBehavior: leaf(enumChecker(STARTUP_BEHAVIORS)),
    checkForUpdates: leaf(boolCheck),
    crashReports: leaf(boolCheck),
  }),
  modelProviders: obj({
    providers: arr(PROVIDER_SCHEMA),
  }),
  assistant: obj({
    name: leaf(nonEmptyStr(256)),
    defaultWorkMode: leaf(enumChecker(WORK_MODES)),
    responseStyle: leaf(enumChecker(RESPONSE_STYLES)),
    evidenceRequirement: leaf(enumChecker(EVIDENCE_REQS)),
    autoScanScope: leaf(enumChecker(SCAN_SCOPES)),
    lowEvidenceBehavior: leaf(enumChecker(LOW_EVIDENCE)),
    repairBehaviors: obj({
      autoCollectEvidence: leaf(boolCheck),
      autoRetryOnFailure: leaf(boolCheck),
      suggestAlternatives: leaf(boolCheck),
      requireApproval: leaf(boolCheck),
      notifyOnComplete: leaf(boolCheck),
      logVerbose: leaf(boolCheck),
    }),
  }),
  appearance: obj({
    theme: leaf(enumChecker(THEME_NAMES)),
    accentColor: leaf(nonEmptyStr(64)),
    density: leaf(enumChecker(DENSITIES)),
    fontSize: leaf(enumChecker(FONT_SIZES)),
    layouts: obj({
      showLeftRail: leaf(boolCheck),
      showProjectExplorer: leaf(boolCheck),
      showRightInspector: leaf(boolCheck),
      showStatusBar: leaf(boolCheck),
    }),
    chatDisplay: obj({
      showTimestamps: leaf(boolCheck),
      showAvatars: leaf(boolCheck),
      codeSyntaxHighlight: leaf(boolCheck),
      collapseLongMessages: leaf(boolCheck),
      showActionButtons: leaf(boolCheck),
    }),
  }),
  language: obj({
    uiLanguage: leaf(enumChecker(UI_LANGS)),
    assistantReplyLanguage: leaf(enumChecker(REPLY_LANGS)),
    terminologyDisplay: leaf(enumChecker(TERM_STYLES)),
    timeFormat: leaf(enumChecker(TIME_FORMATS)),
  }),
  ueConnection: obj({
    projectPath: leaf(strCheck),
    enginePath: leaf(strCheck),
    host: leaf(nonEmptyStr(256)),
    port: leaf(numRange(1, 65535)),
    scanOnStartup: leaf(boolCheck),
    watchAssetChanges: leaf(boolCheck),
    autoScan: leaf(boolCheck),
    taskRelatedOnly: leaf(boolCheck),
  }),
  sandboxSecurity: obj({
    defaultModificationMode: leaf(enumChecker(MOD_MODES)),
    writeBackConfirmations: obj({
      sandboxApply: leaf(boolCheck),
      promote: leaf(boolCheck),
      rollback: leaf(boolCheck),
      bulkOperation: leaf(boolCheck),
    }),
    sandboxLocation: leaf(strCheck),
    rollbackStrategy: leaf(enumChecker(ROLLBACK_STRATS)),
    riskPolicy: leaf(enumChecker(RISK_POLICIES)),
    protectedContent: obj({
      blueprints: leaf(boolCheck),
      behaviorTrees: leaf(boolCheck),
      blackboards: leaf(boolCheck),
      assets: leaf(boolCheck),
      projectSettings: leaf(boolCheck),
    }),
    protectedPaths: arr(leaf(strCheck)),
  }),
  privacyLog: obj({
    dataUsage: obj({
      anonymousTelemetry: leaf(boolCheck),
      crashReports: leaf(boolCheck),
      usageStatistics: leaf(boolCheck),
      improvementProgram: leaf(boolCheck),
    }),
    logging: obj({
      bridgeCommunication: leaf(boolCheck),
      agentStateChanges: leaf(boolCheck),
      userActions: leaf(boolCheck),
      performanceMetrics: leaf(boolCheck),
    }),
    sensitiveInfoProtection: obj({
      maskApiKeys: leaf(boolCheck),
      maskFilePaths: leaf(boolCheck),
      maskAssetNames: leaf(boolCheck),
      maskUserInput: leaf(boolCheck),
    }),
    logRetention: leaf(enumChecker(RETENTIONS)),
  }),
  advanced: obj({
    developerMode: leaf(boolCheck),
    devToggles: obj({
      showRawBridgePayload: leaf(boolCheck),
      enableVerboseLogging: leaf(boolCheck),
      showMockScenarioControls: leaf(boolCheck),
      enableDevTools: leaf(boolCheck),
      bypassSandboxPromote: leaf(boolCheck),
      showExperimentalUi: leaf(boolCheck),
    }),
    agentExecutionLimits: obj({
      maxRetries: leaf(numRange(0, 20)),
      maxCompileRetries: leaf(numRange(0, 20)),
      maxProposalCandidates: leaf(numRange(0, 20)),
      sessionTimeoutMinutes: leaf(numRange(1, 1440)),
    }),
    experimentalFeatures: obj({
      enableAutoScan: leaf(boolCheck),
      enableMultiStepRepair: leaf(boolCheck),
      enableAutoRollback: leaf(boolCheck),
    }),
  }),
});

export const SETTINGS_CATEGORY_KEYS: readonly SettingsCategoryId[] = [
  'general', 'modelProviders', 'assistant', 'appearance', 'language',
  'ueConnection', 'sandboxSecurity', 'privacyLog', 'advanced',
];

/**
 * Preserve the legacy Settings shape while forcing every historical value
 * that claims to weaken the Agent hard gates back to a safe canonical value.
 * The Agent runtime does not consume these legacy policy fields; this
 * normalization prevents persisted files or renderer patches from implying
 * that sandbox, approval, Promote confirmation, or automation can be bypassed.
 */
export function normalizeSettingsSafety(
  input: DeepPartial<SettingsState>,
): DeepPartial<SettingsState> {
  const assistant = input.assistant
    ? {
        ...input.assistant,
        defaultWorkMode: input.assistant.defaultWorkMode === 'advanced-automation'
          ? 'diagnosis-suggestions' as const
          : input.assistant.defaultWorkMode,
        repairBehaviors: {
          ...input.assistant.repairBehaviors,
          autoRetryOnFailure: false,
          requireApproval: true,
        },
      }
    : undefined;

  const sandboxSecurity = input.sandboxSecurity
    ? {
        ...input.sandboxSecurity,
        defaultModificationMode: 'sandbox-always' as const,
        writeBackConfirmations: {
          ...input.sandboxSecurity.writeBackConfirmations,
          sandboxApply: true,
          promote: true,
          rollback: true,
          bulkOperation: true,
        },
        riskPolicy: 'cautious' as const,
      }
    : undefined;

  const advanced = input.advanced
    ? {
        ...input.advanced,
        devToggles: {
          ...input.advanced.devToggles,
          bypassSandboxPromote: false,
        },
        experimentalFeatures: {
          ...input.advanced.experimentalFeatures,
          enableAutoScan: false,
          enableMultiStepRepair: false,
          enableAutoRollback: false,
        },
      }
    : undefined;

  return {
    ...input,
    ...(assistant ? { assistant } : {}),
    ...(sandboxSecurity ? { sandboxSecurity } : {}),
    ...(advanced ? { advanced } : {}),
  };
}

function checkLeaf(check: LeafChecker, value: unknown, path: string): string | null {
  return check(value, path);
}

function validateNode(node: SchemaNode, value: unknown, path: string, errors: ValidationError[]): void {
  if (node.kind === 'leaf') {
    const err = checkLeaf(node.check, value, path);
    if (err) errors.push({ path, message: err });
    return;
  }
  if (node.kind === 'array') {
    if (!Array.isArray(value)) {
      errors.push({ path, message: `${path} must be an array` });
      return;
    }
    for (let i = 0; i < value.length; i += 1) {
      validateNode(node.item, value[i], `${path}[${i}]`, errors);
    }
    return;
  }
  if (!isObject(value)) {
    errors.push({ path, message: `${path} must be an object` });
    return;
  }
  for (const key of Object.keys(node.fields)) {
    if (key in value) {
      validateNode(node.fields[key], value[key], path ? `${path}.${key}` : key, errors);
    }
  }
}

function validatePatchNode(node: SchemaNode, value: unknown, path: string, errors: ValidationError[]): void {
  if (node.kind === 'leaf') {
    const err = checkLeaf(node.check, value, path);
    if (err) errors.push({ path, message: err });
    return;
  }
  if (node.kind === 'array') {
    if (!Array.isArray(value)) {
      errors.push({ path, message: `${path} must be an array` });
      return;
    }
    for (let i = 0; i < value.length; i += 1) {
      validatePatchNode(node.item, value[i], `${path}[${i}]`, errors);
    }
    return;
  }
  if (!isObject(value)) {
    errors.push({ path, message: `${path} must be an object` });
    return;
  }
  for (const key of Object.keys(value)) {
    if (!(key in node.fields)) {
      errors.push({ path: path ? `${path}.${key}` : key, message: `Unknown field "${key}"` });
      continue;
    }
    validatePatchNode(node.fields[key], value[key], path ? `${path}.${key}` : key, errors);
  }
}

function sanitizeNode(node: SchemaNode, value: unknown, path: string, errors: ValidationError[]): unknown {
  if (node.kind === 'leaf') {
    const err = checkLeaf(node.check, value, path);
    if (err) {
      errors.push({ path, message: err });
      return undefined;
    }
    return value;
  }
  if (node.kind === 'array') {
    if (!Array.isArray(value)) {
      errors.push({ path, message: `${path} must be an array` });
      return undefined;
    }
    const out: unknown[] = [];
    for (let i = 0; i < value.length; i += 1) {
      const item = sanitizeNode(node.item, value[i], `${path}[${i}]`, errors);
      if (item !== undefined) out.push(item);
    }
    return out;
  }
  if (!isObject(value)) {
    errors.push({ path, message: `${path} must be an object` });
    return undefined;
  }
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(node.fields)) {
    if (key in value) {
      const child = sanitizeNode(node.fields[key], value[key], path ? `${path}.${key}` : key, errors);
      if (child !== undefined) out[key] = child;
    }
  }
  return out;
}

function isOptionalCompleteField(path: string, key: string): boolean {
  return key === 'apiKeyRef' && /^modelProviders\.providers\[\d+\]$/.test(path);
}

function validateCompleteNode(node: SchemaNode, value: unknown, path: string, errors: ValidationError[]): void {
  if (node.kind === 'leaf') {
    const err = checkLeaf(node.check, value, path);
    if (err) errors.push({ path, message: err });
    return;
  }
  if (node.kind === 'array') {
    if (!Array.isArray(value)) {
      errors.push({ path, message: `${path} must be an array` });
      return;
    }
    for (let i = 0; i < value.length; i += 1) {
      validateCompleteNode(node.item, value[i], `${path}[${i}]`, errors);
    }
    return;
  }
  if (!isObject(value)) {
    errors.push({ path, message: `${path || 'Root'} must be an object` });
    return;
  }
  for (const [key, childNode] of Object.entries(node.fields)) {
    const childPath = path ? `${path}.${key}` : key;
    if (!(key in value)) {
      if (!isOptionalCompleteField(path, key)) {
        errors.push({ path: childPath, message: `${childPath} is required` });
      }
      continue;
    }
    validateCompleteNode(childNode, value[key], childPath, errors);
  }
}

function validateUniqueProviderInstanceIds(providers: unknown[], errors: ValidationError[]): void {
  const seen = new Set<string>();
  for (let i = 0; i < providers.length; i += 1) {
    const provider = providers[i];
    if (!isObject(provider) || typeof provider.instanceId !== 'string') continue;
    if (seen.has(provider.instanceId)) {
      errors.push({
        path: `modelProviders.providers[${i}].instanceId`,
        message: `Duplicate provider instanceId "${provider.instanceId}"`,
      });
      continue;
    }
    seen.add(provider.instanceId);
  }
}

export function validateSettings(input: DeepPartial<SettingsState>): ValidationResult {
  if (!isObject(input)) {
    return { ok: false, errors: [{ path: '', message: 'Root must be a JSON object' }] };
  }
  const errors: ValidationError[] = [];
  for (const key of Object.keys(input)) {
    if (!(key in SETTINGS_SCHEMA.fields)) {
      errors.push({ path: key, message: `Unknown field "${key}"` });
      continue;
    }
    validatePatchNode(SETTINGS_SCHEMA.fields[key], (input as Record<string, unknown>)[key], key, errors);
  }
  return errors.length > 0 ? { ok: false, errors } : { ok: true };
}

export function validateSettingsState(input: SettingsState): ValidationResult {
  if (!isObject(input)) {
    return { ok: false, errors: [{ path: '', message: 'Root must be a JSON object' }] };
  }
  const errors: ValidationError[] = [];
  validatePatchNode(SETTINGS_SCHEMA, input, '', errors);
  validateCompleteNode(SETTINGS_SCHEMA, input, '', errors);
  const providers = (input as { modelProviders?: { providers?: unknown } }).modelProviders?.providers;
  if (Array.isArray(providers)) {
    validateUniqueProviderInstanceIds(providers, errors);
    for (let i = 0; i < providers.length; i += 1) {
      validateProviderApiKeyRefOwner(providers[i], i, errors);
    }
  }
  return errors.length > 0 ? { ok: false, errors } : { ok: true };
}

/**
 * Cross-field check applied to a sanitized provider entry: the
 * `apiKeyRef` must (1) parse as a vault ref, (2) NOT be a `mem-vault-*`
 * session ref, and (3) its parsed `providerInstanceId` must strictly
 * equal the same object's `instanceId`. This is the single rule for
 * persisted settings; the service also strips `apiKeyRef` from
 * renderer patches defensively.
 */
function validateProviderApiKeyRefOwner(provider: unknown, index: number, errors: ValidationError[]): void {
  if (!isObject(provider)) return;
  const ref = provider.apiKeyRef;
  if (ref === undefined || ref === null) return;
  if (typeof ref !== 'string' || ref.length === 0) return; // already caught by leaf check
  const instanceId = provider.instanceId;
  if (typeof instanceId !== 'string' || instanceId.length === 0) {
    errors.push({
      path: `modelProviders.providers[${index}].apiKeyRef`,
      message: 'apiKeyRef requires a non-empty instanceId in the same provider object',
    });
    return;
  }
  if (refIsMemOnly(ref)) {
    errors.push({
      path: `modelProviders.providers[${index}].apiKeyRef`,
      message: 'apiKeyRef must not be a mem-vault-* session ref in persisted settings',
    });
    return;
  }
  if (!refBelongsToProvider(ref, instanceId)) {
    const parsed = parseVaultRef(ref);
    const ownerInfo = parsed.ok ? `parsed owner "${parsed.providerInstanceId}"` : `unparseable ref`;
    errors.push({
      path: `modelProviders.providers[${index}].apiKeyRef`,
      message: `apiKeyRef "${ref}" ${ownerInfo} does not match instanceId "${instanceId}"`,
    });
  }
}

export function sanitizeSettingsFile(input: unknown): { ok: true; data: DeepPartial<SettingsState> } | { ok: false; errors: ValidationError[] } {
  if (!isObject(input)) {
    return { ok: false, errors: [{ path: '', message: 'Root is not a JSON object' }] };
  }
  const errors: ValidationError[] = [];
  const data = sanitizeNode(SETTINGS_SCHEMA, input, '', errors) as DeepPartial<SettingsState>;

  // Cross-field owner check for each provider entry.
  const providers = (data as { modelProviders?: { providers?: unknown } } | null)?.modelProviders?.providers;
  if (Array.isArray(providers)) {
    validateUniqueProviderInstanceIds(providers, errors);
    for (let i = 0; i < providers.length; i += 1) {
      validateCompleteNode(PROVIDER_SCHEMA, providers[i], `modelProviders.providers[${i}]`, errors);
      validateProviderApiKeyRefOwner(providers[i], i, errors);
    }
  }

  return errors.length > 0
    ? { ok: false, errors }
    : { ok: true, data: normalizeSettingsSafety(data) };
}

export function validateResetKeys(keys: unknown): { ok: true; keys: SettingsCategoryId[] } | { ok: false; errors: ValidationError[] } {
  if (keys === undefined || keys === null) {
    return { ok: true, keys: [] };
  }
  if (!Array.isArray(keys)) {
    return { ok: false, errors: [{ path: 'keys', message: 'keys must be an array' }] };
  }
  const out: SettingsCategoryId[] = [];
  const errors: ValidationError[] = [];
  for (let i = 0; i < keys.length; i += 1) {
    const k = keys[i];
    if (!isString(k) || !SETTINGS_CATEGORY_KEYS.includes(k as SettingsCategoryId)) {
      errors.push({ path: `keys[${i}]`, message: `Invalid category "${String(k)}"` });
      continue;
    }
    out.push(k as SettingsCategoryId);
  }
  return errors.length > 0 ? { ok: false, errors } : { ok: true, keys: out };
}

export function isSettingsCategoryId(value: unknown): value is SettingsCategoryId {
  return typeof value === 'string' && SETTINGS_CATEGORY_KEYS.includes(value as SettingsCategoryId);
}
