/** MariaDB/InnoDB deadlock (errno 1213), however many wrappers the driver/ORM put around it. */
export function isDeadlock(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && typeof current === 'object' && current !== null; depth += 1) {
    const candidate = current as { code?: unknown; errno?: unknown; cause?: unknown };
    if (candidate.code === 'ER_LOCK_DEADLOCK' || candidate.errno === 1213) return true;
    current = candidate.cause;
  }
  return false;
}

/**
 * Runs a whole transaction again when InnoDB picks it as a deadlock victim. The database has
 * already rolled the victim back, so retrying the unit of work from the start is the documented
 * remedy ("try restarting transaction"). Anything else, or running out of attempts, is rethrown.
 */
export async function retryOnDeadlock<T>(work: () => Promise<T>, attempts = 4): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await work();
    } catch (error) {
      if (attempt >= attempts || !isDeadlock(error)) throw error;
    }
  }
}
