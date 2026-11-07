import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../app.js';
import { uuidv7 } from '../../common/id.js';
import { loadEnv } from '../../config/env.js';
import { createDatabase } from '../../database/client.js';
import { runMigrations } from '../../database/migrate.js';
import { createCatalogAdminRepository } from '../../database/repositories/catalog-admin.repository.js';
import { createIdempotencyKeysRepository } from '../../database/repositories/idempotency-keys.repository.js';
import { createSubscriptionsRepository } from '../../database/repositories/subscriptions.repository.js';
import * as schema from '../../database/schema/index.js';
import { truncateDomainTables } from '../../test/db-helpers.js';
import { createAccessTokenService } from '../auth/access-token.js';
import { createAuthService } from '../auth/auth.service.js';
import { hashPassword } from '../auth/password.js';
import { createIdempotency } from './idempotency.js';

// `Idempotency-Key` on the two admin writes that are not repeatable (ADR-0026), through the real
// routes on MariaDB (axor_test): a retry gets the first answer instead of doing the work again.
const env = loadEnv(process.env);
const database = createDatabase(env.DATABASE_URL);
const { db } = database;

const PASSWORD = 'correct horse battery staple 42';
const DAY = 86_400_000;
const HOUR = 3_600_000;
const KEY = 'retry-key-0123456789-abcd';
const ORIGIN = new URL(env.WEB_ORIGIN).origin;

let app: ReturnType<typeof buildApp>;
let authService: ReturnType<typeof createAuthService> | undefined;
let passwordHash: string;
let clockMs = Date.now();
const tokenCache = new Map<string, string>();
const ids = { tenant: '', product: '', plan: '', sub: '' };

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
    catalogAdmin: createCatalogAdminRepository(db),
    subscriptions: createSubscriptionsRepository(db),
    idempotency: createIdempotency(createIdempotencyKeysRepository(db), { clock: () => new Date(clockMs) }),
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

async function post(url: string, payload: unknown, as: string | null, key?: string | string[]) {
  const token = as === null ? null : await login(as);
  return app.inject({
    method: 'POST',
    url: `/api/v1${url}`,
    headers: {
      ...(token !== null && { authorization: `Bearer ${token}` }),
      ...(key !== undefined && { 'idempotency-key': key }),
    },
    payload: payload as object,
  });
}

const extend = (days: number, as: string | null = 'admin@axor.test', key?: string | string[]) =>
  post(`/admin/subscriptions/${ids.sub}/extend-trial`, { days }, as, key);

const VERSION = {
  priceMinor: 59900,
  currency: 'EGP',
  billingPeriod: 'monthly',
  trialDays: 14,
  limits: { users: 5, shipments_per_month: null },
  features: { tracking: true },
};
const addVersion = (planId = ids.plan, body: object = VERSION, as: string | null = 'admin@axor.test', key?: string) =>
  post(`/admin/catalog/plans/${planId}/versions`, body, as, key);

const trialEnd = async () => {
  const [row] = await db.select().from(schema.subscriptions).where(eq(schema.subscriptions.id, ids.sub));
  return row?.trialEndsAt?.getTime() ?? 0;
};
const versionCount = async () => (await db.select().from(schema.planVersions)).length;
const storedKeys = () => db.select().from(schema.idempotencyKeys);
type Extended = { data: { trialEndsAt: string } };

beforeAll(async () => {
  expect(new URL(env.DATABASE_URL).pathname).toBe('/axor_test');
  await runMigrations(env.DATABASE_URL);
  passwordHash = await hashPassword(PASSWORD);
});

beforeEach(async () => {
  await authService?.drain();
  await truncateDomainTables(db);
  tokenCache.clear();
  clockMs = Date.now();

  ids.tenant = uuidv7();
  ids.product = uuidv7();
  ids.plan = uuidv7();
  const versionId = uuidv7();
  await db.insert(schema.tenants).values({ id: ids.tenant, name: 'alpha' });
  await db.insert(schema.users).values([
    { id: uuidv7(), email: 'boss@alpha.test', passwordHash, tenantId: ids.tenant, tenantRole: 'owner' },
    { id: uuidv7(), email: 'owner@axor.test', passwordHash, platformRole: 'owner' },
    { id: uuidv7(), email: 'admin@axor.test', passwordHash, platformRole: 'admin' },
    { id: uuidv7(), email: 'support@axor.test', passwordHash, platformRole: 'support' },
  ]);
  await db.insert(schema.products).values({ id: ids.product, code: 'stark', name: 'Stark', status: 'available' });
  await db
    .insert(schema.plans)
    .values({ id: ids.plan, productId: ids.product, code: 'basic', status: 'active', currentVersionId: versionId });
  await db.insert(schema.planVersions).values({
    id: versionId,
    planId: ids.plan,
    version: 1,
    priceMinor: 49900,
    currency: 'EGP',
    billingPeriod: 'monthly',
    trialDays: 14,
    limits: { users: 5, shipments_per_month: null },
    features: { tracking: true },
  });
  app = newApp();
  const started = await post('/subscriptions/trial', { productCode: 'stark', planCode: 'basic' }, 'boss@alpha.test');
  expect(started.statusCode).toBe(201);
  ids.sub = (await db.select().from(schema.subscriptions))[0]?.id ?? '';
});

afterAll(async () => {
  await authService?.drain();
  await database.close();
});

describe('extend-trial with an Idempotency-Key', () => {
  it('without the header nothing changes: every call extends again', async () => {
    const before = await trialEnd();
    expect((await extend(7)).statusCode).toBe(200);
    expect((await extend(7)).statusCode).toBe(200);
    expect(await trialEnd()).toBe(before + 14 * DAY);
    expect(await storedKeys()).toHaveLength(0);
  });

  it('a retry with the same key and content gets the first answer and extends only once', async () => {
    const before = await trialEnd();
    const first = await extend(7, 'admin@axor.test', KEY);
    expect(first.statusCode).toBe(200);
    expect(first.headers['idempotent-replayed']).toBeUndefined();
    expect(Date.parse(first.json<Extended>().data.trialEndsAt)).toBe(before + 7 * DAY);

    const retry = await extend(7, 'admin@axor.test', KEY);
    expect(retry.statusCode).toBe(200);
    expect(retry.headers['idempotent-replayed']).toBe('true');
    expect(retry.json()).toEqual(first.json());
    expect(await trialEnd()).toBe(before + 7 * DAY);
    expect(await storedKeys()).toHaveLength(1);
  });

  it('reusing the key for different content is refused with 422 and changes nothing', async () => {
    const before = await trialEnd();
    await extend(7, 'admin@axor.test', KEY);
    const reused = await extend(30, 'admin@axor.test', KEY);
    expect(reused.statusCode).toBe(422);
    expect(reused.json<{ error: { code: string } }>().error.code).toBe('IDEMPOTENCY_KEY_REUSED');
    expect(await trialEnd()).toBe(before + 7 * DAY);
  });

  it('keys belong to the caller: another admin sending the same string is a separate request', async () => {
    const before = await trialEnd();
    expect((await extend(7, 'admin@axor.test', KEY)).statusCode).toBe(200);
    const other = await extend(7, 'owner@axor.test', KEY);
    expect(other.statusCode).toBe(200);
    expect(other.headers['idempotent-replayed']).toBeUndefined();
    expect(await trialEnd()).toBe(before + 14 * DAY);
    expect(await storedKeys()).toHaveLength(2);
  });

  it('simultaneous retries run the work exactly once; the others are told to wait or get the answer', async () => {
    const before = await trialEnd();
    const results = await Promise.all(Array.from({ length: 6 }, () => extend(7, 'admin@axor.test', KEY)));

    const statuses = results.map((r) => r.statusCode);
    expect(statuses.every((s) => s === 200 || s === 409)).toBe(true);
    const winners = results.filter((r) => r.statusCode === 200 && r.headers['idempotent-replayed'] === undefined);
    expect(winners).toHaveLength(1);
    for (const waiting of results.filter((r) => r.statusCode === 409)) {
      expect(waiting.json<{ error: { code: string } }>().error.code).toBe('IDEMPOTENCY_IN_PROGRESS');
      expect(waiting.headers['retry-after']).toBe('2');
    }
    expect(await trialEnd()).toBe(before + 7 * DAY);

    const retry = await extend(7, 'admin@axor.test', KEY);
    expect(retry.headers['idempotent-replayed']).toBe('true');
  });

  it('a failed request gives the key back: the retry runs instead of replaying the failure', async () => {
    await post(`/admin/subscriptions/${ids.sub}/cancel`, undefined as never, 'admin@axor.test');
    const failed = await extend(7, 'admin@axor.test', KEY);
    expect(failed.statusCode).toBe(409);
    expect(failed.headers['idempotent-replayed']).toBeUndefined();
    expect(await storedKeys()).toHaveLength(0);

    await post(
      `/admin/subscriptions/${ids.sub}/activate`,
      { currentPeriodEnd: new Date(Date.now() + 30 * DAY).toISOString() },
      'admin@axor.test',
    );
    const again = await extend(7, 'admin@axor.test', KEY);
    expect(again.statusCode).toBe(409);
    expect(again.headers['idempotent-replayed']).toBeUndefined();
  });

  it('checks who the caller is before it looks at the key: nothing is stored for refused callers', async () => {
    for (const as of ['support@axor.test', 'boss@alpha.test', null]) {
      const res = await extend(7, as, KEY);
      expect(res.statusCode).toBe(as === null ? 401 : 403);
    }
    expect(await storedKeys()).toHaveLength(0);
  });

  it.each(['short', 'has spaces in the key 123', 'x'.repeat(65), 'slash/in/the/key/0123456789'])(
    'refuses the malformed key %j with 400 and changes nothing',
    async (key) => {
      const before = await trialEnd();
      expect((await extend(7, 'admin@axor.test', key)).statusCode).toBe(400);
      expect(await trialEnd()).toBe(before);
      expect(await storedKeys()).toHaveLength(0);
    },
  );

  it('refuses invalid content before reserving the key', async () => {
    expect((await extend(0, 'admin@axor.test', KEY)).statusCode).toBe(400);
    expect(await storedKeys()).toHaveLength(0);
    expect((await extend(7, 'admin@axor.test', KEY)).statusCode).toBe(200);
  });

  it('forgets an answer after 24 hours: the same key then runs again', async () => {
    const before = await trialEnd();
    await extend(7, 'admin@axor.test', KEY);

    clockMs += 23 * HOUR;
    expect((await extend(7, 'admin@axor.test', KEY)).headers['idempotent-replayed']).toBe('true');

    clockMs += 2 * HOUR;
    const later = await extend(7, 'admin@axor.test', KEY);
    expect(later.statusCode).toBe(200);
    expect(later.headers['idempotent-replayed']).toBeUndefined();
    expect(await trialEnd()).toBe(before + 14 * DAY);
  });
});

describe('a new plan version with an Idempotency-Key', () => {
  it('a retry gets the first answer and adds one version, not two', async () => {
    const first = await addVersion(ids.plan, VERSION, 'admin@axor.test', KEY);
    expect(first.statusCode).toBe(201);
    expect(await versionCount()).toBe(2);

    const retry = await addVersion(ids.plan, VERSION, 'admin@axor.test', KEY);
    expect(retry.statusCode).toBe(201);
    expect(retry.headers['idempotent-replayed']).toBe('true');
    expect(retry.json()).toEqual(first.json());
    expect(await versionCount()).toBe(2);
  });

  it('without the header every call still adds a version', async () => {
    await addVersion();
    await addVersion();
    expect(await versionCount()).toBe(3);
  });

  it('the same key with a different price or for a different plan is refused', async () => {
    await addVersion(ids.plan, VERSION, 'admin@axor.test', KEY);
    const price = await addVersion(ids.plan, { ...VERSION, priceMinor: 1 }, 'admin@axor.test', KEY);
    expect(price.statusCode).toBe(422);
    const plan = await addVersion(uuidv7(), VERSION, 'admin@axor.test', KEY);
    expect(plan.statusCode).toBe(422);
    expect(await versionCount()).toBe(2);
  });

  it('a plan that does not exist fails with 404 and leaves no key behind', async () => {
    const res = await addVersion(uuidv7(), VERSION, 'admin@axor.test', KEY);
    expect(res.statusCode).toBe(404);
    expect(await storedKeys()).toHaveLength(0);
  });

  it('support and company users are refused before anything is stored', async () => {
    expect((await addVersion(ids.plan, VERSION, 'support@axor.test', KEY)).statusCode).toBe(403);
    expect((await addVersion(ids.plan, VERSION, 'boss@alpha.test', KEY)).statusCode).toBe(403);
    expect(await storedKeys()).toHaveLength(0);
    expect(await versionCount()).toBe(1);
  });
});
