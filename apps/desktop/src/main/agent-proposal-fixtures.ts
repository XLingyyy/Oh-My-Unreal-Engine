import type {
  AgentProposalRequest,
  BlueprintAssetSummary,
  CompileIssue,
  TypedFixPayload,
} from '@omue/shared-protocol';

const SAFE_SCRATCH_BLUEPRINT_MUTATION_SCHEMA_VERSION =
  'omue.safeScratchBlueprintMutation.v1';

const DEFAULT_SAFE_SCRATCH_ALLOWLIST_PREFIXES = [
  '/Game/Scratch/',
  '/Game/Test/',
];

export const MOCK_AGENT_PROPOSAL_TARGET_ASSET_PATH =
  '/Game/Scratch/BP_OMUE_Scratch_Fixture';

export const MOCK_COMPILE_ISSUES: CompileIssue[] = [
  {
    code: 'OMUE_METADATA_MARKER_MISSING',
    message: 'Metadata marker missing on scratch fixture.',
    severity: 'error',
  },
  {
    code: 'OMUE_DIAGNOSTIC_CONTEXT',
    message: 'Scratch fixture requires an OMUE metadata marker before repair validation.',
    severity: 'warning',
  },
];

export const MOCK_BLUEPRINT_SUMMARY: BlueprintAssetSummary = {
  assetPath: MOCK_AGENT_PROPOSAL_TARGET_ASSET_PATH,
  displayName: 'BP_OMUE_Scratch_Fixture',
  assetClass: 'Blueprint',
  eligibility: 'eligible_scratch_or_test',
  dirtyState: 'clean',
  source: 'mock_local_fixture',
};

export const MOCK_AGENT_PROPOSAL_TYPED_PAYLOAD: TypedFixPayload = {
  schemaVersion: SAFE_SCRATCH_BLUEPRINT_MUTATION_SCHEMA_VERSION,
  payload: {
    schemaVersion: SAFE_SCRATCH_BLUEPRINT_MUTATION_SCHEMA_VERSION,
    operationKind: 'set_blueprint_metadata_marker',
    targetAssetPath: MOCK_AGENT_PROPOSAL_TARGET_ASSET_PATH,
    targetAssetKind: 'blueprint_scratch_fixture',
    allowlistPrefixes: [...DEFAULT_SAFE_SCRATCH_ALLOWLIST_PREFIXES],
    beforeState: { kind: 'missing_or_absent_allowed' },
    afterState: {
      key: 'OMUE.ScratchFixture.Marker',
      value: SAFE_SCRATCH_BLUEPRINT_MUTATION_SCHEMA_VERSION,
    },
    requireApproval: true,
    requireSnapshot: true,
    display: {
      summary: 'Set OMUE scratch fixture marker on canonical Blueprint metadata.',
      note: 'Mock LLM response fixture for typed schema validation.',
    },
  },
};

const mockAgentProposalPayloadObject =
  MOCK_AGENT_PROPOSAL_TYPED_PAYLOAD as unknown as Record<string, unknown>;
const mockAgentProposalPayloadBodyObject =
  MOCK_AGENT_PROPOSAL_TYPED_PAYLOAD.payload as unknown as Record<string, unknown>;

export const MOCK_LLM_RESPONSES = {
  validFix: JSON.stringify({
    kind: 'fix',
    typedPayload: MOCK_AGENT_PROPOSAL_TYPED_PAYLOAD,
  }),
  validEscalation: JSON.stringify({
    kind: 'escalation',
    reason: 'The requested repair requires graph structure edits outside the supported allowlist.',
    suggestedHumanAction: 'Inspect the Blueprint graph manually and decide whether to create a later graph-edit task.',
  }),
  notJson: 'This is not JSON.',
  schemaInvalid: JSON.stringify({
    kind: 'fix',
    typedPayload: {
      schemaVersion: SAFE_SCRATCH_BLUEPRINT_MUTATION_SCHEMA_VERSION,
      payload: {
        schemaVersion: SAFE_SCRATCH_BLUEPRINT_MUTATION_SCHEMA_VERSION,
        operationKind: 'set_blueprint_metadata_marker',
      },
    },
  }),
  operationUnsupported: JSON.stringify({
    kind: 'fix',
    typedPayload: {
      ...mockAgentProposalPayloadObject,
      payload: {
        ...mockAgentProposalPayloadBodyObject,
        operationKind: 'set_blueprint_variable_default',
      },
    },
  }),
  targetMismatch: JSON.stringify({
    kind: 'fix',
    typedPayload: {
      ...mockAgentProposalPayloadObject,
      payload: {
        ...mockAgentProposalPayloadBodyObject,
        targetAssetPath: '/Game/Scratch/BP_Different_Target',
      },
    },
  }),
} as const;

export const MOCK_AGENT_PROPOSAL_REQUEST: AgentProposalRequest = {
  scope: 'asset',
  userIntent: 'Repair the mock scratch fixture.',
  targetAssetPath: MOCK_AGENT_PROPOSAL_TARGET_ASSET_PATH,
  compileIssues: MOCK_COMPILE_ISSUES,
  blueprintSummary: MOCK_BLUEPRINT_SUMMARY,
  graphDetailJson: JSON.stringify({
    graphCount: 1,
    note: 'Mock graph detail is intentionally minimal for schema validation.',
  }),
  messageLogJson: JSON.stringify([]),
  previousAttempts: [],
  feedback: '',
};
