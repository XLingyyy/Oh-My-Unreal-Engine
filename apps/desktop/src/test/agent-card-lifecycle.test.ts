import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type {
  AgentAssetSessionRecord,
  AgentProjectSessionRecord,
} from '@omue/shared-protocol';
import { REPAIR_SESSION_SCHEMA_VERSION } from '@omue/shared-protocol';
import {
  buildAgentCards,
  buildReplacementSessionRequest,
  resolveFailureRecoveryMode,
  sanitizeFailureDetails,
  type MapperEvent,
} from '../renderer/components/workbench/agentCardMapper';

const SESSION_ID = 'session-lifecycle';
const FIXTURE_TS = '2026-06-20T10:00:00.000Z';

function makeAssetSession(
  overrides?: Partial<AgentAssetSessionRecord>,
): AgentAssetSessionRecord {
  return {
    schemaVersion: REPAIR_SESSION_SCHEMA_VERSION,
    sessionId: SESSION_ID,
    scope: 'asset',
    userIntent: 'Repair the selected Blueprint',
    targetAssetPath: '/Game/Test/BP_A',
    parentSessionId: 'project-parent',
    inheritedEvidenceSummary: 'Parent diagnosis evidence',
    createdAt: FIXTURE_TS,
    updatedAt: '2026-06-20T10:04:00.000Z',
    currentState: 'diagnosing',
    retryCount: 0,
    maxRetries: 3,
    proposals: [],
    ...overrides,
  };
}

function makeProjectSession(
  overrides?: Partial<AgentProjectSessionRecord>,
): AgentProjectSessionRecord {
  return {
    schemaVersion: REPAIR_SESSION_SCHEMA_VERSION,
    sessionId: SESSION_ID,
    scope: 'project',
    userIntent: 'Diagnose project failures',
    createdAt: FIXTURE_TS,
    updatedAt: '2026-06-20T10:04:00.000Z',
    currentState: 'diagnosing',
    retryCount: 0,
    maxRetries: 3,
    proposals: [],
    ...overrides,
  };
}

function stateEvent(
  id: string,
  currentState: MapperEvent['currentState'],
  createdAt: string,
): MapperEvent {
  return {
    id,
    kind: 'state',
    sessionId: SESSION_ID,
    createdAt,
    currentState,
    retryCount: 0,
  };
}

test('lifecycle mapper aggregates multiple state events into one deterministic card', () => {
  const session = makeAssetSession({ currentState: 'preflighting' });
  const events = [
    stateEvent('state-diagnosing', 'diagnosing', '2026-06-20T10:01:00.000Z'),
    stateEvent('state-proposing', 'proposing', '2026-06-20T10:02:00.000Z'),
    stateEvent('state-preflighting', 'preflighting', '2026-06-20T10:03:00.000Z'),
  ];

  const forward = buildAgentCards(session, events);
  const reversed = buildAgentCards(session, events.slice().reverse());
  const lifecycleCards = forward.filter(card => card.kind === 'scan-status');

  assert.equal(lifecycleCards.length, 1);
  assert.equal(lifecycleCards[0]?.id, `scan:${SESSION_ID}:lifecycle`);
  assert.deepEqual(forward, reversed);
});

test('project lifecycle contains only diagnosis phases and a separate terminal result', () => {
  const session = makeProjectSession({
    currentState: 'done',
    closeReason: 'done',
  });
  const cards = buildAgentCards(session, [
    stateEvent('state-draft', 'draft', '2026-06-20T10:00:00.000Z'),
    stateEvent('state-diagnosing', 'diagnosing', '2026-06-20T10:01:00.000Z'),
    stateEvent('state-proposing', 'proposing', '2026-06-20T10:02:00.000Z'),
    stateEvent('state-done', 'done', '2026-06-20T10:03:00.000Z'),
  ]);
  const lifecycle = cards.find(card => card.kind === 'scan-status');
  assert.ok(lifecycle);
  if (lifecycle.kind === 'scan-status') {
    assert.deepEqual(
      lifecycle.data.steps.map(step => step.label),
      ['draft', 'diagnosing', 'proposing', 'done'],
    );
  }
});

test('asset lifecycle contains repair phases and factual resource count only', () => {
  const session = makeAssetSession({
    currentState: 'awaiting_approval',
    contextSnapshot: {
      compileIssues: [],
      blueprintSummary: {
        assetPath: '/Game/Test/BP_A',
        displayName: 'BP_A',
        assetClass: 'Blueprint',
        eligibility: 'unknown',
        dirtyState: 'clean',
        source: 'real_readonly_bridge',
      },
      collectedAt: '2026-06-20T10:01:00.000Z',
    },
  });
  const cards = buildAgentCards(session, [
    stateEvent('state-diagnosing', 'diagnosing', '2026-06-20T10:01:00.000Z'),
    stateEvent('state-awaiting', 'awaiting_approval', '2026-06-20T10:03:00.000Z'),
  ]);
  const lifecycle = cards.find(card => card.kind === 'scan-status');
  assert.ok(lifecycle);
  if (lifecycle.kind === 'scan-status') {
    assert.equal(lifecycle.data.scannedResources, 1);
    assert.ok(lifecycle.data.steps.some(step => step.label === 'sandbox_compiling'));
    assert.ok(lifecycle.data.steps.some(step => step.label === 'awaiting_approval'));
  }

  const noFacts = buildAgentCards(makeProjectSession(), [])
    .find(card => card.kind === 'scan-status');
  assert.ok(noFacts);
  if (noFacts.kind === 'scan-status') {
    assert.equal(noFacts.data.scannedResources, 0);
  }
});

test('failure detail sanitizer strips endpoint and nested URL credentials', () => {
  const sanitized = sanitizeFailureDetails({
    endpoint: 'https://alice:supersecret@example.com:8443/v1?q=x#frag',
    endpoints: [
      'http://bob:othersecret@127.0.0.1:21805/context/project?token=fake#hash',
    ],
    metadata: {
      note: 'retry https://carol:nestedsecret@example.net/private?q=1#frag safely',
      safeCode: 'bridge_unavailable',
    },
  });

  assert.deepEqual(sanitized?.endpoint, 'https://example.com:8443/v1');
  assert.deepEqual(sanitized?.endpoints, [
    'http://127.0.0.1:21805/context/project',
  ]);
  const serialized = JSON.stringify(sanitized);
  assert.doesNotMatch(
    serialized,
    /alice|supersecret|bob|othersecret|carol|nestedsecret|q=x|q=1|frag|token=fake/i,
  );
  assert.match(serialized, /safeCode|bridge_unavailable/);
});

test('failure detail sanitizer removes semantic secret keys across naming styles', () => {
  const sanitized = sanitizeFailureDetails({
    metadata: {
      apiKey: 'fake-api-key',
      api_key: 'fake-api-key',
      'api-key': 'fake-api-key',
      apiKeyRef: 'fake-key-ref',
      accessToken: 'fake-access-token',
      refreshToken: 'fake-refresh-token',
      authToken: 'fake-auth-token',
      clientSecret: 'fake-client-secret',
      privateKey: 'fake-private-key',
      password: 'fake-password',
      credential: 'fake-credential',
      Authorization: 'Basic fake-authorization',
      authorizationHeader: 'Basic fake-authorization-header',
      authHeader: 'Basic fake-auth-header',
      cookie: 'fake-cookie',
      setCookie: 'fake-set-cookie',
      rawProviderOutput: 'fake-provider-output',
      rawLlmOutput: 'fake-llm-output',
      providerResponse: 'fake-provider-response',
      safeCode: 'bridge_unavailable',
    },
  });

  assert.deepEqual(sanitized, {
    metadata: {
      safeCode: 'bridge_unavailable',
    },
  });
});

test('failure detail sanitizer removes complete authorization and credential payloads', () => {
  const sanitized = sanitizeFailureDetails({
    saveMessage: [
      'Authorization: Basic dXNlcjpwYXNz',
      'Proxy-Authorization: Basic cHJveHk6cGFzcw==',
      'Authorization: Bearer fake-bearer-credential',
      'apiKey=fake-api-key-value',
      'token=fake-token-value',
      'secret=fake-secret-value',
      'Bearer standalone-fake-credential',
      'sk-fakecredential123456',
    ].join('; '),
    reason: 'request failed but diagnostics remain safe',
  });

  const serialized = JSON.stringify(sanitized);
  assert.doesNotMatch(
    serialized,
    /dXNlcjpwYXNz|cHJveHk6cGFzcw|fake-bearer-credential|fake-api-key-value|fake-token-value|fake-secret-value|standalone-fake-credential|sk-fakecredential123456/i,
  );
  assert.match(serialized, /diagnostics remain safe/);
});

test('failure detail sanitizer preserves safe fields and all existing budgets', () => {
  const safeKeys = Object.fromEntries(
    Array.from({ length: 20 }, (_, index) => [`safe${String(index).padStart(2, '0')}`, index]),
  );
  const sanitized = sanitizeFailureDetails({
    phase: 'project_diagnosis',
    endpoint: 'http://127.0.0.1:21805/context/project?Authorization=Bearer-secret',
    statusCode: 503,
    persistence: 'persisted',
    context: {
      note: 'x'.repeat(500),
      safeArray: Array.from({ length: 12 }, (_, index) => index),
    },
    diagnostics: safeKeys,
    metadata: safeKeys,
  });

  assert.deepEqual(sanitized && {
    phase: sanitized.phase,
    endpoint: sanitized.endpoint,
    statusCode: sanitized.statusCode,
    persistence: sanitized.persistence,
  }, {
    phase: 'project_diagnosis',
    endpoint: 'http://127.0.0.1:21805/context/project',
    statusCode: 503,
    persistence: 'persisted',
  });
  assert.equal(
    typeof sanitized?.context === 'object'
      && sanitized.context !== null
      && !Array.isArray(sanitized.context)
      && typeof sanitized.context.note === 'string'
      ? sanitized.context.note.length
      : 0,
    240,
  );
  assert.equal(
    typeof sanitized?.context === 'object'
      && sanitized.context !== null
      && !Array.isArray(sanitized.context)
      && Array.isArray(sanitized.context.safeArray)
      ? sanitized.context.safeArray.length
      : 0,
    8,
  );
  assert.ok(
    typeof sanitized?.diagnostics === 'object'
      && sanitized.diagnostics !== null
      && !Array.isArray(sanitized.diagnostics)
      && Object.keys(sanitized.diagnostics).length <= 12,
  );
  assert.ok(JSON.stringify(sanitized).length < 1600);
});

test('failure detail sanitizer is deterministic across input key order', () => {
  const forward = sanitizeFailureDetails({
    phase: 'asset_repair',
    statusCode: 503,
    metadata: {
      safeCode: 'provider_unavailable',
      attempt: 2,
      accessToken: 'fake-secret',
    },
    context: {
      operation: 'diagnose',
      retryCount: 1,
    },
  });
  const reversed = sanitizeFailureDetails({
    context: {
      retryCount: 1,
      operation: 'diagnose',
    },
    metadata: {
      accessToken: 'fake-secret',
      attempt: 2,
      safeCode: 'provider_unavailable',
    },
    statusCode: 503,
    phase: 'asset_repair',
  });

  assert.deepEqual(forward, reversed);
});

test('replacement request preserves asset scope, intent, target, parent, and evidence', () => {
  const request = buildReplacementSessionRequest(makeAssetSession({
    currentState: 'escalated_done',
    closeReason: 'escalated',
  }));
  assert.deepEqual(request, {
    scope: 'asset',
    userIntent: 'Repair the selected Blueprint',
    targetAssetPath: '/Game/Test/BP_A',
    parentSessionId: 'project-parent',
    inheritedEvidenceSummary: 'Parent diagnosis evidence',
  });
});

test('failure recovery mode resumes interrupted sessions and retries terminal recoverable sessions', () => {
  assert.equal(
    resolveFailureRecoveryMode(
      makeAssetSession({ currentState: 'interrupted', closeReason: 'interrupted' }),
      true,
    ),
    'resume',
  );
  assert.equal(
    resolveFailureRecoveryMode(
      makeAssetSession({ currentState: 'escalated_done', closeReason: 'escalated' }),
      true,
    ),
    'retry-new',
  );
  assert.equal(
    resolveFailureRecoveryMode(
      makeAssetSession({ currentState: 'escalated_done', closeReason: 'escalated' }),
      false,
    ),
    'none',
  );
  assert.equal(
    resolveFailureRecoveryMode(makeAssetSession({ currentState: 'diagnosing' }), true),
    'none',
  );
});

test('ScanStatusCard uses scope-aware title and hides an unavailable numeric count', () => {
  const source = readFileSync(resolve(
    process.cwd(),
    'src/renderer/components/workbench/cards/ScanStatusCard.tsx',
  ), 'utf8');
  assert.match(source, /card\.title === 'Asset repair progress'/);
  assert.match(source, /card\.data\.scannedResources > 0/);
  assert.match(source, /t\.progressRecorded/);
  assert.doesNotMatch(source, /t\.scannedResources\(card\.data\.scannedResources\)[\s\S]*unconditional/);
});

test('FailureCard renders sanitized details and a renderer-injected recovery callback', () => {
  const failureSource = readFileSync(resolve(
    process.cwd(),
    'src/renderer/components/workbench/cards/FailureCard.tsx',
  ), 'utf8');
  const rendererSource = readFileSync(resolve(
    process.cwd(),
    'src/renderer/components/workbench/AgentCardRenderer.tsx',
  ), 'utf8');
  assert.match(failureSource, /recoveryAction/);
  assert.match(failureSource, /card\.data\.details/);
  assert.match(failureSource, /t\.detailsTitle/);
  assert.match(failureSource, /t\.nextStep/);
  assert.match(rendererSource, /<FailureCard[\s\S]*recoveryAction=\{failureRecovery\}/);
});

test('ChatPanel recovery wiring resumes interrupted sessions and retries terminal failures as new sessions', () => {
  const chatPanelSource = readFileSync(resolve(
    process.cwd(),
    'src/renderer/components/workbench/ChatPanel.tsx',
  ), 'utf8');
  const hookSource = readFileSync(resolve(
    process.cwd(),
    'src/renderer/hooks/useAgentWorkbenchState.ts',
  ), 'utf8');
  assert.match(chatPanelSource, /resolveFailureRecoveryMode/);
  assert.match(chatPanelSource, /mode === 'resume'[\s\S]*resumeSession/);
  assert.match(chatPanelSource, /mode === 'retry-new'[\s\S]*retrySessionAsNew/);
  assert.match(hookSource, /buildReplacementSessionRequest/);
  assert.match(hookSource, /const retrySessionAsNew/);
  assert.match(hookSource, /retrySessionAsNew,/);
});

test('CompletionCard distinguishes every close reason in user-facing copy', () => {
  const source = readFileSync(resolve(
    process.cwd(),
    'src/renderer/components/workbench/cards/CompletionCard.tsx',
  ), 'utf8');
  for (const copyKey of [
    'completedTitle',
    'escalatedTitle',
    'rejectedTitle',
    'cancelledTitle',
    'interruptedTitle',
  ]) {
    assert.match(source, new RegExp(`t\\.${copyKey}`));
  }
});

test('real recovery smoke uses production Electron and CDP instead of a skip placeholder', () => {
  const source = readFileSync(resolve(
    process.cwd(),
    'scripts/test-agent-real-recovery-smoke.mjs',
  ), 'utf8');
  assert.doesNotMatch(source, /echo\s+SKIP/i);
  assert.match(source, /VITE_OMUE_BRIDGE_MODE:\s*'real'/);
  assert.match(source, /remote-debugging-port/);
  assert.match(source, /Retry as new session/);
  assert.match(source, /originalSessionPreserved/);
  assert.match(source, /noExecutionSideEffects/);
});
