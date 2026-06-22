import { useCallback, useEffect, useMemo, useState } from 'react';

export interface CommandPaletteCommand {
  id: string;
  label: string;
  group: string;
  disabled?: boolean;
  run: () => void;
}

export function useCommandPalette(commands: CommandPaletteCommand[]) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const filteredCommands = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter(command =>
      `${command.group} ${command.label}`.toLowerCase().includes(q),
    );
  }, [commands, query]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query, isOpen]);

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
      filteredCommands.length === 0 ? 0 : (current + 1) % filteredCommands.length,
    );
  }, [filteredCommands.length]);

  const selectPrevious = useCallback(() => {
    setSelectedIndex(current =>
      filteredCommands.length === 0
        ? 0
        : (current - 1 + filteredCommands.length) % filteredCommands.length,
    );
  }, [filteredCommands.length]);

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
