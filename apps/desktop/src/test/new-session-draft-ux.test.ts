import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const desktopRoot = process.cwd();
const readSource = (relativePath: string): string =>
  readFileSync(resolve(desktopRoot, relativePath), 'utf8');

// ── Hook contract: useAgentWorkbenchState ──

test('hook source exposes isDraftSession state', () => {
  const src = readSource('src/renderer/hooks/useAgentWorkbenchState.ts');
  assert.match(src, /isDraftSession/, 'hook must declare isDraftSession');
});

test('hook source exposes draftFocusRequestId state', () => {
  const src = readSource('src/renderer/hooks/useAgentWorkbenchState.ts');
  assert.match(src, /draftFocusRequestId/, 'hook must declare draftFocusRequestId');
});

test('hook source exposes selectSession callback', () => {
  const src = readSource('src/renderer/hooks/useAgentWorkbenchState.ts');
  assert.match(src, /selectSession/, 'hook must declare selectSession');
});

test('hook source exposes handleNewSession callback', () => {
  const src = readSource('src/renderer/hooks/useAgentWorkbenchState.ts');
  assert.match(src, /handleNewSession/, 'hook must declare handleNewSession');
});

test('hook return object includes isDraftSession and draftFocusRequestId', () => {
  const src = readSource('src/renderer/hooks/useAgentWorkbenchState.ts');
  const agentReturnMatch = src.match(/agent:\s*\{[^}]*\}/s);
  assert.ok(agentReturnMatch, 'hook must return an agent object');
  const agentBlock = agentReturnMatch![0];
  assert.match(agentBlock, /isDraftSession/, 'agent return must include isDraftSession');
  assert.match(agentBlock, /draftFocusRequestId/, 'agent return must include draftFocusRequestId');
  assert.match(agentBlock, /selectSession/, 'agent return must include selectSession');
  assert.match(agentBlock, /handleNewSession/, 'agent return must include handleNewSession');
});

test('auto-selection effect has explicit draft guard', () => {
  const src = readSource('src/renderer/hooks/useAgentWorkbenchState.ts');
  assert.match(
    src,
    /if\s*\(\s*isDraftSession\s*\)/,
    'auto-selection effect must return early when isDraftSession is true',
  );
});

test('handleNewSession sets draft state and increments focus request', () => {
  const src = readSource('src/renderer/hooks/useAgentWorkbenchState.ts');
  const handleNewSessionIdx = src.indexOf('handleNewSession = useCallback');
  assert.ok(handleNewSessionIdx >= 0, 'handleNewSession must be a useCallback');
  const block = src.substring(handleNewSessionIdx, handleNewSessionIdx + 500);
  assert.match(block, /setIsDraftSession\s*\(\s*true\s*\)/, 'handleNewSession must set isDraftSession to true');
  assert.match(block, /setSelectedSessionId\s*\(\s*null\s*\)/, 'handleNewSession must clear selectedSessionId');
  assert.match(block, /setDraftFocusRequestId/, 'handleNewSession must increment draftFocusRequestId');
});

test('handleNewSession does not call start, refresh, or IPC', () => {
  const src = readSource('src/renderer/hooks/useAgentWorkbenchState.ts');
  const handleNewSessionIdx = src.indexOf('handleNewSession = useCallback');
  assert.ok(handleNewSessionIdx >= 0, 'handleNewSession useCallback block must exist');
  const block = src.substring(handleNewSessionIdx, handleNewSessionIdx + 500);
  assert.doesNotMatch(block, /startSession/, 'handleNewSession must not call startSession');
  assert.doesNotMatch(block, /refreshSessions/, 'handleNewSession must not call refreshSessions');
  assert.doesNotMatch(block, /window\.omue/, 'handleNewSession must not call IPC');
});

test('successful startSessionWithIntent exits draft', () => {
  const src = readSource('src/renderer/hooks/useAgentWorkbenchState.ts');
  const startIdx = src.indexOf('startSessionWithIntent = useCallback');
  assert.ok(startIdx >= 0, 'startSessionWithIntent must exist');
  const block = src.substring(startIdx, startIdx + 1500);
  assert.match(block, /setIsDraftSession\s*\(\s*false\s*\)/, 'startSessionWithIntent must exit draft on success');
});

test('successful resumeSession exits draft', () => {
  const src = readSource('src/renderer/hooks/useAgentWorkbenchState.ts');
  const resumeIdx = src.indexOf('resumeSession = useCallback');
  assert.ok(resumeIdx >= 0, 'resumeSession must exist');
  const block = src.substring(resumeIdx, resumeIdx + 600);
  assert.match(block, /setIsDraftSession\s*\(\s*false\s*\)/, 'resumeSession must exit draft on success');
});

test('entering draft does not mutate sessions array', () => {
  const src = readSource('src/renderer/hooks/useAgentWorkbenchState.ts');
  const handleNewSessionIdx = src.indexOf('handleNewSession = useCallback');
  assert.ok(handleNewSessionIdx >= 0, 'handleNewSession useCallback block must exist');
  const block = src.substring(handleNewSessionIdx, handleNewSessionIdx + 500);
  assert.doesNotMatch(block, /setSessions/, 'handleNewSession must not call setSessions');
});

test('selectSession exits draft and selects existing session', () => {
  const src = readSource('src/renderer/hooks/useAgentWorkbenchState.ts');
  const selectIdx = src.indexOf('selectSession = useCallback');
  assert.ok(selectIdx >= 0, 'selectSession must exist as useCallback');
  const block = src.substring(selectIdx, selectIdx + 300);
  assert.match(block, /setIsDraftSession\s*\(\s*false\s*\)/, 'selectSession must exit draft');
  assert.match(block, /setSelectedSessionId/, 'selectSession must set selectedSessionId');
});

// ── ChatHeader contract ──

test('ChatHeader accepts isDraftSession prop', () => {
  const src = readSource('src/renderer/components/workbench/ChatHeader.tsx');
  assert.match(src, /isDraftSession/, 'ChatHeader must accept isDraftSession prop');
});

test('ChatHeader renders draft session label when draft is active', () => {
  const src = readSource('src/renderer/components/workbench/ChatHeader.tsx');
  assert.match(src, /draftSessionLabel/, 'ChatHeader must use draftSessionLabel copy');
});

test('ChatHeader preserves existing session options during draft', () => {
  const src = readSource('src/renderer/components/workbench/ChatHeader.tsx');
  assert.match(src, /sessions\.map/, 'ChatHeader must still render existing sessions');
});

test('ChatHeader renders non-interactive draft label when no sessions exist', () => {
  const src = readSource('src/renderer/components/workbench/ChatHeader.tsx');
  assert.match(src, /data-session-mode/, 'ChatHeader must have data-session-mode marker for draft');
});

// ── ChatInputV2 contract ──

test('ChatInputV2 accepts focusRequestId prop', () => {
  const src = readSource('src/renderer/components/workbench/ChatInputV2.tsx');
  assert.match(src, /focusRequestId/, 'ChatInputV2 must accept focusRequestId prop');
});

test('ChatInputV2 uses textarea ref for focus', () => {
  const src = readSource('src/renderer/components/workbench/ChatInputV2.tsx');
  assert.match(src, /useRef\s*<\s*HTMLTextAreaElement\s*>/, 'ChatInputV2 must use a textarea ref');
});

test('ChatInputV2 focuses textarea on focusRequestId change', () => {
  const src = readSource('src/renderer/components/workbench/ChatInputV2.tsx');
  assert.match(src, /\.focus\s*\(\s*\)/, 'ChatInputV2 must call focus() on the textarea');
  assert.match(src, /focusRequestId\s*>\s*0/, 'ChatInputV2 must only focus when focusRequestId > 0');
});

test('ChatInputV2 textarea has data-workbench-chat-input attribute', () => {
  const src = readSource('src/renderer/components/workbench/ChatInputV2.tsx');
  assert.match(src, /data-workbench-chat-input/, 'textarea must have data-workbench-chat-input');
});

test('ChatInputV2 does not use unconditional autoFocus', () => {
  const src = readSource('src/renderer/components/workbench/ChatInputV2.tsx');
  assert.doesNotMatch(src, /autoFocus/, 'ChatInputV2 must not use autoFocus');
});

// ── ChatPanel contract ──

test('ChatPanel passes isDraftSession to ChatHeader', () => {
  const src = readSource('src/renderer/components/workbench/ChatPanel.tsx');
  assert.match(src, /isDraftSession/, 'ChatPanel must pass isDraftSession to ChatHeader');
});

test('ChatPanel passes focusRequestId to ChatInputV2', () => {
  const src = readSource('src/renderer/components/workbench/ChatPanel.tsx');
  assert.match(src, /focusRequestId/, 'ChatPanel must pass focusRequestId to ChatInputV2');
});

test('ChatPanel renders draft empty state with data-session-mode', () => {
  const src = readSource('src/renderer/components/workbench/ChatPanel.tsx');
  assert.match(src, /data-session-mode\s*=\s*"draft"/, 'ChatPanel must render draft empty state with data-session-mode="draft"');
});

test('ChatPanel draft empty state shows draft title', () => {
  const src = readSource('src/renderer/components/workbench/ChatPanel.tsx');
  assert.match(src, /draftTitle/, 'ChatPanel must show draftTitle in draft empty state');
});

test('ChatPanel draft empty state shows draft detail', () => {
  const src = readSource('src/renderer/components/workbench/ChatPanel.tsx');
  assert.match(src, /draftDetail/, 'ChatPanel must show draftDetail in draft empty state');
});

test('ChatPanel handleSelectSession uses selectSession to exit draft', () => {
  const src = readSource('src/renderer/components/workbench/ChatPanel.tsx');
  assert.match(src, /selectSession/, 'ChatPanel must use selectSession for session selection');
});

test('ChatPanel preserves handleSendIntent calling startSessionWithIntent', () => {
  const src = readSource('src/renderer/components/workbench/ChatPanel.tsx');
  assert.match(src, /startSessionWithIntent\s*\(\s*request\s*\)/, 'ChatPanel must call startSessionWithIntent(request)');
});

test('ChatPanel preserves provider-required wiring', () => {
  const src = readSource('src/renderer/components/workbench/ChatPanel.tsx');
  assert.match(src, /providerReady/, 'ChatPanel must retain providerReady prop');
});

test('ChatPanel preserves resume-interrupted wiring', () => {
  const src = readSource('src/renderer/components/workbench/ChatPanel.tsx');
  assert.match(src, /resumeInterrupted|resumeSession|handleResumeInterrupted/, 'ChatPanel must retain resume-interrupted wiring');
});

// ── i18n contract ──

test('i18n types include draftSessionLabel in chatHeader', () => {
  const src = readSource('src/renderer/i18n/types.ts');
  assert.match(src, /draftSessionLabel/, 'types.ts must include draftSessionLabel in chatHeader');
});

test('i18n types include draftTitle in chatInput', () => {
  const src = readSource('src/renderer/i18n/types.ts');
  assert.match(src, /draftTitle/, 'types.ts must include draftTitle in chatInput');
});

test('i18n types include draftDetail in chatInput', () => {
  const src = readSource('src/renderer/i18n/types.ts');
  assert.match(src, /draftDetail/, 'types.ts must include draftDetail in chatInput');
});

test('English dictionary includes draft copy', () => {
  const src = readSource('src/renderer/i18n/dict-en.ts');
  assert.match(src, /Draft\s*·\s*New session/, 'English dict must include draft session label');
  assert.match(src, /New session draft/, 'English dict must include draft title');
  assert.match(src, /A real session will be created only after you send/, 'English dict must include draft detail');
});

test('Chinese dictionary includes draft copy', () => {
  const src = readSource('src/renderer/i18n/dict-zh.ts');
  assert.match(src, /草稿\s*·\s*新会话/, 'Chinese dict must include draft session label');
  assert.match(src, /新会话草稿/, 'Chinese dict must include draft title');
  assert.match(src, /只有发送后才会创建真实会话/, 'Chinese dict must include draft detail');
});

// ── CSS contract ──

test('workbench.css includes draft empty state styles', () => {
  const src = readSource('src/renderer/components/workbench/workbench.css');
  assert.match(src, /data-session-mode/, 'CSS must style draft empty state via data-session-mode');
});

// ── Forbidden scope ──

test('forbidden scope: shared-protocol is untouched', () => {
  const src = readSource('src/renderer/hooks/useAgentWorkbenchState.ts');
  assert.doesNotMatch(src, /from\s+['"]@omue\/shared-protocol['"].*import/, 'hook must not add new shared-protocol imports for draft');
});

test('forbidden scope: no synthetic RepairSessionRecord created for draft', () => {
  const hookSrc = readSource('src/renderer/hooks/useAgentWorkbenchState.ts');
  const chatPanelSrc = readSource('src/renderer/components/workbench/ChatPanel.tsx');
  const combined = hookSrc + chatPanelSrc;
  assert.doesNotMatch(combined, /RepairSessionRecord\s*\(\s*\{.*draft/s, 'must not create synthetic RepairSessionRecord for draft');
});

test('forbidden scope: no new dependency introduced', () => {
  const pkgSrc = readSource('../../package.json');
  assert.doesNotMatch(pkgSrc, /draft/, 'root package.json must not gain draft-related dependencies');
});

// ── Start timing contract ──

test('auto-selection effect guards against pending start session', () => {
  const src = readSource('src/renderer/hooks/useAgentWorkbenchState.ts');
  assert.match(src, /pendingStartSessionIdRef/, 'hook must declare pendingStartSessionIdRef');
  const effectIdx = src.indexOf('useEffect(() => {\n    if (isDraftSession) return;');
  assert.ok(effectIdx >= 0, 'auto-selection effect must exist with draft guard');
  const block = src.substring(effectIdx, effectIdx + 600);
  assert.match(block, /pendingStartSessionIdRef\.current/, 'auto-selection effect must check pendingStartSessionIdRef.current');
});

test('startSession sets pending ref before exiting draft on success', () => {
  const src = readSource('src/renderer/hooks/useAgentWorkbenchState.ts');
  const startIdx = src.indexOf('startSession = useCallback');
  assert.ok(startIdx >= 0, 'startSession must exist');
  const block = src.substring(startIdx, startIdx + 1200);
  const pendingIdx = block.indexOf('pendingStartSessionIdRef.current = result.sessionId');
  const draftExitIdx = block.indexOf('setIsDraftSession(false)');
  assert.ok(pendingIdx >= 0, 'startSession must set pendingStartSessionIdRef.current');
  assert.ok(draftExitIdx >= 0, 'startSession must exit draft');
  assert.ok(pendingIdx < draftExitIdx, 'pendingStartSessionIdRef must be set BEFORE setIsDraftSession(false)');
});

test('startSessionWithIntent sets pending ref before exiting draft on success', () => {
  const src = readSource('src/renderer/hooks/useAgentWorkbenchState.ts');
  const startIdx = src.indexOf('startSessionWithIntent = useCallback');
  assert.ok(startIdx >= 0, 'startSessionWithIntent must exist');
  const block = src.substring(startIdx, startIdx + 1500);
  const pendingIdx = block.indexOf('pendingStartSessionIdRef.current = result.sessionId');
  const draftExitIdx = block.indexOf('setIsDraftSession(false)');
  assert.ok(pendingIdx >= 0, 'startSessionWithIntent must set pendingStartSessionIdRef.current');
  assert.ok(draftExitIdx >= 0, 'startSessionWithIntent must exit draft');
  assert.ok(pendingIdx < draftExitIdx, 'pendingStartSessionIdRef must be set BEFORE setIsDraftSession(false)');
});

test('startSession wraps refreshSessions in try/finally for pending cleanup', () => {
  const src = readSource('src/renderer/hooks/useAgentWorkbenchState.ts');
  const startIdx = src.indexOf('startSession = useCallback');
  assert.ok(startIdx >= 0, 'startSession must exist');
  const block = src.substring(startIdx, startIdx + 1200);
  const pendingIdx = block.indexOf('pendingStartSessionIdRef.current = result.sessionId');
  assert.ok(pendingIdx >= 0, 'startSession must set pendingStartSessionIdRef.current');
  // Scope the search to the inner try/finally that follows the pending-ref assignment.
  const innerBlock = block.substring(pendingIdx);
  const tryIdx = innerBlock.indexOf('try {');
  const refreshIdx = innerBlock.indexOf('await refreshSessions()');
  const finallyIdx = innerBlock.indexOf('} finally {');
  const clearIdx = innerBlock.indexOf('pendingStartSessionIdRef.current = null');
  assert.ok(tryIdx >= 0, 'startSession must use try block after pending ref');
  assert.ok(refreshIdx >= 0, 'startSession must call refreshSessions');
  assert.ok(finallyIdx >= 0, 'startSession must use finally block');
  assert.ok(clearIdx >= 0, 'startSession must clear pendingStartSessionIdRef');
  assert.ok(tryIdx < refreshIdx, 'refreshSessions must be inside try block');
  assert.ok(refreshIdx < finallyIdx, 'finally must follow refreshSessions');
  assert.ok(finallyIdx < clearIdx, 'pending ref clear must be inside finally block');
});

test('startSessionWithIntent wraps refreshSessions in try/finally for pending cleanup', () => {
  const src = readSource('src/renderer/hooks/useAgentWorkbenchState.ts');
  const startIdx = src.indexOf('startSessionWithIntent = useCallback');
  assert.ok(startIdx >= 0, 'startSessionWithIntent must exist');
  const block = src.substring(startIdx, startIdx + 1500);
  const pendingIdx = block.indexOf('pendingStartSessionIdRef.current = result.sessionId');
  assert.ok(pendingIdx >= 0, 'startSessionWithIntent must set pendingStartSessionIdRef.current');
  // Scope the search to the inner try/finally that follows the pending-ref assignment.
  const innerBlock = block.substring(pendingIdx);
  const tryIdx = innerBlock.indexOf('try {');
  const refreshIdx = innerBlock.indexOf('await refreshSessions()');
  const finallyIdx = innerBlock.indexOf('} finally {');
  const clearIdx = innerBlock.indexOf('pendingStartSessionIdRef.current = null');
  assert.ok(tryIdx >= 0, 'startSessionWithIntent must use try block after pending ref');
  assert.ok(refreshIdx >= 0, 'startSessionWithIntent must call refreshSessions');
  assert.ok(finallyIdx >= 0, 'startSessionWithIntent must use finally block');
  assert.ok(clearIdx >= 0, 'startSessionWithIntent must clear pendingStartSessionIdRef');
  assert.ok(tryIdx < refreshIdx, 'refreshSessions must be inside try block');
  assert.ok(refreshIdx < finallyIdx, 'finally must follow refreshSessions');
  assert.ok(finallyIdx < clearIdx, 'pending ref clear must be inside finally block');
});

test('selectSession clears pending start guard', () => {
  const src = readSource('src/renderer/hooks/useAgentWorkbenchState.ts');
  const selectIdx = src.indexOf('selectSession = useCallback');
  assert.ok(selectIdx >= 0, 'selectSession must exist as useCallback');
  const block = src.substring(selectIdx, selectIdx + 300);
  assert.match(block, /pendingStartSessionIdRef\.current\s*=\s*null/, 'selectSession must clear pendingStartSessionIdRef');
});

test('handleNewSession clears pending start guard', () => {
  const src = readSource('src/renderer/hooks/useAgentWorkbenchState.ts');
  const handleNewSessionIdx = src.indexOf('handleNewSession = useCallback');
  assert.ok(handleNewSessionIdx >= 0, 'handleNewSession useCallback block must exist');
  const block = src.substring(handleNewSessionIdx, handleNewSessionIdx + 500);
  assert.match(block, /pendingStartSessionIdRef\.current\s*=\s*null/, 'handleNewSession must clear pendingStartSessionIdRef');
});

test('startSession failure throws before exiting draft', () => {
  const src = readSource('src/renderer/hooks/useAgentWorkbenchState.ts');
  const startIdx = src.indexOf('startSession = useCallback');
  assert.ok(startIdx >= 0, 'startSession must exist');
  const block = src.substring(startIdx, startIdx + 1200);
  const throwIdx = block.indexOf('throw new Error(result.message)');
  const draftExitIdx = block.indexOf('setIsDraftSession(false)');
  assert.ok(throwIdx >= 0, 'startSession must throw on result.ok === false');
  assert.ok(draftExitIdx >= 0, 'startSession must have draft exit code');
  assert.ok(throwIdx < draftExitIdx, 'failure throw must occur BEFORE setIsDraftSession(false)');
});

test('startSessionWithIntent failure throws before exiting draft', () => {
  const src = readSource('src/renderer/hooks/useAgentWorkbenchState.ts');
  const startIdx = src.indexOf('startSessionWithIntent = useCallback');
  assert.ok(startIdx >= 0, 'startSessionWithIntent must exist');
  const block = src.substring(startIdx, startIdx + 1500);
  const throwIdx = block.indexOf('throw new Error(result.message)');
  const draftExitIdx = block.indexOf('setIsDraftSession(false)');
  assert.ok(throwIdx >= 0, 'startSessionWithIntent must throw on result.ok === false');
  assert.ok(draftExitIdx >= 0, 'startSessionWithIntent must have draft exit code');
  assert.ok(throwIdx < draftExitIdx, 'failure throw must occur BEFORE setIsDraftSession(false)');
});

test('pendingStartSessionIdRef is declared with useRef', () => {
  const src = readSource('src/renderer/hooks/useAgentWorkbenchState.ts');
  assert.match(src, /pendingStartSessionIdRef\s*=\s*useRef/, 'pendingStartSessionIdRef must be a useRef');
});
