import type { MouseEvent, ReactNode } from 'react';

export type ActionButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export interface ActionButtonProps {
  label: string;
  variant?: ActionButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  icon?: ReactNode;
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
  ariaLabel?: string;
}

export function ActionButton({
  label,
  variant = 'secondary',
  disabled,
  loading,
  icon,
  onClick,
  ariaLabel,
}: ActionButtonProps) {
  const className = `ue-action-btn ue-action-btn-${variant}${loading ? ' ue-action-btn-loading' : ''}`;
  const isDisabled = disabled || loading;
  return (
    <button
      type="button"
      className={className}
      onClick={onClick}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      aria-label={ariaLabel ?? label}
    >
      {loading ? (
        <span className="ue-action-btn-spinner" aria-hidden="true" />
      ) : (
        icon && <span className="ue-action-btn-icon" aria-hidden="true">{icon}</span>
      )}
      <span className="ue-action-btn-label">{label}</span>
    </button>
  );
}
