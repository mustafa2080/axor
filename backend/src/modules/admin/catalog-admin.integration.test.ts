import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../app.js';
import { uuidv7 } from '../../common/id.js';
import { loadEnv } from '../../config/env.js';
import { createDatabase } from '../../database/client.js';
import { runMigrations } from '../../database/migrate.js';
import { createCatalogAdminRepository } from '../../database/repositories/catalog-admin.repository.js';
import { createCatalogRepository } from '../../database/repositories/catalog.repository.js';
import * as schema from '../../database/schema/index.js';
import { truncateDomainTables } from '../../test/db-helpers.js';
import { createAccessTokenService } from '../auth/access-token.js';
import { createAuthService } from '../auth/auth.service.js';
import { hashPassword } from '../auth/password.js';

// Catalog management on a real MariaDB (axor_test): who may call it, that versions are never
// edited, that the public catalog follows the changes, and that every change leaves a trace.
const env = loadEnv(process.env);
const database = createDatabase(env.DATABASE_URL);
const { db } = database;

const ORIGIN = new URL(env.WEB_ORIGIN).origin;
const PASSWORD = 'correct horse battery staple 42';

let app: ReturnType<typeof buildApp>;
let authService: ReturnType<typeof createAuthService> | undefined;
let passwordHash: string;
const tokens: Record<'owner' | 'admin' | 'support' | 'company', string> = {
  owner: '',
  admin: '',
  support: '',
  company: '',
};
let ownerId: string;

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
  });
}

async function tokenFor(email: string): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    headers: { origin: ORIGIN },
    payload: { email, password: PASSWORD },
  });
  expect(res.statusCode).toBe(200);
  return res.json<{ data: { accessToken: string } }>().data.accessToken;
}

const VERSION = {
  priceMinor: 49900,
  currency: 'EGP',
  billingPeriod: 'monthly',
  trialDays: 14,
  limits: { users: 5, shipments_per_month: null },
  features: { tracking: true, api_access: false },
};

function admin(
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  url = '',
  payload?: unknown,
  token: string | null = tokens.owner,
) {
  return app.inject({
    method,
    url: `/api/v1/admin/catalog${url}`,
    headers: token === null ? {} : { authorization: `Bearer ${token}` },
    ...(payload !== undefined && { payload: payload as object }),
  });
}

type Plan = {
  id: string;
  code: string;
  currentVersionId: string | null;
  status: string;
  versions: Array<{ id: string; version: number; priceMinor: number }>;
};

async function createProduct(status = 'available', code = 'stark') {
  const res = await admin('POST', '/products', { code, name: 'Stark', status });
  expect(res.statusCode).toBe(201);
  return res.json<{ data: { id: string } }>().data.id;
}

async function createPlan(productId: string, code = 'basic', version: object = VERSION) {
  const res = await admin('POST', `/products/${productId}/plans`, { code, version });
  expect(res.statusCode).toBe(201);
  return res.json<{ data: Plan }>().data;
}

const publicPlans = async (productCode = 'stark') =>
  (
    await app.inject({ method: 'GET', url: `/api/v1/catalog/products/${productCode}/plans` })
  ).json<{ data: Array<{ code: string; version: number; price: { amountMinor: number } }> }>();

beforeAll(async () => {
  expect(new URL(env.DATABASE_URL).pathname).toBe('/axor_test');
  await runMigrations(env.DATABASE_URL);
  passwordHash = await hashPassword(PASSWORD);
});

beforeEach(async () => {
  await authService?.drain();
  await truncateDomainTables(db);
  const tenantId = uuidv7();
  ownerId = uuidv7();
  await db.insert(schema.tenants).values({ id: tenantId, name: 'alpha' });
  await db.insert(schema.users).values([
    { id: ownerId, email: 'owner@axor.test', passwordHash, platformRole: 'owner' },
    { id: uuidv7(), email: 'admin@axor.test', passwordHash, platformRole: 'admin' },
    { id: uuidv7(), email: 'support@axor.test', passwordHash, platformRole: 'support' },
    { id: uuidv7(), email: 'boss@alpha.test', passwordHash, tenantId, tenantRole: 'owner' },
  ]);
  app = newApp();
  await app.ready();
  tokens.owner = await tokenFor('owner@axor.test');
  tokens.admin = await tokenFor('admin@axor.test');
  tokens.support = await tokenFor('support@axor.test');
  tokens.company = await tokenFor('boss@alpha.test');
});

afterAll(async () => {
  await authService?.drain();
  await database.close();
});

describe('who may manage the catalog', () => {
  it('needs a platform owner or admin: anonymous 401, support and company users 403', async () => {
    expect((await admin('GET', '', undefined, null)).statusCode).toBe(401);
    expect((await admin('GET', '', undefined, tokens.support)).statusCode).toBe(403);
    expect((await admin('GET', '', undefined, tokens.company)).statusCode).toBe(403);
    expect((await admin('GET')).statusCode).toBe(200);
    expect((await admin('GET', '', undefined, tokens.admin)).statusCode).toBe(200);

    const body = { code: 'x', name: 'Nope', status: 'available' };
    expect((await admin('POST', '/products', body, tokens.company)).statusCode).toBe(403);
    expect((await admin('POST', '/products', body, tokens.support)).statusCode).toBe(403);
    expect((await db.select().from(schema.products)).length).toBe(0);
  });
});

describe('products and activities', () => {
  it('creates, lists and updates them; codes are unique and immutable', async () => {
    const productId = await createProduct('coming_soon');
    expect((await admin('POST', '/products', { code: 'stark', name: 'Again' })).statusCode).toBe(409);

    const activity = await admin('POST', `/products/${productId}/activities`, {
      code: 'freight',
      name: 'Freight',
    });
    expect(activity.statusCode).toBe(201);
    const activityId = activity.json<{ data: { id: string } }>().data.id;
    expect(
      (await admin('POST', `/products/${productId}/activities`, { code: 'freight', name: 'Dup' }))
        .statusCode,
    ).toBe(409);

    const renamed = await admin('PATCH', `/products/${productId}`, { name: 'Stark Logistics', status: 'available' });
    expect(renamed.statusCode).toBe(200);
    expect((await admin('PATCH', `/activities/${activityId}`, { status: 'disabled' })).statusCode).toBe(200);
    // `code` cannot be changed: strict body.
    expect((await admin('PATCH', `/products/${productId}`, { code: 'other' })).statusCode).toBe(400);

    const list = (await admin('GET')).json<{
      data: Array<{ code: string; name: string; status: string; activities: Array<{ status: string }> }>;
    }>().data;
    expect(list[0]).toMatchObject({ code: 'stark', name: 'Stark Logistics', status: 'available' });
    expect(list[0]?.activities[0]?.status).toBe('disabled');
  });

  it('answers 404 for unknown ids and 400 for malformed input', async () => {
    const missing = uuidv7();
    expect((await admin('PATCH', `/products/${missing}`, { name: 'Ghost' })).statusCode).toBe(404);
    expect((await admin('PATCH', `/activities/${missing}`, { name: 'Ghost' })).statusCode).toBe(404);
    expect((await admin('POST', `/products/${missing}/plans`, { code: 'p', version: VERSION })).statusCode).toBe(404);
    expect((await admin('PATCH', '/products/not-a-uuid', { name: 'Ghost' })).statusCode).toBe(400);
    expect((await admin('POST', '/products', { code: 'Bad Code', name: 'x' })).statusCode).toBe(400);
    expect((await admin('POST', '/products', { code: 'ok', name: 'Ok', id: uuidv7() })).statusCode).toBe(400);
    expect((await admin('PATCH', `/products/${missing}`, {})).statusCode).toBe(400);
  });
});

describe('plans and versions', () => {
  it('creates a plan with version 1 and publishes it through the public catalog', async () => {
    const productId = await createProduct('coming_soon');
    const plan = await createPlan(productId);
    expect(plan.versions).toHaveLength(1);
    expect(plan.currentVersionId).toBe(plan.versions[0]?.id);
    // The product is still "coming soon": nothing is public yet.
    expect((await app.inject({ method: 'GET', url: '/api/v1/catalog/products/stark/plans' })).statusCode).toBe(404);

    await admin('PATCH', `/products/${productId}`, { status: 'available' });
    const pub = await publicPlans();
    expect(pub.data).toHaveLength(1);
    expect(pub.data[0]).toMatchObject({ code: 'basic', version: 1, price: { amountMinor: 49900 } });
  });

  it('a price change adds a NEW current version and never edits the old one', async () => {
    const productId = await createProduct();
    const plan = await createPlan(productId);

    const res = await admin('POST', `/plans/${plan.id}/versions`, { ...VERSION, priceMinor: 59900 });
    expect(res.statusCode).toBe(201);
    const updated = res.json<{ data: Plan }>().data;
    expect(updated.versions.map((v) => [v.version, v.priceMinor])).toEqual([
      [1, 49900],
      [2, 59900],
    ]);
    expect(updated.currentVersionId).toBe(updated.versions[1]?.id);
    expect((await publicPlans()).data[0]).toMatchObject({ version: 2, price: { amountMinor: 59900 } });

    // Version 1 is untouched in the database.
    const [v1] = await db
      .select()
      .from(schema.planVersions)
      .where(eq(schema.planVersions.id, plan.versions[0]?.id as string));
    expect(v1?.priceMinor).toBe(49900);
    // There is no way to edit or delete a version.
    for (const method of ['PATCH', 'PUT', 'DELETE'] as const) {
      const attempt = await admin(method, `/plans/${plan.id}/versions/${v1?.id}`, { priceMinor: 1 });
      expect(attempt.statusCode, method).toBe(404);
    }
  });

  it('can point the plan back at one of ITS OWN versions, never at a foreign one', async () => {
    const productId = await createProduct();
    const plan = await createPlan(productId);
    const other = await createPlan(productId, 'pro', { ...VERSION, priceMinor: 99900 });
    await admin('POST', `/plans/${plan.id}/versions`, { ...VERSION, priceMinor: 59900 });

    const back = await admin('PATCH', `/plans/${plan.id}`, { currentVersionId: plan.versions[0]?.id });
    expect(back.statusCode).toBe(200);
    expect((await publicPlans()).data.find((p) => p.code === 'basic')?.price.amountMinor).toBe(49900);

    const foreign = await admin('PATCH', `/plans/${plan.id}`, { currentVersionId: other.versions[0]?.id });
    expect(foreign.statusCode).toBe(400);
    const unknown = await admin('PATCH', `/plans/${plan.id}`, { currentVersionId: uuidv7() });
    expect(unknown.statusCode).toBe(400);
  });

  it('archiving a plan removes it from the public catalog; reactivating brings it back', async () => {
    const productId = await createProduct();
    const plan = await createPlan(productId);
    await admin('PATCH', `/plans/${plan.id}`, { status: 'archived' });
    expect((await publicPlans()).data).toHaveLength(0);
    await admin('PATCH', `/plans/${plan.id}`, { status: 'active' });
    expect((await publicPlans()).data).toHaveLength(1);
  });

  it('ties a plan to an activity by code, and rejects unknown activities and duplicate codes', async () => {
    const productId = await createProduct();
    await admin('POST', `/products/${productId}/activities`, { code: 'courier', name: 'Courier' });
    const ok = await admin('POST', `/products/${productId}/plans`, {
      code: 'courier-basic',
      activityCode: 'courier',
      version: VERSION,
    });
    expect(ok.statusCode).toBe(201);
    expect(ok.json<{ data: { activityId: string | null } }>().data.activityId).not.toBeNull();

    const unknown = await admin('POST', `/products/${productId}/plans`, {
      code: 'ghost',
      activityCode: 'nope',
      version: VERSION,
    });
    expect(unknown.statusCode).toBe(400);
    const dup = await admin('POST', `/products/${productId}/plans`, { code: 'courier-basic', version: VERSION });
    expect(dup.statusCode).toBe(409);
    // The failed attempts left no half-created plans behind.
    expect((await db.select().from(schema.plans)).map((p) => p.code)).toEqual(['courier-basic']);
  });

  it('rejects bad prices, currencies, limits, features and extra fields, creating nothing', async () => {
    const productId = await createProduct();
    const bad: object[] = [
      { ...VERSION, priceMinor: -1 },
      { ...VERSION, priceMinor: 10.5 },
      { ...VERSION, priceMinor: '100' },
      { ...VERSION, currency: 'egp' },
      { ...VERSION, currency: 'EGYPT' },
      { ...VERSION, billingPeriod: 'weekly' },
      { ...VERSION, trialDays: -3 },
      { ...VERSION, trialDays: 4000 },
      { ...VERSION, limits: { users: -1 } },
      { ...VERSION, limits: { Users: 1 } },
      { ...VERSION, limits: { users: 1.5 } },
      { ...VERSION, features: { tracking: 'yes' } },
      { ...VERSION, status: 'active' },
    ];
    for (const version of bad) {
      const res = await admin('POST', `/products/${productId}/plans`, { code: 'bad', version });
      expect(res.statusCode, JSON.stringify(version)).toBe(400);
    }
    expect((await admin('POST', `/products/${productId}/plans`, { code: 'bad', version: VERSION, planId: uuidv7() })).statusCode).toBe(400);
    expect((await db.select().from(schema.plans)).length).toBe(0);
    expect((await db.select().from(schema.planVersions)).length).toBe(0);
  });
});

describe('audit trail', () => {
  it('records every change with the platform user as actor and no secrets', async () => {
    const productId = await createProduct();
    const plan = await createPlan(productId);
    await admin('POST', `/plans/${plan.id}/versions`, { ...VERSION, priceMinor: 59900 });
    await admin('PATCH', `/plans/${plan.id}`, { status: 'archived' });

    const rows = await db.select().from(schema.auditLogs);
    const catalog = rows.filter((row) => row.action.startsWith('catalog.'));
    expect(catalog.map((r) => r.action).sort()).toEqual([
      'catalog.plan_created',
      'catalog.plan_updated',
      'catalog.plan_version_created',
      'catalog.product_created',
    ]);
    for (const row of catalog) {
      expect(row.actorUserId).toBe(ownerId);
      expect(row.tenantId).toBeNull();
      expect(row.requestId).toBeTypeOf('string');
    }
    const versionRow = catalog.find((r) => r.action === 'catalog.plan_version_created');
    expect(versionRow?.metadata).toMatchObject({ version: 2, priceMinor: 59900, currency: 'EGP' });
    expect(JSON.stringify(rows)).not.toContain(PASSWORD);
  });

  it('leaves no audit row for a rejected change', async () => {
    const before = (await db.select().from(schema.auditLogs)).length;
    await admin('POST', '/products', { code: 'Bad Code', name: 'x' });
    await admin('POST', '/products', { code: 'x', name: 'X' }, tokens.company);
    const after = (await db.select().from(schema.auditLogs)).filter((r) =>
      r.action.startsWith('catalog.'),
    );
    expect(after).toHaveLength(0);
    expect((await db.select().from(schema.auditLogs)).length).toBe(before);
  });
});
