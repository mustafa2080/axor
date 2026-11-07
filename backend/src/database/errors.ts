
interface DriverError {
  code?: unknown;
  errno?: unknown;
  message?: unknown;
  cause?: unknown;
}

/** Walks `error` and its `cause` chain (the ORM wraps driver errors) and returns true on the first match. */
function anyInCauseChain(error: unknown, matches: (candidate: DriverError) => boolean): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && typeof current === 'object' && current !== null; depth += 1) {
    const candidate = current as DriverError;
    if (matches(candidate)) return true;
    current = candidate.cause;
  }
  return false;
}

/** MariaDB duplicate-key error (1062), however many wrappers the driver/ORM put around it. */
export function isDuplicateEntry(error: unknown): boolean {
  return anyInCauseChain(error, (c) => c.code === 'ER_DUP_ENTRY' || c.errno === 1062);
}

/**
 * The database could not take the work right now (ADR-0019): the connection queue is full, or a
 * statement ran past `max_statement_time` (errno 1969). Both leave nothing half-done (a queued
 * request never reached the database, and a killed statement rolls its transaction back), so the
 * caller can safely answer 503 and let the client retry.
 */
export function isDatabaseBusy(error: unknown): boolean {
  return anyInCauseChain(
    error,
    (c) =>
      c.errno === 1969 ||
      c.code === 'ER_STATEMENT_TIMEOUT' ||
      (typeof c.message === 'string' && c.message.includes('Queue limit reached')),
  );
}
