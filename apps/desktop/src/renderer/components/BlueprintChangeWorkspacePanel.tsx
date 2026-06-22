import { useState, useMemo, useCallback } from 'react';
import { useDesktopCopy } from '../i18n';
import type {
  BlueprintAssetSummary,
  BlueprintChangePlan,
  PlanSafetyClassification,
  BlueprintInventoryEntry,
  BlueprintInventorySourceKind,
  AssetSource,
} from '@omue/shared-protocol';
import { buildMockPlan, classifyPlanSafety } from '../services/blueprint-change-plan-service';
import {
  getCombinedInventory,
  addManualTarget,
  clearManualTargets,
  getDeferredBridgeState,
} from '../services/blueprint-target-inventory-service';
import type { AiPlanAdapterRequest, AiPlanAdapterResponse, AdapterSafetyMsgCode, AdapterValidationMsgCode } from '../services/ai-plan-adapter-types';
import { generateMockAiPlan, validateAdapterOutput } from '../services/mock-ai-plan-adapter';
import type { AdapterValidationResult } from '../services/mock-ai-plan-adapter';
import type { BlueprintChangeWorkspaceCopy } from '../i18n/types';
import { computeReadinessChecklist, buildReviewPacket } from '../services/blueprint-review-handoff-service';

function safetyMsgLocalized(code: AdapterSafetyMsgCode, cc: BlueprintChangeWorkspaceCopy): string {
  switch (code) {
    case 'safety_no_real_ai': return cc.aiSafetyNoAi;
    case 'safety_no_network': return cc.aiSafetyNoNetwork;
    case 'safety_no_ue_write_save': return cc.aiSafetyNoUeWrite;
    case 'safety_plan_untrusted': return cc.aiPlanUntrusted;
    case 'safety_production_blocked': return cc.aiProductionBlocked;
  }
}

function validationMsgLocalized(code: AdapterValidationMsgCode, cc: BlueprintChangeWorkspaceCopy): string {
  switch (code) {
    case 'validation_no_intent': return cc.aiEmptyIntent;
    case 'validation_production_no_write': return cc.aiProductionNoWritePath;
  }
}

function eligibilityDisplay(eligibility: BlueprintAssetSummary['eligibility'], cc: ReturnType<typeof useDesktopCopy>['copy']['blueprintChangeWorkspace']): string {
  switch (eligibility) {
    case 'eligible_scratch_or_test': return cc.eligibleScratchOrTest;
    case 'production_write_blocked': return cc.productionWriteBlocked;
    case 'unknown': return cc.eligibilityUnknown;
    default: return cc.eligibilityUnknown;
  }
}

function eligibilityClass(eligibility: BlueprintAssetSummary['eligibility']): string {
  switch (eligibility) {
    case 'eligible_scratch_or_test': return 'bcw-elig-eligible';
    case 'production_write_blocked': return 'bcw-elig-blocked';
    case 'unknown': return 'bcw-elig-unknown';
    default: return 'bcw-elig-unknown';
  }
}

function safetyStatusClass(status: BlueprintChangePlan['operations'][number]['safetyStatus']): string {
  switch (status) {
    case 'safe': return 'bcw-safety-safe';
    case 'caution': return 'bcw-safety-caution';
    case 'danger': return 'bcw-safety-danger';
    default: return 'bcw-safety-caution';
  }
}

function classificationClass(classification: PlanSafetyClassification): string {
  switch (classification) {
    case 'preview_only': return 'bcw-class-preview';
    case 'write_blocked_production': return 'bcw-class-blocked';
    case 'needs_user_approval_future': return 'bcw-class-approval';
    case 'unsupported_or_unknown': return 'bcw-class-unknown';
    default: return 'bcw-class-unknown';
  }
}

function classificationDisplay(classification: PlanSafetyClassification, cc: ReturnType<typeof useDesktopCopy>['copy']['blueprintChangeWorkspace']): string {
  switch (classification) {
    case 'preview_only': return cc.classPreviewOnly;
    case 'write_blocked_production': return cc.classWriteBlocked;
    case 'needs_user_approval_future': return cc.classNeedsApproval;
    case 'unsupported_or_unknown': return cc.classUnsupported;
    default: return cc.classUnsupported;
  }
}

function operationKindDisplay(kind: BlueprintChangePlan['operations'][number]['kind']): string {
  switch (kind) {
    case 'set_variable': return 'Set Variable';
    case 'modify_graph': return 'Modify Graph';
    case 'update_metadata': return 'Update Metadata';
    case 'add_component': return 'Add Component';
    default: return 'Unknown';
  }
}

function targetAreaDisplay(area: BlueprintChangePlan['operations'][number]['targetArea']): string {
  switch (area) {
    case 'variable': return 'Variable';
    case 'graph': return 'Graph';
    case 'metadata': return 'Metadata';
    case 'component': return 'Component';
    default: return 'Unknown';
  }
}

function writeStatusLabel(classification: PlanSafetyClassification, cc: ReturnType<typeof useDesktopCopy>['copy']['blueprintChangeWorkspace']): string {
  switch (classification) {
    case 'preview_only': return cc.writeStatusPreview;
    case 'write_blocked_production': return cc.writeStatusBlocked;
    case 'needs_user_approval_future': return cc.writeStatusApproval;
    case 'unsupported_or_unknown': return cc.writeStatusUnsupported;
    default: return cc.writeStatusUnsupported;
  }
}

function nextHumanDecision(classification: PlanSafetyClassification, hasIntent: boolean, cc: ReturnType<typeof useDesktopCopy>['copy']['blueprintChangeWorkspace']): string {
  if (!hasIntent) return cc.nextDecisionNoIntent;
  switch (classification) {
    case 'preview_only': return cc.nextDecisionPreview;
    case 'write_blocked_production': return cc.nextDecisionBlocked;
    case 'needs_user_approval_future': return cc.nextDecisionApproval;
    case 'unsupported_or_unknown': return cc.nextDecisionUnsupported;
    default: return cc.nextDecisionUnsupported;
  }
}

function sourceBadgeClass(sourceKind: BlueprintInventorySourceKind): string {
  switch (sourceKind) {
    case 'mock_local': return 'bcw-source-mock';
    case 'manual': return 'bcw-source-manual';
    case 'imported': return 'bcw-source-imported';
    case 'real_readonly_bridge': return 'bcw-source-real';
    case 'real_bridge_future': return 'bcw-source-real';
    default: return 'bcw-source-mock';
  }
}

function sourceBadgeLabel(sourceKind: BlueprintInventorySourceKind, cc: ReturnType<typeof useDesktopCopy>['copy']['blueprintChangeWorkspace']): string {
  switch (sourceKind) {
    case 'mock_local': return cc.inventorySourceMock;
    case 'manual': return cc.inventorySourceManual;
    case 'imported': return cc.inventorySourceImported;
    case 'real_readonly_bridge': return cc.inventorySourceReal;
    case 'real_bridge_future': return cc.inventorySourceBridgeDeferred;
    default: return cc.inventorySourceMock;
  }
}

function rowSourceBadgeClass(source: AssetSource): string {
  switch (source) {
    case 'mock_local_fixture': return 'bcw-source-mock';
    case 'manual_entry': return 'bcw-source-manual';
    case 'imported_list': return 'bcw-source-imported';
    case 'real_readonly_bridge': return 'bcw-source-real';
    case 'real_bridge_future': return 'bcw-source-real';
    default: return 'bcw-source-mock';
  }
}

function rowSourceBadgeLabel(source: AssetSource, cc: ReturnType<typeof useDesktopCopy>['copy']['blueprintChangeWorkspace']): string {
  switch (source) {
    case 'mock_local_fixture': return cc.inventorySourceRowMock;
    case 'manual_entry': return cc.inventorySourceRowManual;
    case 'imported_list': return cc.inventorySourceRowImported;
    case 'real_readonly_bridge': return cc.inventorySourceRowReal;
    case 'real_bridge_future': return cc.inventorySourceRowDeferred;
    default: return cc.inventorySourceRowOther;
  }
}

export default function BlueprintChangeWorkspacePanel() {
  const { copy } = useDesktopCopy();
  const cc = copy.blueprintChangeWorkspace;

  const [selectedAssetPath, setSelectedAssetPath] = useState<string | null>(null);
  const [userIntent, setUserIntent] = useState('');
  const [showRaw, setShowRaw] = useState(false);
  const [copiedStatus, setCopiedStatus] = useState<'idle' | 'ok' | 'fail'>('idle');
  const [planSourceMode, setPlanSourceMode] = useState<'local' | 'mock_adapter'>('local');
  const [adapterResponse, setAdapterResponse] = useState<AiPlanAdapterResponse | null>(null);
  const [adapterValidation, setAdapterValidation] = useState<AdapterValidationResult | null>(null);
  const [showAdapterRequest, setShowAdapterRequest] = useState(false);

  const [manualPathInput, setManualPathInput] = useState('');
  const [manualAddStatus, setManualAddStatus] = useState<'idle' | 'added' | 'duplicate'>('idle');
  const [showBridgeDeferred, setShowBridgeDeferred] = useState(false);
  const [showManualSection, setShowManualSection] = useState(false);
  const [showChecklist, setShowChecklist] = useState(false);

  const [inventoryKey, setInventoryKey] = useState(0);

  const inventoryState = useMemo(() => {
    return getCombinedInventory();
  }, [inventoryKey]);

  const assets = useMemo(() => inventoryState.items, [inventoryState]);

  const selectedTarget = useMemo(() => {
    if (!selectedAssetPath) return null;
    return assets.find(a => a.assetPath === selectedAssetPath) ?? null;
  }, [selectedAssetPath, assets]);

  const selectedPlan = useMemo(() => {
    if (!selectedTarget) return null;
    if (planSourceMode === 'mock_adapter' && adapterResponse?.plan) {
      return adapterResponse.plan;
    }
    return buildMockPlan(selectedTarget.assetPath, selectedTarget.displayName, userIntent);
  }, [selectedTarget, userIntent, planSourceMode, adapterResponse]);

  const safetyClassification = useMemo(() => {
    if (!selectedTarget) return null;
    return classifyPlanSafety(selectedTarget);
  }, [selectedTarget]);

  const handleRefreshPlan = useCallback(() => {
    if (!selectedAssetPath) return;
    setPlanSourceMode('local');
    setAdapterResponse(null);
    setAdapterValidation(null);
  }, [selectedAssetPath]);

  const handleMockAdapterPreview = useCallback(() => {
    if (!selectedTarget) return;
    const request: AiPlanAdapterRequest = {
      selectedTargetPath: selectedTarget.assetPath,
      selectedTargetDisplayName: selectedTarget.displayName,
      userIntent,
      mode: 'mock_local_adapter',
    };
    const response = generateMockAiPlan(request);
    const validation = validateAdapterOutput(response, request);
    setAdapterResponse(response);
    setAdapterValidation(validation);
    setPlanSourceMode('mock_adapter');
    setShowAdapterRequest(false);
  }, [selectedTarget, userIntent]);

  const handleAddManualTarget = useCallback(() => {
    const path = manualPathInput.trim();
    if (!path) return;
    const name = path.split('/').pop() ?? path;
    const existing = assets.find(a => a.assetPath === path);
    if (existing && existing.source !== 'manual_entry') {
      setManualAddStatus('duplicate');
      setTimeout(() => setManualAddStatus('idle'), 2000);
      return;
    }
    addManualTarget(path, name, 'Blueprint');
    setManualAddStatus('added');
    setInventoryKey(k => k + 1);
    setTimeout(() => setManualAddStatus('idle'), 2000);
  }, [manualPathInput, assets]);

  const handleClearManual = useCallback(() => {
    clearManualTargets();
    setInventoryKey(k => k + 1);
  }, []);

  const handleCopySummary = useCallback(async () => {
    if (!selectedPlan) return;
    const lines = [
      `OMUE Blueprint Change Plan — ${selectedPlan.targetDisplayName}`,
      `Classification: ${safetyClassification ?? 'unknown'}`,
      `Intent: ${selectedPlan.userIntent}`,
      `Summary: ${selectedPlan.summary}`,
      `Risk: ${selectedPlan.risk.level}`,
      `Write Status: ${safetyClassification ? writeStatusLabel(safetyClassification, cc) : 'unknown'}`,
      `Next: ${safetyClassification ? nextHumanDecision(safetyClassification, userIntent.trim().length > 0, cc) : 'review classification'}`,
      '',
      `Operations (${selectedPlan.operations.length}):`,
      ...selectedPlan.operations.map(op => `- [${op.kind}] ${op.description} (${op.safetyStatus})`),
      '',
      `Rollback: ${selectedPlan.rollbackReadiness.status}`,
      `Validation: ${selectedPlan.validationRequirements.requiredChecks.length} required checks, ${selectedPlan.validationRequirements.userLocalChecks.length} user-local checks`,
      '',
      'Mock/local preview only. No AI generated this plan. No UE write/save/rollback/compile/PIE/Automation performed.',
    ];
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopiedStatus('ok');
    } catch {
      setCopiedStatus('fail');
    }
    setTimeout(() => setCopiedStatus('idle'), 2000);
  }, [selectedPlan, safetyClassification, cc, userIntent]);

  const handleCopyReviewPacket = useCallback(async () => {
    if (!selectedAssetPath) return;
    const sourceLabel = selectedTarget ? rowSourceBadgeLabel(selectedTarget.source, cc) : '';
    const eligibilityLabel = selectedTarget ? eligibilityDisplay(selectedTarget.eligibility, cc) : '';
    const classificationLabel = safetyClassification ? classificationDisplay(safetyClassification, cc) : '';
    const nextLabel = safetyClassification ? nextHumanDecision(safetyClassification, userIntent.trim().length > 0, cc) : '';
    const writeLabel = safetyClassification ? writeStatusLabel(safetyClassification, cc) : '';
    const packet = buildReviewPacket(
      selectedAssetPath,
      selectedTarget,
      userIntent,
      planSourceMode,
      selectedPlan,
      safetyClassification,
      sourceLabel,
      eligibilityLabel,
      classificationLabel,
      nextLabel,
      writeLabel,
      cc.reviewHandoffExecDeferred,
      cc,
    );
    try {
      await navigator.clipboard.writeText(packet);
      setCopiedStatus('ok');
    } catch {
      setCopiedStatus('fail');
    }
    setTimeout(() => setCopiedStatus('idle'), 2000);
  }, [selectedAssetPath, selectedTarget, userIntent, planSourceMode, selectedPlan, safetyClassification, cc]);

  const readiness = useMemo(() => {
    return computeReadinessChecklist(selectedTarget, userIntent, selectedPlan);
  }, [selectedTarget, userIntent, selectedPlan]);

  const manualEntries = useMemo(() => {
    return assets.filter(a => a.source === 'manual_entry');
  }, [assets]);

  return (
    <section className="bcw-panel">
      <div className="bcw-summary">
        <h3 className="bcw-summary-title">{cc.summaryHeader}</h3>
        <p className="bcw-summary-detail">{cc.summaryDetailE92}</p>
      </div>

      <div className="bcw-safety-banner">
        <strong>{cc.safetyBannerE92}</strong>
        <br />
        {cc.safetyBannerDetailE92}
      </div>

      <div className="bcw-layout">
        <div className="bcw-sidebar">
          <h4 className="bcw-sidebar-title">{cc.inventorySectionTitle} ({assets.length})</h4>
          <div className="bcw-source-label">
            <span className={`bcw-source-badge ${sourceBadgeClass(inventoryState.sourceKind)}`}>
              {sourceBadgeLabel(inventoryState.sourceKind, cc)}
            </span>
          </div>
          <div className="bcw-source-label">
            <span className="bcw-health-text">
              {cc.inventoryHealth}: {inventoryState.health === 'loaded' ? cc.inventoryHealthLoaded : cc.inventoryHealthUnavailable}
            </span>
          </div>

          {inventoryState.sourceKind === 'manual' && (
            <p className="bcw-dimmed">{cc.manualEntryPlanningOnlyNote}</p>
          )}

          <div className="bcw-section">
            <button
              className="bcw-collapse-btn"
              onClick={() => setShowManualSection(!showManualSection)}
              type="button"
            >
              {showManualSection ? cc.collapsibleCollapse : cc.manualEntryTitle}
            </button>
            {showManualSection && (
              <div className="bcw-manual-entry-area">
                <div className="bcw-manual-row">
                  <input
                    className="bcw-manual-input"
                    type="text"
                    value={manualPathInput}
                    onChange={e => setManualPathInput(e.target.value)}
                    placeholder={cc.manualEntryPlaceholder}
                  />
                  <button
                    className="bcw-manual-btn"
                    onClick={handleAddManualTarget}
                    type="button"
                  >
                    {cc.manualEntryBtn}
                  </button>
                </div>
                {manualAddStatus === 'added' && (
                  <p className="bcw-manual-status-ok">{cc.manualEntryAdded}</p>
                )}
                {manualAddStatus === 'duplicate' && (
                  <p className="bcw-manual-status-warn">{cc.manualEntryDuplicate}</p>
                )}
              </div>
            )}
          </div>

          {manualEntries.length > 0 && (
            <div className="bcw-section">
              <div className="bcw-manual-header-row">
                <span className="bcw-manual-header-label">{cc.manualEntryTargetsSection} ({manualEntries.length})</span>
                <button
                  className="bcw-manual-clear-btn"
                  onClick={handleClearManual}
                  type="button"
                >
                  {cc.manualClearBtn}
                </button>
              </div>
            </div>
          )}

          <div className="bcw-section">
            <button
              className="bcw-collapse-btn"
              onClick={() => setShowBridgeDeferred(!showBridgeDeferred)}
              type="button"
            >
              {showBridgeDeferred ? cc.collapsibleCollapse : cc.bridgeDeferredTitle}
            </button>
            {showBridgeDeferred && (
              <div className="bcw-bridge-deferred-area">
                <p className="bcw-dimmed">{cc.bridgeDeferredDetail}</p>
              </div>
            )}
          </div>

          {assets.length === 0 ? (
            <div className="bcw-empty">{cc.inventoryEmpty}</div>
          ) : (
            <table className="bcw-table">
              <thead>
                <tr>
                  <th>{cc.inventoryAssetPath}</th>
                  <th>{cc.inventoryDisplayName}</th>
                  <th>{cc.inventoryAssetClass}</th>
                  <th>{cc.inventoryEligibility}</th>
                  <th>{cc.inventoryDirtyState}</th>
                  <th>{cc.inventorySource}</th>
                </tr>
              </thead>
              <tbody>
                {assets.map(asset => (
                  <tr
                    key={asset.assetPath}
                    className={`bcw-asset-row${selectedAssetPath === asset.assetPath ? ' bcw-asset-row-selected' : ''}`}
                    onClick={() => { setSelectedAssetPath(asset.assetPath); setShowRaw(false); }}
                    role="button"
                    tabIndex={0}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { setSelectedAssetPath(asset.assetPath); setShowRaw(false); } }}
                  >
                    <td className="bcw-cell-mono">{asset.assetPath}</td>
                    <td>
                      {asset.displayName}
                      {asset.eligibility === 'production_write_blocked' && (
                        <span className="bcw-planning-only-badge">{cc.inventoryPlanningOnly}</span>
                      )}
                    </td>
                    <td>{asset.assetClass}</td>
                    <td>
                      <span className={`bcw-elig-badge ${eligibilityClass(asset.eligibility)}`}>
                        {eligibilityDisplay(asset.eligibility, cc)}
                      </span>
                    </td>
                    <td>{asset.dirtyState}</td>
                    <td className="bcw-cell-source">
                      <span className={`bcw-source-mini-badge ${rowSourceBadgeClass(asset.source)}`}>
                        {rowSourceBadgeLabel(asset.source, cc)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="bcw-main">
          {!selectedAssetPath ? (
            <div className="bcw-empty-main">
              <p>{cc.planNoSelection}</p>
              <p className="bcw-dimmed">{cc.mockOnlyNotice}<br />{cc.mockOnlyDetail}</p>
            </div>
          ) : (
            <div className="bcw-detail-area">
              {!selectedTarget ? (
                <div className="bcw-empty-main">
                  <p>{cc.planEmpty}</p>
                </div>
              ) : (
                <>
                  <div className="bcw-section bcw-intent-section">
                    <label className="bcw-intent-label" htmlFor="bcw-intent-input">
                      {cc.intentLabel}
                    </label>
                    <div className="bcw-intent-row">
                      <input
                        id="bcw-intent-input"
                        className="bcw-intent-input"
                        type="text"
                        value={userIntent}
                        onChange={e => setUserIntent(e.target.value)}
                        placeholder={cc.intentPlaceholder}
                      />
                      <button
                        className="bcw-generate-btn"
                        onClick={handleRefreshPlan}
                        type="button"
                      >
                        {cc.generatePlanBtn}
                      </button>
                    </div>
                    <p className="bcw-intent-hint">{cc.intentHint}</p>
                  </div>

                  <div className="bcw-section bcw-adapter-mode-section">
                    <div className="bcw-adapter-mode-row">
                      <span className="bcw-adapter-mode-label">{cc.aiModeLabel}</span>
                      <span className={`bcw-adapter-mode-badge ${planSourceMode === 'local' ? 'bcw-adapter-mode-active' : ''}`}>
                        {cc.aiModeLocal}
                      </span>
                      <span className={`bcw-adapter-mode-badge ${planSourceMode === 'mock_adapter' ? 'bcw-adapter-mode-active' : ''}`}>
                        {cc.aiModeMock}
                      </span>
                      <span className="bcw-adapter-mode-badge bcw-adapter-mode-disabled">
                        {cc.aiModeRealDisabled}
                      </span>
                    </div>
                    <div className="bcw-adapter-action-row">
                      <button
                        className={`bcw-adapter-btn${planSourceMode === 'local' ? ' bcw-adapter-btn-active' : ''}`}
                        onClick={handleRefreshPlan}
                        type="button"
                      >
                        {cc.aiLocalPreviewBtn}
                      </button>
                      <button
                        className={`bcw-adapter-btn bcw-adapter-btn-mock${planSourceMode === 'mock_adapter' ? ' bcw-adapter-btn-active' : ''}`}
                        onClick={handleMockAdapterPreview}
                        type="button"
                      >
                        {cc.aiPreviewBtn}
                      </button>
                    </div>
                  </div>

                  {planSourceMode === 'mock_adapter' && adapterResponse && (
                    <div className="bcw-section bcw-adapter-result-section">
                      <div className="bcw-adapter-status-row">
                        <span className="bcw-adapter-status-label">{cc.aiStatusLabel}</span>
                        <span className={`bcw-adapter-status-badge bcw-adapter-status-${adapterResponse.status}`}>
                          {adapterResponse.status === 'ok' ? cc.aiStatusOk
                            : adapterResponse.status === 'needs_clarification' ? cc.aiStatusClarification
                            : adapterResponse.status === 'blocked' ? cc.aiStatusBlocked
                            : cc.aiStatusError}
                        </span>
                        <span className="bcw-adapter-source-badge">{cc.aiMockBadge}</span>
                      </div>

                      {adapterResponse.safetyMessages.length > 0 && (
                        <div className="bcw-adapter-subsection">
                          <span className="bcw-adapter-subsection-title">{cc.aiSafetyMsg}</span>
                          <ul className="bcw-adapter-msg-list">
                            {adapterResponse.safetyMessageCodes.map((code, i) => (
                              <li key={i} className="bcw-adapter-msg-item">{safetyMsgLocalized(code, cc)}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {adapterResponse.validationMessages.length > 0 && (
                        <div className="bcw-adapter-subsection">
                          <span className="bcw-adapter-subsection-title">{cc.aiValidationMsg}</span>
                          <ul className="bcw-adapter-msg-list bcw-adapter-validation-list">
                            {adapterResponse.validationMessageCodes.map((code, i) => (
                              <li key={i} className="bcw-adapter-msg-item">{validationMsgLocalized(code, cc)}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {adapterValidation && !adapterValidation.valid && (
                        <div className="bcw-adapter-validation-error">
                          <span>{cc.aiValidationFailedLabel}</span>
                          <ul className="bcw-adapter-msg-list">
                            {adapterValidation.messages.map((msg, i) => (
                              <li key={i} className="bcw-adapter-msg-item">{msg}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      <div className="bcw-adapter-subsection">
                        <button
                          className="bcw-collapse-btn"
                          onClick={() => setShowAdapterRequest(!showAdapterRequest)}
                          type="button"
                        >
                          {showAdapterRequest ? cc.aiHideRequest : cc.aiShowRequest}
                        </button>
                        {showAdapterRequest && (
                          <div className="bcw-adapter-raw-section">
                            <div className="bcw-adapter-raw-block">
                              <span className="bcw-raw-section-title">{cc.aiRequestSection} — {cc.aiRequestLabel}</span>
                              <pre className="bcw-adapter-json-pre">
                                {JSON.stringify({
                                  selectedTargetPath: selectedTarget?.assetPath,
                                  selectedTargetDisplayName: selectedTarget?.displayName,
                                  userIntent,
                                  mode: 'mock_local_adapter',
                                }, null, 2)}
                              </pre>
                            </div>
                            <div className="bcw-adapter-raw-block">
                              <span className="bcw-raw-section-title">{cc.aiRequestSection} — {cc.aiResponseLabel}</span>
                              <pre className="bcw-adapter-json-pre">
                                {JSON.stringify(adapterResponse, null, 2)}
                              </pre>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {selectedPlan && safetyClassification && (
                    <>
                      <div className="bcw-section bcw-compact-summary">
                        <h4 className="bcw-compact-title">{cc.omuePlansTo}</h4>
                        <div className="bcw-compact-grid">
                          <div className="bcw-compact-item">
                            <span className="bcw-compact-label">{cc.targetBlueprint}:</span>
                            <span className="bcw-compact-value">{selectedPlan.targetDisplayName}</span>
                          </div>
                          <div className="bcw-compact-item">
                            <span className="bcw-compact-label">{cc.proposedChanges}:</span>
                            <span className="bcw-compact-value">{selectedPlan.operations.length > 0 ? `${selectedPlan.operations.length} operation(s)` : 'None proposed'}</span>
                          </div>
                          <div className="bcw-compact-item">
                            <span className="bcw-compact-label">{cc.summary}:</span>
                            <span className="bcw-compact-value">{selectedPlan.summary}</span>
                          </div>
                          <div className="bcw-compact-item">
                            <span className="bcw-compact-label">{cc.riskLevel}:</span>
                            <span className={`bcw-risk-badge bcw-risk-${selectedPlan.risk.level.toLowerCase()}`}>{selectedPlan.risk.level}</span>
                          </div>
                          <div className="bcw-compact-item">
                            <span className="bcw-compact-label">{cc.planSafetyStatus}:</span>
                            <span className={`bcw-class-badge ${classificationClass(safetyClassification)}`}>
                              {classificationDisplay(safetyClassification, cc)}
                            </span>
                          </div>
                          <div className="bcw-compact-item">
                            <span className="bcw-compact-label">{cc.writeStatus}:</span>
                            <span className="bcw-compact-value">{writeStatusLabel(safetyClassification, cc)}</span>
                          </div>
                          <div className="bcw-compact-item">
                            <span className="bcw-compact-label">{cc.nextStep}:</span>
                            <span className="bcw-compact-value">{nextHumanDecision(safetyClassification, userIntent.trim().length > 0, cc)}</span>
                          </div>
                          <div className="bcw-compact-item">
                            <span className="bcw-compact-label">{cc.rawSource}:</span>
                            <span className="bcw-compact-value">{cc.rawSourceMock}</span>
                          </div>
                        </div>
                      </div>

                      <div className="bcw-section bcw-review-handoff">
                        <h5 className="bcw-section-title">{cc.reviewHandoffTitle}</h5>
                        <div className="bcw-review-grid">
                          <div className="bcw-review-item">
                            <span className="bcw-compact-label">{cc.reviewHandoffTarget}:</span>
                            <span className="bcw-compact-value">{selectedPlan.targetDisplayName}</span>
                          </div>
                          <div className="bcw-review-item">
                            <span className="bcw-compact-label">{cc.reviewHandoffSource}:</span>
                            <span className="bcw-compact-value">{selectedTarget ? rowSourceBadgeLabel(selectedTarget.source, cc) : ''}</span>
                          </div>
                          <div className="bcw-review-item">
                            <span className="bcw-compact-label">{cc.reviewHandoffEligibility}:</span>
                            <span className={`bcw-elig-badge ${selectedTarget ? eligibilityClass(selectedTarget.eligibility) : ''}`}>
                              {selectedTarget ? eligibilityDisplay(selectedTarget.eligibility, cc) : ''}
                            </span>
                          </div>
                          <div className="bcw-review-item">
                            <span className="bcw-compact-label">{cc.reviewHandoffIntent}:</span>
                            <span className="bcw-compact-value">{userIntent || cc.reviewPacketEmptyIntent}</span>
                          </div>
                          <div className="bcw-review-item">
                            <span className="bcw-compact-label">{cc.reviewHandoffPlanMode}:</span>
                            <span className="bcw-compact-value">{planSourceMode === 'local' ? cc.aiModeLocal : cc.aiModeMock}</span>
                          </div>
                          <div className="bcw-review-item">
                            <span className="bcw-compact-label">{cc.reviewHandoffSafety}:</span>
                            <span className={`bcw-class-badge ${classificationClass(safetyClassification)}`}>
                              {classificationDisplay(safetyClassification, cc)}
                            </span>
                          </div>
                          <div className="bcw-review-item">
                            <span className="bcw-compact-label">{cc.reviewHandoffNextDecision}:</span>
                            <span className="bcw-compact-value">{nextHumanDecision(safetyClassification, userIntent.trim().length > 0, cc)}</span>
                          </div>
                          <div className="bcw-review-item">
                            <span className="bcw-compact-label">{cc.reviewHandoffRollback}:</span>
                            <span className="bcw-compact-value">{selectedPlan.rollbackReadiness.status}</span>
                          </div>
                          <div className="bcw-review-item">
                            <span className="bcw-compact-label">{cc.reviewHandoffValidation}:</span>
                            <span className="bcw-compact-value">
                              {selectedPlan.validationRequirements.requiredChecks.length + selectedPlan.validationRequirements.userLocalChecks.length > 0
                                ? `${selectedPlan.validationRequirements.requiredChecks.length + selectedPlan.validationRequirements.userLocalChecks.length} ${cc.reviewHandoffChecksLabel}`
                                : cc.reviewHandoffNoValidation}
                            </span>
                          </div>
                          <div className="bcw-review-item">
                            <span className="bcw-compact-label">{cc.reviewHandoffExecStatus}:</span>
                            <span className="bcw-compact-value">{cc.reviewHandoffExecDeferred}</span>
                          </div>
                        </div>
                      </div>

                      <div className="bcw-section bcw-readiness-checklist">
                        <button
                          className="bcw-collapse-btn"
                          onClick={() => setShowChecklist(!showChecklist)}
                          type="button"
                        >
                          {showChecklist ? cc.collapsibleCollapse : cc.readinessChecklistTitle}
                        </button>
                        {showChecklist && (
                          <div className="bcw-checklist-items">
                            <div className="bcw-checklist-item">
                              <span className={`bcw-checklist-check ${readiness.targetSelected ? 'bcw-checklist-done' : 'bcw-checklist-pending'}`}>
                                {readiness.targetSelected ? '✓' : '○'}
                              </span>
                              <span>{cc.readinessTargetSelected}</span>
                            </div>
                            <div className="bcw-checklist-item">
                              <span className={`bcw-checklist-check ${readiness.intentProvided ? 'bcw-checklist-done' : 'bcw-checklist-pending'}`}>
                                {readiness.intentProvided ? '✓' : '○'}
                              </span>
                              <span>{cc.readinessIntentProvided}</span>
                            </div>
                            <div className="bcw-checklist-item">
                              <span className={`bcw-checklist-check ${readiness.planGenerated ? 'bcw-checklist-done' : 'bcw-checklist-pending'}`}>
                                {readiness.planGenerated ? '✓' : '○'}
                              </span>
                              <span>{cc.readinessPlanGenerated}</span>
                            </div>
                            <div className="bcw-checklist-item">
                              <span className={`bcw-checklist-check ${readiness.eligibilityClear ? 'bcw-checklist-done' : 'bcw-checklist-pending'}`}>
                                {readiness.eligibilityClear ? '✓' : '○'}
                              </span>
                              <span>{cc.readinessEligibilityClear}</span>
                            </div>
                            <div className="bcw-checklist-item">
                              <span className={`bcw-checklist-check ${readiness.rollbackDescribed ? 'bcw-checklist-done' : 'bcw-checklist-pending'}`}>
                                {readiness.rollbackDescribed ? '✓' : '○'}
                              </span>
                              <span>{cc.readinessRollbackDescribed}</span>
                            </div>
                            <div className="bcw-checklist-item">
                              <span className={`bcw-checklist-check ${readiness.validationListed ? 'bcw-checklist-done' : 'bcw-checklist-pending'}`}>
                                {readiness.validationListed ? '✓' : '○'}
                              </span>
                              <span>{cc.readinessValidationListed}</span>
                            </div>
                            <div className="bcw-checklist-item">
                              <span className={`bcw-checklist-check ${readiness.executionDeferred ? 'bcw-checklist-done' : 'bcw-checklist-pending'}`}>
                                {readiness.executionDeferred ? '✓' : '○'}
                              </span>
                              <span>{cc.readinessExecutionDeferred}</span>
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="bcw-section bcw-review-copy-section">
                        <button
                          className="bcw-action-btn"
                          onClick={handleCopyReviewPacket}
                          type="button"
                        >
                          {copiedStatus === 'ok' ? cc.copied : copiedStatus === 'fail' ? cc.copyFailed : cc.copyReviewPacket}
                        </button>
                      </div>

                      <div className="bcw-section">
                        <h5 className="bcw-section-title">{cc.proposedPlan}</h5>
                        {selectedPlan.operations.length === 0 ? (
                          <p className="bcw-section-empty">{cc.noPlanData}</p>
                        ) : (
                          <table className="bcw-table">
                            <thead>
                              <tr>
                                <th>{cc.operationId}</th>
                                <th>{cc.operationKind}</th>
                                <th>{cc.operationTargetArea}</th>
                                <th>{cc.operationDescription}</th>
                                <th>{cc.operationSafetyStatus}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {selectedPlan.operations.map(op => (
                                <tr key={op.id}>
                                  <td className="bcw-cell-mono">{op.id}</td>
                                  <td>{operationKindDisplay(op.kind)}</td>
                                  <td>{targetAreaDisplay(op.targetArea)}</td>
                                  <td>{op.description}</td>
                                  <td>
                                    <span className={`bcw-safety-badge ${safetyStatusClass(op.safetyStatus)}`}>
                                      {op.safetyStatus === 'safe' ? cc.safetySafe : op.safetyStatus === 'caution' ? cc.safetyCaution : cc.safetyDanger}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>

                      <div className="bcw-section">
                        <h5 className="bcw-section-title">{cc.riskSection}</h5>
                        <div className="bcw-field">
                          <span className="bcw-field-label">{cc.riskLevel}:</span>
                          <span className={`bcw-risk-badge bcw-risk-${selectedPlan.risk.level.toLowerCase()}`}>{selectedPlan.risk.level}</span>
                        </div>
                        <ul className="bcw-reason-list">
                          {selectedPlan.risk.reasons.map((r, i) => (
                            <li key={i}>{r}</li>
                          ))}
                        </ul>
                      </div>

                      <div className="bcw-section">
                        <h5 className="bcw-section-title">{cc.rollbackSection}</h5>
                        <div className="bcw-field">
                          <span className="bcw-field-label">{cc.rollbackStatus}:</span>
                          <span>{selectedPlan.rollbackReadiness.status}</span>
                        </div>
                        <p className="bcw-section-text">{selectedPlan.rollbackReadiness.notes}</p>
                      </div>

                      <div className="bcw-section">
                        <h5 className="bcw-section-title">{cc.approvalSection}</h5>
                        <div className="bcw-field">
                          <span className="bcw-field-label">{cc.approvalRequired}:</span>
                          <span>{selectedPlan.approvalRequirements.required ? cc.yes : cc.no}</span>
                        </div>
                        <p className="bcw-section-text">{selectedPlan.approvalRequirements.notes}</p>
                      </div>

                      <div className="bcw-section">
                        <h5 className="bcw-section-title">{cc.validationSection}</h5>
                        {selectedPlan.validationRequirements.requiredChecks.length > 0 && (
                          <div className="bcw-subsection">
                            <h6 className="bcw-subsection-title">{cc.validationRequiredChecks}</h6>
                            <ul className="bcw-check-list">
                              {selectedPlan.validationRequirements.requiredChecks.map((c, i) => (
                                <li key={i}>{c}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {selectedPlan.validationRequirements.userLocalChecks.length > 0 && (
                          <div className="bcw-subsection">
                            <h6 className="bcw-subsection-title">{cc.validationUserLocalChecks}</h6>
                            <ul className="bcw-check-list">
                              {selectedPlan.validationRequirements.userLocalChecks.map((c, i) => (
                                <li key={i}>{c}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>

                      <div className="bcw-section">
                        <button
                          className="bcw-action-btn"
                          onClick={handleCopySummary}
                          type="button"
                        >
                          {copiedStatus === 'ok' ? cc.copied : copiedStatus === 'fail' ? cc.copyFailed : cc.copyPlanSummary}
                        </button>
                      </div>

                      <div className="bcw-section">
                        <button
                          className="bcw-collapse-btn"
                          onClick={() => setShowRaw(!showRaw)}
                          type="button"
                        >
                          {showRaw ? cc.collapsibleCollapse : cc.collapsibleExpand}
                        </button>
                        {showRaw && (
                          <div className="bcw-raw-section">
                            <div className="bcw-field">
                              <span className="bcw-field-label">{cc.rawSource}:</span>
                              <span>{cc.rawSourceMock}</span>
                            </div>
                            <pre className="bcw-json-pre">
                              {JSON.stringify(selectedPlan, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>

                      <div className="bcw-safety-footer">
                        <p><strong>{cc.noAiGenerated}</strong></p>
                        <p><strong>{cc.noUeWrite}</strong></p>
                        <p className="bcw-dimmed">{cc.mockOnlyPlanNote}</p>
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
