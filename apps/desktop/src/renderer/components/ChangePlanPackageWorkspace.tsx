import { useState, useMemo, useRef, useCallback } from 'react';
import { useDesktopCopy } from '../i18n';
import type { ChangePlanPackageCopy } from '../i18n/types';

// ── Renderer-local types (no shared-protocol changes) ──

type PlanStatus = 'draft' | 'ready_for_review' | 'approved' | 'rejected' | 'blocked';
type OperationType = 'blueprint_bug_fix' | 'blueprint_generation' | 'bt_bb_plan' | 'manual_only';
type RiskLevel = 'low' | 'medium' | 'high' | 'unknown';

interface EvidenceLink {
  sourceType: string;
  sourceLabel: string;
  relevantAssetPath?: string;
}

interface ChangePlanPackage {
  id: string;
  title: string;
  description: string;
  motivation: string;
  status: PlanStatus;
  operationType: OperationType;
  riskLevel: RiskLevel;
  riskRationale: string;
  affectedAsset: string;
  affectedAssets: string[];
  evidenceLinks: EvidenceLink[];
  assumptions: string;
  risks: string;
  validationNotes: string;
  rollbackNotes: string;
  createdAt: string;
  updatedAt: string;
  stale: boolean;
  provenance: {
    author: 'user' | 'template' | 'deterministic_rule';
    confidence: 'high' | 'medium' | 'low';
    knownLimitations: string[];
  };
}

// ── Deterministic mock fixtures ──

const NOW = new Date();
const DAY_MS = 86400000;

function daysAgo(n: number): string {
  return new Date(NOW.getTime() - n * DAY_MS).toISOString();
}

const MOCK_PLANS: ChangePlanPackage[] = [
  {
    id: 'plan-001',
    title: 'Fix Missing Enemy Health Check',
    description: 'Add a Condition_CheckHealth decorator to Sequence_Patrol and wire bHasLowHealth Blackboard key to track pawn health.',
    motivation: 'BT_CombatGuard patrol sequence lacks a health check, causing enemies to continue patrolling even when critically damaged.',
    status: 'draft',
    operationType: 'bt_bb_plan',
    riskLevel: 'medium',
    riskRationale: 'Modifies Behavior Tree structure and adds a new decorator. Low cascading impact but requires compile verification.',
    affectedAsset: '/Game/AI/BT_CombatGuard',
    affectedAssets: ['/Game/AI/BT_CombatGuard', '/Game/AI/Decorators/Decorator_CheckHealth'],
    evidenceLinks: [
      { sourceType: 'bt_diagnostic', sourceLabel: 'BT Diagnostic: Missing decorator on Sequence_Patrol', relevantAssetPath: '/Game/AI/BT_CombatGuard' },
    ],
    assumptions: 'bHasLowHealth Blackboard key exists or can be created. Decorator_CheckHealth asset exists in project.',
    risks: 'If Decorator_CheckHealth does not exist, it must be created separately. bHasLowHealth may need to be added to Blackboard.',
    validationNotes: '1) Compile BP after changes. 2) PIE with AI character to verify patrol stops on low health. 3) Confirm no regression on other patrol behaviors.',
    rollbackNotes: 'Simple: remove the added decorator and restore original Sequence_Patrol configuration.',
    createdAt: daysAgo(2),
    updatedAt: daysAgo(1),
    stale: false,
    provenance: {
      author: 'user',
      confidence: 'medium',
      knownLimitations: ['Decorator_CheckHealth asset existence not confirmed', 'bHasLowHealth key status needs verification'],
    },
  },
  {
    id: 'plan-002',
    title: 'Add Patrol Service to BT_CombatGuard',
    description: 'Attach Service_Patrol to the Combat Selector node to enable dynamic patrol waypoint cycling.',
    motivation: 'Current BT has patrol waypoints but no active patrol service to cycle through them, causing the AI to idle at the last waypoint.',
    status: 'ready_for_review',
    operationType: 'bt_bb_plan',
    riskLevel: 'low',
    riskRationale: 'Adding a service to an existing composite node. No structural changes, low risk.',
    affectedAsset: '/Game/AI/BT_CombatGuard',
    affectedAssets: ['/Game/AI/BT_CombatGuard', '/Game/AI/Services/Service_Patrol'],
    evidenceLinks: [
      { sourceType: 'bt_diagnostic', sourceLabel: 'BT Diagnostic: Service_Patrol not attached to Combat Selector', relevantAssetPath: '/Game/AI/BT_CombatGuard' },
    ],
    assumptions: 'Service_Patrol asset exists and is compatible with the Combat Selector composite.',
    risks: 'If Service_Patrol has incompatible Blackboard requirements, it may fail at runtime.',
    validationNotes: '1) Attach service in BT Editor. 2) Compile. 3) PIE and observe AI patrol behavior.',
    rollbackNotes: 'Remove Service_Patrol from the selector node. No side effects expected.',
    createdAt: daysAgo(5),
    updatedAt: daysAgo(2),
    stale: false,
    provenance: {
      author: 'deterministic_rule',
      confidence: 'high',
      knownLimitations: ['Based on BT diagnostic data only'],
    },
  },
  {
    id: 'plan-003',
    title: 'Optimize Damage Calculation in BP_EnemyBase',
    description: 'Refactor damage calculation in BP_EnemyBase to use a single function instead of duplicated logic in multiple event graphs.',
    motivation: 'Code duplication in OnTakeDamage and OnMeleeHit event graphs leads to maintenance issues and inconsistent damage application.',
    status: 'approved',
    operationType: 'blueprint_bug_fix',
    riskLevel: 'medium',
    riskRationale: 'Refactoring shared logic may affect multiple call sites. Requires thorough testing.',
    affectedAsset: '/Game/Blueprints/BP_EnemyBase',
    affectedAssets: ['/Game/Blueprints/BP_EnemyBase', '/Game/Blueprints/BP_EnemyElite'],
    evidenceLinks: [
      { sourceType: 'graph_detail', sourceLabel: 'Graph Detail: Duplicate damage logic in OnTakeDamage and OnMeleeHit', relevantAssetPath: '/Game/Blueprints/BP_EnemyBase' },
      { sourceType: 'diagnosis_report', sourceLabel: 'Diagnosis Report: Inconsistent damage values observed', relevantAssetPath: '/Game/Blueprints/BP_EnemyBase' },
    ],
    assumptions: 'No external Blueprints override the damage functions being refactored.',
    risks: 'BP_EnemyElite inherits from BP_EnemyBase and may rely on the current duplicated behavior.',
    validationNotes: '1) Refactor and compile. 2) Verify damage values match expected output. 3) Test BP_EnemyElite for regressions.',
    rollbackNotes: 'Revert to the pre-refactor version. Moderate complexity if other changes were made in the same session.',
    createdAt: daysAgo(7),
    updatedAt: daysAgo(3),
    stale: true,
    provenance: {
      author: 'user',
      confidence: 'medium',
      knownLimitations: ['Blueprint dependency chain not fully analyzed'],
    },
  },
];

// ── Form state for new/edit plans ──

interface PlanFormState {
  title: string;
  description: string;
  motivation: string;
  affectedAsset: string;
  operationType: OperationType;
  riskLevel: RiskLevel;
  assumptions: string;
  risks: string;
  validationNotes: string;
  evidenceSourceLabel: string;
}

const EMPTY_FORM: PlanFormState = {
  title: '',
  description: '',
  motivation: '',
  affectedAsset: '',
  operationType: 'manual_only',
  riskLevel: 'unknown',
  assumptions: '',
  risks: '',
  validationNotes: '',
  evidenceSourceLabel: '',
};

// ── Props ──

interface Props {
  // Self-contained — no external props needed for mock/local operation
}

// ── Component ──

export default function ChangePlanPackageWorkspace(_props: Props) {
  const ctx = useDesktopCopy();
  const t = ctx.copy;
  const cc = t.changePlanPackage;

  // ── State ──
  const [plans, setPlans] = useState<ChangePlanPackage[]>(MOCK_PLANS);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [form, setForm] = useState<PlanFormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const [filterStatus, setFilterStatus] = useState<PlanStatus | 'all'>('all');

  const selectedPlan = useMemo(
    () => plans.find(p => p.id === selectedPlanId) ?? null,
    [plans, selectedPlanId],
  );

  // ── Filtered plan list ──
  const filteredPlans = useMemo(() => {
    if (filterStatus === 'all') return plans;
    return plans.filter(p => p.status === filterStatus);
  }, [plans, filterStatus]);

  // ── Status display helper ──
  const statusDisplay = (s: PlanStatus): string => {
    switch (s) {
      case 'draft': return cc.statusDraft;
      case 'ready_for_review': return cc.statusReadyForReview;
      case 'approved': return cc.statusApproved;
      case 'rejected': return cc.statusRejected;
      case 'blocked': return cc.statusBlocked;
    }
  };

  // ── Risk display helper ──
  const riskDisplay = (r: RiskLevel): string => {
    switch (r) {
      case 'low': return cc.riskLow;
      case 'medium': return cc.riskMedium;
      case 'high': return cc.riskHigh;
      case 'unknown': return cc.riskUnknown;
    }
  };

  // ── Operation type display ──
  const opDisplay = (o: OperationType): string => {
    switch (o) {
      case 'blueprint_bug_fix': return cc.opBlueprintBugFix;
      case 'blueprint_generation': return cc.opBlueprintGeneration;
      case 'bt_bb_plan': return cc.opBtBbPlan;
      case 'manual_only': return cc.opManualOnly;
    }
  };

  // ── Handle copy ──
  const handleCopy = useCallback(() => {
    if (!selectedPlan) return;
    navigator.clipboard.writeText(buildMarkdown(selectedPlan, cc)).then(() => {
      setCopyState('copied');
      clearTimeout(copyTimeoutRef.current);
      copyTimeoutRef.current = setTimeout(() => setCopyState('idle'), 2000);
    }).catch(() => {
      setCopyState('error');
      clearTimeout(copyTimeoutRef.current);
      copyTimeoutRef.current = setTimeout(() => setCopyState('idle'), 2000);
    });
  }, [selectedPlan, cc]);

  // ── Start new plan ──
  const handleStartNew = useCallback(() => {
    setSelectedPlanId(null);
    setIsCreating(true);
    setForm(EMPTY_FORM);
    setFormError(null);
  }, []);

  // ── Cancel new plan ──
  const handleCancelNew = useCallback(() => {
    setIsCreating(false);
    setForm(EMPTY_FORM);
    setFormError(null);
  }, []);

  // ── Save new plan ──
  const handleSaveNew = useCallback(() => {
    // Validate
    if (!form.title.trim()) {
      setFormError(cc.errorTitleRequired);
      return;
    }
    if (!form.affectedAsset.trim()) {
      setFormError(cc.errorAssetPathRequired);
      return;
    }
    setFormError(null);

    const newPlan: ChangePlanPackage = {
      id: `plan-${String(plans.length + 1).padStart(3, '0')}`,
      title: form.title.trim(),
      description: form.description.trim(),
      motivation: form.motivation.trim(),
      status: 'draft',
      operationType: form.operationType,
      riskLevel: form.riskLevel,
      riskRationale: '',
      affectedAsset: form.affectedAsset.trim(),
      affectedAssets: [form.affectedAsset.trim()],
      evidenceLinks: form.evidenceSourceLabel.trim()
        ? [{ sourceType: 'manual', sourceLabel: form.evidenceSourceLabel.trim() }]
        : [],
      assumptions: form.assumptions.trim(),
      risks: form.risks.trim(),
      validationNotes: form.validationNotes.trim(),
      rollbackNotes: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      stale: false,
      provenance: {
        author: 'user',
        confidence: form.riskLevel === 'high' ? 'low' : form.riskLevel === 'low' ? 'high' : 'medium',
        knownLimitations: ['Manual plan — no automated evidence verification'],
      },
    };

    setPlans(prev => [...prev, newPlan]);
    setSelectedPlanId(newPlan.id);
    setIsCreating(false);
    setForm(EMPTY_FORM);
  }, [form, plans.length, cc]);

  // ── Form field update ──
  const updateForm = useCallback((field: keyof PlanFormState, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
    if (field === 'title' || field === 'affectedAsset') {
      setFormError(null);
    }
  }, []);

  // ── Make status badge class ──
  const statusBadgeClass = (s: PlanStatus): string => {
    switch (s) {
      case 'draft': return 'cpp-status-draft';
      case 'ready_for_review': return 'cpp-status-rfr';
      case 'approved': return 'cpp-status-approved';
      case 'rejected': return 'cpp-status-rejected';
      case 'blocked': return 'cpp-status-blocked';
    }
  };

  // ── Render ──

  return (
    <section className="cpp-workspace">
      {/* Summary Header */}
      <div className="cpp-summary">
        <h3 className="cpp-summary-title">{cc.summaryHeader}</h3>
        <p className="cpp-summary-detail">{cc.summaryDetail}</p>
      </div>

      {/* Safety Banner */}
      <div className="cpp-safety-banner">
        <strong>{cc.safetyBanner}</strong>
        <br />
        {cc.safetyBannerDetail}
      </div>

      {/* Toolbar */}
      <div className="cpp-toolbar">
        <button
          className="cpp-btn cpp-btn-primary"
          onClick={handleStartNew}
          type="button"
        >
          + {cc.createNewPlan}
        </button>
        <div className="cpp-filter-group">
          <label className="cpp-filter-label">{t.common.status}:</label>
          <select
            className="cpp-select"
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value as PlanStatus | 'all')}
          >
            <option value="all">{t.common.all}</option>
            <option value="draft">{cc.statusDraft}</option>
            <option value="ready_for_review">{cc.statusReadyForReview}</option>
            <option value="approved">{cc.statusApproved}</option>
            <option value="rejected">{cc.statusRejected}</option>
            <option value="blocked">{cc.statusBlocked}</option>
          </select>
        </div>
      </div>

      <div className="cpp-layout">
        {/* Plan List */}
        <div className="cpp-sidebar">
          <h4 className="cpp-sidebar-title">{cc.planListTitle} ({filteredPlans.length})</h4>
          {filteredPlans.length === 0 ? (
            <div className="cpp-empty">
              <p>{cc.emptyState}</p>
              <button
                className="cpp-btn cpp-btn-secondary"
                onClick={handleStartNew}
                type="button"
              >
                + {cc.createNewPlan}
              </button>
            </div>
          ) : (
            <ul className="cpp-plan-list">
              {filteredPlans.map(plan => (
                <li
                  key={plan.id}
                  className={`cpp-plan-item${selectedPlanId === plan.id ? ' cpp-plan-item-selected' : ''}${plan.stale ? ' cpp-plan-item-stale' : ''}`}
                  onClick={() => { setSelectedPlanId(plan.id); setIsCreating(false); }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { setSelectedPlanId(plan.id); setIsCreating(false); } }}
                >
                  <div className="cpp-plan-item-header">
                    <span className={`cpp-status-badge ${statusBadgeClass(plan.status)}`}>
                      {statusDisplay(plan.status)}
                    </span>
                    {plan.stale && <span className="cpp-stale-badge">{t.common.warning}</span>}
                  </div>
                  <div className="cpp-plan-item-title">{plan.title}</div>
                  <div className="cpp-plan-item-meta">
                    {opDisplay(plan.operationType)} · {plan.affectedAsset}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Main Content */}
        <div className="cpp-main">
          {isCreating ? (
            /* ── Create/Edit Form ── */
            <div className="cpp-form">
              <h4 className="cpp-section-title">{cc.createNewPlan}</h4>

              {formError && (
                <div className="cpp-form-error">{formError}</div>
              )}

              <div className="cpp-field">
                <label className="cpp-field-label">{cc.formTitle}</label>
                <input
                  className="cpp-input"
                  type="text"
                  placeholder={cc.formTitlePlaceholder}
                  value={form.title}
                  onChange={e => updateForm('title', e.target.value)}
                />
              </div>

              <div className="cpp-field">
                <label className="cpp-field-label">{cc.formDescription}</label>
                <textarea
                  className="cpp-textarea"
                  placeholder={cc.formDescriptionPlaceholder}
                  value={form.description}
                  onChange={e => updateForm('description', e.target.value)}
                  rows={3}
                />
              </div>

              <div className="cpp-field">
                <label className="cpp-field-label">{cc.formMotivation}</label>
                <textarea
                  className="cpp-textarea"
                  placeholder={cc.formMotivationPlaceholder}
                  value={form.motivation}
                  onChange={e => updateForm('motivation', e.target.value)}
                  rows={2}
                />
              </div>

              <div className="cpp-field">
                <label className="cpp-field-label">{cc.formAssetPath}</label>
                <input
                  className="cpp-input"
                  type="text"
                  placeholder={cc.formAssetPathPlaceholder}
                  value={form.affectedAsset}
                  onChange={e => updateForm('affectedAsset', e.target.value)}
                />
              </div>

              <div className="cpp-field-row">
                <div className="cpp-field cpp-field-half">
                  <label className="cpp-field-label">{cc.formOperationType}</label>
                  <select
                    className="cpp-select"
                    value={form.operationType}
                    onChange={e => updateForm('operationType', e.target.value)}
                  >
                    <option value="blueprint_bug_fix">{cc.opBlueprintBugFix}</option>
                    <option value="blueprint_generation">{cc.opBlueprintGeneration}</option>
                    <option value="bt_bb_plan">{cc.opBtBbPlan}</option>
                    <option value="manual_only">{cc.opManualOnly}</option>
                  </select>
                </div>
                <div className="cpp-field cpp-field-half">
                  <label className="cpp-field-label">{cc.formRiskLevel}</label>
                  <select
                    className="cpp-select"
                    value={form.riskLevel}
                    onChange={e => updateForm('riskLevel', e.target.value)}
                  >
                    <option value="low">{cc.riskLow}</option>
                    <option value="medium">{cc.riskMedium}</option>
                    <option value="high">{cc.riskHigh}</option>
                    <option value="unknown">{cc.riskUnknown}</option>
                  </select>
                </div>
              </div>

              <div className="cpp-field">
                <label className="cpp-field-label">{cc.formEvidenceSourceLabel}</label>
                <input
                  className="cpp-input"
                  type="text"
                  placeholder={cc.formEvidenceSourcePlaceholder}
                  value={form.evidenceSourceLabel}
                  onChange={e => updateForm('evidenceSourceLabel', e.target.value)}
                />
              </div>

              <div className="cpp-field">
                <label className="cpp-field-label">{cc.formAssumptions}</label>
                <textarea
                  className="cpp-textarea"
                  placeholder={cc.formAssumptionsPlaceholder}
                  value={form.assumptions}
                  onChange={e => updateForm('assumptions', e.target.value)}
                  rows={2}
                />
              </div>

              <div className="cpp-field">
                <label className="cpp-field-label">{cc.formRisks}</label>
                <textarea
                  className="cpp-textarea"
                  placeholder={cc.formRisksPlaceholder}
                  value={form.risks}
                  onChange={e => updateForm('risks', e.target.value)}
                  rows={2}
                />
              </div>

              <div className="cpp-field">
                <label className="cpp-field-label">{cc.formValidationNotes}</label>
                <textarea
                  className="cpp-textarea"
                  placeholder={cc.formValidationNotesPlaceholder}
                  value={form.validationNotes}
                  onChange={e => updateForm('validationNotes', e.target.value)}
                  rows={2}
                />
              </div>

              <div className="cpp-form-actions">
                <button
                  className="cpp-btn cpp-btn-primary"
                  onClick={handleSaveNew}
                  type="button"
                >
                  {cc.formSave}
                </button>
                <button
                  className="cpp-btn cpp-btn-secondary"
                  onClick={handleCancelNew}
                  type="button"
                >
                  {cc.formCancel}
                </button>
              </div>
            </div>
          ) : selectedPlan ? (
            /* ── Plan Detail + Markdown Preview ── */
            <div>
              {/* Stale indicator */}
              {selectedPlan.stale && (
                <div className="cpp-stale-warning">{cc.staleLabel}</div>
              )}

              {/* Plan Detail */}
              <div className="cpp-detail">
                <div className="cpp-detail-header">
                  <h4 className="cpp-detail-title">{selectedPlan.title}</h4>
                  <span className={`cpp-status-badge ${statusBadgeClass(selectedPlan.status)}`}>
                    {statusDisplay(selectedPlan.status)}
                  </span>
                </div>

                <div className="cpp-detail-grid">
                  <div className="cpp-detail-field">
                    <span className="cpp-detail-field-label">{cc.intentLabel}:</span>
                    <span>{selectedPlan.description}</span>
                  </div>
                  <div className="cpp-detail-field">
                    <span className="cpp-detail-field-label">{cc.motivationLabel}:</span>
                    <span>{selectedPlan.motivation}</span>
                  </div>
                  <div className="cpp-detail-field">
                    <span className="cpp-detail-field-label">{cc.assetLabel}:</span>
                    <span className="cpp-mono">{selectedPlan.affectedAsset}</span>
                  </div>
                  <div className="cpp-detail-field">
                    <span className="cpp-detail-field-label">{cc.operationTypeLabel}:</span>
                    <span>{opDisplay(selectedPlan.operationType)}</span>
                  </div>
                  <div className="cpp-detail-field">
                    <span className="cpp-detail-field-label">{cc.riskLevelLabel}:</span>
                    <span className={`cpp-risk-badge cpp-risk-${selectedPlan.riskLevel}`}>
                      {riskDisplay(selectedPlan.riskLevel)}
                    </span>
                  </div>
                  {selectedPlan.riskRationale && (
                    <div className="cpp-detail-field">
                      <span className="cpp-detail-field-label">{cc.mdRiskRationale}:</span>
                      <span>{selectedPlan.riskRationale}</span>
                    </div>
                  )}
                </div>

                {/* Evidence links */}
                {selectedPlan.evidenceLinks.length > 0 && (
                  <div className="cpp-section">
                    <h5 className="cpp-section-subtitle">{cc.evidenceLinks}</h5>
                    <ul className="cpp-evidence-list">
                      {selectedPlan.evidenceLinks.map((el, i) => (
                        <li key={i} className="cpp-evidence-item">
                          <span className="cpp-evidence-source">{el.sourceType}</span>
                          <span>{el.sourceLabel}</span>
                          {el.relevantAssetPath && (
                            <span className="cpp-mono cpp-evidence-asset">{el.relevantAssetPath}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Text sections */}
                {selectedPlan.assumptions && (
                  <div className="cpp-section">
                    <h5 className="cpp-section-subtitle">{cc.assumptionsLabel}</h5>
                    <p className="cpp-section-text">{selectedPlan.assumptions}</p>
                  </div>
                )}
                {selectedPlan.risks && (
                  <div className="cpp-section">
                    <h5 className="cpp-section-subtitle">{cc.risksLabel}</h5>
                    <p className="cpp-section-text">{selectedPlan.risks}</p>
                  </div>
                )}
                {selectedPlan.validationNotes && (
                  <div className="cpp-section">
                    <h5 className="cpp-section-subtitle">{cc.validationNotesLabel}</h5>
                    <p className="cpp-section-text cpp-pre-wrap">{selectedPlan.validationNotes}</p>
                  </div>
                )}
                {selectedPlan.rollbackNotes && (
                  <div className="cpp-section">
                    <h5 className="cpp-section-subtitle">{cc.rollbackNotesLabel}</h5>
                    <p className="cpp-section-text">{selectedPlan.rollbackNotes}</p>
                  </div>
                )}

                {/* Provenance */}
                <div className="cpp-section">
                  <h5 className="cpp-section-subtitle">{cc.mdProvenance}</h5>
                  <div className="cpp-detail-field">
                    <span className="cpp-detail-field-label">{cc.provenanceAuthor}:</span>
                    <span>{selectedPlan.provenance.author === 'user' ? cc.provenanceAuthorUser
                      : selectedPlan.provenance.author === 'template' ? cc.provenanceAuthorTemplate
                      : cc.provenanceAuthorRule}</span>
                  </div>
                  <div className="cpp-detail-field">
                    <span className="cpp-detail-field-label">{cc.provenanceConfidence}:</span>
                    <span>{selectedPlan.provenance.confidence}</span>
                  </div>
                  {selectedPlan.provenance.knownLimitations.length > 0 && (
                    <div className="cpp-detail-field">
                      <span className="cpp-detail-field-label">{cc.provenanceLimitations}:</span>
                      <ul className="cpp-limitation-list">
                        {selectedPlan.provenance.knownLimitations.map((l, i) => (
                          <li key={i}>{l}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>

              {/* Markdown Preview + Copy */}
              <div className="cpp-preview-section">
                <div className="cpp-preview-toolbar">
                  <span className="cpp-preview-label">{cc.markdownPreview}</span>
                  <div className="cpp-preview-actions">
                    {copyState === 'copied' && (
                      <span className="cpp-copy-status cpp-copy-ok">{cc.copied}</span>
                    )}
                    {copyState === 'error' && (
                      <span className="cpp-copy-status cpp-copy-error">{cc.copyFailed}</span>
                    )}
                    <button
                      className="cpp-copy-btn"
                      onClick={handleCopy}
                      type="button"
                    >
                      {cc.copyPackage}
                    </button>
                  </div>
                </div>
                <pre className="cpp-markdown-pre">
                  {buildMarkdown(selectedPlan, cc)}
                </pre>
              </div>
            </div>
          ) : (
            /* ── No selection state ── */
            <div className="cpp-empty-main">
              <p>{cc.planListTitle}</p>
              <p className="cpp-dimmed">{t.common.noDataAvailable}</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

// ── Deterministic Markdown builder ──

function buildMarkdown(plan: ChangePlanPackage, cc: ChangePlanPackageCopy): string {
  const lines: string[] = [];

  lines.push(cc.mdTitle);
  lines.push('');
  lines.push(`${cc.mdGenerated} ${new Date().toISOString()}`);
  lines.push('');

  // Safety notice
  lines.push(cc.mdSafetyNotice);
  lines.push('');
  lines.push(cc.mdNotExecutableNotice);
  lines.push('');

  // Plan overview
  lines.push(cc.mdPlanOverview);
  lines.push('');
  lines.push(`- ${cc.mdPlanId} ${plan.id}`);
  lines.push(`- ${cc.mdStatus} ${statusDisplayLabel(plan.status, cc)}`);
  lines.push(`- ${cc.mdIntent} ${plan.title}`);
  lines.push(`- ${cc.mdMotivation} ${plan.motivation}`);
  lines.push(`- ${cc.mdAsset} \`${plan.affectedAsset}\``);
  lines.push(`- ${cc.mdOperationType} ${opDisplayLabel(plan.operationType, cc)}`);
  lines.push(`- ${cc.mdRiskLevel} ${riskDisplayLabel(plan.riskLevel, cc)} (${plan.riskRationale || 'No rationale'})`);
  lines.push('');

  // Affected assets
  lines.push(cc.mdAffectedAssets);
  for (const a of plan.affectedAssets) {
    lines.push(`- \`${a}\``);
  }
  lines.push('');

  // Evidence links
  if (plan.evidenceLinks.length > 0) {
    lines.push(cc.mdEvidenceLinks);
    for (const el of plan.evidenceLinks) {
      lines.push(`- **${el.sourceType}**: ${el.sourceLabel}${el.relevantAssetPath ? ` (\`${el.relevantAssetPath}\`)` : ''}`);
    }
    lines.push('');
  }

  // Detailed fields
  if (plan.description) {
    lines.push(`**${cc.mdIntent}**`);
    lines.push(plan.description);
    lines.push('');
  }
  if (plan.assumptions) {
    lines.push(`${cc.mdAssumptions}`);
    lines.push(plan.assumptions);
    lines.push('');
  }
  if (plan.risks) {
    lines.push(`${cc.mdRisks}`);
    lines.push(plan.risks);
    lines.push('');
  }
  if (plan.validationNotes) {
    lines.push(`${cc.mdValidationPlan}`);
    lines.push(plan.validationNotes);
    lines.push('');
  }
  if (plan.rollbackNotes) {
    lines.push(`${cc.mdRollbackNotes}`);
    lines.push(plan.rollbackNotes);
    lines.push('');
  }

  // Provenance
  lines.push(`${cc.mdProvenance}`);
  lines.push(`- ${cc.provenanceAuthor}: ${plan.provenance.author === 'user' ? cc.provenanceAuthorUser
    : plan.provenance.author === 'template' ? cc.provenanceAuthorTemplate
    : cc.provenanceAuthorRule}`);
  lines.push(`- ${cc.provenanceConfidence}: ${plan.provenance.confidence}`);
  if (plan.provenance.knownLimitations.length > 0) {
    lines.push(`- ${cc.provenanceLimitations}:`);
    for (const l of plan.provenance.knownLimitations) {
      lines.push(`  - ${l}`);
    }
  }

  return lines.join('\n');
}

// ── Local helper copies (to avoid scope conflicts in useMemo) ──

function statusDisplayLabel(s: PlanStatus, cc: ChangePlanPackageCopy): string {
  switch (s) {
    case 'draft': return cc.statusDraft;
    case 'ready_for_review': return cc.statusReadyForReview;
    case 'approved': return cc.statusApproved;
    case 'rejected': return cc.statusRejected;
    case 'blocked': return cc.statusBlocked;
  }
}

function opDisplayLabel(o: OperationType, cc: ChangePlanPackageCopy): string {
  switch (o) {
    case 'blueprint_bug_fix': return cc.opBlueprintBugFix;
    case 'blueprint_generation': return cc.opBlueprintGeneration;
    case 'bt_bb_plan': return cc.opBtBbPlan;
    case 'manual_only': return cc.opManualOnly;
  }
}

function riskDisplayLabel(r: RiskLevel, cc: ChangePlanPackageCopy): string {
  switch (r) {
    case 'low': return cc.riskLow;
    case 'medium': return cc.riskMedium;
    case 'high': return cc.riskHigh;
    case 'unknown': return cc.riskUnknown;
  }
}
