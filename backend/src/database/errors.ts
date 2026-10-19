/** MariaDB duplicate-key error (1062), however many wrappers the driver/ORM put around it. */
export function isDuplicateEntry(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && typeof current === 'object' && current !== null; depth += 1) {
    const candidate = current as { code?: unknown; errno?: unknown; cause?: unknown };
    if (candidate.code === 'ER_DUP_ENTRY' || candidate.errno === 1062) return true;
    current = candidate.cause;
  }
  return false;
}
