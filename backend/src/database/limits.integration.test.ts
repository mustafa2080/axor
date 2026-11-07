import { sql } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { loadEnv } from '../config/env.js';
import { uuidv7 } from '../common/id.js';
import { requireTenantScope } from '../modules/authz/tenant-scope.js';
import { truncateDomainTables } from '../test/db-helpers.js';
import { createDatabase } from './client.js';
import { isDatabaseBusy } from './errors.js';
import { TenantUsersRepository } from './repositories/tenant-users.repository.js';
import { runMigrations } from './migrate.js';
import { tenants, users } from './schema/index.js';

// Real MariaDB (axor_test): ADR-0019. The limits are only worth having if the database really
// enforces them, so these run against the server instead of mocking the driver.
const env = loadEnv(process.env);
const opened: Array<{ close: () => Promise<void> }> = [];
function open(options: Parameters<typeof createDatabase>[1]) {
  const database = createDatabase(env.DATABASE_URL, options);
  opened.push(database);
  return database;
}

afterAll(async () => {
  await Promise.all(opened.map((database) => database.close()));
});

async function sessionLimit(database: ReturnType<typeof open>): Promise<number> {
  const [rows] = (await database.db.execute(sql`SELECT @@session.max_statement_time AS t`)) as unknown as [
    Array<{ t: string | number }>,
  ];
  return Number(rows[0]?.t);
}

describe('database limits (ADR-0019)', () => {
  it('puts max_statement_time on every connection only when a timeout is configured', async () => {
    expect(await sessionLimit(open({}))).toBe(0);
    expect(await sessionLimit(open({ statementTimeoutMs: 1500 }))).toBeCloseTo(1.5, 3);
  });

  it('kills a statement that runs past the timeout, and the connection stays usable', async () => {
    const database = open({ poolSize: 1, statementTimeoutMs: 300 });
    const started = Date.now();
    const error = await database.db.execute(sql`SELECT SLEEP(5)`).then(
      () => undefined,
      (caught: unknown) => caught,
    );
    // MariaDB either raises error 1969 or cuts SLEEP short with a result; both end the wait early.
    expect(Date.now() - started).toBeLessThan(3000);
    if (error !== undefined) expect(isDatabaseBusy(error)).toBe(true);
    await expect(database.ping()).resolves.toBeUndefined();
  });

  it('a runaway statement fails as "busy" so the API can answer 503', async () => {
    const database = open({ poolSize: 1, statementTimeoutMs: 200 });
    // A cross join that cannot finish in 200 ms: the engine, not SLEEP, is what gets interrupted.
    const heavy = sql`SELECT COUNT(*) FROM information_schema.columns a, information_schema.columns b, information_schema.columns c`;
    const error = await database.db.execute(heavy).then(
      () => undefined,
      (caught: unknown) => caught,
    );
    expect(error).toBeDefined();
    expect(isDatabaseBusy(error)).toBe(true);
  });

  it('fails fast once the queue behind a full pool is full', async () => {
    const database = open({ poolSize: 1, queueLimit: 1 });
    const work = () => database.db.execute(sql`SELECT SLEEP(1)`);
    const results = await Promise.allSettled([work(), work(), work()]);
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    // One runs, one waits in the queue, the third is turned away immediately.
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(2);
    expect(rejected).toHaveLength(1);
    expect(isDatabaseBusy(rejected[0]?.reason)).toBe(true);
  });

  it('TenantUsersRepository.list() is always bounded', async () => {
    await runMigrations(env.DATABASE_URL);
    const database = open({});
    await truncateDomainTables(database.db);
    const tenantId = uuidv7();
    await database.db.insert(tenants).values({ id: tenantId, name: 'limits' });
    const total = 130;
    await database.db.insert(users).values(
      Array.from({ length: total }, (_, i) => ({
        id: uuidv7(),
        tenantId,
        email: `limits-${tenantId}-${i}@example.test`,
        tenantRole: 'member' as const,
      })),
    );
    const repo = new TenantUsersRepository(
      database.db,
      requireTenantScope({ kind: 'tenant', userId: uuidv7(), tenantId, role: 'owner' }),
    );

    expect(await repo.list()).toHaveLength(100);
    expect(await repo.list({ limit: 5000 })).toHaveLength(100);
    expect(await repo.list({ limit: 0 })).toHaveLength(1);
    expect(await repo.list({ limit: 25, offset: 100 })).toHaveLength(25);
    expect(await repo.list({ offset: 120 })).toHaveLength(10);

    const everything = (await repo.list()).map((u) => u.id);
    const second = (await repo.list({ offset: 100 })).map((u) => u.id);
    expect(new Set([...everything, ...second]).size).toBe(total);
    await truncateDomainTables(database.db);
  });
});

