export interface SelectableCommand {
  disabled?: boolean;
}

export function findFirstEnabledCommandIndex(
  commands: readonly SelectableCommand[],
): number {
  return commands.findIndex(command => !command.disabled);
}

export function findNextEnabledCommandIndex(
  commands: readonly SelectableCommand[],
  currentIndex: number,
  direction: 1 | -1,
): number {
  const firstEnabledIndex = findFirstEnabledCommandIndex(commands);
  if (firstEnabledIndex === -1) return -1;
  if (
    currentIndex < 0
    || currentIndex >= commands.length
    || commands[currentIndex]?.disabled
  ) {
    return firstEnabledIndex;
  }

  for (let offset = 1; offset <= commands.length; offset += 1) {
    const candidateIndex =
      (currentIndex + direction * offset + commands.length) % commands.length;
    if (!commands[candidateIndex]?.disabled) return candidateIndex;
  }

  return -1;
}

export function normalizeEnabledCommandIndex(
  commands: readonly SelectableCommand[],
  currentIndex: number,
): number {
  if (
    currentIndex >= 0
    && currentIndex < commands.length
    && !commands[currentIndex]?.disabled
  ) {
    return currentIndex;
  }
  return findFirstEnabledCommandIndex(commands);
}
