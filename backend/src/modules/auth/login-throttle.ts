export interface ThrottleOptions {
  /** Failures allowed inside one window before blocking. */
  maxFailures: number;
  windowMs: number;
  /** Hard cap on tracked keys so an attacker cannot grow memory without bound. */
  maxEntries?: number;
  /** Test hook. */
  now?: () => number;
}

interface Entry {
  failures: number;
  resetAt: number;
}

/**
 * Counts FAILED attempts per key and blocks the key once `maxFailures` is reached, until the window
 * (started by the first failure) ends. In-memory: correct for a single instance (ADR-0004 §6).
 */
export function createFailureThrottle(options: ThrottleOptions) {
  const now = options.now ?? Date.now;
  const maxEntries = options.maxEntries ?? 10_000;
  const entries = new Map<string, Entry>();

  function live(key: string): Entry | undefined {
    const entry = entries.get(key);
    if (entry !== undefined && entry.resetAt <= now()) {
      entries.delete(key);
      return undefined;
    }
    return entry;
  }

  function prune(): void {
    const current = now();
    for (const [key, entry] of entries) {
      if (entry.resetAt <= current) entries.delete(key);
    }
    // Still full of live entries: drop the oldest (Map keeps insertion order).
    while (entries.size >= maxEntries) {
      const oldest = entries.keys().next();
      if (oldest.done === true) break;
      entries.delete(oldest.value);
    }
  }

  return {
    /** Seconds the caller must wait, or 0 when not blocked. */
    retryAfterSeconds(key: string): number {
      const entry = live(key);
      if (entry === undefined || entry.failures < options.maxFailures) return 0;
      return Math.max(1, Math.ceil((entry.resetAt - now()) / 1000));
    },

    recordFailure(key: string): void {
      const entry = live(key);
      if (entry !== undefined) {
        entry.failures += 1;
        return;
      }
      if (entries.size >= maxEntries) prune();
      entries.set(key, { failures: 1, resetAt: now() + options.windowMs });
    },

    reset(key: string): void {
      entries.delete(key);
    },
  };
}

export type FailureThrottle = ReturnType<typeof createFailureThrottle>;
