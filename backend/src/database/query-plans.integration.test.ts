import { drizzle } from 'drizzle-orm/mysql2';
import mysql, { type RowDataPacket } from 'mysql2/promise';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { uuidv7 } from '../common/id.js';
import { loadEnv } from '../config/env.js';
import type { TenantPrincipal } from '../modules/authz/principal.js';
import { requireTenantScope } from '../modules/authz/tenant-scope.js';
import { truncateDomainTables } from '../test/db-helpers.js';
import { runMigrations } from './migrate.js';
import { createAuditAdminRepository } from './repositories/audit-admin.repository.js';
import { createCatalogAdminRepository } from './repositories/catalog-admin.repository.js';
import { createMembersRepository } from './repositories/members.repository.js';
import { createSubscriptionsRepository } from './repositories/subscriptions.repository.js';
import { createTenantsAdminRepository } from './repositories/tenants-admin.repository.js';
import { TenantAuditLogsRepository } from './repositories/tenant-audit-logs.repository.js';
import { TenantUsersRepository } from './repositories/tenant-users.repository.js';
import * as schema from './schema/index.js';

// Query-plan guard (TASKS.md section 10, indexing): every list and lookup that grows with the
// number of companies must be served by an index. The test seeds a realistic volume, runs the
// REAL repository methods, captures the SQL they send and EXPLAINs each statement. A new query
// (or a dropped index) that falls back to a full scan or a sort of a big table fails here.
const env = loadEnv(process.env);
const pool = mysql.createPool({ uri: env.DATABASE_URL, connectionLimit: 4, timezone: 'Z' });

interface Captured {
  sql: string;
  params: unknown[];
}
const captured: Captured[] = [];
const db = drizzle({
  client: pool,
  logger: { logQuery: (sql, params) => captured.push({ sql, params }) },
});

const TENANTS = 4000;
const BIG_TENANT_USERS = 600;
const AUDIT_ROWS = 30_000;
const ACTIONS = ['auth.login', 'auth.logout', 'plan.created', 'plan.updated', 'member.invited'];
const SUBSCRIPTION_STATUSES = ['trialing', 'active', 'canceled', 'expired'] as const;
const BASE_TIME = Date.UTC(2026, 0, 1);
// Tables that are big in production; a full scan of one of these is the failure we guard against.
const BIG_TABLES = new Set(['audit_logs', 'users', 'subscriptions', 'tenants']);

let bigTenantId: string;
let someTenantId: string;
let someActorId: string;

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function seed(): Promise<void> {
  const productId = uuidv7();
  const planId = uuidv7();
  await db.insert(schema.products).values({ id: productId, code: 'stark', name: 'STARK' });
  await db.insert(schema.plans).values({ id: planId, productId, code: 'basic' });

  const tenantRows = Array.from({ length: TENANTS }, (_, i) => ({
    id: uuidv7(),
    name: `company-${i}`,
    status: i % 10 === 0 ? ('suspended' as const) : ('active' as const),
    createdAt: new Date(BASE_TIME + i * 1000),
  }));
  for (const part of chunks(tenantRows, 500)) await db.insert(schema.tenants).values(part);

  const ownerRows = tenantRows.map((tenant, i) => ({
    id: uuidv7(),
    email: `owner-${i}@seed.test`,
    tenantId: tenant.id,
    tenantRole: 'owner' as const,
    createdAt: new Date(BASE_TIME + i * 1000),
  }));
  const bigTenant = tenantRows[0]!;
  const memberRows = Array.from({ length: BIG_TENANT_USERS }, (_, i) => ({
    id: uuidv7(),
    email: `member-${i}@seed.test`,
    tenantId: bigTenant.id,
    tenantRole: 'member' as const,
    status: i % 7 === 0 ? ('disabled' as const) : ('active' as const),
    createdAt: new Date(BASE_TIME + i * 1000),
  }));
  for (const part of chunks([...ownerRows, ...memberRows], 500)) {
    await db.insert(schema.users).values(part);
  }

  const subscriptionRows = tenantRows.map((tenant, i) => ({
    id: uuidv7(),
    tenantId: tenant.id,
    productId,
    planId,
    status: SUBSCRIPTION_STATUSES[i % SUBSCRIPTION_STATUSES.length]!,
    currentPeriodEnd: new Date(BASE_TIME + i * 60_000),
    createdAt: new Date(BASE_TIME + i * 1000),
  }));
  for (const part of chunks(subscriptionRows, 500)) {
    await db.insert(schema.subscriptions).values(part);
  }

  const auditRows = Array.from({ length: AUDIT_ROWS }, (_, i) => ({
    id: uuidv7(),
    tenantId: tenantRows[i % TENANTS]!.id,
    actorUserId: ownerRows[i % 200]!.id,
    action: ACTIONS[i % ACTIONS.length]!,
    createdAt: new Date(BASE_TIME + i * 1000),
  }));
  for (const part of chunks(auditRows, 1000)) await db.insert(schema.auditLogs).values(part);

  bigTenantId = bigTenant.id;
  someTenantId = tenantRows[5]!.id;
  someActorId = ownerRows[5]!.id;

  // Fresh statistics, so the optimizer plans for the volume that was just inserted.
  await pool.query('ANALYZE TABLE audit_logs, users, subscriptions, tenants');
}

interface Plan {
  sql: string;
  rows: RowDataPacket[];
}

/** Runs `action`, then EXPLAINs every SELECT it sent to the database. */
async function planOf(action: () => Promise<unknown>): Promise<Plan[]> {
  captured.length = 0;
  await action();
  const selects = captured.filter((query) => /^\s*select\b/i.test(query.sql));
  expect(selects.length, 'the action sent no SELECT').toBeGreaterThan(0);
  const plans: Plan[] = [];
  for (const query of selects) {
    const [rows] = await pool.query<RowDataPacket[]>(`EXPLAIN ${query.sql}`, query.params);
    plans.push({ sql: query.sql, rows });
  }
  return plans;
}

/**
 * `allowSort` is for the few queries whose result is tiny by design (a handful of products, one row
 * per product for a company). It must say why, so every exemption is visible in review.
 */
function expectIndexed(plans: Plan[], options: { allowSort?: string } = {}): void {
  if (options.allowSort !== undefined) expect(options.allowSort.length).toBeGreaterThan(10);
  for (const { sql, rows } of plans) {
    // EXPLAIN_VERBOSE=1 prints every plan, which is how to see why a query fails this guard.
    if (process.env['EXPLAIN_VERBOSE'] === '1') {
      console.log(
        `${sql.slice(0, 160)}\n` +
          rows
            .map((r) => `  ${r['table']}: type=${r['type']} key=${r['key']} rows=${r['rows']} ${r['Extra'] ?? ''}`)
            .join('\n'),
      );
    }
    for (const row of rows) {
      const table = String(row['table']);
      if (BIG_TABLES.has(table)) {
        expect(row['type'], `full table scan of ${table}: ${sql}`).not.toBe('ALL');
        expect(row['key'], `no index used on ${table}: ${sql}`).not.toBeNull();
      }
    }
    // The first row is the driving table: sorting it in memory means the ORDER BY has no index.
    // Reading by primary key (an explicit id list, e.g. the second step of a paged list) is bounded
    // by the list's size, so a sort or GROUP BY over it is fine.
    const driving = rows[0];
    const boundedById =
      driving?.['key'] === 'PRIMARY' && ['range', 'eq_ref', 'const'].includes(String(driving['type']));
    if (options.allowSort === undefined && !boundedById) {
      expect(String(driving?.['Extra'] ?? ''), `filesort on the driving table: ${sql}`).not.toMatch(
        /Using filesort/,
      );
    }
  }
}

beforeAll(async () => {
  expect(new URL(env.DATABASE_URL).pathname).toBe('/axor_test');
  await runMigrations(env.DATABASE_URL);
  await truncateDomainTables(db);
  await seed();
}, 120_000);

afterAll(async () => {
  await truncateDomainTables(db);
  await pool.end();
});

describe('query plans: admin lists use an index for the filter and the sort', () => {
  const audit = createAuditAdminRepository(db);
  const subscriptions = createSubscriptionsRepository(db);
  const tenants = createTenantsAdminRepository(db);
  const page = { limit: 50, offset: 0 };

  it('audit trail, newest first, with no filter', async () => {
    expectIndexed(await planOf(() => audit.list(page)));
  });

  it('audit trail filtered by company', async () => {
    expectIndexed(await planOf(() => audit.list({ ...page, tenantId: someTenantId })));
  });

  it('audit trail filtered by actor', async () => {
    expectIndexed(await planOf(() => audit.list({ ...page, actorUserId: someActorId })));
  });

  it('audit trail filtered by action', async () => {
    expectIndexed(await planOf(() => audit.list({ ...page, action: 'plan.created' })));
  });

  it('subscriptions, newest first, with no filter', async () => {
    expectIndexed(await planOf(() => subscriptions.adminList(page)));
  });

  it('subscriptions filtered by status', async () => {
    expectIndexed(await planOf(() => subscriptions.adminList({ ...page, status: 'active' })));
  });

  it('companies, newest first, with no filter', async () => {
    expectIndexed(await planOf(() => tenants.list(page)));
  });

  it('companies filtered by status', async () => {
    expectIndexed(await planOf(() => tenants.list({ ...page, status: 'suspended' })));
  });
});

describe('query plans: company-scoped reads never scan other companies', () => {
  const principal = (tenantId: string): TenantPrincipal => ({
    kind: 'tenant',
    userId: uuidv7(),
    tenantId,
    role: 'owner',
  });

  it('members page of the biggest company', async () => {
    const members = createMembersRepository(db);
    const scope = requireTenantScope(principal(bigTenantId));
    expectIndexed(await planOf(() => members.list(scope, { limit: 50, offset: 0 })));
  });

  it('the full user list of a company', async () => {
    const users = new TenantUsersRepository(db, requireTenantScope(principal(bigTenantId)));
    expectIndexed(await planOf(async () => await users.list()));
  });

  it('the audit trail of a company', async () => {
    const trail = new TenantAuditLogsRepository(db, requireTenantScope(principal(someTenantId)));
    expectIndexed(await planOf(async () => await trail.list(50)));
  });

  it('the subscriptions of a company', async () => {
    const subscriptions = createSubscriptionsRepository(db);
    const scope = requireTenantScope(principal(someTenantId));
    expectIndexed(await planOf(() => subscriptions.listForTenant(scope)), {
      allowSort: 'one row per product for one company (unique tenant+product), sorted by product name',
    });
  });
});

describe('query plans: sweeps and catalog reads', () => {
  it('the expiry sweep finds due subscriptions through the status/period index', async () => {
    const sweep = createSubscriptionsRepository(db, { now: () => new Date(BASE_TIME + 3_600_000) });
    expectIndexed(await planOf(() => sweep.expireDue()), {
      allowSort: 'sorts only the due rows (status + period index range), and the sweep runs in batches',
    });
  });

  it('the admin catalog page loads products, activities, plans and versions by key', async () => {
    const catalog = createCatalogAdminRepository(db);
    expectIndexed(await planOf(() => catalog.listCatalog({ limit: 50, offset: 0 })), {
      allowSort: 'products is a handful of rows by design (one per AXOR system), sorted by name',
    });
  });
});
