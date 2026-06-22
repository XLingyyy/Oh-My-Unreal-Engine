// Generic transient-error retry helper for file rename.
// Pure logic, no I/O of its own; production code wires in real fs.rename,
// validation tests wire in injectable fakes that throw controlled errors.

export type RenameFn = (tempPath: string, filePath: string) => Promise<void>;
export type SleepFn = (ms: number) => Promise<void>;

export interface RenameRetryOptions {
  rename: RenameFn;
  sleep: SleepFn;
  maxAttempts: number;
  baseDelayMs: number;
  transientErrnoCodes: ReadonlySet<string>;
}

export interface RenameRetryResult {
  ok: boolean;
  attempts: number;
  delays: number[];
  error?: unknown;
}

export function runRenameWithRetry(
  tempPath: string,
  filePath: string,
  options: RenameRetryOptions,
): Promise<RenameRetryResult> {
  const { rename, sleep, maxAttempts, baseDelayMs, transientErrnoCodes } = options;
  const delays: number[] = [];
  let lastError: unknown = null;

  const attempt = async (idx: number): Promise<RenameRetryResult> => {
    if (idx >= maxAttempts) {
      return { ok: false, attempts: maxAttempts, delays, error: lastError };
    }
    try {
      await rename(tempPath, filePath);
      return { ok: true, attempts: idx + 1, delays };
    } catch (err) {
      lastError = err;
      const code = (err as { code?: string } | null)?.code ?? '';
      const isLast = idx === maxAttempts - 1;
      if (!transientErrnoCodes.has(code) || isLast) {
        return { ok: false, attempts: idx + 1, delays, error: err };
      }
      const delay = baseDelayMs * Math.pow(2, idx);
      delays.push(delay);
      await sleep(delay);
      return attempt(idx + 1);
    }
  };

  return attempt(0);
}
