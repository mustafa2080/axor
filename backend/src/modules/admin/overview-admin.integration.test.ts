import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../app.js';
import { uuidv7 } from '../../common/id.js';
import { loadEnv } from '../../config/env.js';
import { createDatabase } from '../../database/client.js';
import { runMigrations } from '../../database/migrate.js';
import {
  TRIALS_ENDING_SOON_DAYS,
  createOverviewAdminRepository,
} from '../../database/repositories/overview-admin.repository.js';
import * as schema from '../../database/schema/index.js';
import { truncateDomainTables } from '../../test/db-helpers.js';
import { createAccessTokenService } from '../auth/access-token.js';
import { createAuthService } from '../auth/auth.service.js';
import { hashPassword } from '../auth/password.js';

// GET /admin/overview on a real MariaDB (axor_test): who may read the platform-wide counters, that
// every status is always present (0 when empty), that the "ending soon" window has exact
// boundaries, and that nothing about a single company leaks into the answer (TASKS.md §5.4).
const env = loadEnv(process.env);
const database = createDatabase(env.DATABASE_URL);
const { db } = database;

const PASSWORD = 'correct horse battery staple 42';
const NOW = Date.parse('2026-10-20T10:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;
const clock = () => new Date(NOW);

let app: ReturnType<typeof buildApp>;
let authService: ReturnType<typeof createAuthService> | undefined;
let passwordHash: string;
const tokenCache = new Map<string, string>();
const ids = { alpha: '', beta: '', gamma: '', delta: '', stark: '', caprina: '', plan: '', plan2: '' };

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
    overviewAdmin: createOverviewAdminRepository(db, { now: clock }),
  });
}

async function login(email: string): Promise<string> {
  const cached = tokenCache.get(email);
  if (cached !== undefined) return cached;
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    headers: { origin: new URL(env.WEB_ORIGIN).origin },
    payload: { email, password: PASSWORD },
  });
  expect(res.statusCode).toBe(200);
  const token = res.json<{ data: { accessToken: string } }>().data.accessToken;
  tokenCache.set(email, token);
  return token;
}

async function get(path: string, as: string | null) {
  const token = as === null ? null : await login(as);
  return app.inject({
    method: 'GET',
    url: `/api/v1${path}`,
    headers: token === null ? {} : { authorization: `Bearer ${token}` },
  });
}

type Counts<S extends string> = Record<S | 'total', number>;
interface Overview {
  tenants: Counts<'active' | 'suspended' | 'closed'>;
  subscriptions: Counts<'trialing' | 'active' | 'past_due' | 'canceled' | 'expired'>;
  trialsEndingSoon: number;
  trialsEndingSoonDays: number;
}
const overviewOf = (res: { json: <T>() => T }) => res.json<{ data: Overview }>().data;

async function subscribe(
  tenantId: string,
  productId: string,
  planId: string,
  status: schema.SubscriptionStatus,
  trialEndsAt: number | null = null,
) {
  await db.insert(schema.subscriptions).values({
    id: uuidv7(),
    tenantId,
    productId,
    planId,
    status,
    trialEndsAt: trialEndsAt === null ? null : new Date(trialEndsAt),
  });
}

const STAFF = 'admin@axor.test';

beforeAll(async () => {
  expect(new URL(env.DATABASE_URL).pathname).toBe('/axor_test');
  await runMigrations(env.DATABASE_URL);
  passwordHash = await hashPassword(PASSWORD);
});

beforeEach(async () => {
  await authService?.drain();
  await truncateDomainTables(db);
  tokenCache.clear();
  for (const key of Object.keys(ids) as Array<keyof typeof ids>) ids[key] = uuidv7();
  await db.insert(schema.tenants).values([
    { id: ids.alpha, name: 'alpha-secret-name' },
    { id: ids.beta, name: 'beta' },
    { id: ids.gamma, name: 'gamma', status: 'closed', closedAt: new Date(NOW) },
    { id: ids.delta, name: 'delta', status: 'suspended' },
  ]);
  await db.insert(schema.users).values([
    { id: uuidv7(), email: 'boss@alpha.test', passwordHash, tenantId: ids.alpha, tenantRole: 'owner' },
    { id: uuidv7(), email: 'owner@axor.test', passwordHash, platformRole: 'owner' },
    { id: uuidv7(), email: STAFF, passwordHash, platformRole: 'admin' },
    { id: uuidv7(), email: 'support@axor.test', passwordHash, platformRole: 'support' },
  ]);
  await db.insert(schema.products).values([
    { id: ids.stark, code: 'stark', name: 'STARK' },
    { id: ids.caprina, code: 'caprina', name: 'CAPRINA' },
  ]);
  await db.insert(schema.plans).values([
    { id: ids.plan, productId: ids.stark, code: 'basic' },
    { id: ids.plan2, productId: ids.caprina, code: 'basic' },
  ]);
  // 7 subscriptions: 3 trialing (one ends in 3 days, one in 20, one ended yesterday but the stored
  // status has not caught up), 1 active, 1 past_due, 1 canceled, 1 expired.
  await subscribe(ids.alpha, ids.stark, ids.plan, 'trialing', NOW + 3 * DAY);
  await subscribe(ids.beta, ids.stark, ids.plan, 'trialing', NOW + 20 * DAY);
  await subscribe(ids.gamma, ids.stark, ids.plan, 'trialing', NOW - 1 * DAY);
  await subscribe(ids.alpha, ids.caprina, ids.plan2, 'active');
  await subscribe(ids.delta, ids.caprina, ids.plan2, 'past_due');
  await subscribe(ids.delta, ids.stark, ids.plan, 'canceled');
  await subscribe(ids.beta, ids.caprina, ids.plan2, 'expired');
  app = newApp();
});

afterAll(async () => {
  await authService?.drain();
  await database.close();
});

describe('who may read /admin/overview', () => {
  it('rejects a caller with no credentials', async () => {
    expect((await get('/admin/overview', null)).statusCode).toBe(401);
  });

  it('rejects company users, whatever their role', async () => {
    const res = await get('/admin/overview', 'boss@alpha.test');
    expect(res.statusCode).toBe(403);
    expect(res.body).not.toMatch(/platform:|permission/i);
  });

  it.each(['owner@axor.test', STAFF, 'support@axor.test'])('lets platform staff %s read it', async (email) => {
    expect((await get('/admin/overview', email)).statusCode).toBe(200);
  });

  it('checks access before looking at the input', async () => {
    expect((await get('/admin/overview?junk=1', 'boss@alpha.test')).statusCode).toBe(403);
    expect((await get('/admin/overview?junk=1', null)).statusCode).toBe(401);
  });
});

describe('what the overview says', () => {
  it('counts companies and subscriptions per status', async () => {
    const data = overviewOf(await get('/admin/overview', STAFF));
    expect(data.tenants).toEqual({ active: 2, suspended: 1, closed: 1, total: 4 });
    expect(data.subscriptions).toEqual({
      trialing: 3,
      active: 1,
      past_due: 1,
      canceled: 1,
      expired: 1,
      total: 7,
    });
  });

  it('counts only trials that end in the future, within the window', async () => {
    const data = overviewOf(await get('/admin/overview', STAFF));
    // alpha (3 days) only: beta ends in 20 days, gamma already ended.
    expect(data.trialsEndingSoon).toBe(1);
    expect(data.trialsEndingSoonDays).toBe(TRIALS_ENDING_SOON_DAYS);
  });

  it('has exactly these keys and no company name, id or email', async () => {
    const res = await get('/admin/overview', STAFF);
    expect(Object.keys(overviewOf(res)).sort()).toEqual(
      ['subscriptions', 'tenants', 'trialsEndingSoon', 'trialsEndingSoonDays'].sort(),
    );
    expect(res.body).not.toMatch(/alpha-secret-name|@alpha\.test/);
    expect(res.body).not.toContain(ids.alpha);
  });

  it('is never cached', async () => {
    expect((await get('/admin/overview', STAFF)).headers['cache-control']).toBe('no-store');
  });

  it('follows a change on the very next call', async () => {
    await db.update(schema.tenants).set({ status: 'suspended' }).where(eq(schema.tenants.id, ids.beta));
    const data = overviewOf(await get('/admin/overview', STAFF));
    expect(data.tenants).toMatchObject({ active: 1, suspended: 2, closed: 1, total: 4 });
  });

  it('rejects an unknown query parameter', async () => {
    expect((await get('/admin/overview?status=active', STAFF)).statusCode).toBe(400);
  });
});

describe('the ending-soon window', () => {
  const overviewAt = (at: number) => createOverviewAdminRepository(db, { now: () => new Date(at) });

  it('excludes a trial that ends exactly now and includes one that ends exactly at the edge', async () => {
    await truncateDomainTables(db);
    await db.insert(schema.tenants).values([
      { id: ids.alpha, name: 'a' },
      { id: ids.beta, name: 'b' },
      { id: ids.gamma, name: 'c' },
      { id: ids.delta, name: 'd' },
    ]);
    await db.insert(schema.products).values({ id: ids.stark, code: 'stark', name: 'STARK' });
    await db.insert(schema.plans).values({ id: ids.plan, productId: ids.stark, code: 'basic' });
    const edge = NOW + TRIALS_ENDING_SOON_DAYS * DAY;
    await subscribe(ids.alpha, ids.stark, ids.plan, 'trialing', NOW); // ends right now: over
    await subscribe(ids.beta, ids.stark, ids.plan, 'trialing', edge); // ends at the edge: counts
    await subscribe(ids.gamma, ids.stark, ids.plan, 'trialing', edge + 1); // one ms later: no
    await subscribe(ids.delta, ids.stark, ids.plan, 'trialing', null); // no end date: no
    expect((await overviewAt(NOW).summary()).trialsEndingSoon).toBe(1);
  });

  it('ignores an end date on a subscription that is not trialing', async () => {
    await db.update(schema.subscriptions).set({ trialEndsAt: new Date(NOW + DAY) }).where(
      eq(schema.subscriptions.status, 'active'),
    );
    expect((await overviewAt(NOW).summary()).trialsEndingSoon).toBe(1);
  });

  it('moves with the clock', async () => {
    // Four days later alpha's trial (3 days from NOW) is over and beta's (20 days) is 16 days away.
    expect((await overviewAt(NOW + 4 * DAY).summary()).trialsEndingSoon).toBe(0);
    // Fourteen days later beta's trial (20 days from NOW) is 6 days away.
    expect((await overviewAt(NOW + 14 * DAY).summary()).trialsEndingSoon).toBe(1);
  });
});

describe('an empty platform', () => {
  it('still answers with every status present and zero', async () => {
    await truncateDomainTables(db);
    expect(await createOverviewAdminRepository(db, { now: clock }).summary()).toEqual({
      tenants: { active: 0, suspended: 0, closed: 0, total: 0 },
      subscriptions: { trialing: 0, active: 0, past_due: 0, canceled: 0, expired: 0, total: 0 },
      trialsEndingSoon: 0,
      trialsEndingSoonDays: TRIALS_ENDING_SOON_DAYS,
    });
  });
});
