import { useEffect, useRef, useState } from 'react';
import { useDesktopCopy } from '../../i18n';
import type {
  TopBarAgentBadge,
  BpBadge,
  SandboxIndicator,
  ScopeStatus,
} from './workbenchStatusViewModel';

interface TopBarProps {
  onOpenSettings: () => void;
  projectName: string;
  engineVersion: string;
  agentBadge: TopBarAgentBadge;
  bpBadge: BpBadge;
  sandboxIndicator: SandboxIndicator;
  scope: ScopeStatus;
  onToggleExplorer?: () => void;
  explorerVisible?: boolean;
}

function BrandIcon() {
  return (
    <svg
      className="ue-topbar-brand-icon"
      viewBox="0 0 24 24"
      width="22"
      height="22"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="ueBrandGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="var(--accent-blue)" />
          <stop offset="100%" stopColor="var(--accent-cyan)" />
        </linearGradient>
      </defs>
      <path
        d="M12 2.5 19.5 7v10L12 21.5 4.5 17V7Z"
        fill="url(#ueBrandGradient)"
        stroke="rgba(255,255,255,0.2)"
        strokeWidth="0.5"
        opacity="0.95"
      />
      <circle cx="12" cy="12" r="1.5" fill="var(--text-on-accent)" />
      {[0, 60, 120, 180, 240, 300].map(angle => {
        const rad = (angle * Math.PI) / 180;
        const x = 12 + 4.5 * Math.cos(rad);
        const y = 12 + 4.5 * Math.sin(rad);
        return <circle key={`node-${angle}`} cx={x} cy={y} r="0.9" fill="var(--text-on-accent)" opacity="0.85" />;
      })}
      {[0, 60, 120, 180, 240, 300].map(angle => {
        const rad = (angle * Math.PI) / 180;
        const x = 12 + 4.5 * Math.cos(rad);
        const y = 12 + 4.5 * Math.sin(rad);
        return (
          <line
            key={`line-${angle}`}
            x1="12"
            y1="12"
            x2={x}
            y2={y}
            stroke="rgba(255,255,255,0.4)"
            strokeWidth="0.4"
          />
        );
      })}
    </svg>
  );
}

function ExplorerIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
      <path
        d="M4 6h6l2 2h8v10H4z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function sandboxLabelKey(
  indicator: SandboxIndicator,
): 'sandboxMode' | 'sandboxPreparing' | 'sandboxValidating' | 'sandboxAwaitingApproval' | 'sandboxPromoting' {
  switch (indicator) {
    case 'preparing':
      return 'sandboxPreparing';
    case 'validating':
      return 'sandboxValidating';
    case 'awaiting-approval':
      return 'sandboxAwaitingApproval';
    case 'promoting':
      return 'sandboxPromoting';
    default:
      return 'sandboxMode';
  }
}

export function TopBar({
  onOpenSettings,
  projectName,
  engineVersion,
  agentBadge,
  bpBadge,
  sandboxIndicator,
  scope,
  onToggleExplorer,
  explorerVisible = false,
}: TopBarProps) {
  const { copy } = useDesktopCopy();
  const [projectOpen, setProjectOpen] = useState(false);
  const projectRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!projectOpen) {
      return undefined;
    }
    const handleClickOutside = (event: MouseEvent) => {
      if (projectRef.current && !projectRef.current.contains(event.target as Node)) {
        setProjectOpen(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setProjectOpen(false);
      }
    };
    window.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [projectOpen]);

  const showSandboxBadge = sandboxIndicator !== 'hidden' && scope === 'asset';

  return (
    <header className="ue-topbar">
      <div className="ue-topbar-left">
        <span className="ue-topbar-brand">
          <BrandIcon />
          <strong>{copy.ueAgentUi.topbar.brand}</strong>
        </span>
        <span className="ue-topbar-divider" />
        <div className="ue-topbar-project-wrapper" ref={projectRef}>
          <button
            type="button"
            className="ue-topbar-project"
            onClick={() => setProjectOpen(value => !value)}
            aria-haspopup="menu"
            aria-expanded={projectOpen}
            title={copy.ueAgentUi.topbar.projectMenu}
          >
            <span>{projectName}</span>
            <span className="ue-topbar-project-caret" aria-hidden="true" />
          </button>
          {projectOpen && (
            <div className="ue-topbar-project-menu" role="menu">
              <div
                className="ue-topbar-project-item ue-topbar-project-item-active"
                role="menuitem"
                aria-current="true"
              >
                <span>{projectName}</span>
                <span className="ue-topbar-project-item-check" aria-hidden="true">✓</span>
              </div>
            </div>
          )}
        </div>
        <span className="ue-topbar-divider" />
        <span
          className="ue-pill ue-pill-muted ue-topbar-version"
          title={copy.ueAgentUi.topbar.ueVersion(engineVersion)}
        >
          <span className="ue-pill-dot" aria-hidden="true" />
          {copy.ueAgentUi.topbar.ueVersion(engineVersion)}
        </span>
        <span
          className={`ue-pill ue-pill-${bpBadge.variant} ue-topbar-bp`}
          title={bpBadge.label}
        >
          <span className="ue-pill-dot" aria-hidden="true" />
          {bpBadge.label}
        </span>
        <span
          className={`ue-pill ue-pill-${agentBadge.variant} ue-topbar-agent`}
          title={agentBadge.label}
        >
          <span className="ue-pill-dot" aria-hidden="true" />
          {agentBadge.label}
        </span>
        {showSandboxBadge && (
          <span
            className={`ue-pill ue-pill-info ue-topbar-sandbox`}
            title={copy.ueAgentUi.topbar[sandboxLabelKey(sandboxIndicator)]}
          >
            <span className="ue-pill-dot" aria-hidden="true" />
            {copy.ueAgentUi.topbar[sandboxLabelKey(sandboxIndicator)]}
          </span>
        )}
      </div>

      <div className="ue-topbar-right">
        {onToggleExplorer && (
          <button
            type="button"
            className={`ue-topbar-icon${explorerVisible ? ' ue-topbar-icon-active' : ''}`}
            onClick={onToggleExplorer}
            title={copy.ueAgentUi.topbar.explorerTitle}
            aria-label={copy.ueAgentUi.topbar.explorerLabel}
            aria-pressed={explorerVisible}
          >
            <ExplorerIcon />
          </button>
        )}
        <button
          type="button"
          className="ue-topbar-icon"
          onClick={onOpenSettings}
          title={copy.ueAgentUi.topbar.settingsTitle}
          aria-label={copy.ueAgentUi.topbar.openSettings}
        >
          <SettingsIcon />
        </button>
      </div>
    </header>
  );
}
