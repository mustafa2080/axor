import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';

export function createDatabase(databaseUrl: string) {
  const pool = mysql.createPool({
    uri: databaseUrl,
    connectionLimit: 10,
    waitForConnections: true,
    queueLimit: 100,
    connectTimeout: 5_000,
  });
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
