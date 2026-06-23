export interface SwitchProps {
  checked: boolean;
  onCheckedChange?: (checked: boolean) => void;
  ariaLabel: string;
  disabled?: boolean;
  disabledReason?: string;
  className?: string;
}

export function Switch({
  checked,
  onCheckedChange,
  ariaLabel,
  disabled = false,
  disabledReason,
  className,
}: SwitchProps) {
  const classes = ['ue-switch', className].filter(Boolean).join(' ');
  return (
    <label
      className={classes}
      title={disabled ? disabledReason : undefined}
      data-disabled={disabled || undefined}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={event => onCheckedChange?.(event.target.checked)}
      />
      <span className="ue-switch-track" aria-hidden="true">
        <span className="ue-switch-thumb" />
      </span>
    </label>
  );
}
