# Drawer Factual Source Convergence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Questions, Closure, Change Plan, and BP Change Workspace source-authoritative so real mode never mounts mock-only content as real capability.

**Architecture:** Add one pure Drawer authority adapter and one shared source-status component. `DrawerPanel` chooses between existing mock components, persisted-real read-only summaries, and unavailable states; Questions filters mock-only BT/BB questions in real mode, while navigation and Command Palette expose the same authority model.

**Tech Stack:** React, TypeScript, Node test runner, existing OMUE i18n/CSS, Electron formal Desktop capture.

## Global Constraints

- Workflow B; no implementation commit or push.
- Product code baseline: `cc9c926 handoff: converge factual source authority`.
- Renderer-only production changes.
- No shared protocol/Main/preload/renderer services/Bridge/UE plugin/Agent loop/dependency changes.
- No new endpoint, polling, protocol, cache, AI/LLM, WebSocket, compile, PIE, Automation or asset write.
- Existing mock components remain unchanged internally and may mount only in mock mode.
- All new source/unavailable/navigation copy must be typed Chinese and English.

---

### Task 1: Add failing Drawer authority tests

**Files:**
- Create: `apps/desktop/src/test/drawer-factual-source-convergence.test.ts`
- Test: `apps/desktop/src/test/drawer-factual-source-convergence.test.ts`

**Interfaces:**
- Consumes: current Drawer, Questions, Closure, Change Plan, BP Workspace and i18n source.
- Produces: regression contracts for `buildDrawerFactualSourceModel`.

- [ ] **Step 1: Add source precedence test cases**

Write tests expecting:

```ts
assert.equal(realLive.pages.questions.kind, 'live');
assert.equal(realCache.pages.questions.kind, 'cache');
assert.equal(mock.pages.questions.kind, 'mock');
assert.equal(realNoSnapshot.pages.questions.kind, 'unavailable');

assert.equal(mock.pages.closure.kind, 'mock');
assert.equal(terminalSession.pages.closure.kind, 'persisted-real');
assert.equal(activeSession.pages.closure.kind, 'unavailable');

assert.equal(mock.pages.changePlan.kind, 'mock');
assert.equal(sessionWithProposals.pages.changePlan.kind, 'persisted-real');
assert.equal(realNoProposals.pages.changePlan.kind, 'unavailable');

assert.equal(mock.pages.blueprintChangeWorkspace.kind, 'mock');
assert.equal(realLive.pages.blueprintChangeWorkspace.kind, 'unavailable');
```

- [ ] **Step 2: Add real mock-isolation source contracts**

Assert real source paths do not mount:

```text
ChangePlanPackageWorkspace
BlueprintChangeWorkspacePanel
InfrastructureClosurePanel
```

unless the corresponding authority is `mock`.

- [ ] **Step 3: Run Agent UI tests and confirm RED**

Run:

```powershell
npm -w @omue/desktop run test:agent-ui
```

Expected: fail because `drawerFactualSourceAdapter.ts` and required wiring do not exist.

---

### Task 2: Implement the pure Drawer authority adapter

**Files:**
- Create: `apps/desktop/src/renderer/components/workbench/drawerFactualSourceAdapter.ts`
- Test: `apps/desktop/src/test/drawer-factual-source-convergence.test.ts`

**Interfaces:**
- Consumes:

```ts
interface DrawerFactualSourceInput {
  isMockClient: boolean;
  snapshot: OmueContextSnapshot | null;
  bridgeError: string | null;
  selectedSession: RepairSessionRecord | null;
}
```

- Produces:

```ts
buildDrawerFactualSourceModel(
  input: DrawerFactualSourceInput,
): DrawerFactualSourceModel
```

- [ ] **Step 1: Define source and fact types**

Implement the exact source kinds and reasons from the design.

- [ ] **Step 2: Implement Questions precedence**

```ts
if (input.isMockClient) return mockFact(input.snapshot?.capturedAt ?? null);
if (input.snapshot && input.bridgeError) return cacheFact(input.snapshot.capturedAt);
if (input.snapshot) return liveFact(input.snapshot.capturedAt);
return unavailableFact('no-live-question-data');
```

- [ ] **Step 3: Implement terminal persisted Closure facts**

Only `done`, `escalated_done`, and `closed` sessions produce `persisted-real`.

Map actual:

```text
sessionId, scope, currentState, updatedAt, closedAt, closeReason,
targetAssetPath, proposalCount, hasSandbox, hasApproval, hasPromote
```

- [ ] **Step 4: Implement persisted Change Plan facts**

Map actual `selectedSession.proposals` without synthesizing IDs. Include typed payload operation kind only when present.

- [ ] **Step 5: Keep BP Workspace real unavailable**

Do not infer workspace capability from snapshot assets.

- [ ] **Step 6: Run focused/full Agent UI tests**

Run:

```powershell
npm -w @omue/desktop run test:agent-ui
```

Expected: adapter tests pass; remaining wiring tests may still fail.

---

### Task 3: Add shared source/unavailable presentation and typed copy

**Files:**
- Create: `apps/desktop/src/renderer/components/workbench/DrawerSourceStatus.tsx`
- Modify: `apps/desktop/src/renderer/i18n/types.ts`
- Modify: `apps/desktop/src/renderer/i18n/dict-en.ts`
- Modify: `apps/desktop/src/renderer/i18n/dict-zh.ts`
- Modify: `apps/desktop/src/renderer/styles/workbench.css`
- Test: `apps/desktop/src/test/drawer-factual-source-convergence.test.ts`

**Interfaces:**
- Consumes: `DrawerPageAuthority`.
- Produces:

```tsx
<DrawerSourceStatus authority={authority} copy={copy.ueAgentUi.drawer.sourceBoundary} />
<DrawerUnavailableState title={...} detail={...} />
```

- [ ] **Step 1: Add typed copy**

Add `ueAgentUi.drawer.sourceBoundary` with:

```text
sourceLabel, updatedAtLabel, kinds, reasons,
questionsNoLiveData,
closureUnavailableTitle/detail,
changePlanUnavailableTitle/detail,
blueprintWorkspaceUnavailableTitle/detail,
persistedClosureTitle and field labels,
persistedPlansTitle and field labels,
tabSourceAria,
commandUnavailableClosure,
commandUnavailableChangePlan,
commandUnavailableBlueprintWorkspace
```

- [ ] **Step 2: Implement source status and unavailable primitives**

Use semantic `data-drawer-source-kind` and existing CSS tokens. Do not hardcode colors or English copy.

- [ ] **Step 3: Add exact en/zh mapping tests**

Directly import dictionaries and assert all five kinds and eight reasons map to the exact intended values.

- [ ] **Step 4: Add CSS contracts**

Cover source badge/status and unavailable/persisted fact list with existing canonical variables.

- [ ] **Step 5: Run Agent UI tests and typecheck**

```powershell
npm -w @omue/desktop run test:agent-ui
npm run typecheck
```

Expected: pass for source presentation contracts.

---

### Task 4: Converge Questions and Closure

**Files:**
- Modify: `apps/desktop/src/renderer/components/InvestigationQuestionMatrixPanel.tsx`
- Modify: `apps/desktop/src/renderer/components/workbench/DrawerPanel.tsx`
- Test: `apps/desktop/src/test/drawer-factual-source-convergence.test.ts`

**Interfaces:**
- Questions receives:

```ts
includeMockBtBlackboardQuestions: boolean;
```

- Drawer consumes the authority model and source presentation.

- [ ] **Step 1: Gate BT/BB mock questions**

Generate current deterministic questions, then:

```ts
const allQuestions = includeMockBtBlackboardQuestions
  ? generatedQuestions
  : generatedQuestions.filter(question => question.category !== 'bt-blackboard');
```

Do not remove mock question definitions.

- [ ] **Step 2: Render Questions by authority**

- live/cache/mock: show source status then existing Question Matrix;
- unavailable: show source status and bilingual no-live-data state;
- pass `includeMockBtBlackboardQuestions={authority.kind === 'mock'}`.

- [ ] **Step 3: Render Closure by authority**

- mock: source status + existing `InfrastructureClosurePanel`;
- persisted-real: source status + read-only actual session closure facts;
- unavailable: source status + unavailable state;
- real mode must never mount `InfrastructureClosurePanel`.

- [ ] **Step 4: Add exact tests**

Prove:

```text
real Questions exclude every bt-blackboard item
mock Questions retain four bt-blackboard items
real Closure source cannot contain mock BT/BB/change-plan/manifest/approval gates
persisted Closure uses actual session ID/state/closeReason
```

- [ ] **Step 5: Run tests**

```powershell
npm -w @omue/desktop run test:agent-ui
```

Expected: pass.

---

### Task 5: Converge Change Plan, BP Workspace, tabs and Command Palette

**Files:**
- Modify: `apps/desktop/src/renderer/components/workbench/DrawerPanel.tsx`
- Modify: `apps/desktop/src/renderer/components/workbench/AgentWorkbenchShell.tsx`
- Modify: `apps/desktop/src/test/command-palette-drawer-workflow.test.ts`
- Test: `apps/desktop/src/test/drawer-factual-source-convergence.test.ts`

**Interfaces:**
- Consumes: `DrawerFactualSourceModel`.
- Produces: factual tab badges, command disabled state, mock/persisted/unavailable page branches.

- [ ] **Step 0: Build the model once in Shell**

In `AgentWorkbenchShell`, call:

```ts
const drawerSourceModel = buildDrawerFactualSourceModel({
  isMockClient,
  snapshot: state.bridge.snapshot,
  bridgeError: state.bridge.error,
  selectedSession: state.agent.selectedSession,
});
```

Use this exact object for command enablement and pass it to:

```tsx
<DrawerPanel sourceModel={drawerSourceModel} ... />
```

`DrawerPanel` must not build a second authority model.

- [ ] **Step 1: Gate Change Plan**

- mock: mount existing `ChangePlanPackageWorkspace`;
- persisted-real: render actual proposal facts from adapter;
- unavailable: render unavailable state;
- real path must not mount `ChangePlanPackageWorkspace`.

- [ ] **Step 2: Gate BP Change Workspace**

- mock: mount existing `BlueprintChangeWorkspacePanel`;
- real: unavailable state only;
- real path must not mount mock inventory/adapter component.

- [ ] **Step 3: Add tab source badges**

Questions, Closure, Change Plan and BP Workspace tabs receive the correct source badge and `data-drawer-source-kind`.

- [ ] **Step 4: Gate Command Palette**

Use the same authority model:

```text
Questions unavailable -> disabled context/source reason
Closure unavailable -> disabled typed reason
Change Plan unavailable -> disabled typed reason
BP Workspace unavailable -> disabled typed reason
```

Mock and persisted-real commands remain enabled.

- [ ] **Step 5: Add wiring tests**

Verify Drawer and Command Palette consume the same adapter model and unavailable commands always have non-empty bilingual reasons.

- [ ] **Step 6: Run tests, typecheck and build**

```powershell
npm -w @omue/desktop run test:agent-ui
npm run typecheck
npm run build
```

Expected: all pass.

---

### Task 6: Formal real/mock Desktop evidence

**Files:**
- Create/modify only: `.agent-bus-b/reports/artifacts/TASK-20260623-drawer-factual-source-convergence/**`

**Interfaces:**
- Consumes: formal Desktop build.
- Produces: 8 screenshots and JSON summary.

- [ ] **Step 1: Build deterministic capture harness**

Reuse the Handoff/Inspector pattern:

```text
formal Main
formal preload
deterministic real loopback bridge
default mock renderer
isolated profile
cleanup and default build restoration
```

- [ ] **Step 2: Capture real English pages**

```text
drawer-real-questions-en.png
drawer-real-closure-en.png
drawer-real-change-plan-en.png
drawer-real-bp-workspace-en.png
```

- [ ] **Step 3: Capture mock Chinese pages**

```text
drawer-mock-questions-zh.png
drawer-mock-closure-zh.png
drawer-mock-change-plan-zh.png
drawer-mock-bp-workspace-zh.png
```

- [ ] **Step 4: Record DOM assertions in both languages**

Assert real pages have no fixed mock IDs/content and mock pages are labeled Mock. Switch zh/en and verify source/unavailable copy for all four pages.

- [ ] **Step 5: Run final verification**

```powershell
npm -w @omue/desktop run test:agent-ui
npm run typecheck
npm run build
git diff --check
git diff -- packages/shared-protocol apps/desktop/src/main apps/desktop/src/preload apps/desktop/src/renderer/services plugins/OmueUnrealBridge package.json package-lock.json pnpm-lock.yaml apps/desktop/package.json
```

Expected: all pass; forbidden diff empty; default renderer restored; no env/profile/Electron process remains.
