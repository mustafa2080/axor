import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { normalizeEmailKey } from '../common/email.js';
import { uuidv7 } from '../common/id.js';
import { loadEnv } from '../config/env.js';
import { DOMAIN_TABLES, truncateDomainTables } from '../test/db-helpers.js';
import { createDatabase } from './client.js';
import { runMigrations } from './migrate.js';
import * as schema from './schema/index.js';

// Constraint tests against the real MariaDB test database (axor_test, see src/test/setup.ts).
// They prove that the rules in ADR-0003 are enforced by the database itself, not only by app code.
const env = loadEnv(process.env);
const database = createDatabase(env.DATABASE_URL);
const { db } = database;

const MYSQL_ERRNO = {
  duplicateEntry: 1062,
  outOfRange: 1264,
  foreignKeyViolation: 1452,
  checkConstraintFailed: 4025,
} as const;

/** Drizzle wraps driver errors; the original mysql2 error (with `errno`) is in `cause`. */
async function expectMysqlError(promise: Promise<unknown>, errno: number): Promise<void> {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(error, 'expected the statement to be rejected').toBeDefined();
  const cause = (error as { cause?: { errno?: number } }).cause;
  const actual = cause?.errno ?? (error as { errno?: number }).errno;
  expect(actual).toBe(errno);
}

/** Runs a SELECT and returns its rows (drizzle types `execute` as a write result). */
async function selectRows<T>(statement: ReturnType<typeof sql>): Promise<T[]> {
  const [rows] = (await db.execute(statement)) as unknown as [T[]];
  return rows;
}

async function insertTenant(name = 'Acme') {
  const id = uuidv7();
  await db.insert(schema.tenants).values({ id, name });
  return id;
}

async function insertProduct(code = 'stark') {
  const id = uuidv7();
  await db.insert(schema.products).values({ id, code, name: code.toUpperCase() });
  return id;
}

async function insertPlan(productId: string, code = 'basic') {
  const id = uuidv7();
  await db.insert(schema.plans).values({ id, productId, code });
  return id;
}

beforeAll(async () => {
  expect(new URL(env.DATABASE_URL).pathname).toBe('/axor_test');
  await runMigrations(env.DATABASE_URL);
});

beforeEach(async () => {
  await truncateDomainTables(db);
});

afterAll(async () => {
  await database.close();
});

describe('schema (ADR-0003)', () => {
  it('creates all 11 domain tables', async () => {
    const rows = await selectRows<{ table_name: string }>(
      sql`SELECT table_name AS table_name FROM information_schema.tables WHERE table_schema = DATABASE()`,
    );
    const names = rows.map((r) => r.table_name);
    for (const table of DOMAIN_TABLES) {
      expect(names).toContain(table);
    }
  });

  it('stores datetimes as UTC regardless of the machine time zone', async () => {
    const closedAt = new Date('2026-01-01T00:00:00.000Z');
    const id = uuidv7();
    await db.insert(schema.tenants).values({ id, name: 'Zone', closedAt });
    const [row] = await db.select().from(schema.tenants);
    expect(row?.closedAt?.toISOString()).toBe(closedAt.toISOString());
    const raw = await selectRows<{ closed_at: string }>(
      sql`SELECT DATE_FORMAT(closed_at, '%Y-%m-%d %H:%i:%s') AS closed_at FROM tenants`,
    );
    expect(raw[0]?.closed_at).toBe('2026-01-01 00:00:00');
  });
});

describe('users: one company per user, or platform staff (ADR-0003 #1)', () => {
  const base = () => ({ id: uuidv7(), email: `${uuidv7()}@example.com` });

  it('accepts a company user', async () => {
    const tenantId = await insertTenant();
    await expect(
      db.insert(schema.users).values({ ...base(), tenantId, tenantRole: 'owner' }),
    ).resolves.toBeDefined();
  });

  it('accepts platform staff with no company', async () => {
    await expect(
      db.insert(schema.users).values({ ...base(), platformRole: 'support' }),
    ).resolves.toBeDefined();
  });

  it('rejects a user that is both company user and platform staff', async () => {
    const tenantId = await insertTenant();
    await expectMysqlError(
      db
        .insert(schema.users)
        .values({ ...base(), tenantId, tenantRole: 'admin', platformRole: 'admin' }),
      MYSQL_ERRNO.checkConstraintFailed,
    );
  });

  it('rejects a user with neither a company nor a platform role', async () => {
    await expectMysqlError(
      db.insert(schema.users).values(base()),
      MYSQL_ERRNO.checkConstraintFailed,
    );
  });

  it('rejects a company without a company role, and a role without a company', async () => {
    const tenantId = await insertTenant();
    await expectMysqlError(
      db.insert(schema.users).values({ ...base(), tenantId }),
      MYSQL_ERRNO.checkConstraintFailed,
    );
    await expectMysqlError(
      db.insert(schema.users).values({ ...base(), tenantRole: 'member' }),
      MYSQL_ERRNO.checkConstraintFailed,
    );
  });

  it('rejects a user pointing at a company that does not exist', async () => {
    await expectMysqlError(
      db.insert(schema.users).values({ ...base(), tenantId: uuidv7(), tenantRole: 'member' }),
      MYSQL_ERRNO.foreignKeyViolation,
    );
  });

  it('keeps emails unique, case-insensitively', async () => {
    await db.insert(schema.users).values({ ...base(), email: 'ali@example.com', platformRole: 'admin' });
    await expectMysqlError(
      db
        .insert(schema.users)
        .values({ ...base(), email: 'ALI@example.com', platformRole: 'support' }),
      MYSQL_ERRNO.duplicateEntry,
    );
  });
});

describe('subscriptions', () => {
  it('allows only one subscription row per (company, product)', async () => {
    const tenantId = await insertTenant();
    const productId = await insertProduct();
    const planId = await insertPlan(productId);

    await db
      .insert(schema.subscriptions)
      .values({ id: uuidv7(), tenantId, productId, planId });
    await expectMysqlError(
      db.insert(schema.subscriptions).values({ id: uuidv7(), tenantId, productId, planId }),
      MYSQL_ERRNO.duplicateEntry,
    );

    const otherProduct = await insertProduct('caprina');
    const otherPlan = await insertPlan(otherProduct);
    await expect(
      db
        .insert(schema.subscriptions)
        .values({ id: uuidv7(), tenantId, productId: otherProduct, planId: otherPlan }),
    ).resolves.toBeDefined();
  });

  it('starts as trialing', async () => {
    const tenantId = await insertTenant();
    const productId = await insertProduct();
    const planId = await insertPlan(productId);
    await db.insert(schema.subscriptions).values({ id: uuidv7(), tenantId, productId, planId });
    const [row] = await db.select().from(schema.subscriptions);
    expect(row?.status).toBe('trialing');
    expect(row?.pinnedPlanVersionId).toBeNull();
  });
});

describe('trial_claims: abuse guard (ADR-0003 #3)', () => {
  it('blocks a second trial for the same email on the same product, even for another company', async () => {
    const productId = await insertProduct();
    const first = await insertTenant('First');
    const second = await insertTenant('Second');
    const emailKey = normalizeEmailKey('Ali+one@Example.com');

    await db.insert(schema.trialClaims).values({ id: uuidv7(), productId, tenantId: first, emailKey });
    await expectMysqlError(
      db.insert(schema.trialClaims).values({
        id: uuidv7(),
        productId,
        tenantId: second,
        emailKey: normalizeEmailKey('ali+two@example.com'),
      }),
      MYSQL_ERRNO.duplicateEntry,
    );
  });

  it('blocks a second trial for the same company on the same product, with a different email', async () => {
    const productId = await insertProduct();
    const tenantId = await insertTenant();
    await db
      .insert(schema.trialClaims)
      .values({ id: uuidv7(), productId, tenantId, emailKey: 'a@example.com' });
    await expectMysqlError(
      db
        .insert(schema.trialClaims)
        .values({ id: uuidv7(), productId, tenantId, emailKey: 'b@example.com' }),
      MYSQL_ERRNO.duplicateEntry,
    );
  });

  it('allows the same email and company to try a different product', async () => {
    const stark = await insertProduct('stark');
    const caprina = await insertProduct('caprina');
    const tenantId = await insertTenant();
    const emailKey = 'a@example.com';
    await db.insert(schema.trialClaims).values({ id: uuidv7(), productId: stark, tenantId, emailKey });
    await expect(
      db
        .insert(schema.trialClaims)
        .values({ id: uuidv7(), productId: caprina, tenantId, emailKey }),
    ).resolves.toBeDefined();
  });
});

describe('plans and plan_versions (ADR-0003 #4)', () => {
  it('keeps (plan, version) unique and round-trips amounts and JSON exactly', async () => {
    const productId = await insertProduct();
    const planId = await insertPlan(productId);
    const versionId = uuidv7();
    const row = {
      planId,
      version: 1,
      priceMinor: 4_999_900,
      currency: 'EGP',
      billingPeriod: 'monthly' as const,
      trialDays: 14,
      limits: { users: 5, shipments: null },
      features: { clientPortal: true },
    };
    await db.insert(schema.planVersions).values({ id: versionId, ...row });

    const [stored] = await db.select().from(schema.planVersions);
    expect(stored?.priceMinor).toBe(4_999_900);
    expect(stored?.limits).toEqual({ users: 5, shipments: null });
    expect(stored?.features).toEqual({ clientPortal: true });

    await expectMysqlError(
      db.insert(schema.planVersions).values({ id: uuidv7(), ...row }),
      MYSQL_ERRNO.duplicateEntry,
    );
    await expect(
      db.insert(schema.planVersions).values({ id: uuidv7(), ...row, version: 2 }),
    ).resolves.toBeDefined();
  });

  it('rejects a negative price', async () => {
    const productId = await insertProduct();
    const planId = await insertPlan(productId);
    await expectMysqlError(
      db.insert(schema.planVersions).values({
        id: uuidv7(),
        planId,
        version: 1,
        priceMinor: -1,
        currency: 'EGP',
        billingPeriod: 'monthly',
        limits: {},
        features: {},
      }),
      MYSQL_ERRNO.outOfRange,
    );
  });

  it('lets a subscription be pinned to a specific version', async () => {
    const tenantId = await insertTenant();
    const productId = await insertProduct();
    const planId = await insertPlan(productId);
    const versionId = uuidv7();
    await db.insert(schema.planVersions).values({
      id: versionId,
      planId,
      version: 1,
      priceMinor: 100,
      currency: 'EGP',
      billingPeriod: 'yearly',
      limits: {},
      features: {},
    });
    await db.insert(schema.subscriptions).values({
      id: uuidv7(),
      tenantId,
      productId,
      planId,
      pinnedPlanVersionId: versionId,
    });
    const [row] = await db.select().from(schema.subscriptions);
    expect(row?.pinnedPlanVersionId).toBe(versionId);

    await expectMysqlError(
      db.insert(schema.subscriptions).values({
        id: uuidv7(),
        tenantId: await insertTenant('Other'),
        productId,
        planId,
        pinnedPlanVersionId: uuidv7(),
      }),
      MYSQL_ERRNO.foreignKeyViolation,
    );
  });
});

describe('refresh_sessions', () => {
  it('keeps token hashes unique', async () => {
    const userId = uuidv7();
    await db.insert(schema.users).values({
      id: userId,
      email: 'staff@example.com',
      platformRole: 'owner',
    });
    const tokenHash = 'a'.repeat(64);
    const row = {
      userId,
      familyId: uuidv7(),
      tokenHash,
      expiresAt: new Date('2030-01-01T00:00:00.000Z'),
    };
    await db.insert(schema.refreshSessions).values({ id: uuidv7(), ...row });
    await expectMysqlError(
      db.insert(schema.refreshSessions).values({ id: uuidv7(), ...row }),
      MYSQL_ERRNO.duplicateEntry,
    );
  });
});

describe('audit_logs', () => {
  it('can always record an event, even for rows that no longer exist (no foreign keys)', async () => {
    await expect(
      db.insert(schema.auditLogs).values({
        id: uuidv7(),
        actorUserId: uuidv7(),
        tenantId: uuidv7(),
        action: 'tenant.closed',
        metadata: { reason: 'requested by owner' },
      }),
    ).resolves.toBeDefined();
  });
});
