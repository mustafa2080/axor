import path from 'node:path';
import { migrate } from 'drizzle-orm/mysql2/migrator';
import { createDatabase } from './client.js';

// Resolved from backend/src so it works both from `src` (tsx) and `dist` (compiled).
export const defaultMigrationsFolder = path.resolve(
  import.meta.dirname,
  '../../src/database/migrations',
);

/** Applies pending SQL migrations. Safe to run repeatedly (applied ones are skipped). */
export async function runMigrations(
  databaseUrl: string,
  migrationsFolder: string = defaultMigrationsFolder,
): Promise<void> {
  const database = createDatabase(databaseUrl);
  try {
    await migrate(database.db, { migrationsFolder });
  } finally {
    await database.close();
  }
}
