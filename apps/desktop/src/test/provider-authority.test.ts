import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { SettingsState, ProviderInstance } from '@omue/shared-protocol';
import * as providerAuthorityModule from '../main/settings/provider-authority';
import {
  createSettingsMutationService,
  type SettingsSessionState,
} from '../main/settings/settingsMutationService';

const { resolveProviderAuthority } = providerAuthorityModule;

interface ProviderAuthorityDeps {
  loadSettings: () => Promise<SettingsState>;
  getSessionApiKey: (providerInstanceId: string) => string | null;
  isSafeStorageAvailable: () => boolean;
  isVaultCorrupt: () => boolean;
  getApiKey: (ref: string) => string | null;
}

const TEST_KEY = 'test-api-key-plaintext';

function makeProvider(overrides?: Partial<ProviderInstance>): ProviderInstance {
  return {
    instanceId: 'test-provider',
    enabled: true,
    displayName: 'Test Provider',
    kind: 'openai',
    baseUrl: 'https://api.example.com/v1',
    defaultModel: 'test-model',
    apiKeyRef: 'vault:test-provider:key1',
    chatModel: 'test-model',
    diagnosisModel: 'test-diagnosis-model',
    summaryModel: 'test-model',
    advanced: {
      timeout: 30,
      retries: 3,
      streaming: true,
      temperature: 0.7,
      maxTokens: 4096,
      reasoningEffort: 'auto',
      proxy: '',
    },
    ...overrides,
  };
}

function makeSettings(providers: ProviderInstance[]): SettingsState {
  return {
    general: { startupBehavior: 'restore-last', checkForUpdates: true, crashReports: true },
    modelProviders: { providers },
    assistant: {
      name: 'Default Assistant',
      defaultWorkMode: 'diagnosis-suggestions',
      responseStyle: 'detailed',
      evidenceRequirement: 'standard',
      autoScanScope: 'current-asset',
      lowEvidenceBehavior: 'ask-user',
      repairBehaviors: {
        autoCollectEvidence: true,
        autoRetryOnFailure: true,
        suggestAlternatives: true,
        requireApproval: true,
        notifyOnComplete: true,
        logVerbose: false,
      },
    },
    appearance: {
      theme: 'ue-agent',
      accentColor: 'blue',
      density: 'comfortable',
      fontSize: 'medium',
      layouts: {
        showLeftRail: true,
        showProjectExplorer: true,
        showRightInspector: true,
        showStatusBar: false,
      },
      chatDisplay: {
        showTimestamps: true,
        showAvatars: true,
        codeSyntaxHighlight: true,
        collapseLongMessages: false,
        showActionButtons: true,
      },
    },
    language: {
      uiLanguage: 'en',
      assistantReplyLanguage: 'follow-ui',
      terminologyDisplay: 'english',
      timeFormat: '24h',
    },
    ueConnection: {
      projectPath: '',
      enginePath: '',
      host: 'localhost',
      port: 28470,
      scanOnStartup: true,
      watchAssetChanges: true,
      autoScan: false,
      taskRelatedOnly: true,
    },
    sandboxSecurity: {
      defaultModificationMode: 'sandbox-always',
      writeBackConfirmations: {
        sandboxApply: true,
        promote: true,
        rollback: true,
        bulkOperation: true,
      },
      sandboxLocation: '/Game/Scratch/',
      rollbackStrategy: 'automatic-snapshot',
      riskPolicy: 'balanced',
      protectedContent: {
        blueprints: true,
        behaviorTrees: true,
        blackboards: true,
        assets: false,
        projectSettings: true,
      },
      protectedPaths: ['/Game/Scratch/', '/Game/Test/'],
    },
    privacyLog: {
      dataUsage: {
        anonymousTelemetry: false,
        crashReports: true,
        usageStatistics: false,
        improvementProgram: false,
      },
      logging: {
        bridgeCommunication: true,
        agentStateChanges: true,
        userActions: false,
        performanceMetrics: false,
      },
      sensitiveInfoProtection: {
        maskApiKeys: true,
        maskFilePaths: true,
        maskAssetNames: false,
        maskUserInput: false,
      },
      logRetention: '30d',
    },
    advanced: {
      developerMode: false,
      devToggles: {
        showRawBridgePayload: false,
        enableVerboseLogging: false,
        showMockScenarioControls: false,
        enableDevTools: false,
        bypassSandboxPromote: false,
        showExperimentalUi: false,
      },
      agentExecutionLimits: {
        maxRetries: 3,
        maxCompileRetries: 5,
        maxProposalCandidates: 3,
        sessionTimeoutMinutes: 30,
      },
      experimentalFeatures: {
        enableAutoScan: false,
        enableMultiStepRepair: false,
        enableAutoRollback: false,
      },
    },
  };
}

function makeDeps(
  providers: ProviderInstance[],
  overrides?: Partial<ProviderAuthorityDeps>,
): ProviderAuthorityDeps {
  return {
    loadSettings: async () => makeSettings(providers),
    getSessionApiKey: () => null,
    isSafeStorageAvailable: () => true,
    isVaultCorrupt: () => false,
    getApiKey: () => TEST_KEY,
    ...overrides,
  };
}

test('returns missing_provider when no provider is enabled', async () => {
  const result = await resolveProviderAuthority(makeDeps([
    makeProvider({ enabled: false }),
  ]));
  assert.deepEqual(result, { status: 'missing_provider' });
});

test('returns ready with diagnosis model and Main-only runtime config', async () => {
  const result = await resolveProviderAuthority(makeDeps([makeProvider()]));

  assert.equal(result.status, 'ready');
  assert.equal(result.providerId, 'test-provider');
  assert.equal(result.diagnosisModel, 'test-diagnosis-model');
  assert.equal(result.config?.provider, 'openai');
  assert.equal(result.config?.model, 'test-diagnosis-model');
  assert.equal(result.config?.apiKey, TEST_KEY);
});

test('uses defaultModel when diagnosisModel is empty', async () => {
  const result = await resolveProviderAuthority(makeDeps([
    makeProvider({ diagnosisModel: '' }),
  ]));
  assert.equal(result.status, 'ready');
  assert.equal(result.diagnosisModel, 'test-model');
  assert.equal(result.config?.model, 'test-model');
});

test('incomplete provider cannot mask a complete provider', async () => {
  const incomplete = makeProvider({
    instanceId: 'a-incomplete',
    apiKeyRef: undefined,
  });
  const complete = makeProvider({
    instanceId: 'z-complete',
    apiKeyRef: 'vault:z-complete:key1',
  });
  const result = await resolveProviderAuthority(makeDeps(
    [incomplete, complete],
    {
      getApiKey: ref => ref === 'vault:z-complete:key1' ? TEST_KEY : null,
    },
  ));

  assert.equal(result.status, 'ready');
  assert.equal(result.providerId, 'z-complete');
});

test('multiple ready providers use stable instanceId ordering', async () => {
  const result = await resolveProviderAuthority(makeDeps([
    makeProvider({ instanceId: 'z-provider', apiKeyRef: 'vault:z-provider:key1' }),
    makeProvider({ instanceId: 'a-provider', apiKeyRef: 'vault:a-provider:key1' }),
  ]));

  assert.equal(result.status, 'ready');
  assert.equal(result.providerId, 'a-provider');
});

test('session-memory key makes provider ready without persisted ref', async () => {
  const result = await resolveProviderAuthority(makeDeps(
    [makeProvider({ apiKeyRef: undefined })],
    {
      getSessionApiKey: providerId => providerId === 'test-provider' ? TEST_KEY : null,
      isSafeStorageAvailable: () => false,
      getApiKey: () => {
        throw new Error('persisted vault must not be read for a session key');
      },
    },
  ));

  assert.equal(result.status, 'ready');
  assert.equal(result.config?.apiKey, TEST_KEY);
});

test('clearing a session-memory key is reflected on the next resolve', async () => {
  let sessionKey: string | null = TEST_KEY;
  const deps = makeDeps(
    [makeProvider({ apiKeyRef: undefined })],
    {
      getSessionApiKey: () => sessionKey,
      isSafeStorageAvailable: () => false,
      getApiKey: () => null,
    },
  );

  assert.equal((await resolveProviderAuthority(deps)).status, 'ready');
  sessionKey = null;
  assert.equal((await resolveProviderAuthority(deps)).status, 'missing_key');
});

test('persisted ref reports vault_unavailable when encryption is unavailable', async () => {
  const result = await resolveProviderAuthority(makeDeps(
    [makeProvider()],
    {
      isSafeStorageAvailable: () => false,
      getApiKey: () => null,
    },
  ));

  assert.equal(result.status, 'vault_unavailable');
});

test('persisted ref reports vault_corrupt distinctly from missing_key', async () => {
  const result = await resolveProviderAuthority(makeDeps(
    [makeProvider()],
    {
      isVaultCorrupt: () => true,
      getApiKey: () => null,
    },
  ));

  assert.equal(result.status, 'vault_corrupt');
});

test('missing persisted plaintext reports missing_key', async () => {
  const result = await resolveProviderAuthority(makeDeps(
    [makeProvider()],
    { getApiKey: () => null },
  ));
  assert.equal(result.status, 'missing_key');
});

test('unsupported proposal provider kind reports invalid_config', async () => {
  const result = await resolveProviderAuthority(makeDeps([
    makeProvider({ kind: 'gemini' }),
  ]));
  assert.equal(result.status, 'invalid_config');
});

test('invalid base URL reports invalid_config', async () => {
  const result = await resolveProviderAuthority(makeDeps([
    makeProvider({ baseUrl: 'not-a-url' }),
  ]));
  assert.equal(result.status, 'invalid_config');
});

test('base URL containing credential-like query reports invalid_config', async () => {
  const result = await resolveProviderAuthority(makeDeps([
    makeProvider({ baseUrl: 'https://api.example.com/v1?api_key=secret' }),
  ]));
  assert.equal(result.status, 'invalid_config');
});

test('when none are ready the most diagnostic status wins deterministically', async () => {
  const result = await resolveProviderAuthority(makeDeps(
    [
      makeProvider({ instanceId: 'a-missing', apiKeyRef: undefined }),
      makeProvider({ instanceId: 'z-invalid', kind: 'unsupported' }),
    ],
  ));

  assert.equal(result.status, 'invalid_config');
  assert.equal(result.providerId, 'z-invalid');
});

test('safe projection serializes without runtime config or plaintext key', async () => {
  const authority = await resolveProviderAuthority(makeDeps([makeProvider()]));
  const toProviderReadiness = (
    providerAuthorityModule as unknown as {
      toProviderReadiness?: (value: typeof authority) => Record<string, unknown>;
    }
  ).toProviderReadiness;
  assert.equal(typeof toProviderReadiness, 'function');
  const projection = toProviderReadiness!(authority);
  const serialized = JSON.stringify(projection);

  assert.deepEqual(projection, {
    status: 'ready',
    providerId: 'test-provider',
    displayName: 'Test Provider',
    diagnosisModel: 'test-diagnosis-model',
  });
  assert.doesNotMatch(serialized, /config/);
  assert.doesNotMatch(serialized, new RegExp(TEST_KEY));
  assert.doesNotMatch(serialized, /apiKey/);
});

test('Settings session-memory set and clear immediately drive the same authority resolver', async () => {
  const session: SettingsSessionState = { inMemoryApiKeys: new Map() };
  let current = makeSettings([makeProvider({ apiKeyRef: undefined })]);
  const service = createSettingsMutationService({
    loadSettings: async () => current,
    getDefaultSettings: () => current,
    writeSettings: async settings => {
      current = settings;
      return { ok: true };
    },
    vault: {
      isSafeStorageAvailable: () => false,
      isVaultCorrupt: () => false,
      setApiKey: async () => ({ ok: false, kind: 'encryption_unavailable', error: 'unavailable' }),
      clearApiKeyEntries: async () => ({ ok: true, changed: false }),
      snapshotProviderEntriesFor: () => ({}),
      restoreProviderEntries: async () => ({ ok: true }),
    },
    validateSettingsPatch: () => ({ ok: true }),
    validateSettingsState: () => ({ ok: true }),
    validateResetKeys: () => ({ ok: true, keys: [] }),
    validateProviderInstanceId: () => null,
    buildMemVaultRef: (providerInstanceId, ts) => `mem-vault-${providerInstanceId}-${ts}`,
    deepMergeSettings: (_base, patch) => patch as SettingsState,
    nowMs: () => 123,
    session,
  });
  const createResolver = (
    providerAuthorityModule as unknown as {
      createProviderAuthorityResolver?: (
        settingsService: typeof service,
        vault: {
          isSafeStorageAvailable: () => boolean;
          isVaultCorrupt: () => boolean;
          getApiKey: (ref: string) => string | null;
        },
      ) => () => ReturnType<typeof resolveProviderAuthority>;
    }
  ).createProviderAuthorityResolver;
  assert.equal(typeof createResolver, 'function');
  const resolver = createResolver!(service, {
    isSafeStorageAvailable: () => false,
    isVaultCorrupt: () => false,
    getApiKey: () => null,
  });

  const setResult = await service.setApiKey('test-provider', TEST_KEY);
  assert.equal(setResult.ok, true);
  assert.equal((await resolver()).status, 'ready');

  const clearResult = await service.clearApiKey('test-provider');
  assert.equal(clearResult.ok, true);
  assert.equal((await resolver()).status, 'missing_key');
});
