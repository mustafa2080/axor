import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../app.js';
import { uuidv7 } from '../../common/id.js';
import { loadEnv } from '../../config/env.js';
import { createDatabase } from '../../database/client.js';
import { runMigrations } from '../../database/migrate.js';
import { createAuditAdminRepository } from '../../database/repositories/audit-admin.repository.js';
import * as schema from '../../database/schema/index.js';
import { truncateDomainTables } from '../../test/db-helpers.js';
import { createAccessTokenService } from '../auth/access-token.js';
import { createAuthService } from '../auth/auth.service.js';
import { hashPassword } from '../auth/password.js';

// GET /admin/audit-logs on a real MariaDB (axor_test): who may read the trail, how it is
// filtered and paged, that it is read-only, and that it survives rows pointing at missing records.
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
const ids = { tenantA: '', tenantB: '', ownerA: '', platformAdmin: '' };

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
    auditAdmin: createAuditAdminRepository(db),
  });
}

async function login(email: string): Promise<string> {
  const cached = tokenCache.get(email);
  if (cached !== undefined) return cached;
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    headers: { origin: ORIGIN },
    payload: { email, password: PASSWORD },
  });
  expect(res.statusCode).toBe(200);
  const token = res.json<{ data: { accessToken: string } }>().data.accessToken;
  tokenCache.set(email, token);
  return token;
}

async function get(query = '', as: string | null = 'admin@axor.test') {
  const token = as === null ? null : await login(as);
  return app.inject({
    method: 'GET',
    url: `/api/v1/admin/audit-logs${query}`,
    headers: token === null ? {} : { authorization: `Bearer ${token}` },
  });
}

type Entry = {
  id: string;
  createdAt: string;
  action: string;
  actorUserId: string | null;
  actorEmail: string | null;
  tenantId: string | null;
  tenantName: string | null;
  targetType: string | null;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
};
const entries = (res: { json: <T>() => T }) => res.json<{ data: Entry[] }>().data;
// Logging in also writes auth.* rows; the tests below only look at the rows they seeded.
const seeded = (list: Entry[]) => list.filter((entry) => entry.action.startsWith('test.'));

async function seedAudit(
  action: string,
  minutes: number,
  extra: Partial<typeof schema.auditLogs.$inferInsert> = {},
) {
  await db.insert(schema.auditLogs).values({
    id: uuidv7(),
    action,
    createdAt: new Date(T0 + minutes * 60_000),
    ...extra,
  });
}

beforeAll(async () => {
  expect(new URL(env.DATABASE_URL).pathname).toBe('/axor_test');
  await runMigrations(env.DATABASE_URL);
  passwordHash = await hashPassword(PASSWORD);
});

beforeEach(async () => {
  await authService?.drain();
  await truncateDomainTables(db);
  tokenCache.clear();
  ids.tenantA = uuidv7();
  ids.tenantB = uuidv7();
  ids.ownerA = uuidv7();
  ids.platformAdmin = uuidv7();
  await db.insert(schema.tenants).values([
    { id: ids.tenantA, name: 'alpha' },
    { id: ids.tenantB, name: 'beta' },
  ]);
  await db.insert(schema.users).values([
    { id: ids.ownerA, email: 'boss@alpha.test', passwordHash, tenantId: ids.tenantA, tenantRole: 'owner' },
    { id: uuidv7(), email: 'owner@axor.test', passwordHash, platformRole: 'owner' },
    { id: ids.platformAdmin, email: 'admin@axor.test', passwordHash, platformRole: 'admin' },
    { id: uuidv7(), email: 'support@axor.test', passwordHash, platformRole: 'support' },
  ]);
  app = newApp();
});

afterAll(async () => {
  await authService?.drain();
  await database.close();
});

describe('who may read the audit trail', () => {
  it('rejects a request without a token', async () => {
    expect((await get('', null)).statusCode).toBe(401);
  });

  it('rejects company users, even the owner', async () => {
    expect((await get('', 'boss@alpha.test')).statusCode).toBe(403);
  });

  it('rejects platform support, which has no audit permission', async () => {
    expect((await get('', 'support@axor.test')).statusCode).toBe(403);
  });

  it('lets platform owner and admin read it, with no-store caching', async () => {
    for (const email of ['owner@axor.test', 'admin@axor.test']) {
      const res = await get('', email);
      expect(res.statusCode).toBe(200);
      expect(res.headers['cache-control']).toBe('no-store');
    }
  });
});

describe('what the trail returns', () => {
  it('returns newest first with the actor email and the company name', async () => {
    await seedAudit('test.first', 1, { actorUserId: ids.ownerA, tenantId: ids.tenantA });
    await seedAudit('test.second', 2, {
      actorUserId: ids.platformAdmin,
      tenantId: ids.tenantB,
      targetType: 'plan',
      targetId: 'plan-1',
      metadata: { from: 'a', to: 'b' },
    });
    const list = seeded(entries(await get()));
    expect(list.map((entry) => entry.action)).toEqual(['test.second', 'test.first']);
    expect(list[0]).toMatchObject({
      actorEmail: 'admin@axor.test',
      tenantName: 'beta',
      targetType: 'plan',
      targetId: 'plan-1',
      metadata: { from: 'a', to: 'b' },
      createdAt: new Date(T0 + 2 * 60_000).toISOString(),
    });
    expect(list[1]).toMatchObject({ actorEmail: 'boss@alpha.test', tenantName: 'alpha' });
  });

  it('keeps rows whose user or company no longer exists, with nulls', async () => {
    await seedAudit('test.orphan', 3, { actorUserId: uuidv7(), tenantId: uuidv7() });
    await seedAudit('test.system', 4);
    const list = seeded(entries(await get()));
    expect(list).toHaveLength(2);
    for (const entry of list) {
      expect(entry.actorEmail).toBeNull();
      expect(entry.tenantName).toBeNull();
    }
  });

  it('never returns password hashes or other columns of the joined tables', async () => {
    await seedAudit('test.leak_check', 5, { actorUserId: ids.ownerA, tenantId: ids.tenantA });
    const res = await get('?action=test.leak_check');
    expect(res.body).not.toContain(passwordHash);
    expect(res.body).not.toMatch(/passwordHash|password_hash|tenantRole|platformRole/);
  });
});

describe('filtering and paging', () => {
  beforeEach(async () => {
    await seedAudit('test.alpha_event', 1, { tenantId: ids.tenantA, actorUserId: ids.ownerA });
    await seedAudit('test.alpha_event', 2, { tenantId: ids.tenantA, actorUserId: ids.platformAdmin });
    await seedAudit('test.beta_event', 3, { tenantId: ids.tenantB, actorUserId: ids.platformAdmin });
  });

  it('filters by action', async () => {
    const list = entries(await get('?action=test.beta_event'));
    expect(list).toHaveLength(1);
    expect(list[0]?.action).toBe('test.beta_event');
  });

  it('filters by company', async () => {
    const list = seeded(entries(await get(`?tenantId=${ids.tenantA}`)));
    expect(list.map((entry) => entry.action)).toEqual(['test.alpha_event', 'test.alpha_event']);
  });

  it('filters by actor and combines filters', async () => {
    const byActor = seeded(entries(await get(`?actorUserId=${ids.platformAdmin}`)));
    expect(byActor).toHaveLength(2);
    const combined = entries(
      await get(`?actorUserId=${ids.platformAdmin}&tenantId=${ids.tenantA}&action=test.alpha_event`),
    );
    expect(combined).toHaveLength(1);
  });

  it('pages with limit and offset and reports them in meta', async () => {
    const first = await get('?action=test.alpha_event&limit=1&offset=0');
    const second = await get('?action=test.alpha_event&limit=1&offset=1');
    expect(entries(first)).toHaveLength(1);
    expect(entries(second)).toHaveLength(1);
    expect(entries(first)[0]?.id).not.toBe(entries(second)[0]?.id);
    expect(first.json<{ meta: { limit: number; offset: number } }>().meta).toEqual({ limit: 1, offset: 0 });
  });
});

describe('input and read-only behaviour', () => {
  it.each([
    ['an unknown query key', '?foo=bar'],
    ['an action with unexpected characters', "?action=x'%20OR%201=1"],
    ['a malformed company id', '?tenantId=not-a-uuid'],
    ['a limit above the cap', '?limit=1000'],
    ['a negative offset', '?offset=-1'],
  ])('rejects %s with 400', async (_name, query) => {
    expect((await get(query)).statusCode).toBe(400);
  });

  it('offers no way to write: POST, PATCH and DELETE are not routes', async () => {
    const token = await login('owner@axor.test');
    for (const method of ['POST', 'PATCH', 'DELETE'] as const) {
      const res = await app.inject({
        method,
        url: '/api/v1/admin/audit-logs',
        headers: { authorization: `Bearer ${token}` },
        payload: {},
      });
      expect(res.statusCode).toBe(404);
    }
  });
});
