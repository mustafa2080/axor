import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../app.js';
import { uuidv7 } from '../../common/id.js';
import { loadEnv } from '../../config/env.js';
import { createDatabase } from '../../database/client.js';
import { runMigrations } from '../../database/migrate.js';
import { createSubscriptionsRepository } from '../../database/repositories/subscriptions.repository.js';
import * as schema from '../../database/schema/index.js';
import { truncateDomainTables } from '../../test/db-helpers.js';
import { createAccessTokenService } from '../auth/access-token.js';
import { createAuthService } from '../auth/auth.service.js';
import { hashPassword } from '../auth/password.js';

// Trials and subscriptions on a real MariaDB (axor_test): who may start/cancel, one trial per
// company/email/product, expiry with a controlled clock, entitlements, staff actions and audit.
const env = loadEnv(process.env);
const database = createDatabase(env.DATABASE_URL);
const { db } = database;

const PASSWORD = 'correct horse battery staple 42';
const DAY = 86_400_000;
const START = Date.parse('2026-10-19T12:00:00.000Z');
const iso = (ms: number) => new Date(ms).toISOString();

let app: ReturnType<typeof buildApp>;
let authService: ReturnType<typeof createAuthService> | undefined;
let passwordHash: string;
let nowMs = START;

const ids = {
  tenantA: '',
  tenantB: '',
  product: '',
  plan: '',
  v1: '',
  ownerA: '',
  platformAdmin: '',
};
const tokenCache = new Map<string, string>();

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
    subscriptions: createSubscriptionsRepository(db, { now: () => new Date(nowMs) }),
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

async function call(
  method: 'GET' | 'POST',
  url: string,
  payload?: unknown,
  as: string | null = 'boss@alpha.test',
) {
  const token = as === null ? null : await login(as);
  return app.inject({
    method,
    url: `/api/v1${url}`,
    headers: token === null ? {} : { authorization: `Bearer ${token}` },
    ...(payload !== undefined && { payload: payload as object }),
  });
}

type View = {
  productCode: string;
  planCode: string;
  status: string;
  entitled: boolean;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  canceledAt: string | null;
  version: {
    version: number;
    pinned: boolean;
    limits: Record<string, number | null>;
  } | null;
};
type AdminView = View & { id: string; tenantName: string; tenantId: string };

const TRIAL = { productCode: 'stark', planCode: 'basic' };
const startTrial = (as = 'boss@alpha.test', body: unknown = TRIAL) =>
  call('POST', '/subscriptions/trial', body, as);
const mine = async (as = 'boss@alpha.test') =>
  (await call('GET', '/subscriptions', undefined, as)).json<{ data: View[] }>().data;
const allSubscriptions = () => db.select().from(schema.subscriptions);
// Logging in (cached per test file) also writes auth.* rows; only the subscription ones matter here.
const subscriptionAudit = async () =>
  (await db.select().from(schema.auditLogs)).filter((row) => row.action.startsWith('subscription.'));

async function addPlan(
  productId: string,
  code: string,
  trialDays: number,
  status: 'active' | 'archived' = 'active',
) {
  const planId = uuidv7();
  const versionId = uuidv7();
  await db.insert(schema.plans).values({ id: planId, productId, code, status, currentVersionId: versionId });
  await db.insert(schema.planVersions).values({
    id: versionId,
    planId,
    version: 1,
    priceMinor: 49900,
    currency: 'EGP',
    billingPeriod: 'monthly',
    trialDays,
    limits: { users: 5, shipments_per_month: null },
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
  nowMs = START;

  ids.tenantA = uuidv7();
  ids.tenantB = uuidv7();
  ids.product = uuidv7();
  ids.ownerA = uuidv7();
  ids.platformAdmin = uuidv7();
  await db.insert(schema.tenants).values([
    { id: ids.tenantA, name: 'alpha' },
    { id: ids.tenantB, name: 'beta' },
  ]);
  await db.insert(schema.users).values([
    { id: ids.ownerA, email: 'boss@alpha.test', passwordHash, tenantId: ids.tenantA, tenantRole: 'owner' },
    { id: uuidv7(), email: 'admin@alpha.test', passwordHash, tenantId: ids.tenantA, tenantRole: 'admin' },
    { id: uuidv7(), email: 'member@alpha.test', passwordHash, tenantId: ids.tenantA, tenantRole: 'member' },
    { id: uuidv7(), email: 'viewer@alpha.test', passwordHash, tenantId: ids.tenantA, tenantRole: 'read_only' },
    { id: uuidv7(), email: 'boss@beta.test', passwordHash, tenantId: ids.tenantB, tenantRole: 'owner' },
    { id: uuidv7(), email: 'owner@axor.test', passwordHash, platformRole: 'owner' },
    { id: ids.platformAdmin, email: 'admin@axor.test', passwordHash, platformRole: 'admin' },
    { id: uuidv7(), email: 'support@axor.test', passwordHash, platformRole: 'support' },
  ]);
  await db.insert(schema.products).values({
    id: ids.product,
    code: 'stark',
    name: 'Stark',
    status: 'available',
  });
  const basic = await addPlan(ids.product, 'basic', 14);
  ids.plan = basic.planId;
  ids.v1 = basic.versionId;
  app = newApp();
});

afterAll(async () => {
  await authService?.drain();
  await database.close();
});

describe('starting a trial', () => {
  it('starts a trial of the length stored in the plan and records the claim, the event and the audit', async () => {
    const res = await startTrial();
    expect(res.statusCode).toBe(201);
    const view = res.json<{ data: View }>().data;
    expect(view).toMatchObject({
      productCode: 'stark',
      planCode: 'basic',
      status: 'trialing',
      entitled: true,
      trialEndsAt: iso(START + 14 * DAY),
      currentPeriodEnd: iso(START + 14 * DAY),
      canceledAt: null,
    });
    expect(view.version).toMatchObject({ version: 1, pinned: false, limits: { users: 5 } });

    const rows = await allSubscriptions();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ tenantId: ids.tenantA, status: 'trialing' });

    const events = await db.select().from(schema.subscriptionEvents);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: 'subscription.trial_started',
      fromStatus: null,
      toStatus: 'trialing',
      actorUserId: ids.ownerA,
      tenantId: ids.tenantA,
    });

    const claims = await db.select().from(schema.trialClaims);
    expect(claims).toHaveLength(1);
    expect(claims[0]).toMatchObject({ emailKey: 'boss@alpha.test', tenantId: ids.tenantA });

    const audit = await subscriptionAudit();
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      action: 'subscription.trial_started',
      actorUserId: ids.ownerA,
      tenantId: ids.tenantA,
      targetType: 'subscription',
    });
    expect(JSON.stringify(audit[0]?.metadata)).not.toMatch(/pass|token|secret/i);
  });

  it('only the company owner may start one: admin, member, read-only, staff and anonymous are refused', async () => {
    for (const email of ['admin@alpha.test', 'member@alpha.test', 'viewer@alpha.test', 'owner@axor.test']) {
      expect((await startTrial(email)).statusCode).toBe(403);
    }
    expect((await call('POST', '/subscriptions/trial', TRIAL, null)).statusCode).toBe(401);
    expect(await allSubscriptions()).toHaveLength(0);
    expect(await db.select().from(schema.trialClaims)).toHaveLength(0);
  });

  it('lets every company role read, but not platform staff', async () => {
    await startTrial();
    for (const email of ['boss@alpha.test', 'admin@alpha.test', 'member@alpha.test', 'viewer@alpha.test']) {
      const res = await call('GET', '/subscriptions', undefined, email);
      expect(res.statusCode).toBe(200);
      expect(res.json<{ data: View[] }>().data).toHaveLength(1);
    }
    expect((await call('GET', '/subscriptions', undefined, 'owner@axor.test')).statusCode).toBe(403);
    expect((await call('GET', '/subscriptions', undefined, null)).statusCode).toBe(401);
  });

  it('refuses unknown, unavailable, archived and trial-less plans and creates nothing', async () => {
    const soon = uuidv7();
    await db.insert(schema.products).values({ id: soon, code: 'caprina', name: 'Caprina', status: 'coming_soon' });
    await addPlan(soon, 'basic', 14);
    await addPlan(ids.product, 'old', 14, 'archived');
    await addPlan(ids.product, 'nofree', 0);

    const cases: Array<[object, number]> = [
      [{ productCode: 'nope', planCode: 'basic' }, 404],
      [{ productCode: 'caprina', planCode: 'basic' }, 404],
      [{ productCode: 'stark', planCode: 'nope' }, 404],
      [{ productCode: 'stark', planCode: 'old' }, 404],
      [{ productCode: 'stark', planCode: 'nofree' }, 400],
    ];
    for (const [body, status] of cases) {
      expect((await startTrial('boss@alpha.test', body)).statusCode).toBe(status);
    }
    expect(await allSubscriptions()).toHaveLength(0);
    expect(await db.select().from(schema.trialClaims)).toHaveLength(0);
  });

  it('rejects anything the client must not decide: status, dates, tenant, trial length, bad codes', async () => {
    const bodies = [
      { ...TRIAL, status: 'active' },
      { ...TRIAL, tenantId: ids.tenantB },
      { ...TRIAL, trialDays: 9999 },
      { ...TRIAL, trialEndsAt: iso(START + 999 * DAY) },
      { productCode: 'Stark!', planCode: 'basic' },
      { productCode: 'stark' },
      {},
    ];
    for (const body of bodies) {
      expect((await startTrial('boss@alpha.test', body)).statusCode).toBe(400);
    }
    expect(await allSubscriptions()).toHaveLength(0);
  });

  it('allows one trial per company and product, and canceling does not give it back', async () => {
    expect((await startTrial()).statusCode).toBe(201);
    expect((await startTrial()).statusCode).toBe(409);
    expect((await call('POST', '/subscriptions/stark/cancel')).statusCode).toBe(200);
    expect((await startTrial()).statusCode).toBe(409);
    expect(await allSubscriptions()).toHaveLength(1);
  });

  it('lets the same company try a different product', async () => {
    const other = uuidv7();
    await db.insert(schema.products).values({ id: other, code: 'orders', name: 'Orders', status: 'available' });
    await addPlan(other, 'basic', 7);
    expect((await startTrial()).statusCode).toBe(201);
    expect((await startTrial('boss@alpha.test', { productCode: 'orders', planCode: 'basic' })).statusCode).toBe(201);
    expect(await allSubscriptions()).toHaveLength(2);
  });

  it('blocks a second company that reuses the same email (+tag) for the same product', async () => {
    const tenantC = uuidv7();
    await db.insert(schema.tenants).values({ id: tenantC, name: 'gamma' });
    await db.insert(schema.users).values({
      id: uuidv7(),
      email: 'boss+promo@alpha.test',
      passwordHash,
      tenantId: tenantC,
      tenantRole: 'owner',
    });
    expect((await startTrial()).statusCode).toBe(201);
    const res = await startTrial('boss+promo@alpha.test');
    expect(res.statusCode).toBe(409);
    expect((await allSubscriptions()).filter((row) => row.tenantId === tenantC)).toHaveLength(0);
    expect((await db.select().from(schema.trialClaims)).filter((row) => row.tenantId === tenantC)).toHaveLength(0);
  });

  it('answers the same 409 whichever rule refused, so it does not reveal which one', async () => {
    const tenantC = uuidv7();
    await db.insert(schema.tenants).values({ id: tenantC, name: 'gamma' });
    await db.insert(schema.users).values({
      id: uuidv7(),
      email: 'boss+promo@alpha.test',
      passwordHash,
      tenantId: tenantC,
      tenantRole: 'owner',
    });
    await startTrial();
    const sameCompany = await startTrial();
    const sameEmail = await startTrial('boss+promo@alpha.test');
    expect(sameCompany.json()).toEqual(sameEmail.json());
  });

  it('has exactly one winner when the same trial is started twice at once', async () => {
    const results = await Promise.all([startTrial(), startTrial()]);
    expect(results.map((res) => res.statusCode).sort()).toEqual([201, 409]);
    expect(await allSubscriptions()).toHaveLength(1);
    expect(await db.select().from(schema.subscriptionEvents)).toHaveLength(1);
    expect(await db.select().from(schema.trialClaims)).toHaveLength(1);
  });
});

describe('canceling', () => {
  it('ends access at once and records the event and the audit', async () => {
    await startTrial();
    nowMs += DAY;
    const res = await call('POST', '/subscriptions/stark/cancel');
    expect(res.statusCode).toBe(200);
    expect(res.json<{ data: View }>().data).toMatchObject({
      status: 'canceled',
      entitled: false,
      canceledAt: iso(START + DAY),
    });
    const events = await db.select().from(schema.subscriptionEvents);
    expect(events.map((event) => event.type).sort()).toEqual([
      'subscription.canceled',
      'subscription.trial_started',
    ]);
    const audit = await subscriptionAudit();
    expect(audit.map((row) => row.action).sort()).toEqual([
      'subscription.canceled',
      'subscription.trial_started',
    ]);
  });

  it('cannot cancel twice, an unknown product, or a product the company never subscribed to', async () => {
    await startTrial();
    expect((await call('POST', '/subscriptions/stark/cancel')).statusCode).toBe(200);
    expect((await call('POST', '/subscriptions/stark/cancel')).statusCode).toBe(409);
    expect((await call('POST', '/subscriptions/nope/cancel')).statusCode).toBe(404);
    const other = uuidv7();
    await db.insert(schema.products).values({ id: other, code: 'orders', name: 'Orders', status: 'available' });
    expect((await call('POST', '/subscriptions/orders/cancel')).statusCode).toBe(404);
  });

  it('needs the manage permission', async () => {
    await startTrial();
    for (const email of ['admin@alpha.test', 'member@alpha.test', 'viewer@alpha.test', 'owner@axor.test']) {
      expect((await call('POST', '/subscriptions/stark/cancel', undefined, email)).statusCode).toBe(403);
    }
    expect((await call('POST', '/subscriptions/stark/cancel', undefined, null)).statusCode).toBe(401);
    expect((await allSubscriptions())[0]?.status).toBe('trialing');
  });
});

describe('company isolation', () => {
  it('never shows or changes another company’s subscription', async () => {
    await startTrial();
    expect(await mine('boss@beta.test')).toEqual([]);
    expect((await call('POST', '/subscriptions/stark/cancel', undefined, 'boss@beta.test')).statusCode).toBe(404);
    const rows = await allSubscriptions();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ tenantId: ids.tenantA, status: 'trialing', canceledAt: null });
    expect(await mine()).toHaveLength(1);
  });
});

describe('expiry', () => {
  it('stops access exactly at the end date even before the job runs, then the job marks it expired', async () => {
    await startTrial();
    nowMs = START + 13 * DAY;
    expect((await mine())[0]).toMatchObject({ status: 'trialing', entitled: true });

    nowMs = START + 14 * DAY;
    expect((await mine())[0]).toMatchObject({ status: 'trialing', entitled: false });

    const repo = createSubscriptionsRepository(db, { now: () => new Date(nowMs) });
    expect(await repo.expireDue()).toBe(1);
    expect((await mine())[0]).toMatchObject({ status: 'expired', entitled: false });

    const events = await db
      .select()
      .from(schema.subscriptionEvents)
      .where(eq(schema.subscriptionEvents.type, 'subscription.expired'));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ fromStatus: 'trialing', toStatus: 'expired', actorUserId: null });

    // The automatic end also lands in the audit trail, once, with the system as the actor.
    const expiredAudit = await db
      .select()
      .from(schema.auditLogs)
      .where(eq(schema.auditLogs.action, 'subscription.expired'));
    expect(expiredAudit).toHaveLength(1);
    expect(expiredAudit[0]).toMatchObject({
      tenantId: ids.tenantA,
      actorUserId: null,
      targetType: 'subscription',
      targetId: events[0]?.subscriptionId,
      metadata: { productCode: 'stark', from: 'trialing', to: 'expired' },
    });

    expect(await repo.expireDue()).toBe(0);
    expect(await db.select().from(schema.subscriptionEvents)).toHaveLength(2);
  });

  it('expires active subscriptions that ran out, and leaves running, canceled and past_due ones alone', async () => {
    const mk = (tenantId: string, productId: string, status: schema.SubscriptionStatus, end: number) => ({
      id: uuidv7(),
      tenantId,
      productId,
      planId: ids.plan,
      status,
      currentPeriodEnd: new Date(end),
    });
    const tenantC = uuidv7();
    const tenantD = uuidv7();
    const tenantE = uuidv7();
    await db.insert(schema.tenants).values([
      { id: tenantC, name: 'c' },
      { id: tenantD, name: 'd' },
      { id: tenantE, name: 'e' },
    ]);
    const lapsed = mk(ids.tenantA, ids.product, 'active', START - DAY);
    const running = mk(ids.tenantB, ids.product, 'active', START + 30 * DAY);
    const canceled = mk(tenantC, ids.product, 'canceled', START - DAY);
    const pastDue = mk(tenantD, ids.product, 'past_due', START - DAY);
    const alreadyExpired = mk(tenantE, ids.product, 'expired', START - DAY);
    await db.insert(schema.subscriptions).values([lapsed, running, canceled, pastDue, alreadyExpired]);

    const repo = createSubscriptionsRepository(db, { now: () => new Date(START) });
    expect(await repo.expireDue()).toBe(1);
    const status = async (id: string) =>
      (await db.select().from(schema.subscriptions).where(eq(schema.subscriptions.id, id)))[0]?.status;
    expect(await status(lapsed.id)).toBe('expired');
    expect(await status(running.id)).toBe('active');
    expect(await status(canceled.id)).toBe('canceled');
    expect(await status(pastDue.id)).toBe('past_due');
    expect(await status(alreadyExpired.id)).toBe('expired');
  });

  it('never gives access to an active subscription that has no end date', async () => {
    await db.insert(schema.subscriptions).values({
      id: uuidv7(),
      tenantId: ids.tenantA,
      productId: ids.product,
      planId: ids.plan,
      status: 'active',
      currentPeriodEnd: null,
    });
    expect((await mine())[0]).toMatchObject({ status: 'active', entitled: false });
  });
});

describe('entitlements follow the plan version', () => {
  it('uses the current version, a pinned one when staff set it, and nothing for a foreign version', async () => {
    await startTrial();
    expect((await mine())[0]?.version).toMatchObject({ version: 1, pinned: false, limits: { users: 5 } });

    const v2 = uuidv7();
    await db.insert(schema.planVersions).values({
      id: v2,
      planId: ids.plan,
      version: 2,
      priceMinor: 79900,
      currency: 'EGP',
      billingPeriod: 'monthly',
      trialDays: 14,
      limits: { users: 50 },
      features: { tracking: true },
    });
    await db.update(schema.plans).set({ currentVersionId: v2 }).where(eq(schema.plans.id, ids.plan));
    expect((await mine())[0]?.version).toMatchObject({ version: 2, pinned: false, limits: { users: 50 } });

    await db.update(schema.subscriptions).set({ pinnedPlanVersionId: ids.v1 });
    expect((await mine())[0]?.version).toMatchObject({ version: 1, pinned: true, limits: { users: 5 } });

    const foreign = await addPlan(ids.product, 'other', 14);
    await db.update(schema.subscriptions).set({ pinnedPlanVersionId: foreign.versionId });
    expect((await mine())[0]?.version).toBeNull();
  });

  it('exposes no internal ids to the company', async () => {
    await startTrial();
    const body = (await call('GET', '/subscriptions')).body;
    expect(body).not.toContain(ids.tenantA);
    expect(body).not.toContain(ids.plan);
    expect(body).not.toContain(ids.product);
    expect(body).not.toContain(ids.v1);
  });
});

describe('staff: reading', () => {
  async function seedTwo() {
    await startTrial();
    nowMs += 1000;
    await db.insert(schema.subscriptions).values({
      id: uuidv7(),
      tenantId: ids.tenantB,
      productId: ids.product,
      planId: ids.plan,
      status: 'active',
      currentPeriodEnd: new Date(START + 30 * DAY),
    });
  }
  const list = (query = '', as: string | null = 'support@axor.test') =>
    call('GET', `/admin/subscriptions${query}`, undefined, as);

  it('is open to every platform role but never to company users or anonymous callers', async () => {
    await seedTwo();
    for (const email of ['owner@axor.test', 'admin@axor.test', 'support@axor.test']) {
      const res = await list('', email);
      expect(res.statusCode).toBe(200);
      expect(res.json<{ data: AdminView[] }>().data).toHaveLength(2);
    }
    expect((await list('', 'boss@alpha.test')).statusCode).toBe(403);
    expect((await list('', null)).statusCode).toBe(401);
  });

  it('shows the company name and filters by status with pagination', async () => {
    await seedTwo();
    const active = (await list('?status=active')).json<{ data: AdminView[] }>().data;
    expect(active).toHaveLength(1);
    expect(active[0]).toMatchObject({ tenantName: 'beta', status: 'active', entitled: true });

    const page = (await list('?limit=1&offset=1')).json<{ data: AdminView[]; meta: { limit: number; offset: number } }>();
    expect(page.data).toHaveLength(1);
    expect(page.meta).toEqual({ limit: 1, offset: 1 });
  });

  it('rejects an invalid status, an unknown parameter and a silly page size', async () => {
    for (const query of ['?status=nope', '?foo=1', '?limit=0', '?limit=101', '?offset=-1']) {
      expect((await list(query)).statusCode).toBe(400);
    }
  });
});

describe('staff: changing', () => {
  let subId: string;
  const act = (action: string, payload?: unknown, as: string | null = 'admin@axor.test', id = subId) =>
    call('POST', `/admin/subscriptions/${id}/${action}`, payload, as);
  const data = (res: { json: <T>() => T }) => res.json<{ data: AdminView }>().data;

  beforeEach(async () => {
    await startTrial();
    subId = (await allSubscriptions())[0]?.id ?? '';
  });

  it('is refused for support, company users and anonymous callers, and nothing changes', async () => {
    const end = iso(START + 30 * DAY);
    for (const as of ['support@axor.test', 'boss@alpha.test', null]) {
      const expected = as === null ? 401 : 403;
      expect((await act('activate', { currentPeriodEnd: end }, as)).statusCode).toBe(expected);
      expect((await act('cancel', undefined, as)).statusCode).toBe(expected);
      expect((await act('extend-trial', { days: 7 }, as)).statusCode).toBe(expected);
    }
    expect((await allSubscriptions())[0]?.status).toBe('trialing');
  });

  it('activates with an end date, renews, and records who did it', async () => {
    const end = iso(START + 30 * DAY);
    const res = await act('activate', { currentPeriodEnd: end });
    expect(res.statusCode).toBe(200);
    expect(data(res)).toMatchObject({ status: 'active', currentPeriodEnd: end, entitled: true });

    const renewed = await act('activate', { currentPeriodEnd: iso(START + 60 * DAY) });
    expect(data(renewed)).toMatchObject({ status: 'active', currentPeriodEnd: iso(START + 60 * DAY) });

    const events = await db.select().from(schema.subscriptionEvents);
    expect(events.map((event) => event.type).sort()).toEqual([
      'subscription.activated',
      'subscription.renewed',
      'subscription.trial_started',
    ]);
    const activated = events.find((event) => event.type === 'subscription.activated');
    expect(activated).toMatchObject({ fromStatus: 'trialing', toStatus: 'active', actorUserId: ids.platformAdmin });
    const audit = await db
      .select()
      .from(schema.auditLogs)
      .where(eq(schema.auditLogs.action, 'subscription.activated'));
    expect(audit).toHaveLength(2);
    expect(audit[0]).toMatchObject({ actorUserId: ids.platformAdmin, tenantId: ids.tenantA });
  });

  it('refuses a bad end date: past, too far, malformed or with extra fields', async () => {
    const bodies = [
      { currentPeriodEnd: iso(START - DAY) },
      { currentPeriodEnd: iso(START) },
      { currentPeriodEnd: iso(START + 6 * 365 * DAY) },
      { currentPeriodEnd: 'tomorrow' },
      {},
      { currentPeriodEnd: iso(START + DAY), status: 'active' },
    ];
    for (const body of bodies) {
      expect((await act('activate', body)).statusCode).toBe(400);
    }
    expect((await allSubscriptions())[0]?.status).toBe('trialing');
  });

  it('cancels, then can reactivate a canceled subscription and clears the cancel date', async () => {
    expect(data(await act('cancel'))).toMatchObject({ status: 'canceled', entitled: false });
    expect((await act('cancel')).statusCode).toBe(409);
    const back = await act('activate', { currentPeriodEnd: iso(START + 30 * DAY) });
    expect(data(back)).toMatchObject({ status: 'active', canceledAt: null, entitled: true });
  });

  it('extends a running trial from its current end, within limits', async () => {
    const res = await act('extend-trial', { days: 7 });
    expect(data(res)).toMatchObject({
      status: 'trialing',
      trialEndsAt: iso(START + 21 * DAY),
      currentPeriodEnd: iso(START + 21 * DAY),
    });
    for (const days of [0, 91, -1, 1.5, '7']) {
      expect((await act('extend-trial', { days })).statusCode).toBe(400);
    }
  });

  it('does not extend a trial that is not running', async () => {
    await act('cancel');
    expect((await act('extend-trial', { days: 7 })).statusCode).toBe(409);

    await act('activate', { currentPeriodEnd: iso(START + 30 * DAY) });
    expect((await act('extend-trial', { days: 7 })).statusCode).toBe(409);
  });

  it('cannot bring an expired trial back to trialing, only activate it', async () => {
    nowMs = START + 15 * DAY;
    await createSubscriptionsRepository(db, { now: () => new Date(nowMs) }).expireDue();
    expect((await allSubscriptions())[0]?.status).toBe('expired');
    expect((await act('extend-trial', { days: 7 })).statusCode).toBe(409);
    expect((await act('cancel')).statusCode).toBe(409);
    expect(data(await act('activate', { currentPeriodEnd: iso(nowMs + 30 * DAY) }))).toMatchObject({
      status: 'active',
      entitled: true,
    });
  });

  it('answers 404 for an unknown subscription and 400 for a malformed id', async () => {
    expect((await act('cancel', undefined, 'admin@axor.test', uuidv7())).statusCode).toBe(404);
    expect((await act('cancel', undefined, 'admin@axor.test', 'not-a-uuid')).statusCode).toBe(400);
  });
});
