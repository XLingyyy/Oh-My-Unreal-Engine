import type { ReactNode } from 'react';

export interface SettingsRowProps {
  title: ReactNode;
  description?: ReactNode;
  control: ReactNode;
  className?: string;
}

export function SettingsRow({ title, description, control, className }: SettingsRowProps) {
  const classes = ['ue-settings-row', className].filter(Boolean).join(' ');
  return (
    <div className={classes}>
      <div className="ue-settings-row-copy">
        <div className="ue-settings-row-title">{title}</div>
        {description ? <div className="ue-settings-row-description">{description}</div> : null}
      </div>
      <div className="ue-settings-row-control">{control}</div>
    </div>
  );
}
