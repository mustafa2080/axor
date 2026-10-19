import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../app.js';
import { uuidv7 } from '../../common/id.js';
import { loadEnv } from '../../config/env.js';
import { createDatabase } from '../../database/client.js';
import { runMigrations } from '../../database/migrate.js';
import { createCatalogRepository } from '../../database/repositories/catalog.repository.js';
import * as schema from '../../database/schema/index.js';
import { truncateDomainTables } from '../../test/db-helpers.js';

// Public catalog on a real MariaDB (axor_test): only what visitors may see, at the CURRENT plan
// version, with nothing internal leaking and nothing taken from the client.
const env = loadEnv(process.env);
const database = createDatabase(env.DATABASE_URL);
const { db } = database;

let app: ReturnType<typeof buildApp>;

async function addPlan(options: {
  productId: string;
  code: string;
  activityId?: string;
  status?: 'active' | 'archived';
  /** Prices of versions 1..n; the last one becomes current unless `current` says otherwise. */
  prices: number[];
  current?: 'last' | 'none' | { foreignVersionId: string };
}): Promise<{ planId: string; versionIds: string[] }> {
  const planId = uuidv7();
  await db.insert(schema.plans).values({
    id: planId,
    productId: options.productId,
    code: options.code,
    ...(options.activityId !== undefined && { activityId: options.activityId }),
    ...(options.status !== undefined && { status: options.status }),
  });
  const versionIds: string[] = [];
  for (const [index, price] of options.prices.entries()) {
    const versionId = uuidv7();
    versionIds.push(versionId);
    await db.insert(schema.planVersions).values({
      id: versionId,
      planId,
      version: index + 1,
      priceMinor: price,
      currency: 'EGP',
      billingPeriod: 'monthly',
      trialDays: 14,
      limits: { users: 5, shipments: null },
      features: { tracking: true },
    });
  }
  const current = options.current ?? 'last';
  const currentVersionId =
    current === 'last'
      ? versionIds[versionIds.length - 1]
      : current === 'none'
        ? undefined
        : current.foreignVersionId;
  if (currentVersionId !== undefined) {
    await db
      .update(schema.plans)
      .set({ currentVersionId })
      .where(eq(schema.plans.id, planId));
  }
  return { planId, versionIds };
}

async function seed(): Promise<void> {
  const [stark, caprina, legacy] = [uuidv7(), uuidv7(), uuidv7()];
  await db.insert(schema.products).values([
    { id: stark, code: 'stark', name: 'Stark', status: 'available' },
    { id: caprina, code: 'caprina', name: 'Caprina', status: 'coming_soon' },
    { id: legacy, code: 'legacy', name: 'Legacy', status: 'disabled' },
  ]);
  const [freight, courier, retired, other] = [uuidv7(), uuidv7(), uuidv7(), uuidv7()];
  await db.insert(schema.businessActivities).values([
    { id: freight, productId: stark, code: 'freight', name: 'Freight' },
    { id: courier, productId: stark, code: 'courier', name: 'Courier' },
    { id: retired, productId: stark, code: 'retired', name: 'Retired', status: 'disabled' },
    { id: other, productId: caprina, code: 'retail', name: 'Retail' },
  ]);

  // basic: two versions; only the CURRENT one (price 200) may be shown.
  await addPlan({ productId: stark, code: 'basic', prices: [100, 200] });
  await addPlan({ productId: stark, code: 'courier-pro', activityId: courier, prices: [500] });
  await addPlan({ productId: stark, code: 'freight-plus', activityId: freight, prices: [900] });
  await addPlan({ productId: stark, code: 'old-plan', status: 'archived', prices: [50] });
  await addPlan({ productId: stark, code: 'no-version', prices: [70], current: 'none' });
  await addPlan({ productId: stark, code: 'retired-only', activityId: retired, prices: [60] });
  // A plan whose current_version_id points at another plan's version must not be listed.
  const donor = await addPlan({ productId: caprina, code: 'donor', prices: [10] });
  await addPlan({
    productId: stark,
    code: 'hijacked',
    prices: [80],
    current: { foreignVersionId: donor.versionIds[0] as string },
  });
}

const get = (url: string) => app.inject({ method: 'GET', url: `/api/v1${url}` });
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-/;

beforeAll(async () => {
  expect(new URL(env.DATABASE_URL).pathname).toBe('/axor_test');
  await runMigrations(env.DATABASE_URL);
});

beforeEach(async () => {
  await truncateDomainTables(db);
  await seed();
  app = buildApp(env, { checkDatabase: () => database.ping(), catalog: createCatalogRepository(db) });
  await app.ready();
});

afterAll(async () => {
  await database.close();
});

describe('GET /catalog/products', () => {
  it('lists non-disabled products with their active activities, without authentication', async () => {
    const res = await get('/catalog/products');
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('public, max-age=60');
    const { data } = res.json<{
      data: Array<{ code: string; status: string; activities: Array<{ code: string }> }>;
    }>();
    expect(data.map((p) => p.code)).toEqual(['caprina', 'stark']);
    expect(data.find((p) => p.code === 'caprina')?.status).toBe('coming_soon');
    expect(data.find((p) => p.code === 'stark')?.activities.map((a) => a.code)).toEqual([
      'courier',
      'freight',
    ]);
  });

  it('exposes no internal ids or columns', async () => {
    const res = await get('/catalog/products');
    expect(res.body).not.toMatch(UUID);
    expect(res.body).not.toMatch(/"(id|productId|createdAt|updatedAt)"/);
  });
});

describe('GET /catalog/products/:productCode/plans', () => {
  it('lists active plans at their CURRENT version only, cheapest first', async () => {
    const res = await get('/catalog/products/stark/plans');
    expect(res.statusCode).toBe(200);
    const { data } = res.json<{
      data: Array<{ code: string; version: number; price: { amountMinor: number; currency: string } }>;
    }>();
    expect(data.map((p) => p.code)).toEqual(['basic', 'courier-pro', 'freight-plus']);
    const basic = data[0];
    expect(basic?.version).toBe(2);
    expect(basic?.price).toEqual({ amountMinor: 200, currency: 'EGP', billingPeriod: 'monthly' });
  });

  it('never lists archived plans, plans without a version, foreign versions or disabled activities', async () => {
    const codes = (await get('/catalog/products/stark/plans')).json<{ data: Array<{ code: string }> }>()
      .data.map((p) => p.code);
    for (const hidden of ['old-plan', 'no-version', 'hijacked', 'retired-only']) {
      expect(codes).not.toContain(hidden);
    }
  });

  it('returns limits (null = unlimited), features and trial days, without internal ids', async () => {
    const res = await get('/catalog/products/stark/plans');
    const first = res.json<{ data: Array<Record<string, unknown>> }>().data[0];
    expect(first).toMatchObject({
      trialDays: 14,
      limits: { users: 5, shipments: null },
      features: { tracking: true },
      activity: null,
    });
    expect(res.body).not.toMatch(UUID);
  });

  it('filters by activity: that activity plus plans that apply to all activities', async () => {
    const courier = (await get('/catalog/products/stark/plans?activity=courier')).json<{
      data: Array<{ code: string }>;
    }>();
    expect(courier.data.map((p) => p.code)).toEqual(['basic', 'courier-pro']);
  });

  it('answers 404 for unavailable products and unknown or disabled activities', async () => {
    for (const url of [
      '/catalog/products/caprina/plans', // coming soon
      '/catalog/products/legacy/plans', // disabled
      '/catalog/products/nope/plans',
      '/catalog/products/stark/plans?activity=retired', // disabled activity
      '/catalog/products/stark/plans?activity=retail', // belongs to another product
    ]) {
      const res = await get(url);
      expect(res.statusCode, url).toBe(404);
    }
  });

  it('rejects malformed codes and unknown query parameters with 400', async () => {
    for (const url of [
      '/catalog/products/ST%20ARK/plans',
      "/catalog/products/stark'--/plans",
      '/catalog/products/stark/plans?activity=Bad Code',
      '/catalog/products/stark/plans?price=1',
    ]) {
      const res = await get(url);
      expect(res.statusCode, url).toBe(400);
    }
  });

  it('is read-only: write methods are not routed', async () => {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE'] as const) {
      const res = await app.inject({
        method,
        url: '/api/v1/catalog/products/stark/plans',
        payload: { price: 1 },
      });
      expect(res.statusCode, method).toBe(404);
    }
    const [row] = await db
      .select()
      .from(schema.plans)
      .where(eq(schema.plans.code, 'basic'));
    expect(row).toBeDefined();
  });
});
