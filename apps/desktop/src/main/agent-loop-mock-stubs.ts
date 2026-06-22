import type {
  AgentProposalRequest,
  AgentProposalResult,
  CompileIssue,
  TypedFixPayload,
} from '@omue/shared-protocol';
import {
  MOCK_AGENT_PROPOSAL_TYPED_PAYLOAD,
  MOCK_BLUEPRINT_SUMMARY,
  MOCK_COMPILE_ISSUES,
} from './agent-proposal-fixtures';

export interface MockDuplicateResult {
  success: true;
  scratchAssetPath: string;
  snapshotId: string;
  duplicatedAt: string;
}

export interface MockApplyResult {
  success: true;
  appliedAt: string;
  operationCount: number;
  targetAssetPath: string;
}

export interface MockCompileResult {
  success: true;
  errors: CompileIssue[];
  durationMs: number;
  compiledAt: string;
}

function cloneTypedPayloadForTarget(targetAssetPath: string): TypedFixPayload {
  const cloned = JSON.parse(JSON.stringify(MOCK_AGENT_PROPOSAL_TYPED_PAYLOAD)) as TypedFixPayload;
  cloned.payload.targetAssetPath = targetAssetPath;
  return cloned;
}

export async function mockLlmPropose(
  request: AgentProposalRequest,
): Promise<AgentProposalResult> {
  if (request.scope === 'project') {
    return Promise.resolve({
      ok: true,
      proposal: {
        kind: 'diagnosis',
        summary: 'Project diagnosis (mock) — see evidence summary for details.',
        evidenceSummary: 'Mock project-level diagnosis produced by agent-loop-mock-stubs. No real LLM call.',
        confidence: 'medium',
        risk: 'low',
        candidateAssets: [],
        suggestedNextSteps: [
          'Open a Blueprint asset and start an asset session for repair.',
        ],
      },
      rawResponseRef: 'mock://agent-loop/phase-b/project-diagnosis',
    });
  }

  const targetAssetPath = request.targetAssetPath ?? '';
  return Promise.resolve({
    ok: true,
    proposal: {
      kind: 'fix',
      summary: 'Mock asset fix proposal — set Blueprint metadata marker.',
      diagnosisSummary: 'Mock diagnosis for asset repair; produced by agent-loop-mock-stubs.',
      evidenceSummary: 'Mock evidence summary for asset repair.',
      confidence: 'medium',
      risk: 'low',
      typedPayload: cloneTypedPayloadForTarget(targetAssetPath),
    },
    rawResponseRef: 'mock://agent-loop/phase-b/proposal',
  });
}

export function isMockContextAllowed(): boolean {
  return process.env.OMUE_AGENT_MOCK_CONTEXT === '1';
}

export async function mockCollectContext(targetAssetPath: string): Promise<{
  compileIssues: CompileIssue[];
  blueprintSummary: typeof MOCK_BLUEPRINT_SUMMARY;
  graphDetailJson: string;
  messageLogJson: string;
}> {
  if (!isMockContextAllowed()) {
    throw new Error(
      'mockCollectContext is not allowed outside explicit test mode (set OMUE_AGENT_MOCK_CONTEXT=1).',
    );
  }
  return Promise.resolve({
    compileIssues: MOCK_COMPILE_ISSUES,
    blueprintSummary: {
      ...MOCK_BLUEPRINT_SUMMARY,
      assetPath: targetAssetPath,
      displayName: targetAssetPath.split('/').pop() ?? MOCK_BLUEPRINT_SUMMARY.displayName,
    },
    graphDetailJson: JSON.stringify({
      source: 'mock-agent-loop-phase-b',
      targetAssetPath,
    }),
    messageLogJson: JSON.stringify([]),
  });
}

export async function mockBridgeDuplicate(
  targetAssetPath: string,
): Promise<MockDuplicateResult> {
  const displayName = targetAssetPath.split('/').pop() ?? 'BP_OMUE_Scratch_Fixture';
  return Promise.resolve({
    success: true,
    scratchAssetPath: `/Game/Scratch/${displayName}_Sandbox`,
    snapshotId: `mock-snapshot-${Date.now()}`,
    duplicatedAt: new Date().toISOString(),
  });
}

export async function mockBridgeApply(
  targetAssetPath: string,
): Promise<MockApplyResult> {
  return Promise.resolve({
    success: true,
    appliedAt: new Date().toISOString(),
    operationCount: 1,
    targetAssetPath,
  });
}

export async function mockBridgeCompile(): Promise<MockCompileResult> {
  return Promise.resolve({
    success: true,
    errors: [],
    durationMs: 1,
    compiledAt: new Date().toISOString(),
  });
}
