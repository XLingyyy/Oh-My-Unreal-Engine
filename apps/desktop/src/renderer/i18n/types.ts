export type DesktopLanguage = 'en' | 'zh-CN';

// ── Common reusable tokens ──

export interface CommonCopy {
  yes: string; no: string;
  copy: string; clear: string; save: string; refresh: string;
  cancel: string; close: string; retry: string; hide: string;
  show: string; reset: string; expand: string; collapse: string;
  open: string; load: string; loading: string; remove: string;
  error: string; warning: string; info: string; successWord: string;
  empty: string; missing: string; ready: string; attention: string;
  items: string; chains: string; graphs: string; nodes: string;
  links: string; pins: string; errors: string; warnings: string;
  characters: string; lines: string; queueWord: string;
  high: string; normal: string; low: string;
  todo: string; reviewed: string; deferred: string; done: string;
  blocked: string; unresolved: string;
  configured: string; notConfigured: string;
  present: string; absent: string;
  loaded: string; notLoaded: string;
  captured: string; notCaptured: string;
  all: string; noneWord: string; unknown: string; na: string; noData: string;
  overview: string; investigation: string; workflow: string;
  action: string; raw: string; evidence: string;
  title: string; id: string; type: string; status: string; source: string;
  severity: string; confidence: string; priority: string; kind: string;
  name: string; path: string; classLabel: string;
  asset: string; project: string; engine: string; bridge: string;
  compile: string; runtime: string; pie: string;
  dirty: string; selected: string; openInEditor: string;
  search: string; filter: string; sort: string;
  preview: string; detail: string; summary: string; notes: string;
  safety: string; checklist: string;
  total: string; count: string;
  ok: string; fail: string; failed: string;
  idle: string; busy: string;
  connected: string; disconnected: string; connecting: string; checking: string;
  running: string; stopped: string; simulating: string;
  unavailable: string; notConfiguredShort: string;
  noAssetSelected: string; noEvidence: string; noLogs: string; logsUnit: string;
  noGraphLoaded: string; noQueueItems: string; noDataAvailable: string;
  clickToLoad: string;
  notRefreshed: string; clean: string; truncated: string; notTruncated: string;
  included: string; excluded: string; availableOnly: string;
  confirming: string; clickAgainToConfirm: string;
  generated: string; created: string; added: string; firstAdded: string;
  lastRefresh: string; currentAsset: string; snapshotId: string;
  model: string; apiKey: string; timeout: string; mode: string;
  metadata: string; result: string; latestResult: string;
  latestResultContent: string; failureDetails: string; reviewPackage: string;
  explanationDraft: string; safetyNote: string;
  totalItems: string; evidenceItems: string; graphNodeItems: string;
  sourceKind: string; nodeId: string; nodeType: string; nodeStatus: string;
  nodeEvidence: string; disabled: string;
  note: string; next: string;
  requestProvider: string; requestModel: string;
  configProvider: string; configModel: string; configUpdated: string;
  providerRequestId: string; providerResultCreatedAt: string;
  milliseconds: string; available: string;
  category: string; verbosity: string; timestamp: string; message: string;
  line: string; column: string; code: string; file: string;
  lastCompile: string; compileResult: string; compileIssues: string; compiling: string;
  inProgress: string; detailUnavailable: string;
}

// ── Shell ──

export interface ShellCopy {
  loading: string;
  loadingDetail: string;
  connectionFailed: string;
  retry: string;
  partialError: string;
  bridgeModeReal: string;
}

// Agent Workbench Shell

export interface UeAgentUiCopy {
  topbar: {
    brand: string;
    project: string;
    projectMenu: string;
    openAnotherProject: string;
    ueVersion: (version: string) => string;
    bpClean: string;
    bpErrors: (count: number) => string;
    bpWarnings: (count: number) => string;
    agentReady: string;
    agentScanning: string;
    agentWorking: string;
    agentNeedApproval: string;
    agentVerifying: string;
    agentFailed: string;
    agentEscalated: string;
    agentProviderRequired: string;
    agentInterrupted: string;
    sandboxMode: string;
    sandboxPreparing: string;
    sandboxValidating: string;
    sandboxAwaitingApproval: string;
    sandboxPromoting: string;
    bpUnknown: string;
    searchTitle: string;
    searchLabel: string;
    notificationsTitle: string;
    notificationsLabel: string;
    helpTitle: string;
    helpLabel: string;
    avatarTitle: string;
    avatarLabel: string;
    settingsTitle: string;
    themeTitle: string;
    openSettings: string;
    toggleTheme: string;
    explorerTitle: string;
    explorerLabel: string;
  };
  commandPalette: {
    dialogLabel: string;
    searchPlaceholder: string;
    empty: string;
    groups: {
      session: string;
      drawer: string;
      settings: string;
    };
    commands: {
      newSession: string;
      resumeInterrupted: string;
      refreshContext: string;
      openDrawer: (itemLabel: string) => string;
      openSettings: string;
      focusChatInput: string;
    };
    disabledReasons: {
      resumeUnavailable: string;
      refreshInProgress: string;
      contextRequired: string;
      chatViewRequired: string;
    };
  };
  drawer: {
    dialogLabel: string;
    items: {
      'session-notes': string;
      queue: string;
      questions: string;
      handoff: string;
      closure: string;
      'change-plan': string;
      'bp-change-workspace': string;
    };
    closeAria: string;
    noContextTitle: string;
    noContextDetail: string;
  };
  settingsPlaceholder: {
    title: string;
    body: string;
    back: string;
  };
  settingsPage: {
    title: string;
    backToChat: string;
    resetToDefaults: string;
    searchPlaceholder: string;
    noResults: string;
    categoriesAriaLabel: string;
    categories: {
      general: string;
      modelProviders: string;
      assistant: string;
      appearance: string;
      language: string;
      ueConnection: string;
      sandboxSecurity: string;
      privacyLog: string;
      advanced: string;
    };
    capability: {
      persistedOnlyLabel: string;
      persistedOnlyDetail: string;
      unavailableLabel: string;
      readOnlyLabel: string;
      readOnlyDetail: string;
    };
    general: {
      title: string;
      startupBehavior: string;
      newSession: string;
      restoreLast: string;
      showHome: string;
      checkUpdates: string;
      checkUpdatesDescription: string;
      crashReports: string;
      crashReportsDescription: string;
      startupPersistedOnlyReason: string;
      updateUnavailableReason: string;
      crashReportUnavailableReason: string;
    };
      modelProviders: {
      title: string;
      addProvider: string;
      testConnection: string;
      refreshModels: string;
      enabled: string;
      displayName: string;
      kind: string;
      baseUrl: string;
      defaultModel: string;
      apiKey: string;
      apiKeyPlaceholder: string;
      modelPurpose: string;
      chat: string;
      diagnosis: string;
      summary: string;
      advanced: string;
      advancedToggle: (expanded: boolean) => string;
      timeout: string;
      retries: string;
      streaming: string;
      temperature: string;
      maxTokens: string;
      reasoningEffort: string;
      proxy: string;
      localOnly: string;
      connectionStatus: string;
      mockOnly: string;
      mockTestConnection: string;
      mockRefreshModels: string;
      sessionOnlyWarning: string;
      sessionOnly: string;
      saveKey: string;
      clearKey: string;
      replace: string;
      testing: string;
      configured: string;
      saveSuccessSecure: string;
      saveSuccessSession: string;
      saveFailure: (error: string) => string;
      clearSuccess: string;
      clearFailure: (error: string) => string;
      settingsUnavailable: string;
      refreshFailure: (error: string) => string;
      testSuccess: (latencyMs: number, modelCount: number) => string;
      testFailure: (error: string) => string;
      testException: string;
      testConnectionUnavailable: string;
      refreshMock: string;
      providerStatusReady: string;
      providerStatusDisabled: string;
      providerStatusNeedsApiKey: string;
      providerStatusConfiguredUnverified: string;
      providerStatusInvalid: string;
      providerExpandAria: (vendorLabel: string) => string;
      providerCollapseAria: (vendorLabel: string) => string;
    };
    assistant: {
      title: string;
      controlsUnavailable: string;
      runtimePolicyNotice: string;
      currentBehaviorTitle: string;
      currentBehaviorNotice: string;
      name: string;
      namePlaceholder: string;
      defaultWorkMode: string;
      readOnlyDiagnosis: string;
      diagnosisSuggestions: string;
      sandboxRepair: string;
      advancedAutomation: string;
      notWired: string;
      responseStyle: string;
      concise: string;
      detailed: string;
      technical: string;
      evidenceRequirement: string;
      minimal: string;
      standard: string;
      thorough: string;
      autoScanScope: string;
      currentAsset: string;
      openAssets: string;
      project: string;
      lowEvidenceBehavior: string;
      askUser: string;
      proceedCautiously: string;
      block: string;
      repairBehaviors: string;
      autoCollectEvidence: string;
      autoRetryOnFailure: string;
      suggestAlternatives: string;
      requireApproval: string;
      notifyOnComplete: string;
      logVerbose: string;
      workModePreset: string;
    };
    appearance: {
      title: string;
      theme: string;
      recommended: string;
      accentColor: string;
      blue: string;
      purple: string;
      green: string;
      density: string;
      compact: string;
      comfortable: string;
      spacious: string;
      fontSize: string;
      small: string;
      medium: string;
      large: string;
      layouts: string;
      showLeftRail: string;
      showProjectExplorer: string;
      showRightInspector: string;
      showStatusBar: string;
      chatDisplay: string;
      showTimestamps: string;
      showAvatars: string;
      codeSyntaxHighlight: string;
      collapseLongMessages: string;
      showActionButtons: string;
    };
    language: {
      title: string;
      uiLanguage: string;
      simplifiedChinese: string;
      english: string;
      assistantReplyLanguage: string;
      followUI: string;
      terminologyDisplay: string;
      englishTerms: string;
      chineseTerms: string;
      mixedUETerms: string;
      codeAndApiLanguage: string;
      alwaysEnglish: string;
      timeFormat: string;
      format24h: string;
      format12h: string;
    };
    ueConnection: {
      title: string;
      projectPath: string;
      projectPathPlaceholder: string;
      enginePath: string;
      enginePathPlaceholder: string;
      bridgeStatus: string;
      connected: string;
      disconnected: string;
      degraded: string;
      connecting: string;
      mockBridge: string;
      endpoint: string;
      healthStatus: string;
      lastCheckedAt: (ts: string) => string;
      neverChecked: string;
      host: string;
      port: string;
      reconnect: string;
      reconnectUnavailable: string;
      installUpdate: string;
      testConnection: string;
      testConnectionUnavailable: string;
      scanOnStartup: string;
      watchAssetChanges: string;
      autoScan: string;
      taskRelatedOnly: string;
      mockIndicator: string;
      storedValuesReason: string;
      reconnectUnavailableReason: string;
      testConnectionUnavailableReason: string;
      runtimeFactReason: string;
      mockRuntimeFactReason: string;
    };
    sandboxSecurity: {
      title: string;
      hardSafetyTitle: string;
      sandboxAlwaysEnforced: string;
      approvalAlwaysRequired: string;
      promoteConfirmationRequired: string;
      settingsCannotOverride: string;
      enforced: string;
      required: string;
      legacyCompatibilityTitle: string;
      legacyCompatibilityNotice: string;
      defaultModificationMode: string;
      sandboxAlways: string;
      askEachTime: string;
      directWrite: string;
      writeBackConfirmations: string;
      sandboxApply: string;
      promote: string;
      rollback: string;
      bulkOperation: string;
      sandboxLocation: string;
      sandboxLocationPlaceholder: string;
      rollbackStrategy: string;
      automaticSnapshot: string;
      manualOnly: string;
      riskPolicy: string;
      cautious: string;
      balanced: string;
      advanced: string;
      protectedContent: string;
      blueprints: string;
      behaviorTrees: string;
      blackboards: string;
      assets: string;
      projectSettings: string;
      protectedPaths: string;
      addPath: string;
      removePath: string;
      pathPlaceholder: string;
    };
    privacyLog: {
      title: string;
      dataUsage: string;
      anonymousTelemetry: string;
      crashReports: string;
      usageStatistics: string;
      improvementProgram: string;
      logging: string;
      bridgeCommunication: string;
      agentStateChanges: string;
      userActions: string;
      performanceMetrics: string;
      sensitiveInfoProtection: string;
      maskApiKeys: string;
      maskFilePaths: string;
      maskAssetNames: string;
      maskUserInput: string;
      logRetention: string;
      retention24h: string;
      retention7d: string;
      retention30d: string;
      retention90d: string;
      retentionForever: string;
      clearLocalLogs: string;
      localOnly: string;
      persistedOnlyReason: string;
      clearLogsUnavailableReason: string;
    };
    advanced: {
      title: string;
      controlsUnavailable: string;
      runtimePolicyNotice: string;
      automationUnavailable: string;
      automationUnavailableNotice: string;
      developerMode: string;
      devToggles: string;
      showRawBridgePayload: string;
      enableVerboseLogging: string;
      enableDevTools: string;
      bypassSandboxPromote: string;
      showExperimentalUi: string;
      agentExecutionLimits: string;
      maxRetries: string;
      maxCompileRetries: string;
      maxProposalCandidates: string;
      sessionTimeoutMinutes: string;
      experimentalFeatures: string;
      enableAutoScan: string;
      enableMultiStepRepair: string;
      enableAutoRollback: string;
      experimentalWarning: string;
    };
  };
  leftRail: {
    chat: string;
    code: string;
    graph: string;
    run: string;
    issues: string;
    assets: string;
    settings: string;
    comingSoon: string;
  };
  projectExplorer: {
    title: string;
    scopeNote: string;
    listAriaLabel: string;
    searchPlaceholder: string;
    clearSearch: string;
    refresh: string;
    refreshing: string;
    refreshErrorTitle: string;
    currentAssetLabel: string;
    openAssetLabel: string;
    activeTargetLabel: string;
    chosenTargetLabel: string;
    dirtyTooltip: string;
    resultCount: (visible: number, total: number) => string;
    panelCollapseAria: string;
    panelExpandAria: string;
    overlayLabel: string;
    noMatchesTitle: string;
    noMatches: (query: string) => string;
    emptyTitle: string;
    emptyGuidance: string;
  };
  chatHeader: {
    newSession: string;
    sessionListPlaceholder: string;
    resumeInterrupted: string;
    sessionAssetLabel: string;
    sessionProjectLabel: string;
    sessionScopeLabel: (scope: 'asset' | 'project') => string;
    draftSessionLabel: string;
  };
  chatInput: {
    placeholder: string;
    attachment: string;
    contextMention: string;
    commandSlash: string;
    send: string;
    sending: string;
    modelPlaceholder: string;
    providerRequired: string;
    hint: string;
    scopeLabel: string;
    targetLabel: string;
    scopeError: string;
    emptyError: string;
    tooLongError: string;
    staleTargetError: string;
    noProjectContextError: string;
    switchToProject: string;
    switchToAsset: string;
    modeProject: string;
    modeAsset: string;
    draftTitle: string;
    draftDetail: string;
  };
  rightInspector: {
    regionLabel: string;
    tabsLabel: string;
    tabEvidence: string;
    tabChanges: string;
    tabLogs: string;
    floatingOpenAria: string;
    floatingCloseAria: string;
    overlayLabel: string;
    emptyTitle: string;
    degradedTitle: string;
    degradedBody: string;
    errorTitle: string;
    errorBody: string;
    evidence: {
      title: string;
      subtitle: (n: number) => string;
      emptyBody: string;
      statusNormal: string;
      statusWarning: string;
      statusError: string;
      expandDetails: string;
      collapseDetails: string;
      inspected: string;
      result: string;
      relatedPath: string;
      anomaly: string;
      anomalyYes: string;
      anomalyNo: string;
        ariaToggleDetails: (assetName: string, expanded: boolean) => string;
      texts: {
        finding: {
          'evidence-imc-default': string;
          'evidence-bp-player-controller': string;
          'evidence-bp-player': string;
          'evidence-imc-gamepad': string;
        };
        inspected: {
          'evidence-imc-default': string;
          'evidence-bp-player-controller': string;
          'evidence-bp-player': string;
          'evidence-imc-gamepad': string;
        };
        result: {
          'evidence-imc-default': string;
          'evidence-bp-player-controller': string;
          'evidence-bp-player': string;
          'evidence-imc-gamepad': string;
        };
      };
    };
    changes: {
      title: string;
      subtitle: string;
      emptyBody: string;
      stage_before: string;
      stage_preview: string;
      stage_sandbox_applied: string;
      stage_promoted: string;
      statusPending: string;
      statusApplied: string;
      statusRolledBack: string;
      statusFailed: string;
      kindAdd: string;
      kindRemove: string;
      kindModify: string;
      rollbackableLabel: string;
      rollbackableYes: string;
      rollbackableNo: string;
      appliedAtLabel: string;
      texts: {
        summary: {
          'change-stage-before': string[];
          'change-stage-preview': string[];
          'change-stage-sandbox-applied': string[];
          'change-stage-promoted': string[];
        };
      };
    };
    logs: {
      title: string;
      subtitle: (n: number) => string;
      emptyBody: string;
      developerModeLabel: string;
      levelInfo: string;
      levelWarn: string;
      levelError: string;
      levelDebug: string;
      sourceToolCall: string;
      sourceCompile: string;
      sourcePie: string;
      sourceAgentState: string;
      sourceBridge: string;
      expandPayload: string;
      collapsePayload: string;
        ariaTogglePayload: (entryId: string, expanded: boolean) => string;
      texts: {
        message: {
          'log-001': string;
          'log-002': string;
          'log-003': string;
          'log-004': string;
          'log-005': string;
          'log-006': string;
          'log-007': string;
          'log-008': string;
          'log-009': string;
          'log-010': string;
        };
      };
    };
    advanced: {
      title: string;
      expand: string;
      collapse: string;
      rawJsonTitle: string;
      toolPayloadTitle: string;
      evidencePackTitle: string;
      preflightTitle: string;
      stateMachineTitle: string;
      compileLogTitle: string;
      ariaToggleRoot: (expanded: boolean) => string;
      ariaToggleSection: (sectionTitle: string, expanded: boolean) => string;
    };
  };
  cards: {
    collapseAria: string;
    expandAria: string;
    actionsLabel: string;
    viewEvidenceDisabledHint: string;
    durationLabel: (ms: number) => string;
    resourcesLabel: (n: number) => string;
    demoFeedbackTitle: string;
    demoFeedbackBody: (cardId: string, actionId: string) => string;
    scanStatus: {
      title: string;
      projectTitle: string;
      assetTitle: string;
      progressRecorded: string;
      scannedResources: (n: number) => string;
      durationSuffix: (s: string) => string;
      done: string;
      escalated: string;
      rejected: string;
      cancelled: string;
      failed: string;
      interrupted: string;
    };
    diagnosis: {
      title: string;
      conclusion: string;
      reason: string;
      impact: string;
      confidenceHigh: string;
      confidenceMedium: string;
      confidenceLow: string;
      riskHigh: string;
      riskMedium: string;
      riskLow: string;
      evidenceCount: (n: number) => string;
      viewEvidence: string;
      previewFix: string;
      applySandbox: string;
    };
    fixPlan: {
      title: string;
      target: string;
      summary: string;
      willModify: string;
      willNotModify: string;
      verification: string;
      steps: string;
      applySandbox: string;
      alternatePlan: string;
      cancel: string;
    };
    changePreview: {
      title: string;
      targetAsset: string;
      willAdd: string;
      willNotChange: string;
      risk: string;
      riskHigh: string;
      riskMedium: string;
      riskLow: string;
      rollbackableYes: string;
      rollbackableNo: string;
      executionLocation: string;
      executionSandbox: string;
      executionCanonical: string;
      verification: string;
      applySandbox: string;
      viewDiff: string;
      cancel: string;
      approve: string;
      reject: string;
    };
    validation: {
      passedTitle: string;
      failedTitle: string;
      checksHeading: string;
      resultSummary: string;
      promote: string;
      promoteRequiresConfirm: string;
      viewDiff: string;
      discard: string;
      viewLogs: string;
      logsGuidance: string;
      regenerate: string;
      recommendationPromote: string;
      recommendationDiscard: string;
      recommendationRegenerate: string;
    };
    mockWorkflow: {
      scenarioLabel: string;
      scenarioSuccess: string;
      scenarioFailure: string;
      feedbackApplySandboxLoading: string;
      feedbackValidationReady: string;
      feedbackPromoted: string;
      feedbackRegenerated: string;
      feedbackDiscarded: string;
      feedbackViewDiff: string;
      feedbackViewLogs: string;
      feedbackCancel: string;
      feedbackUnknown: (actionId: string) => string;
      mockOnlyBadge: string;
      mockOnlyDisclosure: string;
    };
    userIntent: {
      title: string;
      scopeAsset: string;
      scopeProject: string;
      inheritedEvidenceLabel: string;
    };
    failure: {
      title: string;
      failedTitle: string;
      recoverableYes: string;
      recoverableNo: string;
      detailsTitle: string;
      nextStep: string;
      resume: string;
      retryAsNewSession: string;
      resumeNextStep: string;
      retryNextStep: string;
      recoverableNextStep: string;
      nonRecoverableNextStep: string;
    };
    completion: {
      successTitle: string;
      closedTitle: string;
      warningTitle: string;
      completedTitle: string;
      escalatedTitle: string;
      rejectedTitle: string;
      cancelledTitle: string;
      interruptedTitle: string;
    };
    projectCandidates: {
      title: string;
      count: (n: number) => string;
      viewEvidence: string;
      chooseTarget: string;
      continueDiagnosis: string;
      nextSteps: string;
    };
    confirm: {
      closeAria: string;
      backdropAria: string;
      firstPromoteTitle: string;
      firstPromoteMessage: (assetCount: number) => string;
      firstPromoteAssetListLabel: string;
      firstPromoteMockNote: string;
      firstConfirmLabel: string;
      firstCancelLabel: string;
      highRiskPromoteTitle: string;
      highRiskPromoteMessage: (assetCount: number) => string;
      highRiskPromoteAssetListLabel: string;
      highRiskFinalNote: string;
      highRiskConfirmLabel: string;
      highRiskCancelLabel: string;
    };
  };
}

// ── Context Summary ──

// ── Evidence ──

export interface EvidenceCopy {
  high: string; medium: string; low: string; unresolved: string;
  references: string;
  asset: string; graph: string; node: string; pin: string;
  viewGraph: string; focusNode: string; loadGraphToFocus: string;
  chains: string;
  sourceFilter: string; severityFilter: string;
  confidenceFilter: string; sortFilter: string;
  all: string;
  compileIssue: string; recentLog: string; graphDetail: string;
  blueprintGraph: string; blueprintMeta: string; currentAsset: string;
  error: string; warning: string; fatal: string; info: string; unknown: string;
  highConf: string; mediumConf: string; lowConf: string; unresolvedConf: string;
  original: string;
  reset: string; expandAll: string; collapseAll: string;
  showing: (shown: number, total: number) => string;
  detailTitle: string;
  addToQueue: string; closeDetail: string;
  sourceLabel: string; severityLabel: string; confidenceLabel: string;
  reason: string; upgrade: string; summary: string; message: string;
  category: string; assetLabel: string; nextInspection: string;
  rawIndex: (index: number) => string;
  noEvidenceChains: string; noMatchFilter: string;
  expandChain: string; collapseChain: string;
  itemsCount: (n: number) => string;
  nextLabel: string;
  closeBtn: string; inspectBtn: string;
  pinRef: string;
  guidLabel: string;
}

// ── Graph Detail ──

export interface GraphDetailCopy {
  title: string;
  loadingDetail: string;
  retry: string; close: string;
  disabled: string; errorStatus: string; warnStatus: string; focused: string;
  evidenceLabel: (n: number) => string;
  errorLabel: string; warningLabel: string;
  pinName: string; dir: string; kind: string; type: string; connected: string;
  linksLabel: (n: number) => string;
  noLinks: string; linkId: string; sourceLabel: string; targetLabel: string;
  showAllMore: (n: number) => string;
  graphLabel: string; kindLabel: string; nodesLabel: string;
  linksCount: string; pinsLabel: string; statusLabel: string;
  evidenceSection: string; truncatedLabel: string; viewLabel: string;
  pinSummary: (c: number, u: number) => string;
  errorCount: (n: number) => string; warnCount: (n: number) => string;
  disCount: (n: number) => string; none: string;
  nodesText: string;
  addNodeToQueue: string;
  nodeId: string; errorField: string; warningField: string;
  pinsSection: string;
  pinTotal: string; pinConnected: string; pinUnconnected: string;
  pinExec: string; pinData: string; pinDelegate: string;
  incoming: string; outgoing: string;
  searchPlaceholder: string;
  statusFilter: string; allFilter: string; errorFilter: string;
  warningFilter: string; disabledFilter: string; hasStatus: string;
  noStatus: string; evidenceFilter: string; hasEvidence: string;
  noEvidenceFilter: string; pinsFilter: string; hasConnected: string;
  hasUnconnected: string; sortFilter: string; titleSort: string;
  statusSeveritySort: string; evidenceCountSort: string; pinCountSort: string;
  resetFilters: string;
  expandAllShown: string; collapseAllShown: string;
  expandStatusNodes: string; expandEvidenceNodes: string;
  showingNodes: (n: number, total: number) => string;
  copyGraphSummary: string; copySelectedNode: string;
  copiedLabel: (label: string) => string; copyFailed: string;
  titleHeader: string; idHeader: string; pinsHeader: string;
  noNodesMatch: string; noNodesInGraph: string;
  nodeStatusError: string; nodeStatusWarn: string;
  nodeStatusDisabled: string; nodeStatusNone: string;
  // Markdown labels
  mdGraph: (name: string) => string;
  mdKind: (kind: string) => string;
  mdGraphId: (id: string) => string;
  mdNodes: (n: number) => string;
  mdLinks: (n: number) => string;
  mdTotalPins: (total: number, c: number, u: number) => string;
  mdStatusSummary: (e: number, w: number, d: number) => string;
  mdEvidenceSummary: (n: number) => string;
  mdTruncatedYes: string; mdTruncatedNo: string;
  mdTruncationWarnings: string;
  mdCurrentView: (n: number, total: number) => string;
  mdFilters: (summary: string) => string;
  mdSort: (mode: string) => string;
  mdNode: (title: string) => string;
  mdNodeId: (id: string) => string;
  mdNodeType: (type: string) => string;
  mdNodeStatus: (label: string) => string;
  mdNodeErrorMsg: (msg: string) => string;
  mdNodeEvidence: (n: number) => string;
  mdNodeEvidenceNone: string;
  mdNodePins: (total: number, c: number, u: number) => string;
  mdNodePinBreakdown: (exec: number, data: number, del: number) => string;
  mdNodeLinks: (inc: number, out: number) => string;

  // ── E52 Blueprint Graph Diagnostic Workbench ──

  // Diagnostic overview
  diagOverviewTitle: string;
  diagPinBreakdown: (exec: number, data: number, del: number, conn: number, unconn: number) => string;
  diagUnknownNodes: (count: number, ratio: string) => string;

  // Node type distribution
  nodeTypeDistTitle: string;
  nodeTypeCountPercent: (type: string, count: number, pct: string) => string;

  // Type group distribution
  typeGroupDistTitle: string;
  typeGroupLabels: {
    entryEvent: string;
    calls: string;
    variables: string;
    flowControl: string;
    casts: string;
    macroTunnel: string;
    literalsData: string;
    delegates: string;
    uiActor: string;
    otherUnknown: string;
  };

  // Inspection cues
  cuesTitle: string;
  cuesManualHint: string;
  cueSummary: (label: string, count: number) => string;
  cueIsolatedNote: string;
  cueRelatedNodeTitle: (title: string) => string;

  // Node type / group filter
  typeFilter: string;
  typeFilterAll: string;
  groupFilter: string;
  groupFilterAll: string;
  quickFilterUnknown: string;
  quickFilterErrorsWarnings: string;
  quickFilterUnconnectedExec: string;
  quickFilterUnconnectedData: string;

  // Selected node detail enhancement
  detailTypeGroup: string;
  detailNeighborTitle: (title: string, type: string) => string;
  detailUnconnectedBreakdown: string;
  detailCueLabel: string;

  // Diagnostic Report
  diagnosticReportTitle: string;
  copyDiagnosticReport: string;

  // ── E55 Blueprint Graph Detail Annotations ──

  commentedNodesLabel: string;
  containerPinsLabel: string;
  positionLabel: string;
  nodeCommentLabel: string;
  containerType: string;

  // Report markdown
  mdDiagTitle: string;
  mdDiagGenerated: (ts: string) => string;
  mdDiagGraphInfo: (name: string, kind: string, id: string) => string;
  mdDiagCountsSummary: (nodes: number, links: number, pins: number) => string;
  mdDiagPinBreakdown: (exec: number, data: number, del: number, conn: number, unconn: number) => string;
  mdDiagStatusSummary: (errors: number, warnings: number, disabled: number) => string;
  mdDiagEvidenceNodes: (count: number) => string;
  mdDiagUnknownNodes: (count: number, ratio: string) => string;
  mdDiagNodeTypeDist: string;
  mdDiagNodeTypeRow: (type: string, count: number, pct: string) => string;
  mdDiagTypeGroupDist: string;
  mdDiagTypeGroupRow: (group: string, count: number, pct: string) => string;
  mdDiagOtherTypes: (count: number) => string;
  mdDiagCuesSection: string;
  mdDiagCueItem: (label: string, count: number) => string;
  mdDiagTruncationWarnings: string;
  mdDiagActiveFilters: (summary: string) => string;
  mdDiagSelectedNode: (title: string) => string;
  mdDiagSafetyNote: string;
}

// ── Log List ──


// ── Diagnostic Report ──
// Many markdown strings use common tokens + inline formatting.
// Report-specific labels beyond common tokens:


// ── Diagnostic Review ──


// ── Triage ──


// ── Delta ──

export interface DeltaCopy {
  title: string;
  copied: string; copyFailed: string; copyDelta: string;
  captureBaseline: string; recaptureBaseline: string; clearBaseline: string;
  reset: string;
  baseline: string; current: string;
  asset: string; evidence: string; queue: string; graph: string;
  noBaselineTitle: string; noBaselineHint: string;
  noChanges: string; noChangesHint: string;
  categoryFilter: string; changedOnly: string;
  snapshot: string; logs: string;
  changed: string; same: string; added: string; removed: string;
  showingFields: (n: number, total: number) => string;
  changedStatus: string; sameStatus: string;
  markdownPreview: string;
  all: string; compile: string; runtime: string;
  unavailable: string; none: string;
  yes: string; no: string;
  fieldCapturedAt: string; fieldSnapshotId: string; fieldLastUpdated: string;
  fieldAssetName: string; fieldAssetPath: string; fieldAssetClass: string;
  fieldDirty: string; fieldSelected: string; fieldOpenInEditor: string;
  fieldIsCompiling: string; fieldLastResult: string; fieldErrorCount: string;
  fieldWarningCount: string; fieldLastErrorsCount: string;
  fieldPieRunning: string; fieldIsSimulating: string;
  fieldPlayMode: string; fieldActiveWorld: string;
  fieldTotalLogs: string; fieldErrorLogs: string; fieldWarningLogs: string;
  fieldChainCount: string; fieldItemCount: string;
  fieldErrorItems: string; fieldWarningItems: string; fieldUnresolvedItems: string;
  fieldGraphName: string; fieldGraphKind: string; fieldGraphId: string;
  fieldNodeCount: string; fieldLinkCount: string; fieldTruncated: string;
  fieldCoveredNodes: string; fieldNodeEvidenceItems: string;
  fieldTotalItems: string; fieldTodo: string; fieldReviewed: string;
  fieldDeferred: string; fieldHighPriority: string;
  fieldNormalPriority: string; fieldLowPriority: string;
  mdGenerated: string; mdCapturedAt: string; mdSnapshotId: string;
  mdCurrentAsset: string; mdFilters: string; mdDeltaOverview: string;
  mdTotal: string; mdDeltaRows: string;
  mdTableCategory: string; mdTableField: string; mdTableBaseline: string;
  mdTableCurrent: string; mdTableStatus: string;
  mdSafetyNote: string;
}

// ── Session ──

export interface SessionCopy {
  title: string;
  copied: string; copyFailed: string; copyBrief: string;
  openBtn: string;
  workflowReadiness: string; nextActions: string;
  sessionBriefPreview: string;
  captured: string; refresh: string; asset: string;
  bridge: string; editor: string; compile: string;
  runtime: string; evidence: string; graph: string; queue: string;
  unavailable: string; compiling: string;
  pieLabel: string; simulatingLabel: string; idleLabel: string;
  truncatedGraph: string; notTruncatedGraph: string; notLoadedGraph: string;
  // stage labels
  stageContext: string; stageEvidence: string; stageGraphDetail: string;
  stageQueue: string; stageReview: string; stageHandoff: string; stageSafety: string;
  // stage details
  sdNoAsset: string; sdNoEvidence: string; sdNoGraph: string;
  sdNoQueue: string; sdOpenReview: string; sdOpenHandoff: string;
  sdSafetyOk: string;
  sdCompiling: string; sdCompileResult: (result: string) => string;
  sdPieRunning: string; sdSimulating: string;
  // next actions
  naReviewCompile: string; naTriageQueue: string; naAddEvidence: string;
  naInspectGraph: string; naRunReview: string; naPrepareHandoff: string;
  naCompilingDetail: string;
  naItemsNeedReview: (n: number) => string;
  naNodesWithErrors: (n: number) => string;
  naRunReviewDetail: string;
  naHandoffDetail: string;
  // status
  statusReady: string; statusAttention: string;
  statusMissing: string; statusInfo: string;
  briefSafetyText: string;
  briefSafetyText2: string;
  briefSafetyText3: string;
  mdTitle: string; mdGenerated: string; mdCaptured: string;
  mdLastRefresh: string; mdProjectAsset: string;
  mdCompileRuntime: string; mdCompiling: string; mdLastResult: string;
  mdLoadedGraphDetail: string;
  mdGraphCounts: (nodes: number, links: number) => string;
  mdNodeStatusSummary: (errors: number, warnings: number, disabled: number) => string;
  mdTruncatedWithReason: (reason: string | undefined) => string;
  mdNodeEvidenceSummary: (nodes: number, items: number) => string;
  mdQueueStatus: (todo: number, reviewed: number, deferred: number) => string;
  mdQueuePriority: (high: number, normal: number, low: number) => string;
  mdEvidenceChainLine: (items: number, confidence: string) => string;
  // ── E54 Bug Investigation Session Review ──
  reviewTitle: string;
  reviewStatusLabel: string;
  reviewStatusDraft: string;
  reviewStatusVerifying: string;
  reviewStatusReady: string;
  reviewStatusBlocked: string;
  reviewerLabel: string;
  currentQuestionLabel: string;
  workingTheoryLabel: string;
  confirmedFactsLabel: string;
  rejectedHypothesesLabel: string;
  openQuestionsLabel: string;
  verificationPlanLabel: string;
  finalConclusionLabel: string;
  riskNotesLabel: string;
  clearReview: string;
  clearReviewConfirm: string;
  copySessionReview: string;
  readinessSummary: string;
  gapSummary: string;
  contextStaleWarning: string;
  contextOkLabel: string;
  reviewFieldsMissing: string;
  allReady: string;
  allReadyDetail: string;
  noReviewState: string;
  // review checklist
  clContextReviewed: string;
  clEvidenceReviewed: string;
  clGraphReviewed: string;
  clLogsReviewed: string;
  clQueueTriaged: string;
  clSafetyBoundaryConfirmed: string;
  clReadyForHandoff: string;
  // placeholders
  phCurrentQuestion: string;
  phWorkingTheory: string;
  phConfirmedFacts: string;
  phRejectedHypotheses: string;
  phOpenQuestions: string;
  phVerificationPlan: string;
  phFinalConclusion: string;
  phRiskNotes: string;
  phReviewer: string;
  // readiness detail strings
  rdAssetPresent: string;
  rdEvidenceChains: (n: number) => string;
  rdUnresolvedEvidence: (n: number) => string;
  rdGraphLoaded: (name: string) => string;
  rdGraphNotLoaded: string;
  rdGraphHasErrors: (n: number) => string;
  rdGraphHasWarnings: (n: number) => string;
  rdQueueTodo: (n: number) => string;
  rdSessionNotesPresent: string;
  rdSessionNotesEmpty: string;
  rdChecklistDone: (done: number, total: number) => string;
  rdContextUpdated: string;
  // Markdown labels
  mdReviewPackageTitle: string;
  mdGeneratedAt: (ts: string) => string;
  mdContextAsset: string;
  mdReviewStatus: string;
  mdReviewer: string;
  mdUpdatedAt: string;
  mdReadinessSummary: string;
  mdChecklistState: string;
  mdCurrentQuestion: string;
  mdWorkingTheory: string;
  mdConfirmedFacts: string;
  mdRejectedHypotheses: string;
  mdOpenQuestions: string;
  mdVerificationPlan: string;
  mdFinalConclusion: string;
  mdRiskNotes: string;
  mdEvidenceSummary: string;
  mdGraphDiagSummary: string;
  mdQueueSummary: string;
  mdSessionNotes: string;
  mdSafetyNote: string;
  mdSafetyReadOnly: string;
  mdSafetyNoAI: string;
  mdSafetyNoBridge: string;
  mdSafetyNoFix: string;
  mdSafetyNoAssetWrite: string;
  mdSafetyNoCompile: string;
  mdStaleWarning: string;
  mdHandoffReviewSection: string;
}

// ── Timeline ──


// ── Queue ──

export interface QueueCopy {
  title: string;
  copied: string; copyFailed: string; copyPackage: string;
  markdownPreview: string;
  reset: string; clearQueue: string; confirmClear: string;
  total: string; evidence: string; nodes: string; todo: string;
  reviewed: string; deferred: string; high: string; normal: string; low: string;
  kindFilter: string; all: string; evidenceKind: string; graphNodeKind: string;
  statusFilter: string; todoStatus: string; reviewedStatus: string;
  deferredStatus: string;
  priorityFilter: string; highPriority: string; normalPriority: string;
  lowPriority: string;
  noItems: string; noMatchFilter: string;
  evidenceBadge: string; graphNodeBadge: string;
  removeItem: string;
  nodeLabel: string; typeLabel: string;
  errorLabel: string; warningLabel: string;
  pinsLabel: string; linksLabel: string;
  statusControl: string; priorityControl: string;
  itemNotePlaceholder: string;
  sessionNotes: string; sessionNotesPlaceholder: string;
  // Markdown
  mdTitle: string; mdCapturedUnavailable: string;
  mdCurrentAssetUnavailable: string; mdCurrentAsset: string;
  mdQueueSummary: string; mdQueuedItems: string;
  mdSessionNotes: string;
  mdSafetyNote: string;
  mdGenerated: string; mdCaptured: string; mdFirstAdded: string;
  mdPrioritySummary: (high: number, normal: number, low: number) => string;
  mdStatusSummary: (todo: number, reviewed: number, deferred: number) => string;
  statusValue: (status: string) => string;
  priorityValue: (priority: string) => string;
}

// ── Handoff ──

export interface HandoffCopy {
  title: string;
  copied: string; copyFailed: string; copyPackage: string;
  packagePreset: string; packageReadiness: string;
  packageOutline: string; packageTitle: string; sections: string;
  readyChecklist: string; packageNotes: string; markdownPreview: string;
  captured: string; asset: string; path: string; queue: string;
  evidence: string; graph: string; logs: string; checklist: string;
  presetFull: string; presetReviewer: string; presetQueue: string; presetGraph: string;
  readinessAsset: string; readinessEvidence: string; readinessGraph: string;
  readinessNodeEvidence: string; readinessQueue: string;
  readinessDeltaBaseline: string; readinessLastRefresh: string;
  readinessRecentLogs: string; readinessChecklist: string;
  noAssetCaptured: string; notLoaded: string;
  noNodeEvidence: string; noGraphCheck: string;
  notCaptured: string; unknown: string;
  sectionOverview: string; sectionQueueItems: string;
  sectionEvidenceSummary: string; sectionGraphDetail: string;
  sectionRecentLogs: string; sectionSafetyNote: string;
  defaultTitle: string;
  // checklist items
  clContextReviewed: string; clEvidenceReviewed: string;
  clGraphReviewed: string; clQueueTriaged: string; clSafetyConfirmed: string;
  // workspace map
  wmReport: string; wmTriage: string; wmDelta: string; wmVerify: string;
  wmQueue: string; wmTimeline: string; wmEvidence: string;
  wmGraphDetail: string; wmCase: string; wmSafetyNote: string;
  wmIncluded: string; wmExcluded: string; wmAvailableOnly: string;
  wmReportDetail: string; wmNotIncluded: string;
  wmCrossPanel: string; wmDeltaAvailable: string; wmDeltaNotCaptured: string;
  wmVerifyDesc: string; wmNotesPresent: string; wmNoNotes: string;
  wmSafetyDesc: string;
  // suggested actions
  saCaptureSnapshot: string;
  saReviewQueue: (n: number) => string;
  saHighPriority: (n: number) => string;
  saLoadGraph: string;
  saInvestigateUnresolved: (n: number) => string;
  saReviewLogErrors: (n: number) => string;
  saCompleteChecklist: string;
  saCaptureDelta: string;
  // placeholder
  notesPlaceholder: string;
  // readiness detail
  readinessOk: string; readinessAttention: string;
  readinessMissing: string; readinessInfo: string;
  // Markdown
  currentAssetUnavailable: string;
  mdPackageReadiness: string; mdIncludedWorkspaces: string;
  mdCurrentAsset: string; mdQueueSummary: string; mdQueuedItems: string;
  mdEvidenceSummary: string; mdGraphDetail: string;
  mdRecentLogs: string; mdPackageNotes: string;
  mdReadyChecklist: string; mdSuggestedActions: string;
  mdSafetyBoundary: string;
  mdNoGraphDetail: string; mdNoNotes: string; mdNoNotesMarkdown: string;
  mdSafetyText: string;
  readinessEvidenceDetail: (items: number, chains: number, unresolved: number) => string;
  readinessGraphLoaded: (name: string, kind: string) => string;
  readinessNodeEvidenceDetail: (nodes: number) => string;
  readinessQueueDetail: (total: number, todo: number, high: number) => string;
  readinessDeltaCaptured: (time: string) => string;
  readinessRecentLogsDetail: (total: number, errors: number, warnings: number) => string;
  readinessChecklistDetail: (done: number, total: number) => string;
  mdGenerated: string; mdCaptured: string; mdLastRefresh: string; mdPackagePreset: string;
  mdNoRecentLogIssues: string;
  mdTotalEntries: string; mdBreakdown: string;
  mdNodeStatusSummary: (parts: string) => string;
  mdNodeEvidenceSummary: (nodes: number, items: number) => string;
}

// ── Investigation Question Matrix (E56) ──

export interface InvestigationQuestionMatrixCopy {
  title: string;
  // Summary labels
  summaryTotal: string;
  summaryOpen: string;
  summaryBlocked: string;
  summaryAnswered: string;
  summaryHighPriority: string;
  summaryMissingContext: string;
  // Category labels
  categoryContext: string;
  categoryCompile: string;
  categoryRuntime: string;
  categoryLogs: string;
  categoryEvidence: string;
  categoryGraph: string;
  categoryQueue: string;
  categorySession: string;
  categoryHandoff: string;
  categoryBtBlackboard: string;
  // QM-specific status labels
  statusOpen: string;
  statusVerifying: string;
  statusAnswered: string;
  statusBlocked: string;
  statusDeferred: string;
  // Filter labels
  filterCategory: string;
  filterPriority: string;
  filterStatus: string;
  filterSearchPlaceholder: string;
  // Actions
  resetButton: string;
  confirmReset: string;
  previewTitle: string;
  copyButton: string;
  copySuccess: string;
  copyFailed: string;
  // Notes
  notePlaceholder: string;
  // Empty states
  noSnapshot: string;
  noQuestions: string;
  // Markdown sections
  mdTitle: string;
  mdSummary: string;
  mdOpenBlocked: string;
  mdVerificationPlan: string;
  mdAnsweredNotes: string;
  mdNoQuestions: string;
  mdSafetyNote: string;
  mdFieldQuestion: string;
  mdFieldCategory: string;
  mdFieldPriority: string;
  mdFieldSource: string;
  mdFieldWhy: string;
  mdFieldVerification: string;
  mdFieldReason: string;
  mdFieldRef: string;
  mdFieldNote: string;
  mdFieldStatus: string;
  mdItemSummaryLine: (total: number, open: number, blocked: number, answered: number, high: number) => string;
  mdItemEntry: (question: string, status: string, category: string, priority: string) => string;
  mdItemVerificationStep: (question: string, verification: string) => string;
  mdItemAnsweredNote: (question: string, note: string) => string;
  mdDataUnavailable: string;
  hoSectionTitle: string;
}

// ── Infrastructure Closure (E57) ──

export interface InfrastructureClosureCopy {
  title: string;
  panelTitle: string;
  summaryTitle: string;
  gateTitle: string;
  decisionTitle: string;
  decisionPlaceholder: string;
  ownerLabel: string;
  ownerPlaceholder: string;
  decisionNotesLabel: string;
  decisionNotesPlaceholder: string;
  verificationNotesLabel: string;
  verificationNotesPlaceholder: string;
  riskNotesLabel: string;
  riskNotesPlaceholder: string;
  markdownPreview: string;
  copyPackage: string;
  copied: string;
  copyFailed: string;
  // Decision options
  decisionDraft: string;
  decisionReadyForHandoff: string;
  decisionNeedsVerification: string;
  decisionBlocked: string;
  decisionClosed: string;
  // Closure readiness
  readinessReady: string;
  readinessAttention: string;
  readinessBlocked: string;
  readinessMissing: string;
  readinessInfo: string;
  handoffReady: string;
  manualVerification: string;
  blockedLabel: string;
  noBlockedGates: string;
  // Safety note
  safetyNote: string;
  safetyNoteDetail: string;
  // Gate status
  gateReady: string;
  gateAttention: string;
  gateBlocked: string;
  gateMissing: string;
  gateInfo: string;
  gateLabel: string;
  gateSource: string;
  gateDetail: string;
  gateAction: string;
  // Gate source labels
  gateContext: string;
  gateCompileRuntime: string;
  gateEvidence: string;
  gateGraphDetail: string;
  gateQueue: string;
  gateSessionReview: string;
  gateQuestionMatrix: string;
  gateHandoff: string;
  gateSafety: string;
  // Gate detail strings
  noSnapshot: string;
  assetDirty: string;
  compiling: string;
  compileErrors: string;
  compileWarnings: string;
  pieActive: string;
  noEvidence: string;
  unresolvedEvidence: string;
  noGraphDetail: string;
  graphTruncated: string;
  graphNodesAttention: string;
  highPriorityTodo: string;
  todoItems: string;
  allReviewedDeferred: string;
  reviewBlocked: string;
  checklistIncomplete: string;
  sessionReady: string;
  highPriorityOpenBlocked: string;
  questionsAnswered: string;
  noMatrix: string;
  noHandoffNotes: string;
  handoffChecklistReady: string;
  safetyInfo: string;
  safetyInfoDetail: string;
  // Markdown
  mdTitle: string;
  mdGenerated: string;
  mdClosureDecision: string;
  mdOwner: string;
  mdUpdatedAt: string;
  mdDecisionNotes: string;
  mdVerificationNotes: string;
  mdRiskNotes: string;
  mdGateSummary: string;
  mdGateBoard: string;
  mdBlockers: string;
  mdManualVerificationPlan: string;
  mdQuestionSummary: string;
  mdQueueSummary: string;
  mdSessionSummary: string;
  mdHandoffSummary: string;
  mdSafetyNote: string;
  mdNoBlockers: string;
  mdNoVerificationNotes: string;
  mdNoRiskNotes: string;
  mdNoDecisionNotes: string;
  // Handoff section strings
  hoSectionTitle: string;
  hoClosureDecision: string;
  hoOwner: string;
  hoSummary: string;
  hoReady: string;
  hoAttention: string;
  hoBlocked: string;
  hoMissing: string;
  hoVerificationNotes: string;
  hoRiskNotes: string;
  hoSafetyNote: string;
}

// ── Behavior Tree / Blackboard Diagnostic (E59, mock-only) ──

export interface BehaviorTreeBlackboardDiagnosticCopy {
  title: string;
  panelTitle: string;
  sourceLabel: string;
  mockWarning: string;
  assetName: string;
  assetPath: string;
  nodeCount: string;
  bbKeyCount: string;
  refCount: string;
  treeHierarchy: string;
  blackboardKeys: string;
  referenceMatrix: string;
  selectedNode: string;
  detailLabel: string;
  readinessChecklist: string;
  markdownPreview: string;
  copyMarkdown: string;
  copied: string;
  copyFailed: string;
  noSelection: string;
  kindRoot: string;
  kindComposite: string;
  kindDecorator: string;
  kindService: string;
  kindTask: string;
  keyType: string;
  keyScope: string;
  keyDefault: string;
  keyObserved: string;
  keyRefCount: string;
  filterName: string;
  filterType: string;
  filterPlaceholder: string;
  refNode: string;
  refKind: string;
  refKeys: string;
  refKeyName: string;
  treeNodeName: string;
  treeNodeKind: string;
  treeNodeChildren: string;
  treeNodeParent: string;
  detailDecorators: string;
  detailServices: string;
  detailTasks: string;
  decoratorAbortMode: string;
  decoratorObservedKey: string;
  serviceInterval: string;
  serviceRandomDeviation: string;
  taskClass: string;
  detailReferencedBBKeys: string;
  readinessMockOnly: string;
  readinessNoEndpoint: string;
  readinessNoSchema: string;
  readinessHeaderVerification: string;
  mdTitle: string;
  mdAssetSummary: string;
  mdTreeHierarchy: string;
  mdBlackboardKeys: string;
  mdNodeKeyRefs: string;
  mdReadiness: string;
  mdSafetyNote: string;
  mdSummaryLine: (nodes: number, bbKeys: number, refs: number) => string;
  mdNodeEntry: (name: string, kind: string) => string;
  mdKeyEntry: (name: string, type: string, scope: string) => string;
  mdRefEntry: (nodeName: string, keyName: string, kind: string) => string;
  mdRiskEntry: (label: string) => string;
  hoSectionTitle: string;
  hoSourceLine: string;
  hoNoUeData: string;
  // ── E62: Real endpoint mode ──
  modeMock: string;
  modeReal: string;
  assetPathLabel: string;
  assetPathPlaceholder: string;
  loadFromEndpoint: string;
  loadingDiagnostic: string;
  loadError: string;
  loadRetry: string;
  warningsSection: string;
  noDataFromEndpoint: string;
  partialDataMessage: string;
  realApiSource: string;
}

// ── Top-level DesktopCopy ──

export interface DesktopCopy {
  common: CommonCopy;
  shell: ShellCopy;
  ueAgentUi: UeAgentUiCopy;
  evidence: EvidenceCopy;
  graphDetail: GraphDetailCopy;
  delta: DeltaCopy;
  session: SessionCopy;
  queue: QueueCopy;
  handoff: HandoffCopy;
  questionMatrix: InvestigationQuestionMatrixCopy;
  closure: InfrastructureClosureCopy;
  behaviorTreeBlackboard: BehaviorTreeBlackboardDiagnosticCopy;
  approvalGate: ApprovalGateCopy;
  agentTransition: AgentTransitionCopy;
  blueprintChangeWorkspace: BlueprintChangeWorkspaceCopy;
  changePlanPackage: ChangePlanPackageCopy;
  postFixReport: PostFixReportCopy;
}

// ── Change Plan Package Workspace (E65) ──

export interface ChangePlanPackageCopy {
  title: string;
  panelTitle: string;
  summaryHeader: string;
  summaryDetail: string;
  safetyBanner: string;
  safetyBannerDetail: string;
  planListTitle: string;
  emptyState: string;
  createNewPlan: string;
  planDetailTitle: string;
  statusLabel: string;
  intentLabel: string;
  motivationLabel: string;
  assetLabel: string;
  operationTypeLabel: string;
  riskLevelLabel: string;
  evidenceLinks: string;
  assumptionsLabel: string;
  risksLabel: string;
  validationNotesLabel: string;
  rollbackNotesLabel: string;
  staleLabel: string;
  statusDraft: string;
  statusReadyForReview: string;
  statusApproved: string;
  statusRejected: string;
  statusBlocked: string;
  opBlueprintBugFix: string;
  opBlueprintGeneration: string;
  opBtBbPlan: string;
  opManualOnly: string;
  riskLow: string;
  riskMedium: string;
  riskHigh: string;
  riskUnknown: string;
  formTitle: string;
  formTitlePlaceholder: string;
  formDescription: string;
  formDescriptionPlaceholder: string;
  formMotivation: string;
  formMotivationPlaceholder: string;
  formAssetPath: string;
  formAssetPathPlaceholder: string;
  formOperationType: string;
  formRiskLevel: string;
  formAssumptions: string;
  formAssumptionsPlaceholder: string;
  formRisks: string;
  formRisksPlaceholder: string;
  formValidationNotes: string;
  formValidationNotesPlaceholder: string;
  formEvidenceSourceLabel: string;
  formEvidenceSourcePlaceholder: string;
  formSave: string;
  formCancel: string;
  errorTitleRequired: string;
  errorAssetPathRequired: string;
  errorInvalidDraft: string;
  markdownPreview: string;
  copyPackage: string;
  copied: string;
  copyFailed: string;
  mdTitle: string;
  mdGenerated: string;
  mdSafetyNotice: string;
  mdPlanOverview: string;
  mdPlanId: string;
  mdStatus: string;
  mdIntent: string;
  mdMotivation: string;
  mdAsset: string;
  mdOperationType: string;
  mdRiskLevel: string;
  mdRiskRationale: string;
  mdAffectedAssets: string;
  mdEvidenceLinks: string;
  mdAssumptions: string;
  mdRisks: string;
  mdValidationPlan: string;
  mdRollbackNotes: string;
  mdProvenance: string;
  mdNotExecutableNotice: string;
  provenanceAuthor: string;
  provenanceConfidence: string;
  provenanceLimitations: string;
  provenanceAuthorUser: string;
  provenanceAuthorTemplate: string;
  provenanceAuthorRule: string;
}

// ── Patch Preview / Change Manifest (E66) ──

// ── Approval Gate / Phase Closure (E67) ──

export interface ApprovalGateCopy {
  title: string;
  panelTitle: string;
  summaryHeader: string;
  summaryDetail: string;
  safetyBanner: string;
  safetyBannerDetail: string;
  safetyBannerAlert: string;
  gateListTitle: string;
  detailTitle: string;
  gateId: string;
  status: string;
  linkedPlan: string;
  linkedManifest: string;
  decision: string;
  statusDraft: string;
  statusReadyForReview: string;
  statusApproved: string;
  statusRejected: string;
  statusBlocked: string;
  statusRequestChanges: string;
  emptyState: string;
  errorState: string;
  selectedGate: string;
  noGateSelected: string;
  markReady: string;
  approve: string;
  reject: string;
  block: string;
  requestChanges: string;
  resetToDraft: string;
  confirmTitle: string;
  confirmApprove: string;
  confirmReject: string;
  confirmBlock: string;
  confirmRequestChanges: string;
  confirmCancel: string;
  confirmExec: string;
  confirmNoExecute: string;
  warningTitle: string;
  warningNonExecutable: string;
  warningNoUeWrites: string;
  warningNoCompilePie: string;
  warningValidationDeferred: string;
  warningFutureRedZone: string;
  warningAcknowledgement: string;
  decisionNotesLabel: string;
  decisionNotesPlaceholder: string;
  futureCapabilityTitle: string;
  futureApplyChange: string;
  futureWriteAsset: string;
  futureCompilePie: string;
  futureRepairPatch: string;
  futureSendAi: string;
  futureNotImplemented: string;
  markdownPreview: string;
  copyPackage: string;
  copied: string;
  copyFailed: string;
  phaseSummary: string;
  phaseTitle: string;
  mdTitle: string;
  mdGenerated: string;
  mdGate: string;
  mdStatus: string;
  mdLinkedPlan: string;
  mdLinkedManifest: string;
  mdDecision: string;
  mdDecisionNotes: string;
  mdWarnings: string;
  mdValidationReqs: string;
  mdRollbackNotes: string;
  mdPhaseReadiness: string;
  mdNotExecutableNotice: string;
  mdSafetyRollbackNote: string;
  readinessReady: string;
  readinessAttention: string;
  readinessBlocked: string;
  readinessMissing: string;
  readinessInfo: string;
  hoSectionTitle: string;
  hoPhaseStatus: string;
  hoPlanGate: string;
  hoManifestGate: string;
  hoApprovalGate: string;
  hoExecutionBlocked: string;
  hoFutureRedZone: string;
  hoSafetyNote: string;
  hoNotExecutable: string;
  // E76: Fix Approval lane
  fixApprovalSectionTitle: string;
  fixApprovalSessionLabel: string;
  fixApprovalCandidateLabel: string;
  fixApprovalHasPreview: string;
  fixApprovalNoPreview: string;
  fixApprovalRecordedLabel: string;
  fixApprovalApprovedAt: string;
  fixApprovalApprovedBy: string;
  fixApprovalApprovalText: string;
  fixApprovalWarningsAccepted: string;
  fixApprovalSnapshotVerified: string;
  fixApprovalTargetAssetVerified: string;
  fixApprovalNoApproval: string;
  approvalRecordBtn: string;
  approvalRecordSuccess: string;
  executionReadyBanner: string;
  executionReadyDetail: string;
  approvalTextPlaceholder: string;
}

// ── Repair Sessions (E74) ──

// ── E80: Post-Fix Report ──

export interface PostFixReportCopy {
  title: string;
  generated: string;
  session: string;
  targetAsset: string;
  sessionStatus: string;
  fixCandidate: string;
  candidateId: string;
  titleLabel: string;
  source: string;
  ranking: string;
  confidence: string;
  proposedChange: string;
  noCandidate: string;
  approvalAndPreview: string;
  approvalId: string;
  approvedBy: string;
  approvedAt: string;
  approvalText: string;
  snapshotVerified: string;
  targetAssetVerified: string;
  noApproval: string;
  previewId: string;
  diffGenerated: string;
  noPreview: string;
  executionResult: string;
  success: string;
  outcome: string;
  rollbackRecommended: string;
  requiresUserLocalValidation: string;
  writeResponse: string;
  details: string;
  errors: string;
  noExecutionResult: string;
  rollbackStatus: string;
  rollbackAttempted: string;
  noRollbackAttempted: string;
  rollbackHistory: string;
  record: string;
  reason: string;
  timestamp: string;
  validationRuns: string;
  runTitle: string;
  stepStatus: string;
  failureRecoveryTitle: string;
  failureRecoveryGuidance: string;
  executionFailed: string;
  rollbackRecommendedDot: string;
  validationFailed: string;
  rollbackAttemptFailed: string;
  rollbackAvailable: string;
  recoveryNoAutoFix: string;
  recoveryInspectEditor: string;
  recoveryPendingValidation: string;
  phaseResult: string;
  passPendingUserValidation: string;
  reportSafetyNote: string;
  userLocalValidationChecklist: string;
  checklistVerifyAsset: string;
  checklistCompileStatus: string;
  checklistPie: string;
  checklistAutomation: string;
  checklistInspectAsset: string;
  checklistRollbackSnapshot: string;
  checklistRealBridge: string;
  copyReport: string;
  copied: string;
  copyFailed: string;
}

// ── Blueprint Change Workspace (E91) ──

export interface AgentTransitionSessionControlCopy {
  title: string;
  startHeading: string;
  targetLabel: string;
  targetPlaceholder: string;
  targetRequired: string;
  intentLabel: string;
  intentPlaceholder: string;
  startButton: string;
  resumeButton: string;
  discardButton: string;
  cancelButton: string;
  discardConfirm: string;
  cancelConfirm: string;
  groupActive: string;
  groupInterrupted: string;
  groupTerminal: string;
  emptyActive: string;
  emptyInterrupted: string;
  emptyTerminal: string;
}

export interface AgentTransitionLiveProgressCopy {
  title: string;
  stateLabel: string;
  retryLabel: string;
  timelineHeading: string;
  timelineEmpty: string;
  errorsHeading: string;
  errorsEmpty: string;
  noActiveSession: string;
  compileFailedFallback: string;
}

export interface AgentTransitionApprovalGateCopy {
  title: string;
  operationLabel: string;
  targetLabel: string;
  sandboxLabel: string;
  beforeLabel: string;
  afterLabel: string;
  displayLabel: string;
  approveButton: string;
  rejectButton: string;
  noteLabel: string;
  rejectReasonLabel: string;
  copyDiffButton: string;
  copied: string;
  approveFailed: string;
  rejectFailed: string;
}

export interface AgentTransitionStateCopy {
  draft: string;
  diagnosing: string;
  proposing: string;
  payload_validating: string;
  preflighting: string;
  sandbox_duplicating: string;
  sandbox_applying: string;
  sandbox_compiling: string;
  awaiting_approval: string;
  promoting: string;
  done: string;
  escalated_done: string;
  closed: string;
  interrupted: string;
}

export interface AgentTransitionOperationCopy {
  set_blueprint_metadata_marker: string;
  set_blueprint_variable_default: string;
}

export interface AgentTransitionCopy {
  tabLabel: string;
  summaryHeader: string;
  summaryDetail: string;
  safetyBanner: string;
  safetyBannerDetail: string;
  loadingSessions: string;
  loadFailed: string;
  startFailed: string;
  resumeFailed: string;
  discardFailed: string;
  cancelFailed: string;
  errorEventHeading: string;
  errorCodeLabel: string;
  errorMessageLabel: string;
  copyFailed: string;
  copyFallbackMissing: string;
  section: {
    sessionControl: AgentTransitionSessionControlCopy;
    liveProgress: AgentTransitionLiveProgressCopy;
    approvalGate: AgentTransitionApprovalGateCopy;
  };
  state: AgentTransitionStateCopy;
  operation: AgentTransitionOperationCopy;
}

export interface BlueprintChangeWorkspaceCopy {
  title: string;
  summaryHeader: string;
  summaryDetail: string;
  summaryDetailE92: string;
  safetyBanner: string;
  safetyBannerDetail: string;
  safetyBannerE92: string;
  safetyBannerDetailE92: string;
  inventorySourceMock: string;
  inventorySourceReal: string;
  inventorySourceManual: string;
  inventorySourceBridgeDeferred: string;
  inventorySourceImported: string;
  inventorySourceRowMock: string;
  inventorySourceRowManual: string;
  inventorySourceRowImported: string;
  inventorySourceRowReal: string;
  inventorySourceRowDeferred: string;
  inventorySourceRowOther: string;
  manualClearBtn: string;
  inventorySectionTitle: string;
  inventoryEmpty: string;
  inventoryAssetPath: string;
  inventoryDisplayName: string;
  inventoryAssetClass: string;
  inventoryEligibility: string;
  inventoryDirtyState: string;
  inventorySource: string;
  inventoryHealth: string;
  inventoryHealthLoaded: string;
  inventoryHealthUnavailable: string;
  inventoryPlanningOnly: string;
  manualEntryTitle: string;
  manualEntryPlaceholder: string;
  manualEntryBtn: string;
  manualEntryAdded: string;
  manualEntryDuplicate: string;
  manualEntryPlanningOnlyNote: string;
  manualEntryTargetsSection: string;
  bridgeDeferredTitle: string;
  bridgeDeferredDetail: string;
  eligibleScratchOrTest: string;
  productionWriteBlocked: string;
  eligibilityUnknown: string;
  dirtyRecorded: string;
  dirtyNotRecorded: string;
  planSectionTitle: string;
  planNoSelection: string;
  planEmpty: string;
  planIdLabel: string;
  targetBlueprint: string;
  userIntent: string;
  summary: string;
  proposedPlan: string;
  operationId: string;
  operationKind: string;
  operationTargetArea: string;
  operationDescription: string;
  operationSafetyStatus: string;
  riskSection: string;
  riskLevel: string;
  riskReasons: string;
  rollbackSection: string;
  rollbackStatus: string;
  rollbackNotes: string;
  validationSection: string;
  validationRequiredChecks: string;
  validationUserLocalChecks: string;
  rawDetails: string;
  rawSource: string;
  rawSourceMock: string;
  rawSourceReal: string;
  rawPlanData: string;
  noAiGenerated: string;
  noUeWrite: string;
  mockOnlyNotice: string;
  mockOnlyDetail: string;
  selectTargetHint: string;
  planCreated: string;
  planTitle: string;
  noPlanData: string;
  disabledLane: string;
  safetySafe: string;
  safetyCaution: string;
  safetyDanger: string;
  rollbackAvailable: string;
  rollbackNotReady: string;
  collapsibleExpand: string;
  collapsibleCollapse: string;
  // E92 new fields
  intentLabel: string;
  intentPlaceholder: string;
  intentHint: string;
  generatePlanBtn: string;
  omuePlansTo: string;
  proposedChanges: string;
  planSafetyStatus: string;
  writeStatus: string;
  nextStep: string;
  approvalSection: string;
  approvalRequired: string;
  yes: string;
  no: string;
  copyPlanSummary: string;
  copied: string;
  copyFailed: string;
  mockOnlyPlanNote: string;
  classPreviewOnly: string;
  classWriteBlocked: string;
  classNeedsApproval: string;
  classUnsupported: string;
  writeStatusPreview: string;
  writeStatusBlocked: string;
  writeStatusApproval: string;
  writeStatusUnsupported: string;
  nextDecisionNoIntent: string;
  nextDecisionPreview: string;
  nextDecisionBlocked: string;
  nextDecisionApproval: string;
  nextDecisionUnsupported: string;
  // E93 - AI Plan Adapter Mock
  aiModeLocal: string;
  aiModeMock: string;
  aiModeRealDisabled: string;
  aiPreviewBtn: string;
  aiStatusOk: string;
  aiStatusClarification: string;
  aiStatusBlocked: string;
  aiStatusError: string;
  aiSafetyMsg: string;
  aiValidationMsg: string;
  aiSafetyNoAi: string;
  aiSafetyNoNetwork: string;
  aiSafetyNoUeWrite: string;
  aiPlanUntrusted: string;
  aiShowRequest: string;
  aiHideRequest: string;
  aiRequestSection: string;
  aiProductionBlocked: string;
  aiEmptyIntent: string;
  aiMockBadge: string;
  aiModeLabel: string;
  aiStatusLabel: string;
  aiValidationFailedLabel: string;
  aiRequestLabel: string;
  aiResponseLabel: string;
  aiLocalPreviewBtn: string;
  aiProductionNoWritePath: string;
  aiProviderDisabledReason: string;
  // E95 - Review/Handoff Workflow
  reviewHandoffTitle: string;
  reviewHandoffTarget: string;
  reviewHandoffSource: string;
  reviewHandoffEligibility: string;
  reviewHandoffIntent: string;
  reviewHandoffPlanMode: string;
  reviewHandoffSafety: string;
  reviewHandoffNextDecision: string;
  reviewHandoffRollback: string;
  reviewHandoffValidation: string;
  reviewHandoffExecStatus: string;
  reviewHandoffExecDeferred: string;
  readinessChecklistTitle: string;
  readinessTargetSelected: string;
  readinessIntentProvided: string;
  readinessPlanGenerated: string;
  readinessEligibilityClear: string;
  readinessRollbackDescribed: string;
  readinessValidationListed: string;
  readinessExecutionDeferred: string;
  copyReviewPacket: string;
  // E95-fix - Review packet localized text
  reviewPacketTitle: string;
  reviewPacketTargetLabel: string;
  reviewPacketDisplayNameLabel: string;
  reviewPacketSourceLabel: string;
  reviewPacketEligibilityLabel: string;
  reviewPacketIntentLabel: string;
  reviewPacketPlanSourceLabel: string;
  reviewPacketSafetyClassificationLabel: string;
  reviewPacketNextDecisionLabel: string;
  reviewPacketWriteStatusLabel: string;
  reviewPacketOpsSection: string;
  reviewPacketRollbackSection: string;
  reviewPacketValidationSection: string;
  reviewPacketExecSection: string;
  reviewPacketNotSelected: string;
  reviewPacketEmptyIntent: string;
  reviewPacketNoneProposed: string;
  reviewPacketNotDescribed: string;
  reviewPacketNoneListed: string;
  reviewPacketRequiredChecks: string;
  reviewPacketUserLocalChecks: string;
  reviewPacketPlanSourceMock: string;
  reviewPacketPlanSourceLocal: string;
  reviewPacketSafetyPrefix: string;
  reviewPacketSafetyMid: string;
  reviewPacketSafetyDeferred: string;
  // E95-fix - Review handoff UI fallbacks
  reviewHandoffChecksLabel: string;
  reviewHandoffNoValidation: string;
}
