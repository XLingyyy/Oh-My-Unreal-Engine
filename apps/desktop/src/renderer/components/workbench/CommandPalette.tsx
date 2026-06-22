import { useEffect } from 'react';
import type { CommandPaletteCommand } from '../../hooks/useCommandPalette';

interface CommandPaletteProps {
  isOpen: boolean;
  query: string;
  setQuery: (query: string) => void;
  commands: CommandPaletteCommand[];
  selectedIndex: number;
  setSelectedIndex: (index: number) => void;
  onClose: () => void;
  onSelectNext: () => void;
  onSelectPrevious: () => void;
  onRunSelected: () => void;
}

export function CommandPalette({
  isOpen,
  query,
  setQuery,
  commands,
  selectedIndex,
  setSelectedIndex,
  onClose,
  onSelectNext,
  onSelectPrevious,
  onRunSelected,
}: CommandPaletteProps) {
  useEffect(() => {
    if (!isOpen) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        onSelectNext();
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        onSelectPrevious();
      } else if (event.key === 'Enter') {
        event.preventDefault();
        onRunSelected();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose, onRunSelected, onSelectNext, onSelectPrevious]);

  if (!isOpen) return null;

  return (
    <div className="wb-command-backdrop" onMouseDown={onClose}>
      <section className="wb-command-palette" onMouseDown={event => event.stopPropagation()}>
        <input
          autoFocus
          value={query}
          onChange={event => setQuery(event.target.value)}
          placeholder="Type a command..."
        />
        <div className="wb-command-list">
          {commands.length === 0 ? (
            <p className="wb-empty">No commands</p>
          ) : (
            commands.map((command, index) => (
              <button
                key={command.id}
                type="button"
                className={`wb-command-item${index === selectedIndex ? ' wb-command-item-selected' : ''}`}
                disabled={command.disabled}
                onMouseEnter={() => setSelectedIndex(index)}
                onClick={() => {
                  if (!command.disabled) {
                    command.run();
                    onClose();
                  }
                }}
              >
                <span>{command.label}</span>
                <small>{command.group}</small>
              </button>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
