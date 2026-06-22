import type {
  ChangeItem,
  EvidenceItem,
  AgentUiLogEntry,
} from '@omue/shared-protocol';
import type { UeAgentUiCopy } from '../../i18n/types';

type EvidenceTexts = UeAgentUiCopy['rightInspector']['evidence']['texts'];
type ChangeTexts = UeAgentUiCopy['rightInspector']['changes']['texts'];
type LogTexts = UeAgentUiCopy['rightInspector']['logs']['texts'];

const FIXED_TIMESTAMP = '2026-06-19T08:00:00.000Z';

export function buildMockEvidenceItems(texts: EvidenceTexts): EvidenceItem[] {
  return [
    {
      id: 'evidence-imc-default',
      assetName: 'IMC_Default',
      assetPath: '/Game/Input/IMC_Default',
      status: 'normal',
      finding: texts.finding['evidence-imc-default'],
      details: {
        inspected: texts.inspected['evidence-imc-default'],
        result: texts.result['evidence-imc-default'],
        relatedPath: '/Game/Input/IMC_Default',
        isAnomaly: false,
      },
    },
    {
      id: 'evidence-bp-player-controller',
      assetName: 'BP_PlayerController',
      assetPath: '/Game/Blueprints/BP_PlayerController',
      status: 'warning',
      finding: texts.finding['evidence-bp-player-controller'],
      details: {
        inspected: texts.inspected['evidence-bp-player-controller'],
        result: texts.result['evidence-bp-player-controller'],
        relatedPath: '/Game/Blueprints/BP_PlayerController',
        isAnomaly: true,
      },
    },
    {
      id: 'evidence-bp-player',
      assetName: 'BP_Player',
      assetPath: '/Game/Blueprints/BP_Player',
      status: 'normal',
      finding: texts.finding['evidence-bp-player'],
      details: {
        inspected: texts.inspected['evidence-bp-player'],
        result: texts.result['evidence-bp-player'],
        relatedPath: '/Game/Blueprints/BP_Player',
        isAnomaly: false,
      },
    },
    {
      id: 'evidence-imc-gamepad',
      assetName: 'IMC_Gamepad',
      assetPath: '/Game/Input/IMC_Gamepad',
      status: 'normal',
      finding: texts.finding['evidence-imc-gamepad'],
      details: {
        inspected: texts.inspected['evidence-imc-gamepad'],
        result: texts.result['evidence-imc-gamepad'],
        relatedPath: '/Game/Input/IMC_Gamepad',
        isAnomaly: false,
      },
    },
  ];
}

export function buildMockChangeItems(texts: ChangeTexts): ChangeItem[] {
  return [
    {
      id: 'change-stage-before',
      stage: 'before',
      targetAsset: '/Game/Input/IMC_Default',
      changes: [
        { kind: 'add', summary: texts.summary['change-stage-before'][0] },
      ],
      status: 'pending',
      rollbackable: true,
    },
    {
      id: 'change-stage-preview',
      stage: 'preview',
      targetAsset: '/Game/Input/IMC_Default',
      changes: [
        { kind: 'modify', summary: texts.summary['change-stage-preview'][0] },
        { kind: 'add', summary: texts.summary['change-stage-preview'][1] },
      ],
      status: 'pending',
      rollbackable: true,
    },
    {
      id: 'change-stage-sandbox-applied',
      stage: 'sandbox-applied',
      targetAsset: '/Game/Scratch/BP_OMUE_Scratch_Fixture_Sandbox',
      changes: [
        { kind: 'modify', summary: texts.summary['change-stage-sandbox-applied'][0] },
        { kind: 'add', summary: texts.summary['change-stage-sandbox-applied'][1] },
      ],
      status: 'applied',
      rollbackable: true,
      appliedAt: FIXED_TIMESTAMP,
    },
    {
      id: 'change-stage-promoted',
      stage: 'promoted',
      targetAsset: '/Game/Input/IMC_Default',
      changes: [
        { kind: 'modify', summary: texts.summary['change-stage-promoted'][0] },
        { kind: 'remove', summary: texts.summary['change-stage-promoted'][1] },
      ],
      status: 'applied',
      rollbackable: true,
      appliedAt: FIXED_TIMESTAMP,
    },
  ];
}

const MOCK_PROMOTED_CANONICAL_TARGET = '/Game/Input/IMC_Default';

export function getMockPromotedCanonicalTarget(): string {
  return MOCK_PROMOTED_CANONICAL_TARGET;
}

export function buildMockLogEntries(texts: LogTexts): AgentUiLogEntry[] {
  return [
    {
      id: 'log-001',
      level: 'info',
      source: 'agent-state',
      message: texts.message['log-001'],
      timestamp: FIXED_TIMESTAMP,
    },
    {
      id: 'log-002',
      level: 'info',
      source: 'tool-call',
      message: texts.message['log-002'],
      payload:
        '{\n  "tool": "collect_evidence",\n  "target": "BP_PlayerController",\n  "durationMs": 412\n}',
      timestamp: FIXED_TIMESTAMP,
    },
    {
      id: 'log-003',
      level: 'debug',
      source: 'bridge',
      message: texts.message['log-003'],
      payload: '{\n  "endpoint": "/snapshot/context",\n  "ok": true\n}',
      timestamp: FIXED_TIMESTAMP,
    },
    {
      id: 'log-004',
      level: 'warn',
      source: 'compile',
      message: texts.message['log-004'],
      timestamp: FIXED_TIMESTAMP,
    },
    {
      id: 'log-005',
      level: 'error',
      source: 'compile',
      message: texts.message['log-005'],
      payload: '{\n  "refusalReason": "compile_in_progress",\n  "attempt": 2\n}',
      timestamp: FIXED_TIMESTAMP,
    },
    {
      id: 'log-006',
      level: 'info',
      source: 'compile',
      message: texts.message['log-006'],
      timestamp: FIXED_TIMESTAMP,
    },
    {
      id: 'log-007',
      level: 'info',
      source: 'agent-state',
      message: texts.message['log-007'],
      timestamp: FIXED_TIMESTAMP,
    },
    {
      id: 'log-008',
      level: 'debug',
      source: 'pie',
      message: texts.message['log-008'],
      timestamp: FIXED_TIMESTAMP,
    },
    {
      id: 'log-009',
      level: 'info',
      source: 'agent-state',
      message: texts.message['log-009'],
      timestamp: FIXED_TIMESTAMP,
    },
    {
      id: 'log-010',
      level: 'info',
      source: 'agent-state',
      message: texts.message['log-010'],
      timestamp: FIXED_TIMESTAMP,
    },
  ];
}

export type AdvancedSectionTitleKey =
  | 'rawJsonTitle'
  | 'toolPayloadTitle'
  | 'evidencePackTitle'
  | 'preflightTitle'
  | 'stateMachineTitle'
  | 'compileLogTitle';

export interface AdvancedSection {
  id: string;
  titleKey: AdvancedSectionTitleKey;
  body: string;
}

export const MOCK_ADVANCED_SECTIONS: readonly AdvancedSection[] = [
  {
    id: 'advanced-raw-json',
    titleKey: 'rawJsonTitle',
    body: JSON.stringify(
      {
        snapshot: 'mock-snapshot-001',
        project: 'MyProject',
        engine: '5.4',
        capturedAt: FIXED_TIMESTAMP,
        currentAsset: {
          name: 'BP_PlayerController',
          path: '/Game/Blueprints/BP_PlayerController',
        },
        compileStatus: { errorCount: 0, warningCount: 2 },
      },
      null,
      2,
    ),
  },
  {
    id: 'advanced-tool-payload',
    titleKey: 'toolPayloadTitle',
    body: JSON.stringify(
      {
        tool: 'propose_fix',
        sessionId: 'mock-session-phase3',
        targetAsset: '/Game/Input/IMC_Default',
        arguments: { addMapping: { key: 'SpaceBar', action: 'IA_Jump' } },
      },
      null,
      2,
    ),
  },
  {
    id: 'advanced-evidence-pack',
    titleKey: 'evidencePackTitle',
    body: JSON.stringify(
      {
        evidencePackId: 'mock-pack-001',
        items: [
          {
            id: 'evidence-imc-default',
            assetName: 'IMC_Default',
            status: 'normal',
            finding: 'Input mapping context is bound but missing the IA_Jump Space-key entry.',
          },
          {
            id: 'evidence-bp-player-controller',
            assetName: 'BP_PlayerController',
            status: 'warning',
            finding:
              'PlayerController references IA_Jump on the Jump branch but the default context is not bound at runtime.',
          },
          {
            id: 'evidence-bp-player',
            assetName: 'BP_Player',
            status: 'normal',
            finding:
              'Player Blueprint wires the Jump handler correctly; no compile errors detected.',
          },
          {
            id: 'evidence-imc-gamepad',
            assetName: 'IMC_Gamepad',
            status: 'normal',
            finding:
              'Gamepad-only context is intact and registers a Gamepad face button for IA_Jump.',
          },
        ],
      },
      null,
      2,
    ),
  },
  {
    id: 'advanced-preflight',
    titleKey: 'preflightTitle',
    body: JSON.stringify(
      {
        passed: true,
        checks: [
          { id: 'target_scratch_allowlisted', passed: true },
          { id: 'typed_payload_valid', passed: true },
          { id: 'e85_canonical_target', passed: true },
        ],
      },
      null,
      2,
    ),
  },
  {
    id: 'advanced-state-machine',
    titleKey: 'stateMachineTitle',
    body: JSON.stringify(
      {
        currentState: 'done',
        history: [
          'draft',
          'diagnosing',
          'proposing',
          'payload_validating',
          'preflighting',
          'sandbox_duplicating',
          'sandbox_applying',
          'sandbox_compiling',
          'awaiting_approval',
          'promoting',
          'done',
        ],
      },
      null,
      2,
    ),
  },
  {
    id: 'advanced-compile-log',
    titleKey: 'compileLogTitle',
    body: [
      '[08:00:00.000] Compile started for /Game/Scratch/BP_OMUE_Scratch_Fixture_Sandbox',
      '[08:00:00.420] Blueprint graph compiled (0 errors, 0 warnings)',
      '[08:00:00.760] Default values refreshed',
      '[08:00:01.110] Compile finished in 1.11s',
    ].join('\n'),
  },
] as const;
