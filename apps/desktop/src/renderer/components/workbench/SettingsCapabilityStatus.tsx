import type { ReactNode } from 'react';

export type SettingsCapabilityKind = 'persisted-only' | 'unavailable' | 'read-only';

export interface SettingsCapabilityStatusProps {
  kind: SettingsCapabilityKind;
  label: string;
  detail?: ReactNode;
  id?: string;
}

export function SettingsCapabilityStatus({
  kind,
  label,
  detail,
  id,
}: SettingsCapabilityStatusProps) {
  return (
    <div className="ue-settings-capability" data-settings-capability={kind} id={id}>
      <span className="ue-settings-capability-label">{label}</span>
      {detail ? <span className="ue-settings-capability-detail">{detail}</span> : null}
    </div>
  );
}
