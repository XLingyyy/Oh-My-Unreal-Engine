import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  findFirstEnabledCommandIndex,
  findNextEnabledCommandIndex,
  normalizeEnabledCommandIndex,
} from '../renderer/hooks/commandPaletteNavigation';
import { DRAWER_ITEM_IDS } from '../renderer/hooks/drawerNavigation';

const desktopRoot = process.cwd();
const sourcePath = (relativePath: string): string => resolve(desktopRoot, relativePath);
const readSource = (relativePath: string): string =>
  readFileSync(sourcePath(relativePath), 'utf8');

const commandNavigationPath = 'src/renderer/hooks/commandPaletteNavigation.ts';
const drawerNavigationPath = 'src/renderer/hooks/drawerNavigation.ts';

test('pure command and Drawer navigation boundaries exist', () => {
  assert.equal(existsSync(sourcePath(commandNavigationPath)), true);
  assert.equal(existsSync(sourcePath(drawerNavigationPath)), true);
});

test('agent test tsconfig includes both pure navigation helpers', () => {
  const src = readSource('tsconfig.agent-tests.json');
  assert.match(src, /renderer\/hooks\/commandPaletteNavigation\.ts/);
  assert.match(src, /renderer\/hooks\/drawerNavigation\.ts/);
});

test('Drawer registry contains exactly the seven real content IDs', () => {
  assert.deepEqual(DRAWER_ITEM_IDS, [
    'session-notes',
    'queue',
    'questions',
    'handoff',
    'closure',
    'change-plan',
    'bp-change-workspace',
  ]);
});

test('findFirstEnabledCommandIndex returns the first enabled command', () => {
  assert.equal(findFirstEnabledCommandIndex([{ disabled: true }, {}]), 1);
  assert.equal(findFirstEnabledCommandIndex([{}, { disabled: true }]), 0);
});

test('findFirstEnabledCommandIndex returns -1 when none are enabled', () => {
  assert.equal(findFirstEnabledCommandIndex([]), -1);
  assert.equal(findFirstEnabledCommandIndex([{ disabled: true }]), -1);
});

test('findNextEnabledCommandIndex skips disabled commands and wraps forward', () => {
  const commands = [{}, { disabled: true }, {}];
  assert.equal(findNextEnabledCommandIndex(commands, 0, 1), 2);
  assert.equal(findNextEnabledCommandIndex(commands, 2, 1), 0);
});

test('findNextEnabledCommandIndex skips disabled commands and wraps backward', () => {
  const commands = [{}, { disabled: true }, {}];
  assert.equal(findNextEnabledCommandIndex(commands, 2, -1), 0);
  assert.equal(findNextEnabledCommandIndex(commands, 0, -1), 2);
});

test('findNextEnabledCommandIndex handles invalid selection and no enabled commands', () => {
  assert.equal(findNextEnabledCommandIndex([{ disabled: true }, {}], -1, 1), 1);
  assert.equal(findNextEnabledCommandIndex([{ disabled: true }, {}], -1, -1), 1);
  assert.equal(findNextEnabledCommandIndex([{ disabled: true }], -1, 1), -1);
});

test('normalizeEnabledCommandIndex preserves enabled selection or chooses first enabled', () => {
  const commands = [{ disabled: true }, {}, {}];
  assert.equal(normalizeEnabledCommandIndex(commands, 2), 2);
  assert.equal(normalizeEnabledCommandIndex(commands, 0), 1);
  assert.equal(normalizeEnabledCommandIndex(commands, 99), 1);
  assert.equal(normalizeEnabledCommandIndex([{ disabled: true }], 0), -1);
});

test('command model exposes keywords and disabled reason', () => {
  const src = readSource('src/renderer/hooks/useCommandPalette.ts');
  assert.match(src, /keywords\?:\s*string\[\]/);
  assert.match(src, /disabledReason\?:\s*string/);
});

test('New Session command enters Chat and delegates to handleNewSession', () => {
  const src = readSource('src/renderer/components/workbench/AgentWorkbenchShell.tsx');
  const start = src.indexOf("id: 'new-session'");
  assert.notEqual(start, -1);
  const block = src.slice(start, start + 500);
  assert.match(block, /setActiveView\(\s*['"]chat['"]\s*\)/);
  assert.match(block, /state\.agent\.handleNewSession\(\)/);
  assert.doesNotMatch(block, /run:\s*focusChatInput/);
  assert.doesNotMatch(block, /startSession|refreshSessions|window\.omue/);
});

test('command list contains only factual command families', () => {
  const src = readSource('src/renderer/components/workbench/AgentWorkbenchShell.tsx');
  for (const id of [
    'new-session',
    'resume-interrupted',
    'refresh-context',
    'open-settings',
    'focus-chat-input',
  ]) {
    assert.match(src, new RegExp(`['"]${id}['"]`));
  }
  assert.doesNotMatch(
    src,
    /id:\s*['"][^'"]*(?:approve|reject|promote|cancel|discard|compile|pie|automation|write|rollback|test-connection)[^'"]*['"]/i,
  );
});

test('every disabled command has a typed non-empty reason', () => {
  const shell = readSource('src/renderer/components/workbench/AgentWorkbenchShell.tsx');
  assert.match(shell, /disabledReason:/);
  assert.match(shell, /resumeUnavailable/);
  assert.match(shell, /refreshInProgress/);
  assert.match(shell, /contextRequired/);
  const hook = readSource('src/renderer/hooks/useCommandPalette.ts');
  assert.match(hook, /command\.disabled\s*&&\s*!command\.disabledReason\?\.trim\(\)/);
});

test('Drawer registry is the only DrawerItem type source', () => {
  const registry = readSource(drawerNavigationPath);
  for (const id of [
    'session-notes',
    'queue',
    'questions',
    'handoff',
    'closure',
    'change-plan',
    'bp-change-workspace',
  ]) {
    assert.match(registry, new RegExp(`['"]${id}['"]`));
  }
  assert.match(registry, /export type DrawerItem\s*=\s*typeof DRAWER_ITEM_IDS\[number\]/);

  const state = readSource('src/renderer/hooks/useAgentWorkbenchState.ts');
  assert.match(state, /import type \{ DrawerItem \} from ['"]\.\/drawerNavigation['"]/);
  assert.doesNotMatch(state, /export type DrawerItem\s*=/);
});

test('Shell Drawer commands and Drawer tabs consume the shared registry', () => {
  const shell = readSource('src/renderer/components/workbench/AgentWorkbenchShell.tsx');
  const drawer = readSource('src/renderer/components/workbench/DrawerPanel.tsx');
  assert.match(shell, /DRAWER_ITEM_IDS/);
  assert.match(drawer, /DRAWER_ITEM_IDS/);
  assert.doesNotMatch(shell, /const DRAWER_COMMANDS/);
  assert.doesNotMatch(drawer, /const DRAWER_ITEMS/);
});

test('Drawer render branches cover every registered item', () => {
  const drawer = readSource('src/renderer/components/workbench/DrawerPanel.tsx');
  for (const id of [
    'session-notes',
    'queue',
    'questions',
    'handoff',
    'closure',
    'change-plan',
    'bp-change-workspace',
  ]) {
    assert.match(drawer, new RegExp(`['"]${id}['"]`), `missing render branch for ${id}`);
  }
});

test('command palette has dialog, listbox, option and stable command IDs', () => {
  const src = readSource('src/renderer/components/workbench/CommandPalette.tsx');
  assert.match(src, /role="dialog"/);
  assert.match(src, /aria-modal="true"/);
  assert.match(src, /role="listbox"/);
  assert.match(src, /role="option"/);
  assert.match(src, /data-command-id=\{command\.id\}/);
  assert.match(src, /aria-selected=/);
  assert.match(src, /aria-disabled=/);
});

test('disabled command pointer and keyboard paths cannot select or execute', () => {
  const component = readSource('src/renderer/components/workbench/CommandPalette.tsx');
  assert.match(component, /if\s*\(\s*!command\.disabled\s*\)\s*setSelectedIndex/);
  assert.match(component, /command\.disabledReason/);
  const hook = readSource('src/renderer/hooks/useCommandPalette.ts');
  assert.match(hook, /findNextEnabledCommandIndex/);
  assert.match(hook, /normalizeEnabledCommandIndex/);
  assert.match(hook, /if\s*\(\s*!selected\s*\|\|\s*selected\.disabled\s*\)\s*return/);
});

test('palette close restores focus and Shell Escape gives palette priority', () => {
  const palette = readSource('src/renderer/components/workbench/CommandPalette.tsx');
  assert.match(palette, /previousFocusRef/);
  assert.match(palette, /data-workbench-chat-input/);
  assert.match(palette, /workbench-root/);

  const shell = readSource('src/renderer/components/workbench/AgentWorkbenchShell.tsx');
  assert.match(shell, /if\s*\(\s*palette\.isOpen\s*\)\s*return/);
});

test('Drawer uses tab semantics, roving tabindex and keyboard navigation', () => {
  const src = readSource('src/renderer/components/workbench/DrawerPanel.tsx');
  assert.match(src, /role="dialog"/);
  assert.match(src, /role="tablist"/);
  assert.match(src, /role="tab"/);
  assert.match(src, /tabIndex=\{/);
  assert.match(src, /ArrowLeft/);
  assert.match(src, /ArrowRight/);
  assert.match(src, /Home/);
  assert.match(src, /End/);
  assert.match(src, /event\.key === ['"]Enter['"]/);
  assert.match(src, /event\.key === ['"] ['"]/);
  assert.match(src, /aria-selected=/);
  assert.match(src, /aria-controls=/);
  assert.match(src, /data-drawer-item=/);
  assert.match(src, /data-active-drawer-item=/);
});

test('Drawer close paths restore focus and tabs remain stable without context', () => {
  const src = readSource('src/renderer/components/workbench/DrawerPanel.tsx');
  assert.match(src, /previousFocusRef/);
  assert.match(src, /data-workbench-chat-input/);
  assert.match(src, /workbench-root/);
  assert.match(src, /onClick=\{closeDrawer\}/);
  assert.match(src, /event\.key === ['"]Escape['"]/);
  assert.match(src, /noContextTitle/);
  assert.match(src, /noContextDetail/);
  assert.match(src, /DRAWER_ITEM_IDS\.map/);
  assert.match(src, /data-drawer-source-kind=/);
  assert.doesNotMatch(
    src,
    /\{snapshot\s*\?\s*\(\s*<div[\s\S]*className="wb-drawer-tabs"/,
  );
});

test('factual Drawer commands use the shared source model and typed reasons', () => {
  const shell = readSource('src/renderer/components/workbench/AgentWorkbenchShell.tsx');
  assert.match(shell, /drawerSourceModel\.pages\.questions/);
  assert.match(shell, /drawerSourceModel\.pages\.closure/);
  assert.match(shell, /drawerSourceModel\.pages\.changePlan/);
  assert.match(shell, /drawerSourceModel\.pages\.blueprintChangeWorkspace/);
  assert.match(shell, /commandUnavailableQuestions/);
  assert.match(shell, /commandUnavailableClosure/);
  assert.match(shell, /commandUnavailableChangePlan/);
  assert.match(shell, /commandUnavailableBlueprintWorkspace/);
});

test('typed English and Chinese command and Drawer copy is present', () => {
  const types = readSource('src/renderer/i18n/types.ts');
  const english = readSource('src/renderer/i18n/dict-en.ts');
  const chinese = readSource('src/renderer/i18n/dict-zh.ts');

  for (const key of [
    'commandPalette',
    'dialogLabel',
    'searchPlaceholder',
    'empty',
    'groups',
    'commands',
    'disabledReasons',
    'drawer',
    'items',
    'closeAria',
    'noContextTitle',
    'noContextDetail',
  ]) {
    assert.match(types, new RegExp(`${key}:`), `types missing ${key}`);
    assert.match(english, new RegExp(`${key}:`), `English copy missing ${key}`);
    assert.match(chinese, new RegExp(`${key}:`), `Chinese copy missing ${key}`);
  }
  assert.match(english, /newSession:\s*['"]New session['"]/);
  assert.match(chinese, /newSession:\s*['"]新建会话['"]/);
});

test('command and Drawer chrome has selected, disabled, reason and focus-visible styles', () => {
  const css = readSource('src/renderer/components/workbench/workbench.css');
  assert.match(css, /\.wb-command-item-selected/);
  assert.match(css, /\.wb-command-item:disabled/);
  assert.match(css, /\.wb-command-disabled-reason/);
  assert.match(css, /\.wb-command-item:focus-visible/);
  assert.match(css, /\.wb-drawer-tab:focus-visible/);
  assert.match(css, /\.wb-drawer-no-context/);
});

test('forbidden package and runtime scopes remain outside this Renderer workflow', () => {
  const shell = readSource('src/renderer/components/workbench/AgentWorkbenchShell.tsx');
  const drawer = readSource('src/renderer/components/workbench/DrawerPanel.tsx');
  const palette = readSource('src/renderer/components/workbench/CommandPalette.tsx');
  const combined = `${shell}\n${drawer}\n${palette}`;
  assert.doesNotMatch(combined, /WebSocket|OpenAI|Anthropic|compileBlueprint|Automation|PIE/i);
});
