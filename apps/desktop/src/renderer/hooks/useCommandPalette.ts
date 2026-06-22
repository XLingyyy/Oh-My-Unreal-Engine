import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  findFirstEnabledCommandIndex,
  findNextEnabledCommandIndex,
  normalizeEnabledCommandIndex,
} from './commandPaletteNavigation';

export interface CommandPaletteCommand {
  id: string;
  label: string;
  group: string;
  keywords?: string[];
  disabled?: boolean;
  disabledReason?: string;
  run: () => void;
}

export function useCommandPalette(commands: CommandPaletteCommand[]) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(-1);

  const filteredCommands = useMemo(() => {
    for (const command of commands) {
      if (command.disabled && !command.disabledReason?.trim()) {
        throw new Error(`Disabled command "${command.id}" requires a disabled reason.`);
      }
    }
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter(command =>
      `${command.group} ${command.label} ${(command.keywords ?? []).join(' ')}`
        .toLowerCase()
        .includes(q),
    );
  }, [commands, query]);

  useEffect(() => {
    if (!isOpen) return;
    setSelectedIndex(findFirstEnabledCommandIndex(filteredCommands));
  }, [query, isOpen]);

  useEffect(() => {
    setSelectedIndex(current =>
      normalizeEnabledCommandIndex(filteredCommands, current),
    );
  }, [filteredCommands]);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => {
    setIsOpen(false);
    setQuery('');
  }, []);
  const toggle = useCallback(() => setIsOpen(current => !current), []);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const isCommandK = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k';
      if (isCommandK) {
        event.preventDefault();
        toggle();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [toggle]);

  const selectNext = useCallback(() => {
    setSelectedIndex(current =>
      findNextEnabledCommandIndex(filteredCommands, current, 1),
    );
  }, [filteredCommands]);

  const selectPrevious = useCallback(() => {
    setSelectedIndex(current =>
      findNextEnabledCommandIndex(filteredCommands, current, -1),
    );
  }, [filteredCommands]);

  const runSelected = useCallback(() => {
    const selected = filteredCommands[selectedIndex];
    if (!selected || selected.disabled) return;
    selected.run();
    close();
  }, [close, filteredCommands, selectedIndex]);

  return {
    isOpen,
    query,
    setQuery,
    selectedIndex,
    setSelectedIndex,
    filteredCommands,
    open,
    close,
    toggle,
    selectNext,
    selectPrevious,
    runSelected,
  };
}
