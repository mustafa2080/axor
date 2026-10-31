import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../app.js';
import { uuidv7 } from '../../common/id.js';
import { loadEnv } from '../../config/env.js';
import { createDatabase } from '../../database/client.js';
import { runMigrations } from '../../database/migrate.js';
import { createTenantsAdminRepository } from '../../database/repositories/tenants-admin.repository.js';
import * as schema from '../../database/schema/index.js';
import { truncateDomainTables } from '../../test/db-helpers.js';
import { createAccessTokenService } from '../auth/access-token.js';
import { createAuthService } from '../auth/auth.service.js';
import { hashPassword } from '../auth/password.js';

// /admin/tenants on a real MariaDB (axor_test): who may list, suspend and reactivate companies
// (ADR-0011), that a suspension locks the company's people out on their very next request, that
// the reason is mandatory and audited, and that only valid status transitions are accepted.
const env = loadEnv(process.env);
const database = createDatabase(env.DATABASE_URL);
const { db } = database;

const PASSWORD = 'correct horse battery staple 42';
const ORIGIN = new URL(env.WEB_ORIGIN).origin;
const T0 = Date.parse('2026-10-20T10:00:00.000Z');

let app: ReturnType<typeof buildApp>;
let authService: ReturnType<typeof createAuthService> | undefined;
let passwordHash: string;
const tokenCache = new Map<string, string>();
const ids = { alpha: '', beta: '', gamma: '', platformAdmin: '' };

function newApp() {
  const accessTokens = createAccessTokenService({
    secret: env.JWT_ACCESS_SECRET,
    ttlSeconds: env.ACCESS_TOKEN_TTL_SECONDS,
    issuer: 'axor-api',
    audience: 'axor-web',
  });
  const auth = createAuthService({ db, accessTokens, refreshTtlDays: env.REFRESH_TOKEN_TTL_DAYS });
  authService = auth;
  return buildApp(env, {
    checkDatabase: () => database.ping(),
    auth,
    tenantsAdmin: createTenantsAdminRepository(db),
  });
}

const loginResponse = (email: string) =>
  app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    headers: { origin: ORIGIN },
    payload: { email, password: PASSWORD },
  });

async function login(email: string): Promise<string> {
  const cached = tokenCache.get(email);
  if (cached !== undefined) return cached;
  const res = await loginResponse(email);
  expect(res.statusCode).toBe(200);
  const token = res.json<{ data: { accessToken: string } }>().data.accessToken;
  tokenCache.set(email, token);
  return token;
}

async function call(
  method: 'GET' | 'POST',
  path: string,
  as: string | null,
  payload?: Record<string, unknown>,
  headers: Record<string, string> = {},
) {
  const token = as === null ? null : await login(as);
  return app.inject({
    method,
    url: `/api/v1${path}`,
    headers: { ...(token !== null && { authorization: `Bearer ${token}` }), ...headers },
    ...(payload !== undefined && { payload }),
  });
}

const STAFF = 'admin@axor.test';
type TenantRow = { id: string; name: string; status: string; userCount: number; closedAt: string | null };
const tenantsOf = (res: { json: <T>() => T }) => res.json<{ data: TenantRow[] }>().data;
const statusOf = async (id: string) =>
  (await db.select().from(schema.tenants).where(eq(schema.tenants.id, id)))[0]?.status;
const auditRows = (action: string) =>
  db.select().from(schema.auditLogs).where(eq(schema.auditLogs.action, action));

beforeAll(async () => {
  expect(new URL(env.DATABASE_URL).pathname).toBe('/axor_test');
  await runMigrations(env.DATABASE_URL);
  passwordHash = await hashPassword(PASSWORD);
});

beforeEach(async () => {
  await authService?.drain();
  await truncateDomainTables(db);
  tokenCache.clear();
  ids.alpha = uuidv7();
  ids.beta = uuidv7();
  ids.gamma = uuidv7();
  ids.platformAdmin = uuidv7();
  await db.insert(schema.tenants).values([
    { id: ids.alpha, name: 'alpha', createdAt: new Date(T0 + 1 * 60_000) },
    { id: ids.beta, name: 'beta', createdAt: new Date(T0 + 2 * 60_000) },
    { id: ids.gamma, name: 'gamma', status: 'closed', closedAt: new Date(T0), createdAt: new Date(T0 + 3 * 60_000) },
  ]);
  await db.insert(schema.users).values([
    { id: uuidv7(), email: 'boss@alpha.test', passwordHash, tenantId: ids.alpha, tenantRole: 'owner' },
    { id: uuidv7(), email: 'member@alpha.test', passwordHash, tenantId: ids.alpha, tenantRole: 'member' },
    { id: uuidv7(), email: 'boss@beta.test', passwordHash, tenantId: ids.beta, tenantRole: 'owner' },
    { id: uuidv7(), email: 'owner@axor.test', passwordHash, platformRole: 'owner' },
    { id: ids.platformAdmin, email: STAFF, passwordHash, platformRole: 'admin' },
    { id: uuidv7(), email: 'support@axor.test', passwordHash, platformRole: 'support' },
  ]);
  app = newApp();
});

afterAll(async () => {
  await authService?.drain();
  await database.close();
});

describe('who may use /admin/tenants', () => {
  it('rejects a request without a token', async () => {
    expect((await call('GET', '/admin/tenants', null)).statusCode).toBe(401);
  });

  it('rejects company users, even the owner', async () => {
    expect((await call('GET', '/admin/tenants', 'boss@alpha.test')).statusCode).toBe(403);
    const res = await call('POST', `/admin/tenants/${ids.alpha}/suspend`, 'boss@alpha.test', { reason: 'testing' });
    expect(res.statusCode).toBe(403);
    expect(await statusOf(ids.alpha)).toBe('active');
  });

  it('lets support read but not change anything', async () => {
    const list = await call('GET', '/admin/tenants', 'support@axor.test');
    expect(list.statusCode).toBe(200);
    expect(list.headers['cache-control']).toBe('no-store');
    for (const action of ['suspend', 'reactivate']) {
      const res = await call('POST', `/admin/tenants/${ids.alpha}/${action}`, 'support@axor.test', {
        reason: 'testing',
      });
      expect(res.statusCode, action).toBe(403);
    }
    expect(await statusOf(ids.alpha)).toBe('active');
  });
});

describe('listing companies', () => {
  it('returns every company, newest first, with its status and user count', async () => {
    const list = tenantsOf(await call('GET', '/admin/tenants', STAFF));
    expect(list.map((tenant) => [tenant.name, tenant.status, tenant.userCount])).toEqual([
      ['gamma', 'closed', 0],
      ['beta', 'active', 1],
      ['alpha', 'active', 2],
    ]);
    expect(list[0]?.closedAt).toBe(new Date(T0).toISOString());
  });

  it('filters by status and pages with limit and offset', async () => {
    const active = tenantsOf(await call('GET', '/admin/tenants?status=active', STAFF));
    expect(active.map((tenant) => tenant.name)).toEqual(['beta', 'alpha']);
    const page = await call('GET', '/admin/tenants?limit=1&offset=1', STAFF);
    expect(tenantsOf(page).map((tenant) => tenant.name)).toEqual(['beta']);
    expect(page.json<{ meta: unknown }>().meta).toEqual({ limit: 1, offset: 1 });
  });

  it('never returns credentials or user details', async () => {
    const res = await call('GET', '/admin/tenants', STAFF);
    expect(res.body).not.toContain(passwordHash);
    expect(res.body).not.toMatch(/@alpha\.test|passwordHash|password_hash/);
  });

  it.each([
    ['an unknown query key', '?foo=bar'],
    ['an unknown status', '?status=deleted'],
    ['a limit above the cap', '?limit=1000'],
    ['a negative offset', '?offset=-1'],
  ])('rejects %s with 400', async (_name, query) => {
    expect((await call('GET', `/admin/tenants${query}`, STAFF)).statusCode).toBe(400);
  });
});

describe('suspending a company', () => {
  it('suspends it, returns the new state and audits the reason', async () => {
    const res = await call(
      'POST',
      `/admin/tenants/${ids.alpha}/suspend`,
      STAFF,
      { reason: '  Unpaid invoice, third notice  ' },
      { 'x-request-id': 'req-tenants-0001' },
    );
    expect(res.statusCode).toBe(200);
    expect(res.json<{ data: TenantRow }>().data).toMatchObject({
      id: ids.alpha,
      status: 'suspended',
      userCount: 2,
    });
    expect(await statusOf(ids.alpha)).toBe('suspended');
    const rows = await auditRows('tenant.suspended');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      tenantId: ids.alpha,
      actorUserId: ids.platformAdmin,
      targetType: 'tenant',
      targetId: ids.alpha,
      metadata: { reason: 'Unpaid invoice, third notice' },
      requestId: 'req-tenants-0001',
    });
  });

  it('locks every user of the company out at once, and nobody else', async () => {
    await login('boss@alpha.test');
    await login('member@alpha.test');
    await login('boss@beta.test');
    await call('POST', `/admin/tenants/${ids.alpha}/suspend`, STAFF, { reason: 'abuse report' });

    // Tokens they already hold stop working on the next request...
    for (const email of ['boss@alpha.test', 'member@alpha.test']) {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
        headers: { authorization: `Bearer ${await login(email)}` },
      });
      expect(res.statusCode, email).toBe(401);
      // ...and so does signing in again.
      expect((await loginResponse(email)).statusCode, email).toBe(401);
    }
    // Another company and the platform staff are not affected.
    for (const email of ['boss@beta.test', STAFF]) {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
        headers: { authorization: `Bearer ${await login(email)}` },
      });
      expect(res.statusCode, email).toBe(200);
    }
  });

  it.each([
    ['no reason', {}],
    ['an empty reason', { reason: '' }],
    ['a blank reason', { reason: '     ' }],
    ['a reason that is too short', { reason: 'ab' }],
    ['a reason that is too long', { reason: 'x'.repeat(501) }],
    ['a reason that is not text', { reason: 42 }],
    ['an unknown key next to a valid reason', { reason: 'valid reason', status: 'active' }],
  ])('requires a proper reason: %s -> 400, and nothing changes', async (_name, payload) => {
    const res = await call('POST', `/admin/tenants/${ids.alpha}/suspend`, STAFF, payload);
    expect(res.statusCode).toBe(400);
    expect(await statusOf(ids.alpha)).toBe('active');
    expect(await auditRows('tenant.suspended')).toHaveLength(0);
  });

  it('answers 409 for a company that is not active (suspended or closed), without a second audit row', async () => {
    await call('POST', `/admin/tenants/${ids.alpha}/suspend`, STAFF, { reason: 'first time' });
    const again = await call('POST', `/admin/tenants/${ids.alpha}/suspend`, STAFF, { reason: 'second time' });
    expect(again.statusCode).toBe(409);
    const closed = await call('POST', `/admin/tenants/${ids.gamma}/suspend`, STAFF, { reason: 'closed already' });
    expect(closed.statusCode).toBe(409);
    expect(await statusOf(ids.gamma)).toBe('closed');
    expect(await auditRows('tenant.suspended')).toHaveLength(1);
  });

  it('answers 404 for an unknown company and 400 for a malformed id', async () => {
    expect((await call('POST', `/admin/tenants/${uuidv7()}/suspend`, STAFF, { reason: 'does not exist' })).statusCode).toBe(404);
    expect((await call('POST', '/admin/tenants/not-a-uuid/suspend', STAFF, { reason: 'bad id here' })).statusCode).toBe(400);
  });

  it('lets two staff members race: exactly one suspension is recorded', async () => {
    await login('owner@axor.test');
    await login(STAFF);
    const results = await Promise.all([
      call('POST', `/admin/tenants/${ids.alpha}/suspend`, 'owner@axor.test', { reason: 'race one' }),
      call('POST', `/admin/tenants/${ids.alpha}/suspend`, STAFF, { reason: 'race two' }),
    ]);
    expect(results.map((res) => res.statusCode).sort()).toEqual([200, 409]);
    expect(await auditRows('tenant.suspended')).toHaveLength(1);
  });
});

describe('reactivating a company', () => {
  beforeEach(async () => {
    await call('POST', `/admin/tenants/${ids.alpha}/suspend`, STAFF, { reason: 'unpaid invoice' });
  });

  it('reactivates it: its people can sign in again, and it is audited', async () => {
    expect((await loginResponse('boss@alpha.test')).statusCode).toBe(401);
    const res = await call('POST', `/admin/tenants/${ids.alpha}/reactivate`, STAFF, {
      reason: 'invoice paid',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ data: TenantRow }>().data.status).toBe('active');
    expect((await loginResponse('boss@alpha.test')).statusCode).toBe(200);
    const rows = await auditRows('tenant.reactivated');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      tenantId: ids.alpha,
      actorUserId: ids.platformAdmin,
      targetType: 'tenant',
      metadata: { reason: 'invoice paid' },
    });
  });

  it('accepts a request with no body and no reason', async () => {
    const res = await call('POST', `/admin/tenants/${ids.alpha}/reactivate`, STAFF);
    expect(res.statusCode).toBe(200);
    const rows = await auditRows('tenant.reactivated');
    expect(rows[0]?.metadata).toEqual({});
  });

  it('rejects unknown keys and a too-short reason', async () => {
    for (const payload of [{ status: 'active' }, { reason: 'ab' }]) {
      const res = await call('POST', `/admin/tenants/${ids.alpha}/reactivate`, STAFF, payload);
      expect(res.statusCode).toBe(400);
    }
    expect(await statusOf(ids.alpha)).toBe('suspended');
  });

  it('answers 409 for a company that is not suspended (active or closed)', async () => {
    const active = await call('POST', `/admin/tenants/${ids.beta}/reactivate`, STAFF);
    expect(active.statusCode).toBe(409);
    const closed = await call('POST', `/admin/tenants/${ids.gamma}/reactivate`, STAFF);
    expect(closed.statusCode).toBe(409);
    expect(await statusOf(ids.gamma)).toBe('closed');
    expect(await auditRows('tenant.reactivated')).toHaveLength(0);
  });

  it('answers 404 for an unknown company', async () => {
    expect((await call('POST', `/admin/tenants/${uuidv7()}/reactivate`, STAFF)).statusCode).toBe(404);
  });

  it('leaves the company\u2019s users and their statuses exactly as they were', async () => {
    await call('POST', `/admin/tenants/${ids.alpha}/reactivate`, STAFF);
    const users = await db
      .select()
      .from(schema.users)
      .where(and(eq(schema.users.tenantId, ids.alpha)));
    expect(users.map((user) => user.status)).toEqual(['active', 'active']);
  });
});
