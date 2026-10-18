import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { uuidv7 } from '../common/id.js';
import { loadEnv } from '../config/env.js';
import { requireTenantScope } from '../modules/authz/tenant-scope.js';
import type { TenantPrincipal } from '../modules/authz/principal.js';
import { truncateDomainTables } from '../test/db-helpers.js';
import { createDatabase } from './client.js';
import { runMigrations } from './migrate.js';
import { TenantAuditLogsRepository } from './repositories/tenant-audit-logs.repository.js';
import { TenantSubscriptionsRepository } from './repositories/tenant-subscriptions.repository.js';
import { TenantUsersRepository } from './repositories/tenant-users.repository.js';
import * as schema from './schema/index.js';

// Horizontal-access (IDOR/BOLA) tests: company A must never read or change company B's data,
// even when it knows B's ids. Written before any endpoint reads company data (ADR-0003 §1).
const env = loadEnv(process.env);
const database = createDatabase(env.DATABASE_URL);
const { db } = database;

interface Company {
  tenantId: string;
  ownerId: string;
  memberId: string;
  subscriptionId: string;
  principal: TenantPrincipal;
}

let productId: string;
let a: Company;
let b: Company;

async function seedCompany(name: string, planId: string): Promise<Company> {
  const tenantId = uuidv7();
  const ownerId = uuidv7();
  const memberId = uuidv7();
  const subscriptionId = uuidv7();
  await db.insert(schema.tenants).values({ id: tenantId, name });
  await db.insert(schema.users).values([
    {
      id: ownerId,
      email: `owner@${name}.test`,
      passwordHash: 'argon2id$not-a-real-hash',
      tenantId,
      tenantRole: 'owner',
    },
    { id: memberId, email: `member@${name}.test`, tenantId, tenantRole: 'member' },
  ]);
  await db
    .insert(schema.subscriptions)
    .values({ id: subscriptionId, tenantId, productId, planId });
  return {
    tenantId,
    ownerId,
    memberId,
    subscriptionId,
    principal: { kind: 'tenant', userId: ownerId, tenantId, role: 'owner' },
  };
}

const usersOf = (c: Company) => new TenantUsersRepository(db, requireTenantScope(c.principal));
const subsOf = (c: Company) =>
  new TenantSubscriptionsRepository(db, requireTenantScope(c.principal));
const auditOf = (c: Company) => new TenantAuditLogsRepository(db, requireTenantScope(c.principal));

beforeAll(async () => {
  expect(new URL(env.DATABASE_URL).pathname).toBe('/axor_test');
  await runMigrations(env.DATABASE_URL);
});

beforeEach(async () => {
  await truncateDomainTables(db);
  productId = uuidv7();
  await db.insert(schema.products).values({ id: productId, code: 'stark', name: 'STARK' });
  const planId = uuidv7();
  await db.insert(schema.plans).values({ id: planId, productId, code: 'basic' });
  a = await seedCompany('alpha', planId);
  b = await seedCompany('beta', planId);
});

afterAll(async () => {
  await database.close();
});

describe('tenant isolation: the seed is not vacuous', () => {
  it('the database really holds both companies, so isolation is the repository’s doing', async () => {
    expect(await db.select().from(schema.users)).toHaveLength(4);
    expect(await db.select().from(schema.subscriptions)).toHaveLength(2);
  });
});

describe('tenant isolation: users', () => {
  it('lists only the caller’s own company', async () => {
    const rows = await usersOf(a).list();
    expect(rows.map((r) => r.id).sort()).toEqual([a.ownerId, a.memberId].sort());
  });

  it('never exposes the password hash', async () => {
    const rows = await usersOf(a).list();
    for (const row of rows) {
      expect(Object.keys(row)).not.toContain('passwordHash');
    }
    const found = await usersOf(a).findById(a.ownerId);
    expect(found && Object.keys(found)).not.toContain('passwordHash');
  });

  it('cannot read another company’s user even with the exact id', async () => {
    expect(await usersOf(a).findById(b.ownerId)).toBeUndefined();
    expect(await usersOf(a).findById(b.memberId)).toBeUndefined();
    expect(await usersOf(a).findById(a.memberId)).toBeDefined();
  });

  it('cannot change another company’s user role, and the row stays untouched', async () => {
    expect(await usersOf(a).updateRole(b.memberId, 'admin')).toBe(false);
    const [row] = await db
      .select({ role: schema.users.tenantRole })
      .from(schema.users)
      .where(eq(schema.users.id, b.memberId));
    expect(row?.role).toBe('member');
  });

  it('cannot disable another company’s user, and the row stays untouched', async () => {
    expect(await usersOf(a).setStatus(b.ownerId, 'disabled')).toBe(false);
    const [row] = await db
      .select({ status: schema.users.status })
      .from(schema.users)
      .where(eq(schema.users.id, b.ownerId));
    expect(row?.status).toBe('active');
  });

  it('can change its own company’s users', async () => {
    expect(await usersOf(a).updateRole(a.memberId, 'admin')).toBe(true);
    expect((await usersOf(a).findById(a.memberId))?.tenantRole).toBe('admin');
    expect(await usersOf(a).setStatus(a.memberId, 'disabled')).toBe(true);
    expect((await usersOf(a).findById(a.memberId))?.status).toBe('disabled');
  });

  it('is symmetric: company B is equally blind to company A', async () => {
    expect(await usersOf(b).findById(a.ownerId)).toBeUndefined();
    expect(await usersOf(b).updateRole(a.memberId, 'read_only')).toBe(false);
  });
});

describe('tenant isolation: subscriptions', () => {
  it('lists only the caller’s own subscriptions', async () => {
    const rows = await subsOf(a).list();
    expect(rows.map((r) => r.id)).toEqual([a.subscriptionId]);
  });

  it('finds the caller’s own subscription for a product, never the other company’s', async () => {
    const found = await subsOf(a).findByProduct(productId);
    expect(found?.id).toBe(a.subscriptionId);
    expect(found?.tenantId).toBe(a.tenantId);
  });

  it('returns nothing for a product the caller has no subscription to', async () => {
    expect(await subsOf(a).findByProduct(uuidv7())).toBeUndefined();
  });
});

describe('tenant isolation: audit logs', () => {
  it('writes events with the tenant and actor taken from the scope', async () => {
    await auditOf(a).record({ action: 'user.role_changed', targetType: 'user', targetId: b.memberId });
    const [row] = await auditOf(a).list();
    expect(row?.tenantId).toBe(a.tenantId);
    expect(row?.actorUserId).toBe(a.ownerId);
  });

  it('reads only the caller’s own trail', async () => {
    await auditOf(a).record({ action: 'a.one' });
    await auditOf(a).record({ action: 'a.two' });
    await auditOf(b).record({ action: 'b.one' });

    expect((await auditOf(a).list()).map((r) => r.action).sort()).toEqual(['a.one', 'a.two']);
    expect((await auditOf(b).list()).map((r) => r.action)).toEqual(['b.one']);
  });

  it('refuses credentials in metadata, at any depth', async () => {
    await expect(
      auditOf(a).record({ action: 'x', metadata: { password: 'hunter2' } }),
    ).rejects.toThrow(/sensitive key/);
    await expect(
      auditOf(a).record({ action: 'x', metadata: { nested: { refreshToken: 'abc' } } }),
    ).rejects.toThrow(/sensitive key/);
    await expect(
      auditOf(a).record({ action: 'x', metadata: { from: 'member', to: 'admin' } }),
    ).resolves.toBeTypeOf('string');
  });

  it('caps the page size', async () => {
    for (let i = 0; i < 3; i += 1) {
      await auditOf(a).record({ action: `event.${i}` });
    }
    expect(await auditOf(a).list(2)).toHaveLength(2);
    expect(await auditOf(a).list(0)).toHaveLength(1);
    expect(await auditOf(a).list(10_000)).toHaveLength(3);
  });
});

