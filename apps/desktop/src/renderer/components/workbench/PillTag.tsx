import type { ReactNode } from 'react';

export type PillTagVariant = 'default' | 'success' | 'warning' | 'danger' | 'info';

export interface PillTagProps {
  label: string;
  variant?: PillTagVariant;
  icon?: ReactNode;
}

export function PillTag({ label, variant = 'default', icon }: PillTagProps) {
  const variantClass = `ue-pill ue-pill-${variant}`;
  return (
    <span className={variantClass}>
      {icon && <span className="ue-pill-icon" aria-hidden="true">{icon}</span>}
      <span className="ue-pill-dot" aria-hidden="true" />
      {label}
    </span>
  );
}
