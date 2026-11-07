export interface SessionPurgeStore {
  /** Deletes at most `batchSize` sessions that expired before `cutoff`; resolves with the count. */
  purgeExpired(cutoff: Date, batchSize: number): Promise<number>;
}

export interface SessionPurgeOptions {
  /** How long after `expires_at` a session is kept, so reuse of an old token is still seen. */
  graceMs: number;
  /** Rows per DELETE, so one statement never holds locks for long. */
  batchSize: number;
  /** Upper bound on DELETEs in one pass; the next scheduled pass continues where this stopped. */
  maxBatches: number;
  clock?: () => Date;
}

/**
 * One purge pass (ADR-0025): deletes expired refresh sessions in bounded batches and returns the
 * total. A full batch means there may be more, so it goes on, but never beyond `maxBatches`, which
 * keeps a first pass over a large backlog from running for minutes. Errors propagate to the
 * scheduler, which reports them and retries on the next tick.
 */
export async function purgeExpiredSessions(
  store: SessionPurgeStore,
  options: SessionPurgeOptions,
): Promise<number> {
  const cutoff = new Date((options.clock?.() ?? new Date()).getTime() - options.graceMs);
  let total = 0;
  for (let batch = 0; batch < options.maxBatches; batch += 1) {
    const deleted = await store.purgeExpired(cutoff, options.batchSize);
    total += deleted;
    if (deleted < options.batchSize) break;
  }
  return total;
}
