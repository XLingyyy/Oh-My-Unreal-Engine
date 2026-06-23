import type { UeAgentUiCopy } from '../../i18n/types';
import type { DrawerPageAuthority } from './drawerFactualSourceAdapter';

type SourceBoundaryCopy = UeAgentUiCopy['drawer']['sourceBoundary'];

interface DrawerSourceStatusProps {
  authority: DrawerPageAuthority;
  copy: SourceBoundaryCopy;
}

interface DrawerUnavailableStateProps {
  title: string;
  detail: string;
}

export function DrawerSourceStatus({
  authority,
  copy,
}: DrawerSourceStatusProps) {
  return (
    <div
      className="wb-drawer-source-status"
      data-drawer-source-kind={authority.kind}
    >
      <div className="wb-drawer-source-primary">
        <span className="wb-drawer-source-label">{copy.sourceLabel}</span>
        <strong className={`wb-drawer-source-badge wb-drawer-source-badge-${authority.kind}`}>
          {copy.kinds[authority.kind]}
        </strong>
      </div>
      <div className="wb-drawer-source-detail">
        <span>{copy.reasonLabel}</span>
        <span>{copy.reasons[authority.reason]}</span>
      </div>
      {authority.updatedAt && (
        <div className="wb-drawer-source-detail">
          <span>{copy.updatedAtLabel}</span>
          <time dateTime={authority.updatedAt}>{authority.updatedAt}</time>
        </div>
      )}
    </div>
  );
}

export function DrawerUnavailableState({
  title,
  detail,
}: DrawerUnavailableStateProps) {
  return (
    <div className="wb-drawer-unavailable" data-drawer-unavailable="true">
      <strong>{title}</strong>
      <p>{detail}</p>
    </div>
  );
}
