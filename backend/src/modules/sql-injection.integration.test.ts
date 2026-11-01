import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { uuidv7 } from '../common/id.js';
import { loadEnv } from '../config/env.js';
import { createDatabase } from '../database/client.js';
import { runMigrations } from '../database/migrate.js';
import { createAuditAdminRepository } from '../database/repositories/audit-admin.repository.js';
import { createCatalogRepository } from '../database/repositories/catalog.repository.js';
import * as schema from '../database/schema/index.js';
import { truncateDomainTables } from '../test/db-helpers.js';
import { createAccessTokenService } from './auth/access-token.js';
import { createAuthService } from './auth/auth.service.js';
import { hashPassword } from './auth/password.js';

// SQL injection attempts through every kind of input the API takes, on a real MariaDB (axor_test):
// a login email and password, a company name, a display name, and public catalog path/query params.
// Each attempt must end as plain data or a clean 4xx: never a 200 that logs someone in, never a 500,
// and the tables and the existing rows must come out untouched.
const env = loadEnv(process.env);
const database = createDatabase(env.DATABASE_URL);
const { db } = database;

const ORIGIN = new URL(env.WEB_ORIGIN).origin;
const PASSWORD = 'correct horse battery staple 42';
const EMAIL = 'owner@alpha.test';
const ADMIN_EMAIL = 'admin@axor.test';

const PAYLOADS = [
  "' OR '1'='1",
  "'; DROP TABLE users; --",
  '" OR ""="',
  "x'); DELETE FROM tenants; --",
  "\\' OR 1=1 -- ",
  "' UNION SELECT password_hash FROM users -- ",
];

let app: ReturnType<typeof buildApp>;
let authService: ReturnType<typeof createAuthService> | undefined;
let userId: string;
let tenantId: string;

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
    auditAdmin: createAuditAdminRepository(db),
  });
}

const login = (email: string, password: string) =>
  app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    headers: { origin: ORIGIN },
    payload: { email, password },
  });

async function ownerRow() {
  const [row] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  return row;
}

beforeAll(async () => {
  expect(new URL(env.DATABASE_URL).pathname).toBe('/axor_test');
  await runMigrations(env.DATABASE_URL);
});

beforeEach(async () => {
  await authService?.drain();
  await truncateDomainTables(db);
  tenantId = uuidv7();
  userId = uuidv7();
  const passwordHash = await hashPassword(PASSWORD);
  await db.insert(schema.tenants).values({ id: tenantId, name: 'alpha' });
  await db.insert(schema.users).values([
    { id: userId, email: EMAIL, passwordHash, tenantId, tenantRole: 'owner' },
    { id: uuidv7(), email: ADMIN_EMAIL, passwordHash, platformRole: 'admin' },
  ]);
  app = newApp();
  await app.ready();
});

afterAll(async () => {
  await authService?.drain();
  await database.close();
});

describe('SQL injection', () => {
  it('treats SQL in a login email as an unknown email', async () => {
    const before = await ownerRow();
    for (const payload of PAYLOADS) {
      const res = await login(payload, PASSWORD);
      expect([400, 401], `email ${payload}`).toContain(res.statusCode);
      expect(res.body).not.toContain('accessToken');
    }
    expect(await ownerRow()).toEqual(before);
  });

  it('treats SQL in a password as a wrong password', async () => {
    const before = await ownerRow();
    // Four tries: the fifth wrong password for one IP and email is blocked by the throttle (429).
    for (const payload of PAYLOADS.slice(0, 4)) {
      const res = await login(EMAIL, payload);
      expect(res.statusCode, `password ${payload}`).toBe(401);
    }
    expect(await ownerRow()).toEqual(before);
  });

  it('stores SQL in a company name as plain text, and every table survives', async () => {
    const before = await ownerRow();
    // Four sign-ups: registration is limited to five per IP per hour.
    for (const [index, payload] of PAYLOADS.slice(0, 4).entries()) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        headers: { origin: ORIGIN },
        payload: { companyName: payload, email: `founder${index}@beta.test`, password: PASSWORD },
      });
      expect(res.statusCode, `company ${payload}`).toBe(201);
      const names = (await db.select().from(schema.tenants)).map((row) => row.name);
      expect(names).toContain(payload.trim());
    }
    expect(await db.select().from(schema.tenants)).toHaveLength(5);
    expect(await db.select().from(schema.users)).toHaveLength(6);
    expect(await ownerRow()).toEqual(before);
  });

  it('stores SQL in a display name as plain text', async () => {
    const login200 = await login(EMAIL, PASSWORD);
    expect(login200.statusCode).toBe(200);
    const token = login200.json<{ data: { accessToken: string } }>().data.accessToken;
    for (const payload of PAYLOADS) {
      const res = await app.inject({
        method: 'PATCH',
        url: '/api/v1/auth/me',
        headers: { origin: ORIGIN, authorization: `Bearer ${token}` },
        payload: { fullName: payload },
      });
      expect(res.statusCode, `name ${payload}`).toBe(200);
      expect((await ownerRow())?.fullName).toBe(payload.trim());
    }
    expect(await db.select().from(schema.users)).toHaveLength(2);
  });

  it('rejects SQL in public catalog paths and queries with a 400 before any lookup', async () => {
    // Control: the catalog routes really are mounted here, so the 400s below are not a missing route.
    const control = await app.inject({ method: 'GET', url: '/api/v1/catalog/products' });
    expect(control.statusCode).toBe(200);
    for (const payload of PAYLOADS) {
      const encoded = encodeURIComponent(payload);
      const inPath = await app.inject({
        method: 'GET',
        url: `/api/v1/catalog/products/${encoded}/plans`,
      });
      expect(inPath.statusCode, `path ${payload}`).toBe(400);
      const inActivity = await app.inject({
        method: 'GET',
        url: `/api/v1/catalog/products/shipping/plans?activity=${encoded}`,
      });
      expect(inActivity.statusCode, `activity ${payload}`).toBe(400);
      const unknownKey = await app.inject({
        method: 'GET',
        url: `/api/v1/catalog/products/shipping/plans?${encoded}=1`,
      });
      expect(unknownKey.statusCode, `query key ${payload}`).toBe(400);
    }
  });

  it('rejects SQL in the platform audit-log filters with a 400', async () => {
    const adminLogin = await login(ADMIN_EMAIL, PASSWORD);
    expect(adminLogin.statusCode).toBe(200);
    const headers = {
      authorization: `Bearer ${adminLogin.json<{ data: { accessToken: string } }>().data.accessToken}`,
    };
    // Control: a well-formed filter works, so the 400s below come from the filter, not from auth.
    const control = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/audit-logs?action=auth.login',
      headers,
    });
    expect(control.statusCode).toBe(200);
    for (const payload of PAYLOADS) {
      const encoded = encodeURIComponent(payload);
      for (const key of ['action', 'tenantId', 'actorUserId']) {
        const res = await app.inject({
          method: 'GET',
          url: `/api/v1/admin/audit-logs?${key}=${encoded}`,
          headers,
        });
        expect(res.statusCode, `${key} ${payload}`).toBe(400);
      }
    }
  });
});
