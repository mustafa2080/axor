export interface ThrottleOptions {
  /** Failures allowed inside one window before blocking. */
  maxFailures: number;
  windowMs: number;
  /**
   * Repeat offenders wait longer each time. The first block is the window above, the second lasts
   * twice as long, the third four times, and so on up to `maxBlockMs`. A key is forgiven once
   * `memoryMs` passes after its last block ended, or on `reset` (a successful login).
   *
   * Use it only on keys an attacker cannot aim at someone else: a longer block on a key the
   * victim shares (like the email alone) would be a way to lock the victim out.
   */
  escalation?: { maxBlockMs: number; memoryMs: number };
  /** Hard cap on tracked keys so an attacker cannot grow memory without bound. */
  maxEntries?: number;
  /** Test hook. */
  now?: () => number;
}

interface Entry {
  failures: number;
  resetAt: number;
}

interface Strikes {
  /** How many blocks this key has earned in a row. */
  count: number;
  /** After this moment the key is forgiven. */
  forgetAt: number;
}

/**
 * Counts FAILED attempts per key and blocks the key once `maxFailures` is reached, until the window
 * (started by the first failure) ends. In-memory: correct for a single instance (ADR-0004 §6).
 */
export function createFailureThrottle(options: ThrottleOptions) {
  // Read `Date.now` at call time, not once here: a reference taken now would ignore a clock that
  // is faked or replaced later (the integration tests fake `Date` after the app is built).
  const now = options.now ?? (() => Date.now());
  const maxEntries = options.maxEntries ?? 10_000;
  const entries = new Map<string, Entry>();
  const strikes = new Map<string, Strikes>();

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

  function pruneStrikes(): void {
    const current = now();
    for (const [key, strike] of strikes) {
      if (strike.forgetAt <= current) strikes.delete(key);
    }
    while (strikes.size >= maxEntries) {
      const oldest = strikes.keys().next();
      if (oldest.done === true) break;
      strikes.delete(oldest.value);
    }
  }

  /** Called the moment a key reaches `maxFailures`: lengthens the block for a repeat offender. */
  function escalate(key: string, entry: Entry): void {
    const escalation = options.escalation;
    if (escalation === undefined) return;
    const current = now();
    const previous = strikes.get(key);
    const count = previous !== undefined && previous.forgetAt > current ? previous.count + 1 : 1;
    if (count > 1) {
      // The exponent is capped so the product stays a finite number however many strikes pile up.
      const doubled = options.windowMs * 2 ** Math.min(count - 1, 30);
      entry.resetAt = current + Math.min(doubled, escalation.maxBlockMs);
    }
    if (previous === undefined && strikes.size >= maxEntries) pruneStrikes();
    strikes.set(key, { count, forgetAt: entry.resetAt + escalation.memoryMs });
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
        if (entry.failures === options.maxFailures) escalate(key, entry);
        return;
      }
      if (entries.size >= maxEntries) prune();
      const created: Entry = { failures: 1, resetAt: now() + options.windowMs };
      entries.set(key, created);
      if (created.failures === options.maxFailures) escalate(key, created);
    },

    reset(key: string): void {
      entries.delete(key);
      strikes.delete(key);
    },
  };
}

export type FailureThrottle = ReturnType<typeof createFailureThrottle>;
