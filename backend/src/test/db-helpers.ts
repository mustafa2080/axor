import { sql } from 'drizzle-orm';
import type { Database } from '../database/client.js';

/** Child tables first. Used to wipe the dedicated test database between tests. */
export const DOMAIN_TABLES = [
  'audit_logs',
  'trial_claims',
  'subscription_events',
  'subscriptions',
  'refresh_sessions',
  'users',
  'plan_versions',
  'plans',
  'business_activities',
  'products',
  'tenants',
] as const;

/**
 * Only ever call this against axor_test (src/test/setup.ts forces it).
 * FOREIGN_KEY_CHECKS is a per-connection setting, so everything runs inside one transaction
 * to guarantee the pool hands every statement the same connection.
 */
export async function truncateDomainTables(db: Database['db']): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(sql`SET FOREIGN_KEY_CHECKS = 0`);
    for (const table of DOMAIN_TABLES) {
      await tx.execute(sql.raw(`TRUNCATE TABLE \`${table}\``));
    }
    await tx.execute(sql`SET FOREIGN_KEY_CHECKS = 1`);
  });
}
