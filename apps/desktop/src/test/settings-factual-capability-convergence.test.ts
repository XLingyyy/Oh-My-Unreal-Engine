import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const desktopRoot = process.cwd();
const sourcePath = (relativePath: string): string => resolve(desktopRoot, relativePath);
const readSource = (relativePath: string): string =>
  readFileSync(sourcePath(relativePath), 'utf8');

const GENERAL = 'src/renderer/components/workbench/GeneralSettings.tsx';
const UE = 'src/renderer/components/workbench/UEConnectionSettings.tsx';
const PRIVACY = 'src/renderer/components/workbench/PrivacyLogSettings.tsx';
const SETTINGS_PAGE = 'src/renderer/components/workbench/SettingsPage.tsx';
const SWITCH = 'src/renderer/components/workbench/Switch.tsx';
const CAPABILITY = 'src/renderer/components/workbench/SettingsCapabilityStatus.tsx';
const CSS = 'src/renderer/components/workbench/workbench.css';
const TYPES = 'src/renderer/i18n/types.ts';
const EN = 'src/renderer/i18n/dict-en.ts';
const ZH = 'src/renderer/i18n/dict-zh.ts';

// ── Shared capability presentation ──

test('SettingsCapabilityStatus primitive exists', () => {
  assert.equal(existsSync(sourcePath(CAPABILITY)), true);
});

test('SettingsCapabilityStatus exposes a typed kind union and non-interactive surface', () => {
  const src = readSource(CAPABILITY);
  assert.match(src, /SettingsCapabilityKind/);
  assert.match(src, /'persisted-only'/);
  assert.match(src, /'unavailable'/);
  assert.match(src, /'read-only'/);
  assert.match(src, /data-settings-capability/);
  assert.doesNotMatch(src, /<button|<input|<select|onChange|onClick/);
});

test('Switch allows omitting onCheckedChange for disabled factual display', () => {
  const src = readSource(SWITCH);
  assert.match(src, /onCheckedChange\?:/);
});

test('capability CSS uses existing tokens for the three factual states', () => {
  const css = readSource(CSS);
  for (const selector of [
    '.ue-settings-capability',
    '[data-settings-capability="persisted-only"]',
    '[data-settings-capability="unavailable"]',
    '[data-settings-capability="read-only"]',
  ]) {
    assert.match(css, new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(css, /var\(--/);
});

// ── General: persisted-only + unavailable, no onUpdate ──

test('GeneralSettings has no active onUpdate path', () => {
  const src = readSource(GENERAL);
  assert.doesNotMatch(src, /onUpdate/);
});

test('GeneralSettings marks startup behavior persisted-only with disabled radios', () => {
  const src = readSource(GENERAL);
  assert.match(src, /name="startupBehavior"/);
  assert.match(src, /disabled/);
  assert.match(src, /SettingsCapabilityStatus/);
  assert.match(src, /persisted-only/);
});

test('GeneralSettings shows update check and crash reports as unavailable disabled switches without handlers', () => {
  const src = readSource(GENERAL);
  assert.match(src, /checkForUpdates/);
  assert.match(src, /crashReports/);
  assert.match(src, /disabled/);
  assert.doesNotMatch(src, /onCheckedChange/);
  assert.match(src, /unavailable/);
});

test('GeneralSettings references typed bilingual capability reasons', () => {
  const src = readSource(GENERAL);
  assert.match(src, /startupPersistedOnlyReason/);
  assert.match(src, /updateUnavailableReason/);
  assert.match(src, /crashReportUnavailableReason/);
});

// ── UE Connection: read-only runtime facts + persisted-only + unavailable ──

test('UEConnectionSettings has no active onUpdate path', () => {
  const src = readSource(UE);
  assert.doesNotMatch(src, /onUpdate/);
});

test('UEConnectionSettings keeps connectionView runtime facts as read-only', () => {
  const src = readSource(UE);
  assert.match(src, /connectionView\.endpoint/);
  assert.match(src, /connectionView\.healthStatus/);
  assert.match(src, /connectionView\.lastCheckedAt/);
  assert.match(src, /read-only/);
});

test('UEConnectionSettings renders stored project/engine/host/port as native readOnly', () => {
  const src = readSource(UE);
  assert.match(src, /settings\.projectPath/);
  assert.match(src, /settings\.enginePath/);
  assert.match(src, /settings\.host/);
  assert.match(src, /settings\.port/);
  assert.match(src, /readOnly/);
});

test('UEConnectionSettings shows the four stored booleans as disabled switches without handlers', () => {
  const src = readSource(UE);
  for (const key of ['scanOnStartup', 'watchAssetChanges', 'autoScan', 'taskRelatedOnly']) {
    assert.match(src, new RegExp(`'${key}'`), `missing stored boolean key ${key}`);
  }
  assert.match(src, /settings\[toggle\.key\]/);
  assert.match(src, /disabled/);
  assert.doesNotMatch(src, /onCheckedChange/);
});

test('UEConnectionSettings keeps Reconnect and Test disabled with visible unavailable reasons', () => {
  const src = readSource(UE);
  assert.match(src, /reconnect/i);
  assert.match(src, /testConnection/i);
  assert.match(src, /disabled/);
  assert.match(src, /unavailable/);
});

test('UEConnectionSettings distinguishes effective endpoint from stored host/port', () => {
  const src = readSource(UE);
  assert.match(src, /persisted-only/);
  assert.match(src, /storedValuesReason/);
  assert.match(src, /reconnectUnavailableReason/);
  assert.match(src, /testConnectionUnavailableReason/);
  assert.match(src, /runtimeFactReason/);
});

test('UEConnectionSettings branches read-only runtime fact detail by connectionView.isMock', () => {
  const src = readSource(UE);
  const readOnlyCap = src.match(/<SettingsCapabilityStatus[\s\S]*?kind="read-only"[\s\S]*?\/>/);
  assert.ok(readOnlyCap, 'read-only capability not found');
  const detail = readOnlyCap[0];
  assert.match(detail, /isMock\s*\?/, 'read-only detail must condition on isMock');
  assert.match(detail, /mockRuntimeFactReason/, 'mock branch must use mockRuntimeFactReason');
  assert.match(detail, /runtimeFactReason/, 'real branch must keep runtimeFactReason');
  assert.match(detail, /readOnlyDetail/, 'real branch must keep readOnlyDetail');
});

test('UEConnectionSettings mock read-only fact does not claim a live bridge runtime', () => {
  const english = readSource(EN);
  const chinese = readSource(ZH);
  const mockEn = english.match(/mockRuntimeFactReason:\s*['"]([^'"]+)['"]/);
  const mockZh = chinese.match(/mockRuntimeFactReason:\s*['"]([^'"]+)['"]/);
  assert.ok(mockEn && mockZh, 'mockRuntimeFactReason copy missing');
  const enText = mockEn[1].toLowerCase();
  const zhText = mockZh[1];
  assert.doesNotMatch(enText, /live\s*runtime|live\s*bridge\s*runtime/);
  assert.doesNotMatch(zhText, /实时运行时|实时桥接运行时/);
  assert.match(enText, /mock|simulated/);
  assert.match(zhText, /模拟/);
});

test('UEConnectionSettings real read-only fact keeps live bridge runtime copy', () => {
  const english = readSource(EN);
  const chinese = readSource(ZH);
  const realEn = english.match(/runtimeFactReason:\s*['"]([^'"]+)['"]/);
  const realZh = chinese.match(/runtimeFactReason:\s*['"]([^'"]+)['"]/);
  assert.ok(realEn && realZh, 'runtimeFactReason copy missing');
  assert.match(realEn[1].toLowerCase(), /live\s*bridge\s*runtime/);
  assert.match(realZh[1], /实时桥接运行时/);
});

// ── Privacy & Log: persisted-only + unavailable, no onUpdate ──

test('PrivacyLogSettings has no active onUpdate path', () => {
  const src = readSource(PRIVACY);
  assert.doesNotMatch(src, /onUpdate/);
});

test('PrivacyLogSettings preserves stored booleans as disabled switches without handlers', () => {
  const src = readSource(PRIVACY);
  assert.match(src, /dataUsage/);
  assert.match(src, /logging/);
  assert.match(src, /sensitiveInfoProtection/);
  assert.match(src, /disabled/);
  assert.doesNotMatch(src, /onCheckedChange/);
});

test('PrivacyLogSettings keeps retention select disabled and Clear Local Logs unavailable with a visible reason', () => {
  const src = readSource(PRIVACY);
  assert.match(src, /logRetention/);
  assert.match(src, /disabled/);
  assert.match(src, /clearLocalLogs/);
  assert.match(src, /unavailable/);
});

test('PrivacyLogSettings references typed bilingual persisted-only and clear-logs reasons', () => {
  const src = readSource(PRIVACY);
  assert.match(src, /persisted-only/);
  assert.match(src, /persistedOnlyReason/);
  assert.match(src, /clearLogsUnavailableReason/);
});

// ── SettingsPage wiring ──

test('SettingsPage stops passing onUpdate to General, UE Connection and Privacy & Log', () => {
  const src = readSource(SETTINGS_PAGE);
  const general = src.match(/<GeneralSettings[\s\S]*?\/>/);
  const ue = src.match(/<UEConnectionSettings[\s\S]*?\/>/);
  const privacy = src.match(/<PrivacyLogSettings[\s\S]*?\/>/);
  assert.ok(general, 'GeneralSettings mount not found');
  assert.ok(ue, 'UEConnectionSettings mount not found');
  assert.ok(privacy, 'PrivacyLogSettings mount not found');
  assert.doesNotMatch(general![0], /onUpdate=/);
  assert.doesNotMatch(ue![0], /onUpdate=/);
  assert.doesNotMatch(privacy![0], /onUpdate=/);
});

test('SettingsPage keeps Provider, Appearance and Language update wiring', () => {
  const src = readSource(SETTINGS_PAGE);
  const providers = src.match(/<ModelProviderSettings[\s\S]*?\/>/);
  const appearance = src.match(/<AppearanceSettings[\s\S]*?\/>/);
  const language = src.match(/<LanguageSettings[\s\S]*?\/>/);
  assert.ok(providers, 'ModelProviderSettings mount not found');
  assert.ok(appearance, 'AppearanceSettings mount not found');
  assert.ok(language, 'LanguageSettings mount not found');
  assert.match(providers![0], /onUpdate=/);
  assert.match(appearance![0], /onUpdate=/);
  assert.match(language![0], /onUpdate=/);
});

test('SettingsPage keeps Assistant, Sandbox and Advanced mounts intact', () => {
  const src = readSource(SETTINGS_PAGE);
  assert.match(src, /case 'assistant'/);
  assert.match(src, /<AssistantSettings/);
  assert.match(src, /case 'sandboxSecurity'/);
  assert.match(src, /<SandboxSecuritySettings/);
  assert.match(src, /case 'advanced'/);
  assert.match(src, /<AdvancedSettings/);
});

// ── Safety surfaces remain intact ──

test('Assistant, Advanced and Sandbox safety surfaces remain non-interactive and factual', () => {
  const assistant = readSource('src/renderer/components/workbench/AssistantSettings.tsx');
  const advanced = readSource('src/renderer/components/workbench/AdvancedSettings.tsx');
  const sandbox = readSource('src/renderer/components/workbench/SandboxSecuritySettings.tsx');
  assert.match(assistant, /controlsUnavailable/);
  assert.match(assistant, /runtimePolicyNotice/);
  assert.doesNotMatch(assistant, /type=["'](?:checkbox|radio)["']|<select|onUpdate\(/);
  assert.match(advanced, /controlsUnavailable/);
  assert.match(advanced, /automationUnavailable/);
  assert.doesNotMatch(advanced, /type=["'](?:checkbox|radio)["']|<select|onUpdate\(/);
  assert.match(sandbox, /sandboxAlwaysEnforced/);
  assert.match(sandbox, /settingsCannotOverride/);
  assert.doesNotMatch(sandbox, /type=["'](?:checkbox|radio)["']|<select|onUpdate\(/);
});

// ── Typed bilingual copy ──

test('typed English and Chinese capability copy exists for shared labels and page reasons', () => {
  const types = readSource(TYPES);
  const english = readSource(EN);
  const chinese = readSource(ZH);
  const shared = [
    'persistedOnlyLabel',
    'persistedOnlyDetail',
    'unavailableLabel',
    'readOnlyLabel',
    'readOnlyDetail',
  ];
  const generalReasons = [
    'startupPersistedOnlyReason',
    'updateUnavailableReason',
    'crashReportUnavailableReason',
  ];
  const ueReasons = [
    'storedValuesReason',
    'reconnectUnavailableReason',
    'testConnectionUnavailableReason',
    'runtimeFactReason',
    'mockRuntimeFactReason',
  ];
  const privacyReasons = [
    'persistedOnlyReason',
    'clearLogsUnavailableReason',
  ];

  for (const key of shared) {
    assert.match(types, new RegExp(`${key}:`), `types missing capability.${key}`);
    assert.match(english, new RegExp(`${key}:`), `English missing capability.${key}`);
    assert.match(chinese, new RegExp(`${key}:`), `Chinese missing capability.${key}`);
  }
  for (const key of [...generalReasons, ...ueReasons, ...privacyReasons]) {
    assert.match(types, new RegExp(`${key}:`), `types missing ${key}`);
    assert.match(english, new RegExp(`${key}:`), `English missing ${key}`);
    assert.match(chinese, new RegExp(`${key}:`), `Chinese missing ${key}`);
  }
});

// ── Enabled Switches still have handlers (runtime-backed pages) ──

test('Appearance and ModelProvider enabled switches keep onCheckedChange handlers', () => {
  const appearance = readSource('src/renderer/components/workbench/AppearanceSettings.tsx');
  const providers = readSource('src/renderer/components/workbench/ModelProviderSettings.tsx');
  assert.match(appearance, /onCheckedChange/);
  assert.match(providers, /onCheckedChange/);
});

// ── Renderer-only and no unsafe capabilities ──

test('factual convergence stays Renderer-only and adds no unsafe capabilities', () => {
  const combined = [
    readSource(GENERAL),
    readSource(UE),
    readSource(PRIVACY),
    readSource(CAPABILITY),
  ].join('\n');
  assert.doesNotMatch(
    combined,
    /WebSocket|OpenAI|Anthropic|AssetRegistry|compileBlueprint|Automation|PIE|saveAsset|writeAsset/i,
  );
  assert.doesNotMatch(
    combined,
    /from ['"]\.\.\/\.\.\/\.\.\/main|from ['"]\.\.\/\.\.\/\.\.\/preload|from ['"]\.\.\/\.\.\/services/i,
  );
});
