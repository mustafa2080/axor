import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../app.js';
import { uuidv7 } from '../../common/id.js';
import { loadEnv } from '../../config/env.js';
import { createDatabase } from '../../database/client.js';
import { runMigrations } from '../../database/migrate.js';
import * as schema from '../../database/schema/index.js';
import { truncateDomainTables } from '../../test/db-helpers.js';
import { createAccessTokenService } from './access-token.js';
import { createAuthService } from './auth.service.js';
import { hashPassword } from './password.js';

// Password change on a real MariaDB (axor_test): every other session dies, the caller keeps a new
// one, wrong "current password" answers are throttled, and nothing secret reaches the audit log.
const env = loadEnv(process.env);
const database = createDatabase(env.DATABASE_URL);
const { db } = database;

const ORIGIN = new URL(env.WEB_ORIGIN).origin;
const PASSWORD = 'correct horse battery staple 42';
const NEW_PASSWORD = 'a completely different passphrase 77';
const EMAIL = 'owner@alpha.test';
const COOKIE = 'axor_rt';

let passwordHash: string;
let app: ReturnType<typeof buildApp>;
let authService: ReturnType<typeof createAuthService> | undefined;
let userId: string;

function newApp() {
  const accessTokens = createAccessTokenService({
    secret: env.JWT_ACCESS_SECRET,
    ttlSeconds: env.ACCESS_TOKEN_TTL_SECONDS,
    issuer: 'axor-api',
    audience: 'axor-web',
  });
  const auth = createAuthService({ db, accessTokens, refreshTtlDays: env.REFRESH_TOKEN_TTL_DAYS });
  authService = auth;
  return buildApp(env, { checkDatabase: () => database.ping(), auth });
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const cookieOf = (res: { cookies: Array<{ name: string; value: string }> }) =>
  res.cookies.find((c) => c.name === COOKIE)?.value;

function login(password = PASSWORD) {
  return app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    headers: { origin: ORIGIN },
    payload: { email: EMAIL, password },
  });
}

async function session() {
  const res = await login();
  expect(res.statusCode).toBe(200);
  return {
    accessToken: res.json<{ data: { accessToken: string } }>().data.accessToken,
    refreshToken: cookieOf(res) as string,
  };
}

function change(
  accessToken: string | null,
  payload: unknown = { currentPassword: PASSWORD, newPassword: NEW_PASSWORD },
  origin: string | null = ORIGIN,
) {
  return app.inject({
    method: 'POST',
    url: '/api/v1/auth/change-password',
    headers: {
      ...(origin === null ? {} : { origin }),
      ...(accessToken === null ? {} : { authorization: `Bearer ${accessToken}` }),
    },
    payload: payload as object,
  });
}

const me = (accessToken: string) =>
  app.inject({
    method: 'GET',
    url: '/api/v1/auth/me',
    headers: { authorization: `Bearer ${accessToken}` },
  });

const refresh = (token: string) =>
  app.inject({
    method: 'POST',
    url: '/api/v1/auth/refresh',
    headers: { origin: ORIGIN, cookie: `${COOKIE}=${token}` },
  });

async function auditActions(): Promise<string[]> {
  await authService?.drain();
  const rows = await db.select().from(schema.auditLogs);
  return rows.map((row) => row.action);
}

beforeAll(async () => {
  expect(new URL(env.DATABASE_URL).pathname).toBe('/axor_test');
  await runMigrations(env.DATABASE_URL);
  passwordHash = await hashPassword(PASSWORD);
});

beforeEach(async () => {
  await authService?.drain();
  await truncateDomainTables(db);
  const tenantId = uuidv7();
  userId = uuidv7();
  await db.insert(schema.tenants).values({ id: tenantId, name: 'alpha' });
  await db
    .insert(schema.users)
    .values({ id: userId, email: EMAIL, passwordHash, tenantId, tenantRole: 'owner' });
  app = newApp();
  await app.ready();
});

afterAll(async () => {
  await authService?.drain();
  await database.close();
});

describe('POST /auth/change-password', () => {
  it('switches the password and keeps the calling device signed in', async () => {
    const { accessToken } = await session();
    const res = await change(accessToken);
    expect(res.statusCode).toBe(200);

    const body = res.json<{ data: { accessToken: string } }>();
    expect(JSON.stringify(body)).not.toContain(NEW_PASSWORD);
    expect(cookieOf(res)).toBeTypeOf('string');
    expect((await me(body.data.accessToken)).statusCode).toBe(200);

    expect((await login(PASSWORD)).statusCode).toBe(401);
    expect((await login(NEW_PASSWORD)).statusCode).toBe(200);

    const [row] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
    expect(row?.passwordChangedAt).not.toBeNull();
    expect(row?.passwordHash).not.toBe(passwordHash);
  });

  it('signs out every other device: refresh tokens and older access tokens stop working', async () => {
    const phone = await session();
    const laptop = await session();
    // JWT `iat` has one-second precision: make sure the old tokens predate the change.
    await sleep(1100);

    const res = await change(laptop.accessToken);
    expect(res.statusCode).toBe(200);

    expect((await refresh(phone.refreshToken)).statusCode).toBe(401);
    expect((await refresh(laptop.refreshToken)).statusCode).toBe(401);
    expect((await me(phone.accessToken)).statusCode).toBe(401);
    expect((await me(laptop.accessToken)).statusCode).toBe(401);

    const fresh = res.json<{ data: { accessToken: string } }>().data.accessToken;
    expect((await me(fresh)).statusCode).toBe(200);
    expect((await refresh(cookieOf(res) as string)).statusCode).toBe(200);
  });

  it('rejects a wrong current password, changes nothing and audits it without secrets', async () => {
    const { accessToken } = await session();
    const res = await change(accessToken, {
      currentPassword: 'not the password at all 99',
      newPassword: NEW_PASSWORD,
    });
    expect(res.statusCode).toBe(400);
    expect(res.json<{ error: { code: string } }>().error.code).toBe('INVALID_CURRENT_PASSWORD');

    const [row] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
    expect(row?.passwordHash).toBe(passwordHash);
    expect(row?.passwordChangedAt).toBeNull();
    expect((await login(PASSWORD)).statusCode).toBe(200);

    expect(await auditActions()).toContain('auth.password_change_failed');
    const dump = JSON.stringify(await db.select().from(schema.auditLogs));
    expect(dump).not.toContain(NEW_PASSWORD);
    expect(dump).not.toContain('not the password at all');
  });

  it('throttles wrong current-password guesses, even when the next one is right', async () => {
    const { accessToken } = await session();
    for (let i = 0; i < 5; i += 1) {
      const res = await change(accessToken, { currentPassword: `wrong guess number ${i}!`, newPassword: NEW_PASSWORD });
      expect(res.statusCode).toBe(400);
    }
    const blocked = await change(accessToken);
    expect(blocked.statusCode).toBe(429);
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
    expect((await login(PASSWORD)).statusCode).toBe(200);
  });

  it('enforces the password policy and rejects reusing the current password', async () => {
    const { accessToken } = await session();
    const weak = await change(accessToken, { currentPassword: PASSWORD, newPassword: 'short' });
    expect(weak.statusCode).toBe(400);
    const details = weak.json<{ error: { code: string; details: Array<{ path: string }> } }>().error;
    expect(details.code).toBe('VALIDATION_ERROR');
    expect(details.details.map((d) => d.path)).toContain('newPassword');

    const same = await change(accessToken, { currentPassword: PASSWORD, newPassword: PASSWORD });
    expect(same.statusCode).toBe(400);

    const withEmail = await change(accessToken, {
      currentPassword: PASSWORD,
      newPassword: `${EMAIL} is my password`,
    });
    expect(withEmail.statusCode).toBe(400);
    expect((await login(PASSWORD)).statusCode).toBe(200);
  });

  it('requires authentication, a trusted Origin and a strict body', async () => {
    const { accessToken } = await session();
    expect((await change(null)).statusCode).toBe(401);
    expect((await change(accessToken, undefined, null)).statusCode).toBe(403);
    expect((await change(accessToken, undefined, 'https://evil.example')).statusCode).toBe(403);
    const extra = await change(accessToken, {
      currentPassword: PASSWORD,
      newPassword: NEW_PASSWORD,
      role: 'owner',
    });
    expect(extra.statusCode).toBe(400);
    expect((await login(PASSWORD)).statusCode).toBe(200);
  });

  it('audits a successful change', async () => {
    const { accessToken } = await session();
    expect((await change(accessToken)).statusCode).toBe(200);
    expect(await auditActions()).toContain('auth.password_changed');
  });
});
