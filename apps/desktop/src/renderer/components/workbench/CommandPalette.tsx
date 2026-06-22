import { useEffect, useRef } from 'react';
import type { CommandPaletteCommand } from '../../hooks/useCommandPalette';

interface CommandPaletteProps {
  isOpen: boolean;
  dialogLabel: string;
  searchPlaceholder: string;
  emptyLabel: string;
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
  dialogLabel,
  searchPlaceholder,
  emptyLabel,
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
  const inputRef = useRef<HTMLInputElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (isOpen) {
      if (!wasOpenRef.current) {
        previousFocusRef.current =
          document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null;
      }
      wasOpenRef.current = true;
      const frame = window.requestAnimationFrame(() => inputRef.current?.focus());
      return () => window.cancelAnimationFrame(frame);
    }

    if (!wasOpenRef.current) return;
    wasOpenRef.current = false;
    const previousFocus = previousFocusRef.current;
    previousFocusRef.current = null;
    if (previousFocus?.isConnected) {
      previousFocus.focus();
      return;
    }
    const fallback = document.querySelector<HTMLElement>(
      '[data-workbench-chat-input], .workbench-root',
    );
    fallback?.focus();
  }, [isOpen]);

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
      <section
        className="wb-command-palette"
        role="dialog"
        aria-modal="true"
        aria-label={dialogLabel}
        onMouseDown={event => event.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={event => setQuery(event.target.value)}
          placeholder={searchPlaceholder}
          aria-label={searchPlaceholder}
          aria-controls="workbench-command-list"
          aria-activedescendant={
            selectedIndex >= 0 && commands[selectedIndex]
              ? `workbench-command-${commands[selectedIndex].id}`
              : undefined
          }
        />
        <div
          id="workbench-command-list"
          className="wb-command-list"
          role="listbox"
          aria-label={dialogLabel}
        >
          {commands.length === 0 ? (
            <p className="wb-empty">{emptyLabel}</p>
          ) : (
            commands.map((command, index) => {
              const reasonId = command.disabledReason
                ? `workbench-command-${command.id}-reason`
                : undefined;
              return (
                <button
                  key={command.id}
                  id={`workbench-command-${command.id}`}
                  type="button"
                  role="option"
                  data-command-id={command.id}
                  className={`wb-command-item${index === selectedIndex ? ' wb-command-item-selected' : ''}`}
                  disabled={command.disabled}
                  aria-disabled={command.disabled || undefined}
                  aria-selected={index === selectedIndex}
                  aria-describedby={reasonId}
                  onMouseEnter={() => {
                    if (!command.disabled) setSelectedIndex(index);
                  }}
                  onClick={() => {
                    if (!command.disabled) {
                      command.run();
                      onClose();
                    }
                  }}
                >
                  <span className="wb-command-item-copy">
                    <span>{command.label}</span>
                    {command.disabledReason && (
                      <span id={reasonId} className="wb-command-disabled-reason">
                        {command.disabledReason}
                      </span>
                    )}
                  </span>
                  <small>{command.group}</small>
                </button>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}
