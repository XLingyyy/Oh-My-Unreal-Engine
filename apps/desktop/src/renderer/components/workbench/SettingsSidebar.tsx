import { useCallback, useRef, type KeyboardEvent } from 'react';
import type { SettingsCategoryId } from './settings/settingsTypes';
import { useDesktopCopy } from '../../i18n';

interface SettingsSidebarProps {
  categories: Array<{ id: SettingsCategoryId; label: string; iconId: SettingsCategoryId }>;
  activeCategory: SettingsCategoryId;
  onSelect: (id: SettingsCategoryId) => void;
}

function SettingsCategoryIcon({ id }: { id: SettingsCategoryId }) {
  const common = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.6,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };

  if (id === 'modelProviders') {
    return (
      <svg viewBox="0 0 24 24" width="18" height="18" focusable="false">
        <path {...common} d="M9 4h6M9 20h6M7 8h10v8H7z" />
        <path {...common} d="M4 10h3M17 10h3M4 14h3M17 14h3M10 11h4M10 14h2" />
      </svg>
    );
  }
  if (id === 'assistant') {
    return (
      <svg viewBox="0 0 24 24" width="18" height="18" focusable="false">
        <rect {...common} x="5" y="7" width="14" height="11" rx="3" />
        <path {...common} d="M12 7V4M9 12h.01M15 12h.01M9.5 15h5" />
      </svg>
    );
  }
  if (id === 'appearance') {
    return (
      <svg viewBox="0 0 24 24" width="18" height="18" focusable="false">
        <circle {...common} cx="12" cy="12" r="8" />
        <path {...common} d="M12 4a8 8 0 0 1 0 16 4 4 0 0 0 0-16Z" />
      </svg>
    );
  }
  if (id === 'language') {
    return (
      <svg viewBox="0 0 24 24" width="18" height="18" focusable="false">
        <circle {...common} cx="12" cy="12" r="8" />
        <path {...common} d="M4 12h16M12 4c2 2.2 3 4.8 3 8s-1 5.8-3 8M12 4c-2 2.2-3 4.8-3 8s1 5.8 3 8" />
      </svg>
    );
  }
  if (id === 'ueConnection') {
    return (
      <svg viewBox="0 0 24 24" width="18" height="18" focusable="false">
        <path {...common} d="M9.5 14.5 14.5 9.5M8 10H6a4 4 0 0 0 0 8h4M16 14h2a4 4 0 0 0 0-8h-4" />
      </svg>
    );
  }
  if (id === 'sandboxSecurity') {
    return (
      <svg viewBox="0 0 24 24" width="18" height="18" focusable="false">
        <path {...common} d="M12 3 19 6v5c0 4.5-2.8 7.8-7 10-4.2-2.2-7-5.5-7-10V6l7-3Z" />
        <path {...common} d="m9.5 12 1.7 1.7 3.5-4" />
      </svg>
    );
  }
  if (id === 'privacyLog') {
    return (
      <svg viewBox="0 0 24 24" width="18" height="18" focusable="false">
        <rect {...common} x="6" y="10" width="12" height="9" rx="2" />
        <path {...common} d="M9 10V7a3 3 0 0 1 6 0v3M12 14v2" />
      </svg>
    );
  }
  if (id === 'advanced') {
    return (
      <svg viewBox="0 0 24 24" width="18" height="18" focusable="false">
        <path {...common} d="M13 3 5 14h6l-1 7 9-12h-6l0-6Z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" focusable="false">
      <circle {...common} cx="12" cy="12" r="3" />
      <path {...common} d="M12 3v2M12 19v2M4.2 7.5l1.7 1M18.1 15.5l1.7 1M4.2 16.5l1.7-1M18.1 8.5l1.7-1M3 12h2M19 12h2" />
    </svg>
  );
}

export function SettingsSidebar({ categories, activeCategory, onSelect }: SettingsSidebarProps) {
  const { copy } = useDesktopCopy();
  const itemRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const activeIndex = Math.max(
    0,
    categories.findIndex(cat => cat.id === activeCategory),
  );

  const moveBy = useCallback(
    (offset: number) => {
      const total = categories.length;
      if (total === 0) return;
      const nextIndex = (activeIndex + offset + total) % total;
      const next = categories[nextIndex];
      onSelect(next.id);
      const node = itemRefs.current[next.id];
      if (node) {
        node.focus();
      }
    },
    [activeIndex, categories, onSelect],
  );

  const moveTo = useCallback(
    (index: number) => {
      const total = categories.length;
      if (total === 0) return;
      const clamped = ((index % total) + total) % total;
      const next = categories[clamped];
      onSelect(next.id);
      const node = itemRefs.current[next.id];
      if (node) {
        node.focus();
      }
    },
    [categories, onSelect],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        moveBy(1);
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        moveBy(-1);
      } else if (event.key === 'Home') {
        event.preventDefault();
        moveTo(0);
      } else if (event.key === 'End') {
        event.preventDefault();
        moveTo(categories.length - 1);
      }
    },
    [categories.length, moveBy, moveTo],
  );

  return (
    <nav
      className="ue-settings-sidebar"
      aria-label={copy.ueAgentUi.settingsPage.categoriesAriaLabel}
      role="listbox"
      aria-orientation="vertical"
      aria-activedescendant={`ue-settings-sidebar-item-${activeCategory}`}
      onKeyDown={handleKeyDown}
    >
      {categories.map(cat => {
        const isActive = cat.id === activeCategory;
        const className = `ue-settings-sidebar-item${isActive ? ' ue-settings-sidebar-item-active' : ''}`;

        return (
          <button
            key={cat.id}
            ref={node => {
              itemRefs.current[cat.id] = node;
            }}
            id={`ue-settings-sidebar-item-${cat.id}`}
            type="button"
            role="option"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            className={className}
            onClick={() => onSelect(cat.id)}
          >
            <span className="ue-settings-sidebar-icon" aria-hidden="true">
              <SettingsCategoryIcon id={cat.iconId} />
            </span>
            <span className="ue-settings-sidebar-label">{cat.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
