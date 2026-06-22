import { useDesktopCopy } from '../../i18n';

type RailIcon = 'chat' | 'settings';

interface LeftRailProps {
  activeView: 'chat' | 'settings';
  onChangeView: (view: 'chat' | 'settings') => void;
}

const RAIL_ITEMS: Array<{ id: RailIcon; labelKey: string; copyKey: 'chat' | 'settings' }> = [
  { id: 'chat', labelKey: 'chat', copyKey: 'chat' },
  { id: 'settings', labelKey: 'settings', copyKey: 'settings' },
];

function RailIconGlyph({ id }: { id: RailIcon }) {
  const common = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.7,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };

  if (id === 'chat') {
    return (
      <svg viewBox="0 0 24 24" width="20" height="20" focusable="false">
        <path {...common} d="M5 6.5h14v9H9l-4 3.5v-12.5Z" />
        <path {...common} d="M8.5 10h7M8.5 13h4.5" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" focusable="false">
      <circle {...common} cx="12" cy="12" r="3" />
      <path {...common} d="M12 3v2M12 19v2M4.2 7.5l1.7 1M18.1 15.5l1.7 1M4.2 16.5l1.7-1M18.1 8.5l1.7-1M3 12h2M19 12h2" />
    </svg>
  );
}

export function LeftRail({ activeView, onChangeView }: LeftRailProps) {
  const { copy } = useDesktopCopy();

  return (
    <nav className="ue-rail" aria-label="UE Agent views">
      {RAIL_ITEMS.map(item => {
        const isActive = item.id === activeView;
        const className = `ue-rail-item${isActive ? ' ue-rail-item-active' : ''}`;
        const label = copy.ueAgentUi.leftRail[item.copyKey];

        return (
          <button
            key={item.id}
            type="button"
            className={className}
            title={label}
            aria-label={label}
            aria-current={isActive ? 'page' : undefined}
            onClick={() => onChangeView(item.id)}
          >
            <span className="ue-rail-icon" aria-hidden="true">
              <RailIconGlyph id={item.id} />
            </span>
          </button>
        );
      })}
    </nav>
  );
}
