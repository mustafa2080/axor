
import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';

export interface DatabaseOptions {
  /** Most connections the pool opens (default 10). */
  poolSize?: number;
  /** Requests allowed to wait for a free connection; more than this fail fast instead of piling up (default 100). */
  queueLimit?: number;
  /**
   * Longest a single statement may run before MariaDB kills it (`max_statement_time`, ADR-0019).
   * Unset or 0 means no limit, which is what migrations and one-off scripts need.
   */
  statementTimeoutMs?: number;
}

export function createDatabase(databaseUrl: string, options: DatabaseOptions = {}) {
  const { poolSize = 10, queueLimit = 100, statementTimeoutMs = 0 } = options;
  const pool = mysql.createPool({
    uri: databaseUrl,
    connectionLimit: poolSize,
    waitForConnections: true,
    queueLimit,
    connectTimeout: 5_000,
    // All datetime columns are UTC (ADR-0003 §2): never let the driver apply the machine's local zone.
    timezone: 'Z',
  });

  if (statementTimeoutMs > 0) {
    // Runs on every NEW connection before it is handed to a caller (statements on one connection
    // are queued in order), so the limit also covers statements inside transactions. MariaDB takes
    // seconds, and accepts fractions.
    // A number, bound as a placeholder: the driver gets a fixed string (sql-safety.test.ts) and
    // formats the value as a numeric literal, never as a quoted string.
    const seconds = Number((statementTimeoutMs / 1000).toFixed(3));
    // Listens on the underlying callback pool: the promise wrapper re-emits the raw connection but
    // its typings claim a promise one, so this is the one place where type and runtime agree.
    pool.pool.on('connection', (connection) => {
      connection.query('SET SESSION max_statement_time = ?', [seconds], (error: unknown) => {
        // A connection without the limit would silently defeat it: drop it and let the pool reopen one.
        if (error !== null && error !== undefined) connection.destroy();
      });
    });
  }

  const db = drizzle({ client: pool });

  return {
    db,
    /** Lightweight connectivity check used by the readiness endpoint. */
    async ping(): Promise<void> {
      await pool.query('SELECT 1');
    },
    async close(): Promise<void> {
      await pool.end();
    },
  };
}

export type Database = ReturnType<typeof createDatabase>;
