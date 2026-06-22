import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateAgentProposal,
  validateAgentProposalRequest,
  parseLegacyTypedPayloadProposal,
} from '../main/ai-blueprint-propose-fix-provider-types';
import {
  AGENT_PROPOSAL_CANDIDATE_MAX,
  AGENT_PROPOSAL_DIAGNOSIS_SUMMARY_MAX,
  AGENT_PROPOSAL_EVIDENCE_SUMMARY_MAX,
  AGENT_PROPOSAL_SUMMARY_MAX,
  AGENT_USER_INTENT_MAX,
} from '@omue/shared-protocol';

const FIX_TYPED_PAYLOAD = {
  schemaVersion: 'omue.safeScratchBlueprintMutation.v1',
  payload: {
    schemaVersion: 'omue.safeScratchBlueprintMutation.v1',
    operationKind: 'set_blueprint_metadata_marker',
    targetAssetPath: '/Game/Test/BP_A',
    targetAssetKind: 'blueprint_scratch_fixture',
    allowlistPrefixes: ['/Game/Scratch/'],
    beforeState: { kind: 'missing_or_absent_allowed' },
    afterState: { kind: 'metadata_key_value', key: 'BP_Marker', value: 'v2' },
    requireApproval: true,
    requireSnapshot: true,
    display: { summary: 'Mock display summary.' },
  },
};

const PROJECT_DIAGNOSIS = {
  kind: 'diagnosis',
  summary: 'Project-wide compile failures stem from a missing IMC mapping.',
  evidenceSummary: 'Project compile log shows 4 repeated errors referencing IA_Jump.',
  confidence: 'medium',
  risk: 'low',
  candidateAssets: [
    {
      assetPath: '/Game/Input/IMC_Default',
      assetName: 'IMC_Default',
      assetType: 'InputMappingContext',
      reason: 'Mapping context for keyboard input lacks SpaceBar -> IA_Jump entry.',
      confidence: 'high',
    },
  ],
  suggestedNextSteps: [
    'Open IMC_Default and inspect its mapping entries.',
    'Start an asset session scoped to IMC_Default.',
  ],
};

const PROJECT_ESCALATION = {
  kind: 'escalation',
  reason: 'Bridge is unreachable; cannot read compile log.',
  suggestedHumanAction: 'Restart the UE Editor and retry the project session.',
};

test('validateAgentProposal: accepts valid project diagnosis', () => {
  const result = validateAgentProposal(JSON.stringify(PROJECT_DIAGNOSIS), {
    scope: 'project',
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.proposal.kind, 'diagnosis');
  }
});

test('validateAgentProposal: accepts valid project escalation', () => {
  const result = validateAgentProposal(JSON.stringify(PROJECT_ESCALATION), {
    scope: 'project',
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.proposal.kind, 'escalation');
  }
});

test('validateAgentProposal: rejects project fix proposal with scope_execution_forbidden', () => {
  const fix = {
    kind: 'fix',
    ...FIX_TYPED_PAYLOAD,
  };
  const result = validateAgentProposal(JSON.stringify(fix), {
    scope: 'project',
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.errorCode, 'scope_execution_forbidden');
  }
});

test('validateAgentProposal: rejects asset diagnosis proposal', () => {
  const result = validateAgentProposal(JSON.stringify(PROJECT_DIAGNOSIS), {
    scope: 'asset',
    targetAssetPath: '/Game/Test/BP_A',
  });
  assert.equal(result.ok, false);
});

test('validateAgentProposal: rejects more than 10 candidates', () => {
  const tooMany = {
    ...PROJECT_DIAGNOSIS,
    candidateAssets: Array.from({ length: AGENT_PROPOSAL_CANDIDATE_MAX + 1 }, (_, i) => ({
      assetPath: `/Game/Test/BP_${i}`,
      reason: 'mock candidate',
      confidence: 'low' as const,
    })),
  };
  const result = validateAgentProposal(JSON.stringify(tooMany), { scope: 'project' });
  assert.equal(result.ok, false);
});

test('validateAgentProposal: rejects empty suggestedNextSteps', () => {
  const empty = { ...PROJECT_DIAGNOSIS, suggestedNextSteps: [] };
  const result = validateAgentProposal(JSON.stringify(empty), { scope: 'project' });
  assert.equal(result.ok, false);
});

test('validateAgentProposal: rejects oversize summary', () => {
  const oversize = { ...PROJECT_DIAGNOSIS, summary: 'x'.repeat(AGENT_PROPOSAL_SUMMARY_MAX + 1) };
  const result = validateAgentProposal(JSON.stringify(oversize), { scope: 'project' });
  assert.equal(result.ok, false);
});

test('validateAgentProposal: rejects oversize evidenceSummary', () => {
  const oversize = { ...PROJECT_DIAGNOSIS, evidenceSummary: 'x'.repeat(AGENT_PROPOSAL_EVIDENCE_SUMMARY_MAX + 1) };
  const result = validateAgentProposal(JSON.stringify(oversize), { scope: 'project' });
  assert.equal(result.ok, false);
});

test('validateAgentProposal: accepts valid asset fix proposal', () => {
  const fix = {
    kind: 'fix',
    summary: 'Set metadata marker on /Game/Test/BP_A',
    diagnosisSummary: 'Diagnosis summary',
    evidenceSummary: 'Evidence summary',
    confidence: 'medium',
    risk: 'low',
    typedPayload: FIX_TYPED_PAYLOAD,
  };
  const result = validateAgentProposal(JSON.stringify(fix), {
    scope: 'asset',
    targetAssetPath: '/Game/Test/BP_A',
  });
  assert.equal(result.ok, true);
});

test('validateAgentProposal: rejects fix with target mismatch', () => {
  const fix = {
    kind: 'fix',
    summary: 'Set metadata marker on /Game/Test/BP_A',
    diagnosisSummary: 'Diagnosis summary',
    evidenceSummary: 'Evidence summary',
    confidence: 'medium',
    risk: 'low',
    typedPayload: {
      ...FIX_TYPED_PAYLOAD,
      payload: {
        ...FIX_TYPED_PAYLOAD.payload,
        targetAssetPath: '/Game/Other/BP_B',
      },
    },
  };
  const result = validateAgentProposal(JSON.stringify(fix), {
    scope: 'asset',
    targetAssetPath: '/Game/Test/BP_A',
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.errorCode, 'llm_output_target_mismatch');
  }
});

test('validateAgentProposal: rejects JSON with unknown fields', () => {
  const result = validateAgentProposal(JSON.stringify({
    ...PROJECT_DIAGNOSIS,
    extraField: 'should be rejected',
  }), { scope: 'project' });
  assert.equal(result.ok, false);
});

test('validateAgentProposal: rejects non-JSON text', () => {
  const result = validateAgentProposal('not json', { scope: 'project' });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.errorCode, 'llm_output_not_json');
  }
});

test('validateAgentProposalRequest: accepts scope-aware asset request', () => {
  const result = validateAgentProposalRequest({
    scope: 'asset',
    userIntent: 'fix the compile error',
    targetAssetPath: '/Game/Test/BP_A',
    compileIssues: [],
    blueprintSummary: {
      assetPath: '/Game/Test/BP_A',
      displayName: 'BP_A',
      assetClass: 'Blueprint',
      eligibility: 'eligible_scratch_or_test',
      dirtyState: 'clean',
      source: 'mock_local_fixture',
    },
  });
  assert.equal(result.ok, true);
});

test('validateAgentProposalRequest: rejects project request with targetAssetPath', () => {
  const result = validateAgentProposalRequest({
    scope: 'project',
    userIntent: 'investigate',
    targetAssetPath: '/Game/Test/BP_A',
  });
  assert.equal(result.ok, false);
});

test('validateAgentProposalRequest: rejects userIntent > 2000 chars', () => {
  const result = validateAgentProposalRequest({
    scope: 'project',
    userIntent: 'x'.repeat(AGENT_USER_INTENT_MAX + 1),
  });
  assert.equal(result.ok, false);
});

test('parseLegacyTypedPayloadProposal: parses legacy fix proposal', () => {
  const legacy = {
    kind: 'fix',
    typedPayload: FIX_TYPED_PAYLOAD,
  };
  const result = parseLegacyTypedPayloadProposal(JSON.stringify(legacy), '/Game/Test/BP_A');
  assert.equal(result.ok, true);
});

test('parseLegacyTypedPayloadProposal: rejects garbage', () => {
  const result = parseLegacyTypedPayloadProposal('not json', '/Game/Test/BP_A');
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.errorCode, 'legacy_proposal_parse_failed');
  }
});

test('parseLegacyTypedPayloadProposal: rejects non-fix kind', () => {
  const result = parseLegacyTypedPayloadProposal(JSON.stringify({ kind: 'diagnosis' }), '/Game/Test/BP_A');
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.errorCode, 'legacy_proposal_parse_failed');
  }
});

test('validateAgentProposal: rejects asset diagnosis with non-diagnosis fields', () => {
  const result = validateAgentProposal(JSON.stringify({
    kind: 'diagnosis',
    summary: 'short',
    evidenceSummary: 'short',
    confidence: 'medium',
    risk: 'low',
    candidateAssets: [
      {
        assetPath: '/Game/Test/BP_A',
        reason: 'r',
        confidence: 'high',
        unknownField: 'rejected',
      },
    ],
    suggestedNextSteps: ['next'],
  }), { scope: 'project' });
  assert.equal(result.ok, false);
});

test('validateAgentProposal: rejects diagnosisSummary over 4000 chars for fix', () => {
  const fix = {
    kind: 'fix',
    summary: 'Set metadata marker on /Game/Test/BP_A',
    diagnosisSummary: 'x'.repeat(AGENT_PROPOSAL_DIAGNOSIS_SUMMARY_MAX + 1),
    evidenceSummary: 'Evidence summary',
    confidence: 'medium',
    risk: 'low',
    typedPayload: FIX_TYPED_PAYLOAD,
  };
  const result = validateAgentProposal(JSON.stringify(fix), {
    scope: 'asset',
    targetAssetPath: '/Game/Test/BP_A',
  });
  assert.equal(result.ok, false);
});
