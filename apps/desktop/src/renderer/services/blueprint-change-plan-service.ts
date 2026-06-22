import type {
  BlueprintAssetSummary,
  BlueprintChangePlan,
  ChangePlanOperation,
  PlanSafetyClassification,
} from '@omue/shared-protocol';

// ── Deterministic Mock Asset Inventory ──

const MOCK_ASSETS: BlueprintAssetSummary[] = [
  {
    assetPath: '/Game/Scratch/BP_OMUE_Scratch_Fixture',
    displayName: 'BP_OMUE_Scratch_Fixture',
    assetClass: 'Blueprint',
    eligibility: 'eligible_scratch_or_test',
    dirtyState: 'not recorded',
    source: 'mock_local_fixture',
  },
  {
    assetPath: '/Game/Blueprints/BP_PlayerCharacter',
    displayName: 'BP_PlayerCharacter',
    assetClass: 'Blueprint',
    eligibility: 'production_write_blocked',
    dirtyState: 'clean',
    source: 'mock_local_fixture',
  },
  {
    assetPath: '/Game/AI/BT_CombatGuard',
    displayName: 'BT_CombatGuard',
    assetClass: 'BehaviorTree',
    eligibility: 'unknown',
    dirtyState: 'not recorded',
    source: 'mock_local_fixture',
  },
  {
    assetPath: '/Game/Blueprints/BP_ProjectileBase',
    displayName: 'BP_ProjectileBase',
    assetClass: 'Blueprint',
    eligibility: 'production_write_blocked',
    dirtyState: 'dirty',
    source: 'mock_local_fixture',
  },
];

export function getMockAssets(): BlueprintAssetSummary[] {
  return MOCK_ASSETS;
}

function getSafetyClassification(assetPath: string): PlanSafetyClassification {
  if (assetPath.startsWith('/Game/Scratch/') || assetPath.startsWith('/Game/Test/')) {
    return 'preview_only';
  }
  if (assetPath.startsWith('/Game/Blueprints/')) {
    return 'write_blocked_production';
  }
  return 'unsupported_or_unknown';
}

function buildScratchFixturePlan(intent: string): BlueprintChangePlan {
  const classification = getSafetyClassification('/Game/Scratch/BP_OMUE_Scratch_Fixture');
  const operations: ChangePlanOperation[] = [
    {
      id: 'op-1',
      kind: 'update_metadata',
      targetArea: 'metadata',
      description: 'Set OMUE.ScratchFixture.Marker = "omue.safeScratchBlueprintMutation.v1" on the canonical scratch fixture.',
      safetyStatus: 'safe',
      beforePreview: 'Key OMUE.ScratchFixture.Marker: absent (or prior value)',
      afterPreview: 'Key OMUE.ScratchFixture.Marker = "omue.safeScratchBlueprintMutation.v1"',
    },
    {
      id: 'op-2',
      kind: 'update_metadata',
      targetArea: 'metadata',
      description: 'Capture before-state metadata value (if any) and after-state for audit trail.',
      safetyStatus: 'safe',
    },
  ];

  return {
    schemaVersion: 1,
    planId: 'bcp-scratch-001',
    createdTimestamp: new Date().toISOString(),
    source: 'mock_local_plan',
    targetAssetPath: '/Game/Scratch/BP_OMUE_Scratch_Fixture',
    targetDisplayName: 'BP_OMUE_Scratch_Fixture',
    userIntent: intent || 'Set OMUE scratch fixture metadata marker for Safe UE Mutation Core v1 validation.',
    summary: 'Write one metadata marker (OMUE.ScratchFixture.Marker) to the canonical scratch Blueprint asset and confirm package dirty state.',
    operations,
    safetyClassification: classification,
    risk: {
      level: 'Safe',
      reasons: [
        'Target is a designated scratch/test fixture asset.',
        'Operation is a non-structural metadata write — no graph, variable, or component changes.',
        'Write is blocked for production assets by explicit safety gate.',
      ],
    },
    approvalRequirements: {
      required: true,
      notes: 'Bridge approval metadata must be present before write execution.',
    },
    rollbackReadiness: {
      status: 'Rollback data available',
      notes: 'Typed rollback payload is recorded: previous metadata value (or absence) is captured. Restore can be requested via the bridge.',
    },
    validationRequirements: {
      requiredChecks: [
        'Bridge approval metadata must be present.',
        'Snapshot must be captured before write.',
        'Target asset path must match the canonical scratch fixture.',
        'Typed payload schema version must match.',
      ],
      userLocalChecks: [
        'Open UE Editor and verify the metadata marker on /Game/Scratch/BP_OMUE_Scratch_Fixture.',
        'Confirm package shows dirty state.',
        'No compile, PIE, or Automation triggered by OMUE automation.',
      ],
    },
    rawSource: 'mock_local_plan',
  };
}

function buildPlayerCharacterPlan(intent: string): BlueprintChangePlan {
  const classification = getSafetyClassification('/Game/Blueprints/BP_PlayerCharacter');
  const operations: ChangePlanOperation[] = [
    {
      id: 'op-1',
      kind: 'modify_graph',
      targetArea: 'graph',
      description: 'Connect the unconnected "B" input pin of the Multiply node to a default value or variable reference.',
      safetyStatus: 'caution',
      beforePreview: 'Multiply node has unconnected "B" float input pin',
      afterPreview: 'Multiply node "B" input connected to a default float value or variable',
    },
    {
      id: 'op-2',
      kind: 'set_variable',
      targetArea: 'variable',
      description: 'Add or wire a default damage multiplier variable to provide the missing float input.',
      safetyStatus: 'caution',
    },
  ];

  return {
    schemaVersion: 1,
    planId: 'bcp-prod-001',
    createdTimestamp: new Date().toISOString(),
    source: 'mock_local_plan',
    targetAssetPath: '/Game/Blueprints/BP_PlayerCharacter',
    targetDisplayName: 'BP_PlayerCharacter',
    userIntent: intent || 'Review and plan a fix for the TakeDamage event — unconnected pin causes compile warning.',
    summary: 'Proposed change plan for BP_PlayerCharacter: connect the unconnected float pin in the OnTakeDamage function entry to resolve the BP compile warning.',
    operations,
    safetyClassification: classification,
    risk: {
      level: 'Caution',
      reasons: [
        'Target is a production Blueprint — writes are blocked by safety gate.',
        'Plan requires graph modification which may affect behavior.',
        'Compile verification needed after changes.',
      ],
    },
    approvalRequirements: {
      required: true,
      notes: 'Production write gate must be explicitly approved. User-local validation required after any write.',
    },
    rollbackReadiness: {
      status: 'Rollback not ready',
      notes: 'No typed rollback payload exists for this plan. Snapshot and before-state capture would be required before any write.',
    },
    validationRequirements: {
      requiredChecks: [
        'Production write gate must be explicitly approved.',
        'Snapshot must be captured before write.',
        'Compile verification after changes.',
        'PIE smoke test recommended.',
      ],
      userLocalChecks: [
        'Review proposed graph changes in UE Blueprint Editor.',
        'Verify no regression in character behavior.',
        'Run PIE smoke test with player character.',
      ],
    },
    rawSource: 'mock_local_plan',
  };
}

function buildFallbackPlan(assetPath: string, displayName: string, intent: string): BlueprintChangePlan {
  const classification = getSafetyClassification(assetPath);
  return {
    schemaVersion: 1,
    planId: `bcp-unknown-${Date.now()}`,
    createdTimestamp: new Date().toISOString(),
    source: 'mock_local_plan',
    targetAssetPath: assetPath,
    targetDisplayName: displayName,
    userIntent: intent || 'No specific intent available for this target.',
    summary: `Plan preview for ${displayName}. This target is classified as "${classification}" — ${classification === 'unsupported_or_unknown' ? 'no operations can be generated automatically.' : 'review-only.'}`,
    operations: [],
    safetyClassification: classification,
    risk: {
      level: 'Unknown',
      reasons: [
        classification === 'write_blocked_production'
          ? 'Target is a production asset — writes are blocked by safety gate.'
          : 'Target type or path is not recognized.',
        'No operations are proposed for this target.',
      ],
    },
    approvalRequirements: {
      required: false,
      notes: 'No operations to approve. Review classification before enabling any write path.',
    },
    rollbackReadiness: {
      status: 'Rollback not applicable',
      notes: 'No operations means no rollback payload is needed.',
    },
    validationRequirements: {
      requiredChecks: [],
      userLocalChecks: [],
    },
    rawSource: 'mock_local_plan',
  };
}

// ── Deterministic Plan Builder ──

export function buildMockPlan(assetPath: string, displayName: string, intent: string): BlueprintChangePlan {
  switch (assetPath) {
    case '/Game/Scratch/BP_OMUE_Scratch_Fixture':
      return buildScratchFixturePlan(intent);
    case '/Game/Blueprints/BP_PlayerCharacter':
      return buildPlayerCharacterPlan(intent);
    default:
      return buildFallbackPlan(assetPath, displayName, intent);
  }
}

export function classifyPlanSafety(asset: BlueprintAssetSummary): PlanSafetyClassification {
  if (asset.eligibility === 'eligible_scratch_or_test') {
    return 'preview_only';
  }
  if (asset.eligibility === 'production_write_blocked') {
    return 'write_blocked_production';
  }
  return 'unsupported_or_unknown';
}
