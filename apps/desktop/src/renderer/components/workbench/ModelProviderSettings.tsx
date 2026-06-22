import React, { useCallback, useMemo, useState } from 'react';
import { useDesktopCopy } from '../../i18n';
import type { ModelProviderSettings as ModelProviderSettingsType, ProviderInstance } from './settings/settingsTypes';
import {
  computeApiKeySaveOutcome,
  computeApiKeyClearOutcome,
  type SettingsApiResolver,
} from '@omue/shared-protocol';
import { Switch } from './Switch';
import {
  deriveProviderCardStatus,
  getProviderVendorLabel,
  type ProviderCardStatus,
} from './providerCardState';
import type { ProviderReadiness } from '../../../main/settings/provider-authority';

interface ModelProviderSettingsProps {
  settings: ModelProviderSettingsType;
  onUpdate: (patch: Partial<ModelProviderSettingsType>) => void;
  onRefreshSettings: () => Promise<{ ok: boolean; error?: string }>;
  safeStorageAvailable: boolean;
  providerReadiness: ProviderReadiness;
}

const MODEL_PURPOSE_KEYS = ['chatModel', 'diagnosisModel', 'summaryModel'] as const;
const MODEL_PURPOSE_TO_LABEL: Record<(typeof MODEL_PURPOSE_KEYS)[number], 'chat' | 'diagnosis' | 'summary'> = {
  chatModel: 'chat',
  diagnosisModel: 'diagnosis',
  summaryModel: 'summary',
};

type MockFeedbackState = { type: string; message: string; visible: boolean };

function resolveSettingsApi(): ReturnType<SettingsApiResolver> {
  return (window as unknown as { omue?: { settings?: ReturnType<SettingsApiResolver> } }).omue?.settings ?? null;
}

function safeDomIdSuffix(instanceId: string): string {
  return instanceId.replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'provider';
}

export function ModelProviderSettings({
  settings,
  onUpdate,
  onRefreshSettings,
  safeStorageAvailable,
  providerReadiness,
}: ModelProviderSettingsProps) {
  const { copy } = useDesktopCopy();
  const t = copy.ueAgentUi.settingsPage.modelProviders;
  const common = copy.common;
  const [expandedProviderId, setExpandedProviderId] = useState<string | null>(null);
  const [advancedExpanded, setAdvancedExpanded] = useState<Record<string, boolean>>({});
  const [feedback, setFeedback] = useState<MockFeedbackState | null>(null);
  const [editingKey, setEditingKey] = useState<Record<string, string>>({});

  const showFeedback = (type: string, message: string) => {
    setFeedback({ type, message, visible: true });
    setTimeout(() => setFeedback(null), 3000);
  };

  const updateProvider = (instanceId: string, patch: Partial<ProviderInstance>) => {
    const next = settings.providers.map((p: ProviderInstance) =>
      p.instanceId === instanceId ? { ...p, ...patch } : p
    );
    onUpdate({ providers: next });
  };

  const toggleExpanded = (instanceId: string) => {
    setExpandedProviderId(prev => (prev === instanceId ? null : instanceId));
  };

  const toggleAdvanced = (instanceId: string) => {
    setAdvancedExpanded(prev => ({ ...prev, [instanceId]: !prev[instanceId] }));
  };

  const addProvider = () => {
    const id = `custom-${Date.now()}`;
    const newProvider: ProviderInstance = {
      instanceId: id,
      enabled: true,
      displayName: 'Custom Provider',
      kind: 'custom',
      baseUrl: '',
      defaultModel: '',
      chatModel: '',
      diagnosisModel: '',
      summaryModel: '',
      advanced: { timeout: 30, retries: 3, streaming: true, temperature: 0.7, maxTokens: 4096, reasoningEffort: 'auto', proxy: '' },
    };
    onUpdate({ providers: [...settings.providers, newProvider] });
  };

  const handleSaveApiKey = useCallback(async (instanceId: string) => {
    const plaintext = editingKey[instanceId];
    if (!plaintext || plaintext.trim().length === 0) return;

    const outcome = await computeApiKeySaveOutcome(instanceId, plaintext, {
      resolveApi: resolveSettingsApi,
      refresh: onRefreshSettings,
      safeStorageAvailable,
    });

    if (outcome.kind === 'api-missing') {
      showFeedback('saveKey', t.settingsUnavailable);
      return;
    }
    if (outcome.kind === 'save-failed' || outcome.kind === 'exception') {
      showFeedback('saveKey', t.saveFailure(outcome.error ?? ''));
      return;
    }
    if (outcome.kind === 'refresh-failed') {
      showFeedback('saveKey', t.refreshFailure(outcome.error ?? ''));
      return;
    }

    setEditingKey(prev => {
      const next = { ...prev };
      delete next[instanceId];
      return next;
    });
    showFeedback('saveKey', outcome.persisted ? t.saveSuccessSecure : t.saveSuccessSession);
  }, [editingKey, onRefreshSettings, safeStorageAvailable, t]);

  const handleClearApiKey = useCallback(async (instanceId: string) => {
    const outcome = await computeApiKeyClearOutcome(instanceId, {
      resolveApi: resolveSettingsApi,
      refresh: onRefreshSettings,
      safeStorageAvailable,
    });

    if (outcome.kind === 'api-missing') {
      showFeedback('clearKey', t.settingsUnavailable);
      return;
    }
    if (outcome.kind === 'clear-failed' || outcome.kind === 'exception') {
      showFeedback('clearKey', t.clearFailure(outcome.error ?? ''));
      return;
    }
    if (outcome.kind === 'refresh-failed') {
      showFeedback('clearKey', t.refreshFailure(outcome.error ?? ''));
      return;
    }

    showFeedback('clearKey', t.clearSuccess);
  }, [onRefreshSettings, safeStorageAvailable, t]);

  const statusLabelFor = useMemo(() => {
    const labels: Record<ProviderCardStatus['kind'], string> = {
      ready: t.providerStatusReady,
      disabled: t.providerStatusDisabled,
      'needs-api-key': t.providerStatusNeedsApiKey,
      'configured-unverified': t.providerStatusConfiguredUnverified,
      invalid: t.providerStatusInvalid,
    };
    return (status: ProviderCardStatus) => labels[status.kind];
  }, [t]);

  return (
    <section className="ue-settings-section">
      {!safeStorageAvailable && (
        <div className="ue-settings-warning-banner">
          {t.sessionOnlyWarning}
        </div>
      )}

      <div className="ue-settings-provider-list">
        {settings.providers.map((provider: ProviderInstance) => {
          const isExpanded = expandedProviderId === provider.instanceId;
          const isAdvancedOpen = advancedExpanded[provider.instanceId] ?? false;
          const hasKey = !!provider.apiKeyRef;
          const isEditing = editingKey[provider.instanceId] !== undefined;
          const vendorLabel = getProviderVendorLabel(provider);
          const status = deriveProviderCardStatus(provider, providerReadiness);
          const bodyId = `ue-settings-provider-body-${safeDomIdSuffix(provider.instanceId)}`;
          const expandAria = isExpanded ? t.providerCollapseAria(vendorLabel) : t.providerExpandAria(vendorLabel);
          const statusLabel = statusLabelFor(status);
          const statusBadgeClass = `ue-provider-status-badge ue-provider-status-${status.kind}`;

          return (
            <article key={provider.instanceId} className="ue-settings-provider-card">
              <div className="ue-settings-provider-card-header">
                <div className="ue-settings-provider-summary">
                  <div className="ue-settings-provider-vendor">{vendorLabel}</div>
                  <div className="ue-settings-provider-meta">
                    <span className="ue-settings-provider-kind-label">{provider.kind}</span>
                    <span
                      className={statusBadgeClass}
                      title={status.message}
                      data-testid={`ue-provider-status-${provider.instanceId}`}
                    >
                      {statusLabel}
                    </span>
                  </div>
                </div>
                <div className="ue-settings-provider-header-actions">
                  <Switch
                    checked={provider.enabled}
                    onCheckedChange={value => updateProvider(provider.instanceId, { enabled: value })}
                    ariaLabel={t.enabled}
                    className="ue-settings-provider-enable"
                  />
                  <button
                    type="button"
                    className="ue-settings-btn ue-settings-btn-small ue-button-secondary ue-settings-provider-toggle"
                    aria-expanded={isExpanded}
                    aria-controls={bodyId}
                    onClick={() => toggleExpanded(provider.instanceId)}
                  >
                    {isExpanded ? common.collapse : common.expand}
                    <span className="ue-settings-provider-toggle-glyph" aria-hidden="true">
                      {isExpanded ? '▾' : '▸'}
                    </span>
                    <span className="ue-settings-provider-toggle-aria">{expandAria}</span>
                  </button>
                </div>
              </div>

              {isExpanded ? (
                <div id={bodyId} className="ue-settings-provider-card-body">
                  <div className="ue-settings-field">
                    <label className="ue-settings-label">{t.displayName}</label>
                    <input
                      type="text"
                      className="ue-settings-input"
                      value={provider.displayName}
                      onChange={e => updateProvider(provider.instanceId, { displayName: e.target.value })}
                    />
                  </div>

                  <div className="ue-settings-field">
                    <label className="ue-settings-label">{t.baseUrl}</label>
                    <input
                      type="text"
                      className="ue-settings-input"
                      value={provider.baseUrl}
                      onChange={e => updateProvider(provider.instanceId, { baseUrl: e.target.value })}
                    />
                  </div>

                  <div className="ue-settings-field">
                    <label className="ue-settings-label">{t.defaultModel}</label>
                    <input
                      type="text"
                      className="ue-settings-input"
                      value={provider.defaultModel}
                      onChange={e => updateProvider(provider.instanceId, { defaultModel: e.target.value })}
                    />
                  </div>

                  <div className="ue-settings-field">
                    <label className="ue-settings-label">
                      {t.apiKey}
                      {!safeStorageAvailable && (
                        <span className="ue-settings-session-badge">{t.sessionOnly}</span>
                      )}
                    </label>
                    <div className="ue-settings-api-key-row">
                      {hasKey && !isEditing ? (
                        <>
                          <input
                            type="password"
                            className="ue-settings-input"
                            value="••••••••"
                            readOnly
                          />
                          <button
                            type="button"
                            className="ue-settings-btn ue-settings-btn-small ue-settings-btn-secondary"
                            onClick={() => setEditingKey(prev => ({ ...prev, [provider.instanceId]: '' }))}
                          >
                            {t.replace}
                          </button>
                          <button
                            type="button"
                            className="ue-settings-btn ue-settings-btn-small ue-settings-btn-danger"
                            onClick={() => handleClearApiKey(provider.instanceId)}
                          >
                            {t.clearKey}
                          </button>
                        </>
                      ) : (
                        <>
                          <input
                            type="password"
                            className="ue-settings-input"
                            placeholder={t.apiKeyPlaceholder}
                            value={editingKey[provider.instanceId] ?? ''}
                            onChange={e => setEditingKey(prev => ({ ...prev, [provider.instanceId]: e.target.value }))}
                          />
                          <button
                            type="button"
                            className="ue-settings-btn ue-settings-btn-small"
                            onClick={() => handleSaveApiKey(provider.instanceId)}
                            disabled={!editingKey[provider.instanceId] || editingKey[provider.instanceId].trim().length === 0}
                          >
                            {t.saveKey}
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {MODEL_PURPOSE_KEYS.map(purpose => (
                    <div key={purpose} className="ue-settings-field">
                      <label className="ue-settings-label">{t[MODEL_PURPOSE_TO_LABEL[purpose]]}</label>
                      <input
                        type="text"
                        className="ue-settings-input"
                        value={provider[purpose]}
                        onChange={e => updateProvider(provider.instanceId, { [purpose]: e.target.value } as Partial<ProviderInstance>)}
                      />
                    </div>
                  ))}

                  <div className="ue-settings-provider-actions-row">
                    <button
                      type="button"
                      className="ue-settings-btn ue-settings-btn-small ue-settings-btn-disabled"
                      disabled
                      title={t.testConnectionUnavailable}
                    >
                      {t.testConnectionUnavailable}
                    </button>
                    <button
                      type="button"
                      className="ue-settings-btn ue-settings-btn-small ue-settings-btn-secondary"
                      onClick={() => toggleAdvanced(provider.instanceId)}
                    >
                      {t.advancedToggle(isAdvancedOpen)}
                    </button>
                  </div>

                  {isAdvancedOpen && (
                    <div className="ue-settings-advanced-section">
                      <div className="ue-settings-field">
                        <label className="ue-settings-label">{t.timeout}</label>
                        <input
                          type="number"
                          className="ue-settings-input ue-settings-input-narrow"
                          value={provider.advanced.timeout}
                          onChange={e => updateProvider(provider.instanceId, {
                            advanced: { ...provider.advanced, timeout: Number(e.target.value) }
                          })}
                        />
                      </div>
                      <div className="ue-settings-field">
                        <label className="ue-settings-label">{t.retries}</label>
                        <input
                          type="number"
                          className="ue-settings-input ue-settings-input-narrow"
                          value={provider.advanced.retries}
                          onChange={e => updateProvider(provider.instanceId, {
                            advanced: { ...provider.advanced, retries: Number(e.target.value) }
                          })}
                        />
                      </div>
                      <div className="ue-settings-field ue-settings-toggle-row">
                        <span className="ue-settings-label">{t.streaming}</span>
                        <Switch
                          checked={provider.advanced.streaming}
                          onCheckedChange={value => updateProvider(provider.instanceId, {
                            advanced: { ...provider.advanced, streaming: value }
                          })}
                          ariaLabel={t.streaming}
                        />
                      </div>
                      <div className="ue-settings-field">
                        <label className="ue-settings-label">{t.temperature}</label>
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          max="2"
                          className="ue-settings-input ue-settings-input-narrow"
                          value={provider.advanced.temperature}
                          onChange={e => updateProvider(provider.instanceId, {
                            advanced: { ...provider.advanced, temperature: Number(e.target.value) }
                          })}
                        />
                      </div>
                      <div className="ue-settings-field">
                        <label className="ue-settings-label">{t.maxTokens}</label>
                        <input
                          type="number"
                          className="ue-settings-input ue-settings-input-narrow"
                          value={provider.advanced.maxTokens}
                          onChange={e => updateProvider(provider.instanceId, {
                            advanced: { ...provider.advanced, maxTokens: Number(e.target.value) }
                          })}
                        />
                      </div>
                      <div className="ue-settings-field">
                        <label className="ue-settings-label">{t.reasoningEffort}</label>
                        <input
                          type="text"
                          className="ue-settings-input"
                          value={provider.advanced.reasoningEffort}
                          onChange={e => updateProvider(provider.instanceId, {
                            advanced: { ...provider.advanced, reasoningEffort: e.target.value }
                          })}
                        />
                      </div>
                      <div className="ue-settings-field">
                        <label className="ue-settings-label">{t.proxy}</label>
                        <input
                          type="text"
                          className="ue-settings-input"
                          value={provider.advanced.proxy}
                          onChange={e => updateProvider(provider.instanceId, {
                            advanced: { ...provider.advanced, proxy: e.target.value }
                          })}
                        />
                      </div>
                    </div>
                  )}
                </div>
              ) : null}
            </article>
          );
        })}
      </div>

      <div className="ue-settings-provider-actions">
        <button type="button" className="ue-settings-btn" onClick={addProvider}>
          {t.addProvider}
        </button>
      </div>

      {feedback && feedback.visible && (
        <div className="ue-settings-feedback-msg">{feedback.message}</div>
      )}
    </section>
  );
}
