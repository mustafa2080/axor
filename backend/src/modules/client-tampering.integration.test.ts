import { randomUUID } from 'node:crypto';
import { SignJWT } from 'jose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { uuidv7 } from '../common/id.js';
import { loadEnv } from '../config/env.js';
import { createDatabase } from '../database/client.js';
import { runMigrations } from '../database/migrate.js';
import { createCatalogAdminRepository } from '../database/repositories/catalog-admin.repository.js';
import { createCatalogRepository } from '../database/repositories/catalog.repository.js';
import { createSubscriptionsRepository } from '../database/repositories/subscriptions.repository.js';
import * as schema from '../database/schema/index.js';
import { truncateDomainTables } from '../test/db-helpers.js';
import { createAccessTokenService } from './auth/access-token.js';
import { createAuthService } from './auth/auth.service.js';
import { hashPassword } from './auth/password.js';

// Client tampering (TASKS.md, phase D): everything a browser sends is hostile. Prices, trial
// length, plan, company and role are decided by the server; whatever a client adds, forges or
// replays must change NOTHING. Every rejected request is checked against a full database snapshot.
const env = loadEnv(process.env);
const database = createDatabase(env.DATABASE_URL);
const { db } = database;

const PASSWORD = 'correct horse battery staple 42';
const DAY = 86_400_000;
const START = Date.parse('2026-10-19T12:00:00.000Z');
const iso = (ms: number) => new Date(ms).toISOString();
const ORIGIN = new URL(env.WEB_ORIGIN).origin;
const JSON_HEADERS = { 'content-type': 'application/json' };

let app: ReturnType<typeof buildApp>;
let authService: ReturnType<typeof createAuthService> | undefined;
let passwordHash: string;
const tokenCache = new Map<string, string>();

const ids = { tenantA: '', tenantB: '', stark: '', orders: '', basic: '', pro: '', basicV1: '' };
const TRIAL = { productCode: 'stark', planCode: 'basic' };

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
    catalog: createCatalogRepository(db),
    catalogAdmin: createCatalogAdminRepository(db),
    subscriptions: createSubscriptionsRepository(db, { now: () => new Date(START) }),
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

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
interface CallOptions {
  as?: string | null;
  payload?: unknown;
  headers?: Record<string, string>;
}

/** Sends a request the way a (possibly hostile) client would; `as: null` means no credentials. */
async function call(method: Method, url: string, options: CallOptions = {}) {
  const { as = 'boss@alpha.test', payload, headers = {} } = options;
  const token = as === null ? null : await login(as);
  return app.inject({
    method,
    url: `/api/v1${url}`,
    headers: { ...(token !== null && { authorization: `Bearer ${token}` }), ...headers },
    ...(payload !== undefined && { payload: payload as object }),
  });
}

const startTrial = (options: CallOptions = {}) =>
  call('POST', '/subscriptions/trial', { payload: TRIAL, ...options });

async function userId(email: string): Promise<string> {
  const rows = await db.select({ id: schema.users.id, email: schema.users.email }).from(schema.users);
  const row = rows.find((entry) => entry.email === email);
  if (row === undefined) throw new Error(`no seeded user ${email}`);
  return row.id;
}

/** Every table a client could possibly influence, in one comparable string. */
async function snapshot(): Promise<string> {
  const audit = (await db.select().from(schema.auditLogs)).filter((row) => !row.action.startsWith('auth.'));
  return JSON.stringify({
    tenants: await db.select().from(schema.tenants),
    users: await db
      .select({
        id: schema.users.id,
        tenantId: schema.users.tenantId,
        tenantRole: schema.users.tenantRole,
        platformRole: schema.users.platformRole,
        status: schema.users.status,
      })
      .from(schema.users),
    products: await db.select().from(schema.products),
    activities: await db.select().from(schema.businessActivities),
    plans: await db.select().from(schema.plans),
    versions: await db.select().from(schema.planVersions),
    subscriptions: await db.select().from(schema.subscriptions),
    events: await db.select().from(schema.subscriptionEvents),
    claims: await db.select().from(schema.trialClaims),
    audit,
  });
}

async function addPlan(productId: string, code: string, trialDays: number, priceMinor: number) {
  const planId = uuidv7();
  const versionId = uuidv7();
  await db.insert(schema.plans).values({ id: planId, productId, code, status: 'active', currentVersionId: versionId });
  await db.insert(schema.planVersions).values({
    id: versionId,
    planId,
    version: 1,
    priceMinor,
    currency: 'EGP',
    billingPeriod: 'monthly',
    trialDays,
    limits: { users: 5 },
    features: { tracking: true },
  });
  return { planId, versionId };
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
  ids.stark = uuidv7();
  ids.orders = uuidv7();
  await db.insert(schema.tenants).values([
    { id: ids.tenantA, name: 'alpha' },
    { id: ids.tenantB, name: 'beta' },
  ]);
  await db.insert(schema.users).values([
    { id: uuidv7(), email: 'boss@alpha.test', passwordHash, tenantId: ids.tenantA, tenantRole: 'owner' },
    { id: uuidv7(), email: 'member@alpha.test', passwordHash, tenantId: ids.tenantA, tenantRole: 'member' },
    { id: uuidv7(), email: 'boss@beta.test', passwordHash, tenantId: ids.tenantB, tenantRole: 'owner' },
    { id: uuidv7(), email: 'owner@axor.test', passwordHash, platformRole: 'owner' },
    { id: uuidv7(), email: 'support@axor.test', passwordHash, platformRole: 'support' },
  ]);
  await db.insert(schema.products).values([
    { id: ids.stark, code: 'stark', name: 'Stark', status: 'available' },
    { id: ids.orders, code: 'orders', name: 'Orders', status: 'available' },
  ]);
  const basic = await addPlan(ids.stark, 'basic', 14, 49_900);
  ids.basic = basic.planId;
  ids.basicV1 = basic.versionId;
  ids.pro = (await addPlan(ids.orders, 'pro', 7, 99_900)).planId;
  await addPlan(ids.stark, 'nofree', 0, 19_900);
  app = newApp();
});

afterAll(async () => {
  await authService?.drain();
  await database.close();
});

describe('the server decides plan, trial length and company', () => {
  it('ignores forged headers, a client clock and extra query parameters', async () => {
    const url = `/subscriptions/trial?tenantId=${ids.tenantB}&trialDays=9999&status=active&priceMinor=0`;
    const res = await call('POST', url, {
      payload: TRIAL,
      headers: {
        date: iso(START + 400 * DAY),
        'x-tenant-id': ids.tenantB,
        'x-forwarded-for': '203.0.113.9',
        'x-http-method-override': 'DELETE',
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json<{ data: Record<string, unknown> }>().data).toMatchObject({
      status: 'trialing',
      trialEndsAt: iso(START + 14 * DAY),
    });
    const rows = await db.select().from(schema.subscriptions);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ tenantId: ids.tenantA, planId: ids.basic });
    expect((await db.select().from(schema.trialClaims)).map((claim) => claim.tenantId)).toEqual([ids.tenantA]);
    const versions = await db.select().from(schema.planVersions);
    expect(versions.find((version) => version.id === ids.basicV1)).toMatchObject({ priceMinor: 49_900, trialDays: 14 });
  });

  it('accepts a plan only under its own product and only in its exact spelling', async () => {
    const before = await snapshot();
    const bodies = [
      { productCode: 'orders', planCode: 'basic' },
      { productCode: 'stark', planCode: 'pro' },
      { productCode: 'STARK', planCode: 'basic' },
      { productCode: ' stark', planCode: 'basic' },
      { productCode: 'stark\n', planCode: 'basic' },
      { productCode: 'stark', planCode: 'basic\u0000' },
      { productCode: '\uff53\uff54\uff41\uff52\uff4b', planCode: 'basic' },
      { productCode: 'stark', planCode: 'b'.repeat(51) },
    ];
    const statuses: number[] = [];
    for (const payload of bodies) statuses.push((await startTrial({ payload })).statusCode);
    expect(statuses).toEqual([404, 404, 400, 400, 400, 400, 400, 400]);
    expect(await snapshot()).toBe(before);
  });

  it('rejects every field the client must not decide, and operator-style values', async () => {
    const before = await snapshot();
    const extras: Array<Record<string, unknown>> = [
      { pinnedPlanVersionId: ids.basicV1 },
      { planVersionId: ids.basicV1 },
      { planId: ids.pro },
      { priceMinor: 0 },
      { currency: 'USD' },
      { limits: { users: 999_999 } },
      { features: { everything: true } },
      { currentPeriodEnd: iso(START + 999 * DAY) },
      { canceledAt: null },
      { id: uuidv7() },
      { tenant_id: ids.tenantB },
      { userId: ids.tenantB },
      { role: 'owner' },
      { entitled: true },
    ];
    for (const extra of extras) {
      expect((await startTrial({ payload: { ...TRIAL, ...extra } })).statusCode).toBe(400);
    }
    const weird: unknown[] = [
      { productCode: { $ne: '' }, planCode: 'basic' },
      { productCode: ['stark'], planCode: 'basic' },
      { productCode: 1, planCode: 'basic' },
      { productCode: null, planCode: 'basic' },
      { productCode: 'stark', planCode: true },
    ];
    for (const payload of weird) expect((await startTrial({ payload })).statusCode).toBe(400);
    expect(await snapshot()).toBe(before);
  });

  it('survives malformed bodies, wrong content types and prototype pollution attempts', async () => {
    const before = await snapshot();
    const raw = (payload: string, contentType = 'application/json') =>
      call('POST', '/subscriptions/trial', { payload, headers: { 'content-type': contentType } });
    const attempts: Array<[string, string?]> = [
      ['{'],
      ['null'],
      ['[]'],
      ['"stark"'],
      ['123'],
      [JSON.stringify([TRIAL])],
      ['productCode=stark&planCode=basic', 'text/plain'],
      ['productCode=stark&planCode=basic', 'application/x-www-form-urlencoded'],
      ['{"productCode":"stark","planCode":"basic","__proto__":{"status":"active"}}'],
      ['{"productCode":"stark","planCode":"basic","constructor":{"prototype":{"status":"active"}}}'],
    ];
    for (const [payload, contentType] of attempts) {
      const status = (await raw(payload, contentType)).statusCode;
      expect(status, payload).toBeGreaterThanOrEqual(400);
      expect(status, payload).toBeLessThan(500);
    }
    expect(({} as Record<string, unknown>)['status']).toBeUndefined();
    expect(await snapshot()).toBe(before);
  });

  it('refuses a body above the size limit without creating anything', async () => {
    const before = await snapshot();
    const res = await call('POST', '/subscriptions/trial', {
      payload: JSON.stringify({ ...TRIAL, junk: 'x'.repeat(1_200_000) }),
      headers: JSON_HEADERS,
    });
    expect(res.statusCode).toBe(413);
    expect(await snapshot()).toBe(before);
  });
});

describe('registering', () => {
  it('rejects any plan, price, trial, role or company field and creates nothing', async () => {
    const before = await snapshot();
    const base = { companyName: 'Mallory Ltd', email: 'mallory@example.test', password: PASSWORD };
    const extras: Array<Record<string, unknown>> = [
      { productCode: 'stark', planCode: 'basic' },
      { trialDays: 9999 },
      { priceMinor: 0 },
      { status: 'active' },
      { role: 'owner' },
      { tenantRole: 'owner' },
      { platformRole: 'owner' },
      { tenantId: ids.tenantA },
      { isEntitled: true },
      { subscription: { status: 'active', currentPeriodEnd: iso(START + 999 * DAY) } },
    ];
    for (const extra of extras) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        headers: { origin: ORIGIN },
        payload: { ...base, ...extra },
      });
      expect(res.statusCode, JSON.stringify(extra)).toBe(400);
    }
    expect(await snapshot()).toBe(before);
  });
});

describe('permissions cannot be borrowed', () => {
  const version = (priceMinor: number) => ({
    priceMinor,
    currency: 'EGP',
    billingPeriod: 'monthly',
    trialDays: 365,
    limits: { users: 999_999 },
    features: { tracking: true },
  });

  async function startedSubscriptionId(): Promise<string> {
    expect((await startTrial()).statusCode).toBe(201);
    return (await db.select().from(schema.subscriptions))[0]?.id ?? '';
  }

  it('keeps every admin route closed to company users, anonymous callers and support, and changes nothing', async () => {
    const sub = await startedSubscriptionId();
    const before = await snapshot();
    const routes: Array<[Method, string, unknown]> = [
      ['GET', '/admin/catalog', undefined],
      ['POST', '/admin/catalog/products', { code: 'hacked', name: 'Hacked', status: 'available' }],
      ['PATCH', `/admin/catalog/products/${ids.stark}`, { status: 'disabled' }],
      ['POST', `/admin/catalog/products/${ids.stark}/activities`, { code: 'retail', name: 'Retail' }],
      ['PATCH', `/admin/catalog/activities/${uuidv7()}`, { status: 'disabled' }],
      ['POST', `/admin/catalog/products/${ids.stark}/plans`, { code: 'free', version: version(0) }],
      ['POST', `/admin/catalog/plans/${ids.basic}/versions`, version(1)],
      ['PATCH', `/admin/catalog/plans/${ids.basic}`, { status: 'archived' }],
      ['POST', `/admin/subscriptions/${sub}/activate`, { currentPeriodEnd: iso(START + 730 * DAY) }],
      ['POST', `/admin/subscriptions/${sub}/cancel`, undefined],
      ['POST', `/admin/subscriptions/${sub}/extend-trial`, { days: 90 }],
    ];
    for (const as of ['boss@alpha.test', 'member@alpha.test', 'support@axor.test', null]) {
      for (const [method, url, payload] of routes) {
        const res = await call(method, url, { as, payload });
        expect(res.statusCode, `${as ?? 'anonymous'} ${method} ${url}`).toBe(as === null ? 401 : 403);
      }
    }
    expect(await snapshot()).toBe(before);
  });

  it('offers no way to edit a plan version or delete anything, even to the platform owner', async () => {
    const sub = await startedSubscriptionId();
    const before = await snapshot();
    const attempts: Array<[Method, string]> = [
      ['PATCH', `/admin/catalog/plan-versions/${ids.basicV1}`],
      ['PUT', `/admin/catalog/plans/${ids.basic}/versions/${ids.basicV1}`],
      ['PATCH', `/admin/catalog/plans/${ids.basic}/versions/${ids.basicV1}`],
      ['DELETE', `/admin/catalog/plans/${ids.basic}`],
      ['DELETE', `/admin/catalog/products/${ids.stark}`],
      ['DELETE', `/admin/subscriptions/${sub}`],
      ['PUT', '/subscriptions/trial'],
      ['GET', '/subscriptions/trial'],
      ['PATCH', '/subscriptions'],
      ['DELETE', '/subscriptions'],
      ['DELETE', '/subscriptions/stark/cancel'],
    ];
    for (const [method, url] of attempts) {
      const res = await call(method, url, { as: 'owner@axor.test', payload: { priceMinor: 0 } });
      expect(res.statusCode, `${method} ${url}`).toBe(404);
    }
    expect(await snapshot()).toBe(before);
  });
});

describe('identity cannot be forged', () => {
  const sign = (sub: string, claims: Record<string, unknown> = {}, secret = env.JWT_ACCESS_SECRET) =>
    new SignJWT(claims)
      .setProtectedHeader({ alg: 'HS256', typ: 'at+jwt' })
      .setSubject(sub)
      .setJti(randomUUID())
      .setIssuer('axor-api')
      .setAudience('axor-web')
      .setIssuedAt()
      .setExpirationTime('10m')
      .sign(new TextEncoder().encode(secret));
  const b64 = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const withHeader = (authorization: string, method: Method, url: string) =>
    app.inject({ method, url: `/api/v1${url}`, headers: { authorization } });

  it('rejects tokens with a wrong signature, no signature, a swapped subject or an unknown user', async () => {
    const memberId = await userId('member@alpha.test');
    const bossId = await userId('boss@alpha.test');
    const now = Math.floor(Date.now() / 1000);
    const [header, payload, signature] = (await sign(memberId)).split('.');
    const swapped = {
      ...(JSON.parse(Buffer.from(payload ?? '', 'base64url').toString()) as object),
      sub: bossId,
    };
    const tokens: Record<string, string> = {
      'another secret': await sign(memberId, {}, 'another-secret-another-secret-another-secret-0000'),
      'alg none': `${b64({ alg: 'none', typ: 'at+jwt' })}.${b64({ sub: bossId, jti: randomUUID(), iss: 'axor-api', aud: 'axor-web', iat: now, exp: now + 600 })}.`,
      'swapped subject': `${header}.${b64(swapped)}.${signature}`,
      'unknown user': await sign(uuidv7()),
    };
    const before = await snapshot();
    for (const [label, token] of Object.entries(tokens)) {
      for (const [method, url] of [
        ['GET', '/auth/me'],
        ['POST', '/subscriptions/trial'],
        ['GET', '/admin/catalog'],
      ] as const) {
        expect((await withHeader(`Bearer ${token}`, method, url)).statusCode, `${label} ${url}`).toBe(401);
      }
    }
    expect(await snapshot()).toBe(before);
  });

  it('ignores role, company and permission claims inside a correctly signed token', async () => {
    const memberId = await userId('member@alpha.test');
    const token = await sign(memberId, {
      role: 'owner',
      tenantRole: 'owner',
      platformRole: 'owner',
      tenantId: ids.tenantB,
      permissions: ['platform:plans:manage', 'subscription:manage'],
    });
    const before = await snapshot();
    const me = await withHeader(`Bearer ${token}`, 'GET', '/auth/me');
    expect(me.statusCode).toBe(200);
    expect(me.json<{ data: Record<string, unknown> }>().data).toMatchObject({
      kind: 'tenant',
      role: 'member',
      tenantId: ids.tenantA,
    });
    expect((await withHeader(`Bearer ${token}`, 'GET', '/admin/catalog')).statusCode).toBe(403);
    const trial = await app.inject({
      method: 'POST',
      url: '/api/v1/subscriptions/trial',
      headers: { authorization: `Bearer ${token}` },
      payload: TRIAL,
    });
    expect(trial.statusCode).toBe(403);
    expect(await snapshot()).toBe(before);
  });

  it('accepts nothing but a well-formed Bearer header', async () => {
    const token = await login('boss@alpha.test');
    const headers = [
      `bearer ${token}`,
      `Bearer  ${token}`,
      `Bearer ${token} `,
      `Bearer ${token},${token}`,
      `Basic ${token}`,
      `Token ${token}`,
      token,
    ];
    for (const header of headers) {
      expect((await withHeader(header, 'GET', '/subscriptions')).statusCode, header.slice(0, 12)).toBe(401);
    }
  });

  it('does not treat the refresh cookie as a credential, even from a foreign origin', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { origin: ORIGIN },
      payload: { email: 'boss@alpha.test', password: PASSWORD },
    });
    const setCookie = res.headers['set-cookie'];
    const cookie = (Array.isArray(setCookie) ? setCookie[0] : setCookie)?.split(';')[0] ?? '';
    expect(cookie).toMatch(/^axor_rt=/);
    const before = await snapshot();
    for (const [method, url] of [
      ['POST', '/subscriptions/trial'],
      ['GET', '/subscriptions'],
      ['POST', '/subscriptions/stark/cancel'],
    ] as const) {
      const forged = await app.inject({
        method,
        url: `/api/v1${url}`,
        headers: { cookie, origin: 'https://evil.example' },
        ...(method === 'POST' && url.endsWith('trial') && { payload: TRIAL }),
      });
      expect(forged.statusCode, url).toBe(401);
      expect(forged.headers['access-control-allow-origin']).toBeUndefined();
    }
    expect(await snapshot()).toBe(before);
  });
});

describe('the company always comes from the signed-in user', () => {
  it('shows and cancels only the caller’s own subscriptions, whatever ids the client names', async () => {
    expect((await startTrial()).statusCode).toBe(201);
    const beta = await startTrial({ as: 'boss@beta.test', payload: { productCode: 'orders', planCode: 'pro' } });
    expect(beta.statusCode).toBe(201);
    const before = await snapshot();
    const spoof = { 'x-tenant-id': ids.tenantB };

    const list = await call('GET', `/subscriptions?tenantId=${ids.tenantB}`, { headers: spoof });
    expect(list.json<{ data: Array<{ productCode: string }> }>().data.map((entry) => entry.productCode)).toEqual([
      'stark',
    ]);
    const cancel = await call('POST', `/subscriptions/orders/cancel?tenantId=${ids.tenantB}`, { headers: spoof });
    expect(cancel.statusCode).toBe(404);
    expect(await snapshot()).toBe(before);

    const betaList = await call('GET', '/subscriptions', { as: 'boss@beta.test' });
    expect(betaList.json<{ data: Array<{ productCode: string; status: string }> }>().data).toMatchObject([
      { productCode: 'orders', status: 'trialing' },
    ]);
  });

  it('refuses tampered product codes in the path and cancels nothing', async () => {
    expect((await startTrial()).statusCode).toBe(201);
    const before = await snapshot();
    const paths = [
      '/subscriptions/STARK/cancel',
      '/subscriptions/stark%00/cancel',
      '/subscriptions/stark%20/cancel',
      '/subscriptions/stark%2Forders/cancel',
      '/subscriptions/%2e%2e/cancel',
      `/subscriptions/${'a'.repeat(51)}/cancel`,
    ];
    for (const path of paths) {
      const status = (await call('POST', path)).statusCode;
      expect([400, 404], path).toContain(status);
    }
    expect(await snapshot()).toBe(before);
    expect((await db.select().from(schema.subscriptions))[0]?.status).toBe('trialing');
  });
});
