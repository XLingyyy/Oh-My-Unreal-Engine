import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { resolve, dirname, relative, join, extname } from 'node:path';

const rendererDir = resolve(process.cwd(), 'src/renderer');
const workbenchDir = resolve(rendererDir, 'components/workbench');
const componentsDir = resolve(rendererDir, 'components');

const MANDATORY_DELETED_ROOTS = [
  'AgentTransitionPanel.tsx',
  'MockScenarioControls.tsx',
  'AiDiagnosticChatPanel.tsx',
  'ApprovalGatePhaseClosurePanel.tsx',
  'DesktopSettingsPanel.tsx',
  'DesktopVerificationPanel.tsx',
  'ExecutionReadinessPreviewPanel.tsx',
  'PatchPreviewManifestView.tsx',
  'RepairSessionWorkspace.tsx',
  'RightPanelWorkspaceNavigator.tsx',
  'ValidationWorkspacePanel.tsx',
  'AiChatWorkspacePanel.tsx',
];

const MANDATORY_DELETED_WORKBENCH_ROOTS = [
  'CenterArea.tsx',
  'ChatStream.tsx',
  'ChatInput.tsx',
  'AgentStateEvent.tsx',
  'ApprovalCard.tsx',
  'DiffCard.tsx',
  'EventBubble.tsx',
  'LeftArea.tsx',
  'RightArea.tsx',
  'ContextSidebar.tsx',
  'SessionRail.tsx',
  'SettingsPlaceholder.tsx',
  'TitleBar.tsx',
  'ThemeToggle.tsx',
  'mockAgentCards.ts',
];

const MANDATORY_DELETED_VIEW_ROOTS = [
  'AssetViewContent.tsx',
  'EvidenceViewContent.tsx',
  'GraphViewContent.tsx',
  'LogsViewContent.tsx',
  'RawViewContent.tsx',
];

const MANDATORY_DELETED_ORPHAN_ROOTS = [
  'ContextSummary.tsx',
  'DiagnosticReportPanel.tsx',
  'BlueprintExplanationPanel.tsx',
  'InvestigationTriageBoardPanel.tsx',
  'DiagnosticReviewPanel.tsx',
  'EvidencePanel.tsx',
  'InvestigationCaseFilePanel.tsx',
  'InvestigationTimelinePanel.tsx',
  'LogList.tsx',
  'JsonPreview.tsx',
];

const RETAINED_ACTIVE_EXPORT_PANELS = [
  'GraphDetailPanel.tsx',
  'InvestigationDeltaPanel.tsx',
  'BehaviorTreeBlackboardDiagnosticPanel.tsx',
];

const RECURSIVE_DELETED_AI_PANELS = [
  'AiProviderSettingsPanel.tsx',
  'AiExplanationRequestPackagePanel.tsx',
  'AiExplanationResultReviewPanel.tsx',
  'AiExplanationProviderResultPanel.tsx',
  'AiExplanationProviderResultHistoryPanel.tsx',
  'AiExplanationSessionReviewPanel.tsx',
];

test('mandatory deleted view roots no longer exist', () => {
  for (const file of MANDATORY_DELETED_VIEW_ROOTS) {
    const path = resolve(workbenchDir, 'views', file);
    assert.equal(existsSync(path), false, `view root should be deleted: ${file}`);
  }
});

test('mandatory deleted orphan roots no longer exist', () => {
  for (const file of MANDATORY_DELETED_ORPHAN_ROOTS) {
    const path = resolve(componentsDir, file);
    assert.equal(existsSync(path), false, `orphan root should be deleted: ${file}`);
  }
});

test('retained active export panels still exist', () => {
  for (const file of RETAINED_ACTIVE_EXPORT_PANELS) {
    const path = resolve(componentsDir, file);
    assert.equal(existsSync(path), true, `active export panel should remain: ${file}`);
  }
});

test('recursive zero-consumer Ai explanation panels no longer exist', () => {
  for (const file of RECURSIVE_DELETED_AI_PANELS) {
    const path = resolve(componentsDir, file);
    assert.equal(existsSync(path), false, `recursive orphan Ai panel should be deleted: ${file}`);
  }
});

test('useAgentWorkbenchState still imports retained active type exports', () => {
  const source = readFileSync(resolve(rendererDir, 'hooks/useAgentWorkbenchState.ts'), 'utf8');
  assert.match(source, /NodeEvidenceSummary/);
  assert.match(source, /DeltaSummary/);
  assert.match(source, /from ['"]\.\.\/components\/GraphDetailPanel['"]/);
  assert.match(source, /from ['"]\.\.\/components\/InvestigationDeltaPanel['"]/);
});

test('DrawerPanel still imports retained active MOCK_BB_DIAGNOSTIC_SUMMARY', () => {
  const source = readFileSync(resolve(workbenchDir, 'DrawerPanel.tsx'), 'utf8');
  assert.match(source, /MOCK_BB_DIAGNOSTIC_SUMMARY/);
  assert.match(source, /from ['"]\.\.\/BehaviorTreeBlackboardDiagnosticPanel['"]/);
});

test('mandatory deleted workbench roots no longer exist', () => {
  for (const file of MANDATORY_DELETED_WORKBENCH_ROOTS) {
    const path = resolve(workbenchDir, file);
    assert.equal(existsSync(path), false, `workbench legacy root should be deleted: ${file}`);
  }
});

test('mandatory deleted view roots no longer exist', () => {
  for (const file of MANDATORY_DELETED_VIEW_ROOTS) {
    const path = resolve(workbenchDir, 'views', file);
    assert.equal(existsSync(path), false, `view root should be deleted: ${file}`);
  }
});

test('AgentWorkbenchShell no longer imports or renders legacy AI chat / center area / mock scenario controls', () => {
  const source = readFileSync(resolve(workbenchDir, 'AgentWorkbenchShell.tsx'), 'utf8');
  assert.doesNotMatch(source, /AiChatWorkspacePanel/);
  assert.doesNotMatch(source, /CenterArea/);
  assert.doesNotMatch(source, /MockScenarioControls/);
  assert.doesNotMatch(source, /mockAgentCards/);
  assert.doesNotMatch(source, /AgentTransitionPanel/);
  assert.doesNotMatch(source, /ChatStream/);
});

test('AgentWorkbenchShell no longer carries dead AI chat modal state', () => {
  const source = readFileSync(resolve(workbenchDir, 'AgentWorkbenchShell.tsx'), 'utf8');
  assert.doesNotMatch(source, /activeModal/);
  assert.doesNotMatch(source, /setActiveModal/);
  assert.doesNotMatch(source, /ai-chat/);
});

test('useAgentWorkbenchState no longer carries dead modal or context-sidebar state', () => {
  const source = readFileSync(resolve(rendererDir, 'hooks/useAgentWorkbenchState.ts'), 'utf8');
  assert.doesNotMatch(source, /ActiveWorkbenchModal/);
  assert.doesNotMatch(source, /activeModal/);
  assert.doesNotMatch(source, /setActiveModal/);
  assert.doesNotMatch(source, /isContextCollapsed/);
  assert.doesNotMatch(source, /toggleContextSidebar/);
  assert.doesNotMatch(source, /contextSidebarWidth/);
  assert.doesNotMatch(source, /setContextSidebarWidth/);
  assert.doesNotMatch(source, /ContextSidebarView/);
  assert.doesNotMatch(source, /contextView/);
});

test('ChatPanel still imports and renders ConfirmModal', () => {
  const source = readFileSync(resolve(workbenchDir, 'ChatPanel.tsx'), 'utf8');
  assert.match(source, /import \{ ConfirmModal \} from ['"]\.\/ConfirmModal['"]/);
  assert.match(source, /<ConfirmModal/);
});

test('AgentWorkbenchShell still imports and renders DrawerPanel and CommandPalette', () => {
  const source = readFileSync(resolve(workbenchDir, 'AgentWorkbenchShell.tsx'), 'utf8');
  assert.match(source, /import \{ DrawerPanel \} from ['"]\.\/DrawerPanel['"]/);
  assert.match(source, /<DrawerPanel/);
  assert.match(source, /import \{ CommandPalette \} from ['"]\.\/CommandPalette['"]/);
  assert.match(source, /<CommandPalette/);
});

test('inspectorDataAdapter retains explicit isMockClient gating for mockInspectorData', () => {
  const source = readFileSync(resolve(workbenchDir, 'inspectorDataAdapter.ts'), 'utf8');
  assert.match(source, /isMockClient/);
  assert.match(source, /mockInspectorData/);
});

test('App.tsx may still create MockBridgeClient only through createBridgeClient()', () => {
  const source = readFileSync(resolve(rendererDir, 'App.tsx'), 'utf8');
  assert.match(source, /createBridgeClient/);
  assert.match(source, /MockBridgeClient/);
  assert.doesNotMatch(source, /new MockBridgeClient\(/);
});

test('protected active surface files still exist', () => {
  const protectedFiles = [
    'ChatPanel.tsx',
    'ConfirmModal.tsx',
    'DrawerPanel.tsx',
    'CommandPalette.tsx',
    'RightInspector.tsx',
    'AdvancedInspector.tsx',
    'mockInspectorData.ts',
    'agentCardMapper.ts',
    'inspectorDataAdapter.ts',
  ];
  for (const file of protectedFiles) {
    const path = resolve(workbenchDir, file);
    assert.equal(existsSync(path), true, `protected surface should remain: ${file}`);
  }
  assert.equal(
    existsSync(resolve(rendererDir, 'services/mock-bridge-client.ts')),
    true,
    'mock-bridge-client.ts should remain',
  );
});

test('no production renderer source references deleted legacy roots', () => {
  const deletedTokens = [
    'AgentTransitionPanel',
    'MockScenarioControls',
    'AiDiagnosticChatPanel',
    'ApprovalGatePhaseClosurePanel',
    'DesktopSettingsPanel',
    'DesktopVerificationPanel',
    'ExecutionReadinessPreviewPanel',
    'PatchPreviewManifestView',
    'RepairSessionWorkspace',
    'RightPanelWorkspaceNavigator',
    'ValidationWorkspacePanel',
    'AiChatWorkspacePanel',
    'mockAgentCards',
    'MOCK_AGENT_CARDS',
  ];
  const scanFiles = [
    resolve(workbenchDir, 'AgentWorkbenchShell.tsx'),
    resolve(workbenchDir, 'ChatPanel.tsx'),
    resolve(workbenchDir, 'DrawerPanel.tsx'),
    resolve(workbenchDir, 'RightInspector.tsx'),
    resolve(workbenchDir, 'AdvancedInspector.tsx'),
    resolve(rendererDir, 'App.tsx'),
    resolve(rendererDir, 'hooks/useAgentWorkbenchState.ts'),
  ];
  for (const file of scanFiles) {
    if (!existsSync(file)) continue;
    const source = readFileSync(file, 'utf8');
    for (const token of deletedTokens) {
      assert.doesNotMatch(
        source,
        new RegExp(token),
        `active source ${file} must not reference deleted root ${token}`,
      );
    }
  }
});

test('styles.css preserves UTF-8 encoding integrity', () => {
  const source = readFileSync(resolve(rendererDir, 'styles.css'), 'utf8');
  assert.doesNotMatch(source, /\u9234|\u9225|\u923d/);
});

test('deleted Task B component CSS selectors are fully closed in styles and workbench css', () => {
  const styles = readFileSync(resolve(rendererDir, 'styles.css'), 'utf8');
  const workbench = readFileSync(resolve(workbenchDir, 'workbench.css'), 'utf8');
  const combined = `${styles}\n${workbench}`;
  const deletedPrefixes = [
    'atp',
    'adc',
    'agp',
    'acw',
    'ai-chat',
    'ds',
    'dv',
    'erp',
    'mock',
    'ppm',
    'rs',
    'rwn',
    'vwp',
  ];
  for (const prefix of deletedPrefixes) {
    assert.doesNotMatch(
      combined,
      new RegExp(`\\.${prefix}-`),
      `stale CSS selector prefix .${prefix}- must be removed from combined CSS`,
    );
  }
  const deletedWorkbenchSelectors = [
    'wb-button-danger',
    'ue-area',
    'ue-area-center',
    'ue-area-header',
    'ue-area-label',
    'ue-area-label-vertical',
    'ue-area-left',
    'ue-area-right',
    'ue-settings-placeholder',
    'wb-status-dot',
    'wb-titlebar',
  ];
  for (const selector of deletedWorkbenchSelectors) {
    assert.doesNotMatch(
      combined,
      new RegExp(`\\.${selector}`),
      `stale workbench selector family .${selector} must be removed from combined CSS`,
    );
  }
});

test('InvestigationSessionPanel no longer emits stale Raw navigation action', () => {
  const source = readFileSync(resolve(componentsDir, 'InvestigationSessionPanel.tsx'), 'utf8');
  assert.doesNotMatch(source, /targetPanel:\s*'raw'/);
  assert.doesNotMatch(source, /\bnaVerifyRaw\b/);
  assert.doesNotMatch(source, /naVerifyRawDetail/);
});

test('deleted orphan closure CSS selectors are fully removed from combined CSS', () => {
  const styles = readFileSync(resolve(rendererDir, 'styles.css'), 'utf8');
  const workbench = readFileSync(resolve(workbenchDir, 'workbench.css'), 'utf8');
  const combined = `${styles}\n${workbench}`;
  assert.doesNotMatch(combined, /\.safety-banner/, 'no-consumer .safety-banner must be removed');
  const orphanOnlyPrefixes = [
    'itb-',
    'context-summary',
    'bdw-',
    'dr-readiness',
    'dr-report',
    'drv-',
    'be-',
    'icf-',
    'graph-item',
    'graph-list',
    'graph-more',
    'compile-issue',
    'json-preview',
    'json-block',
    'evidence-panel',
    'log-table',
    'log-category',
    'aps-',
    'aerp-',
    'aerr-',
    'aeprp-',
    'aeprh-',
    'aesr-',
  ];
  for (const prefix of orphanOnlyPrefixes) {
    assert.doesNotMatch(
      combined,
      new RegExp(`\\.${prefix}`),
      `orphan-only CSS selector prefix .${prefix} must be removed from combined CSS`,
    );
  }
  const orphanOnlyEvTokens = [
    'ev-chain',
    'ev-detail',
    'ev-filter',
    'ev-ref',
    'ev-toolbar',
    'ev-action',
    'ev-label',
    'ev-mono',
    'ev-toggle',
    'ev-items',
    'ev-item-header',
    'ev-item-summary',
    'ev-item-detail',
    'ev-item-message',
    'ev-item-reason',
    'ev-item-field',
    'ev-item-upgrade',
    'ev-item-next',
    'ev-item-code',
    'ev-item-refs',
  ];
  for (const token of orphanOnlyEvTokens) {
    assert.doesNotMatch(
      combined,
      new RegExp(`\\.${token}`),
      `orphan-only old EvidencePanel CSS selector .${token} must be removed from combined CSS`,
    );
  }
  const orphanOnlyItTokens = [
    'it-panel',
    'it-toolbar',
    'it-copy',
    'it-overview',
    'it-filter',
    'it-search',
    'it-detail',
    'it-event',
    'it-preview',
    'it-label',
    'it-mono',
    'it-ref',
  ];
  for (const token of orphanOnlyItTokens) {
    assert.doesNotMatch(
      combined,
      new RegExp(`\\.${token}`),
      `orphan-only InvestigationTimelinePanel CSS selector .${token} must be removed from combined CSS`,
    );
  }
});

// ====================================================================
// FIX-3: Final closure — import graph, dead top-level i18n, FCW/StatusBar CSS
// ====================================================================

const MANDATORY_FINAL_ORPHAN_ROOTS = [
  'FixCandidateWorkspace.tsx',
  'StatusBar.tsx',
];

const MANDATORY_FINAL_ORPHAN_WORKBENCH_FILES = [
  'settings/index.ts',
];

const MANDATORY_FINAL_ORPHAN_SERVICES = [
  'fix-execution-adapter.ts',
  'scratch-fixture.ts',
];

const ZERO_CONSUMER_TOP_LEVEL_I18N_BLOCKS = [
  'tabs',
  'workbench',
  'nav',
  'settings',
  'providerSettings',
  'mockScenario',
  'verify',
  'aiChat',
  'diagnosticChat',
  'capabilityDiscovery',
  'executionReadinessPreview',
  'patchPreviewManifest',
  'validationWorkspace',
  'repairSessions',
];

const ZERO_CONSUMER_TOP_LEVEL_I18N_KEYS = [
  'appTitle',
  'statusBar',
];

async function walkRenderer(dir: string): Promise<string[]> {
  const all: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === 'dist' || e.name === 'dist-agent-tests') continue;
      all.push(...(await walkRenderer(p)));
    } else {
      const ext = extname(e.name);
      if (['.ts', '.tsx', '.css', '.js', '.jsx'].includes(ext)) all.push(p);
    }
  }
  return all;
}

function buildImportGraph(entries: string[]): { reachable: Set<string>; all: string[] } {
  const rendererAbs = resolve(process.cwd(), 'src/renderer');
  const rel = (p: string) => relative(rendererAbs, p).replace(/\\/g, '/');
  const reachable = new Set<string>();
  const queue: string[] = [resolve(rendererAbs, 'main.tsx')];
  reachable.add('main.tsx');
  const importRe = /(?:^|\n)\s*(?:import\s+(?:[^'"`;]+?\s+from\s+)?|export\s+(?:[^'"`;]+?\s+from\s+)|export\s*\*\s*from\s+)(['"`])([^'"`]+)\1/g;
  while (queue.length > 0) {
    const cur = queue.shift()!;
    let source: string;
    try { source = readFileSync(cur, 'utf8'); } catch { continue; }
    let match: RegExpExecArray | null;
    importRe.lastIndex = 0;
    while ((match = importRe.exec(source)) !== null) {
      const raw = match[2];
      if (!raw || !raw.startsWith('.')) continue;
      const abs = resolve(dirname(cur), raw);
      const candidates = [
        abs,
        abs + '.ts', abs + '.tsx', abs + '.js', abs + '.jsx',
        join(abs, 'index.ts'), join(abs, 'index.tsx'), join(abs, 'index.js'),
      ];
      let found: string | null = null;
      for (const c of candidates) {
        try {
          if (statSync(c).isFile()) { found = c; break; }
        } catch { /* missing */ }
      }
      if (found) {
        const r = rel(found);
        if (!reachable.has(r)) { reachable.add(r); queue.push(found); }
      }
    }
  }
  const all = entries.map(rel).sort();
  return { reachable, all };
}

test('mandatory final orphan roots no longer exist', () => {
  for (const file of MANDATORY_FINAL_ORPHAN_ROOTS) {
    const p = resolve(componentsDir, file);
    assert.equal(existsSync(p), false, `final orphan root should be deleted: ${file}`);
  }
  for (const file of MANDATORY_FINAL_ORPHAN_WORKBENCH_FILES) {
    const p = resolve(workbenchDir, file);
    assert.equal(existsSync(p), false, `final orphan workbench file should be deleted: ${file}`);
  }
  for (const file of MANDATORY_FINAL_ORPHAN_SERVICES) {
    const p = resolve(rendererDir, 'services', file);
    assert.equal(existsSync(p), false, `final orphan service should be deleted: ${file}`);
  }
});

test('production renderer import graph has no unreachable code modules (excluding vite-env.d.ts)', async () => {
  const entries = await walkRenderer(rendererDir);
  const { reachable, all } = buildImportGraph(entries);
  const codeFiles = all.filter(f => !f.endsWith('.css'));
  const expectedAmbient = new Set(['vite-env.d.ts']);
  const unreachable = codeFiles.filter(f => !reachable.has(f) && !expectedAmbient.has(f));
  assert.equal(
    unreachable.length,
    0,
    `unreachable code modules (excluding vite-env.d.ts):\n${unreachable.join('\n')}`,
  );
});

test('FCW/StatusBar private CSS classes are removed from styles.css', () => {
  const styles = readFileSync(resolve(rendererDir, 'styles.css'), 'utf8');
  // fcw-* classes are owned exclusively by FixCandidateWorkspace.tsx
  assert.doesNotMatch(styles, /\.fcw-[a-zA-Z0-9_-]+/, 'all .fcw-* classes must be removed (FixCandidateWorkspace deleted)');
  // .status-bar / .status-bar-* / .app-title are owned exclusively by StatusBar.tsx
  assert.doesNotMatch(styles, /\.status-bar\b/, '.status-bar must be removed (StatusBar deleted)');
  assert.doesNotMatch(styles, /\.status-bar-[a-zA-Z0-9_-]+/, '.status-bar-* descendants must be removed (StatusBar deleted)');
  assert.doesNotMatch(styles, /\.app-title\b/, '.app-title must be removed (StatusBar deleted)');
});

test('DesktopCopy top-level appTitle/statusBar fields and i18n blocks are removed', () => {
  const typesSource = readFileSync(resolve(rendererDir, 'i18n/types.ts'), 'utf8');
  const enSource = readFileSync(resolve(rendererDir, 'i18n/dict-en.ts'), 'utf8');
  const zhSource = readFileSync(resolve(rendererDir, 'i18n/dict-zh.ts'), 'utf8');
  for (const key of ZERO_CONSUMER_TOP_LEVEL_I18N_KEYS) {
    assert.doesNotMatch(
      typesSource,
      new RegExp(`^\\s*${key}:\\s+${key === 'appTitle' ? 'string' : '\\w+Copy'};`, 'm'),
      `top-level DesktopCopy.${key} field must be removed`,
    );
    assert.doesNotMatch(
      enSource,
      new RegExp(`^\\s+${key}:\\s*\\{`, 'm'),
      `top-level ${key} block must be removed from dict-en.ts`,
    );
    assert.doesNotMatch(
      zhSource,
      new RegExp(`^\\s+${key}:\\s*\\{`, 'm'),
      `top-level ${key} block must be removed from dict-zh.ts`,
    );
  }
});

test('zero-consumer top-level i18n blocks are removed from types/dicts', () => {
  const typesSource = readFileSync(resolve(rendererDir, 'i18n/types.ts'), 'utf8');
  const enSource = readFileSync(resolve(rendererDir, 'i18n/dict-en.ts'), 'utf8');
  const zhSource = readFileSync(resolve(rendererDir, 'i18n/dict-zh.ts'), 'utf8');
  for (const block of ZERO_CONSUMER_TOP_LEVEL_I18N_BLOCKS) {
    const cap = block.charAt(0).toUpperCase() + block.slice(1);
    const reInterface = new RegExp(`export\\s+interface\\s+${cap}Copy\\s*\\{`, 'g');
    assert.equal(
      (typesSource.match(reInterface) || []).length,
      0,
      `${cap}Copy interface must be removed from i18n/types.ts`,
    );
    const reField = new RegExp(`^\\s+${block}:\\s+\\w+Copy;`, 'm');
    assert.doesNotMatch(
      typesSource,
      reField,
      `DesktopCopy.${block} field must be removed from i18n/types.ts`,
    );
    const reBlock = new RegExp(`^\\s+${block}:\\s*\\{`, 'm');
    assert.doesNotMatch(enSource, reBlock, `${block} block must be removed from dict-en.ts`);
    assert.doesNotMatch(zhSource, reBlock, `${block} block must be removed from dict-zh.ts`);
  }
});

test('InvestigationSessionPanel no longer emits misleading naUseEvidencePanel action', () => {
  const source = readFileSync(resolve(componentsDir, 'InvestigationSessionPanel.tsx'), 'utf8');
  assert.doesNotMatch(source, /\bnaUseEvidencePanel\b/, 'naUseEvidencePanel must be removed from InvestigationSessionPanel.tsx');
  const typesSource = readFileSync(resolve(rendererDir, 'i18n/types.ts'), 'utf8');
  assert.doesNotMatch(typesSource, /\bnaUseEvidencePanel\b/, 'naUseEvidencePanel must be removed from i18n/types.ts');
  const enSource = readFileSync(resolve(rendererDir, 'i18n/dict-en.ts'), 'utf8');
  assert.doesNotMatch(enSource, /\bnaUseEvidencePanel\b/, 'naUseEvidencePanel must be removed from dict-en.ts');
  const zhSource = readFileSync(resolve(rendererDir, 'i18n/dict-zh.ts'), 'utf8');
  assert.doesNotMatch(zhSource, /\bnaUseEvidencePanel\b/, 'naUseEvidencePanel must be removed from dict-zh.ts');
});

test('components/workbench/settings/index.ts barrel is removed (settings types come from settingsTypes.ts)', () => {
  // After removal, the workbench/settings directory should still contain settingsTypes.ts (used by other modules).
  assert.equal(
    existsSync(resolve(workbenchDir, 'settings/settingsTypes.ts')),
    true,
    'settingsTypes.ts must remain (re-exports/imports use direct path)',
  );
});
