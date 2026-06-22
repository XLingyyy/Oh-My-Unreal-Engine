import type { OmueContextSnapshot } from '../types/context-snapshot.js';

/**
 * 示例上下文快照。
 * 用于桌面端 UI 开发和协议验证，模拟一个正在编辑 Blueprint 的 UE5 项目。
 */
export const sampleContextSnapshot: OmueContextSnapshot = {
  snapshotId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  capturedAt: '2026-05-30T12:00:00.000Z',
  bridgeVersion: '0.1.0',

  project: {
    projectName: 'MyUE5Game',
    projectPath: 'D:/Projects/MyUE5Game',
    uprojectFile: 'D:/Projects/MyUE5Game/MyUE5Game.uproject',
    engineVersion: '5.4.2',
    editorStatus: 'idle',
  },

  currentAsset: {
    assetName: 'BP_PlayerCharacter',
    assetPath: '/Game/Blueprints/Characters/BP_PlayerCharacter',
    assetClass: 'Blueprint',
    packagePath: '/Game/Blueprints/Characters/BP_PlayerCharacter',
    isDirty: true,
    isSelected: true,
    isOpenInEditor: true,
  },

  openAssets: [
    {
      assetName: 'BP_PlayerCharacter',
      assetPath: '/Game/Blueprints/Characters/BP_PlayerCharacter',
      assetClass: 'Blueprint',
      packagePath: '/Game/Blueprints/Characters/BP_PlayerCharacter',
      isDirty: true,
      isSelected: true,
      isOpenInEditor: true,
    },
    {
      assetName: 'MI_PlayerMaterial',
      assetPath: '/Game/Materials/Characters/MI_PlayerMaterial',
      assetClass: 'MaterialInstanceConstant',
      packagePath: '/Game/Materials/Characters/MI_PlayerMaterial',
      isDirty: false,
      isSelected: false,
      isOpenInEditor: true,
    },
  ],

  blueprint: {
    assetPath: '/Game/Blueprints/Characters/BP_PlayerCharacter',
    parentClass: 'Character',
    blueprintType: 'Normal',
    graphNames: ['EventGraph', 'OnTakeDamage', 'UpdateHealth'],
    variables: [
      {
        name: 'MaxHealth',
        type: 'float',
        defaultValue: '100.0',
        isEditable: true,
        isExposed: true,
        category: 'Health',
      },
      {
        name: 'CurrentHealth',
        type: 'float',
        defaultValue: '100.0',
        isEditable: true,
        isExposed: false,
        category: 'Health',
      },
      {
        name: 'MovementSpeed',
        type: 'float',
        defaultValue: '600.0',
        isEditable: true,
        isExposed: true,
        category: 'Movement',
      },
    ],
    functions: [
      {
        name: 'OnTakeDamage',
        isOverride: true,
        isPure: false,
        isConst: false,
        inputParams: [
          {
            name: 'Damage',
            type: 'float',
            isReturnValue: false,
            isReference: false,
          },
        ],
        outputParams: [],
        nodeCount: 8,
      },
      {
        name: 'UpdateHealth',
        isOverride: false,
        isPure: false,
        isConst: false,
        inputParams: [],
        outputParams: [],
        nodeCount: 5,
      },
    ],
    events: [
      {
        name: 'BeginPlay',
        eventType: 'BeginPlay',
        nodeCount: 3,
      },
      {
        name: 'Tick',
        eventType: 'Tick',
        nodeCount: 2,
      },
    ],
    nodeCount: 42,
    edgeCount: 56,
    exportStatus: 'partial',
  },

  recentLogs: [
    {
      timestamp: '2026-05-30T11:59:58.000Z',
      category: 'LogCompile',
      verbosity: 'warning',
      message: 'BP_PlayerCharacter: UpdateHealth — unused input pin "Target"',
    },
    {
      timestamp: '2026-05-30T11:59:57.000Z',
      category: 'LogCompile',
      verbosity: 'error',
      message:
        'BP_PlayerCharacter: OnTakeDamage — type mismatch on Damage pin (expected float, got int)',
    },
    {
      timestamp: '2026-05-30T11:59:30.000Z',
      category: 'LogBlueprint',
      verbosity: 'display',
      message: 'Compiling Blueprint BP_PlayerCharacter...',
    },
    {
      timestamp: '2026-05-30T11:58:00.000Z',
      category: 'LogPlayLevel',
      verbosity: 'log',
      message: 'PIE session ended.',
    },
    {
      timestamp: '2026-05-30T11:55:00.000Z',
      category: 'LogPlayLevel',
      verbosity: 'log',
      message: 'Play in editor start. World: /Game/Maps/MainLevel',
    },
    {
      timestamp: '2026-05-30T11:54:30.000Z',
      category: 'LogCompile',
      verbosity: 'display',
      message: 'Compile completed with 1 error(s), 2 warning(s)',
    },
  ],

  compileStatus: {
    isCompiling: false,
    lastCompileResult: 'failed',
    errorCount: 1,
    warningCount: 2,
    lastCompileTime: '2026-05-30T11:54:30.000Z',
    lastErrors: [
      {
        code: 'BPTypeMismatch',
        message:
          'BP_PlayerCharacter: OnTakeDamage — type mismatch on Damage pin (expected float, got int)',
        file: '/Game/Blueprints/Characters/BP_PlayerCharacter',
        severity: 'error',
      },
      {
        code: 'BPUnusedPin',
        message:
          'BP_PlayerCharacter: UpdateHealth — unused input pin "Target"',
        file: '/Game/Blueprints/Characters/BP_PlayerCharacter',
        severity: 'warning',
      },
    ],
  },

  blueprintSummary: {
    name: 'BP_PlayerCharacter',
    packagePath: '/Game/Blueprints/Characters/BP_PlayerCharacter',
    objectPath: '/Game/Blueprints/Characters/BP_PlayerCharacter.BP_PlayerCharacter',
    assetClass: 'Blueprint',
    parentClassName: 'Character',
    generatedClassName: 'BP_PlayerCharacter_C',
    skeletonClassName: 'SKEL_BP_PlayerCharacter_C',
    blueprintType: 'BPType_Normal',
    status: 'BS_Dirty',
    isDataOnly: false,
    isDirty: true,
    graphCount: 3,
    graphs: [
      { name: 'EventGraph', kind: 'event' },
      { name: 'OnTakeDamage', kind: 'function' },
      { name: 'UpdateHealth', kind: 'function' },
    ],
    variableCount: 3,
    variables: [
      { name: 'MaxHealth', category: 'Health' },
      { name: 'CurrentHealth', category: 'Health' },
      { name: 'MovementSpeed', category: 'Movement' },
    ],
    functionCount: 2,
    functions: [
      { name: 'OnTakeDamage' },
      { name: 'UpdateHealth' },
    ],
    macroCount: 0,
    macros: [],
  },

  blueprintGraphs: {
    exportMeta: {
      formatVersion: '0.1.0',
      exportedAt: '2026-05-30T12:00:00.000Z',
      source: 'live',
      assetPath: '/Game/Blueprints/Characters/BP_PlayerCharacter',
      includedGraphIds: [],
    },
    blueprint: {
      name: 'BP_PlayerCharacter',
      packagePath: '/Game/Blueprints/Characters/BP_PlayerCharacter',
      objectPath: '/Game/Blueprints/Characters/BP_PlayerCharacter.BP_PlayerCharacter',
      assetClass: 'Blueprint',
      parentClassName: 'Character',
      generatedClassName: 'BP_PlayerCharacter_C',
      skeletonClassName: 'SKEL_BP_PlayerCharacter_C',
      blueprintType: 'BPType_Normal',
      status: 'BS_Dirty',
      isDataOnly: false,
      isDirty: true,
      graphCount: 5,
      variableCount: 3,
      functionCount: 2,
      eventCount: 6,
      macroCount: 1,
      totalNodeCount: 72,
      totalLinkCount: 94,
    },
    graphs: [
      { graphId: 'event::EventGraph', name: 'EventGraph', kind: 'event', nodeCount: 28, linkCount: 38, isEntryGraph: true },
      { graphId: 'function::OnTakeDamage', name: 'OnTakeDamage', kind: 'function', nodeCount: 12, linkCount: 15, isEntryGraph: false },
      { graphId: 'function::UpdateHealth', name: 'UpdateHealth', kind: 'function', nodeCount: 8, linkCount: 10, isEntryGraph: false },
      { graphId: 'macro::ForEachWithBreak', name: 'ForEachWithBreak', kind: 'macro', nodeCount: 5, linkCount: 6, isEntryGraph: false },
      { graphId: 'custom::ConstructionScript', name: 'ConstructionScript', kind: 'custom', nodeCount: 14, linkCount: 18, isEntryGraph: false },
      { graphId: 'delegate::OnDeath__DelegateSignature', name: 'OnDeath__DelegateSignature', kind: 'delegate', nodeCount: 5, linkCount: 7, isEntryGraph: false },
    ],
    variables: [
      { name: 'MaxHealth', type: 'float', category: 'Health', isEditable: true, isExposed: true, isArray: false, defaultValue: '100.0' },
      { name: 'CurrentHealth', type: 'float', category: 'Health', isEditable: true, isExposed: false, isArray: false, defaultValue: '100.0' },
      { name: 'MovementSpeed', type: 'float', category: 'Movement', isEditable: true, isExposed: true, isArray: false, defaultValue: '600.0' },
    ],
    functions: [
      { name: 'OnTakeDamage', graphId: 'function::OnTakeDamage', isOverride: true, isPure: false, isConst: false, inputParams: [{ name: 'Damage', type: 'float', isReturnValue: false, isReference: false, isArray: false }], outputParams: [], nodeCount: 12 },
      { name: 'UpdateHealth', graphId: 'function::UpdateHealth', isOverride: false, isPure: false, isConst: false, inputParams: [], outputParams: [], nodeCount: 8 },
    ],
    events: [
      { name: 'ReceiveBeginPlay', eventType: 'BeginPlay', graphId: 'event::EventGraph', nodeCount: 28 },
      { name: 'ReceiveTick', eventType: 'Tick', graphId: 'event::EventGraph', nodeCount: 28 },
      { name: 'OnActorBeginOverlap', eventType: 'BeginOverlap', graphId: 'event::EventGraph', nodeCount: 28 },
      { name: 'OnDeath', eventType: 'CustomEvent', graphId: 'event::EventGraph', nodeCount: 28 },
      { name: 'OnDamageTaken', eventType: 'CustomEvent', graphId: 'event::EventGraph', nodeCount: 28 },
    ],
    macros: [
      { name: 'ForEachWithBreak', graphId: 'macro::ForEachWithBreak', nodeCount: 5 },
    ],
  },

  runtimeStatus: {
    isPieRunning: false,
    isSimulating: false,
    activeWorldName: undefined,
    playMode: 'none',
  },
};
