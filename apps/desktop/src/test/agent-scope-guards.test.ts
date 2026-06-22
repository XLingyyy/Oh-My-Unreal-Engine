import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canEnterExecutionState, canCallExecutionAction } from '../main/agent-session-validation';

test('canEnterExecutionState: project scope cannot enter execution states', () => {
  const blocked = [
    'payload_validating',
    'preflighting',
    'sandbox_duplicating',
    'sandbox_applying',
    'sandbox_compiling',
    'awaiting_approval',
    'promoting',
  ];
  for (const state of blocked) {
    assert.equal(canEnterExecutionState('project', state as never), false, `project should not enter ${state}`);
  }
});

test('canEnterExecutionState: project scope can stay in common states', () => {
  for (const state of ['draft', 'diagnosing', 'proposing', 'done', 'escalated_done', 'closed', 'interrupted']) {
    assert.equal(canEnterExecutionState('project', state as never), true);
  }
});

test('canCallExecutionAction: project scope rejects all execution actions', () => {
  for (const action of ['approve', 'reject', 'apply-sandbox', 'duplicate-sandbox', 'compile-sandbox', 'promote'] as const) {
    assert.equal(canCallExecutionAction('project', action), false);
  }
});

test('canCallExecutionAction: asset scope accepts all execution actions', () => {
  for (const action of ['approve', 'reject', 'apply-sandbox', 'duplicate-sandbox', 'compile-sandbox', 'promote'] as const) {
    assert.equal(canCallExecutionAction('asset', action), true);
  }
});
