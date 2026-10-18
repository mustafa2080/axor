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
import { hashRefreshToken } from './refresh-token.js';

// End-to-end auth flow on a real MariaDB (axor_test): login, refresh rotation, reuse detection,
// logout, uniform failures, CSRF origin check and brute-force throttling (ADR-0004).
const env = loadEnv(process.env);
const database = createDatabase(env.DATABASE_URL);
const { db } = database;

const ORIGIN = new URL(env.WEB_ORIGIN).origin;
const PASSWORD = 'correct horse battery staple 42';
const COOKIE = 'axor_rt';

let passwordHash: string;
let app: ReturnType<typeof buildApp>;
let tenantId: string;

function newApp(appEnv = env) {
  const accessTokens = createAccessTokenService({
    secret: appEnv.JWT_ACCESS_SECRET,
    ttlSeconds: appEnv.ACCESS_TOKEN_TTL_SECONDS,
    issuer: 'axor-api',
    audience: 'axor-web',
  });
  const auth = createAuthService({ db, accessTokens, refreshTtlDays: appEnv.REFRESH_TOKEN_TTL_DAYS });
  return buildApp(appEnv, { checkDatabase: () => database.ping(), auth });
}

async function seedUsers(): Promise<void> {
  tenantId = uuidv7();
  const suspendedTenantId = uuidv7();
  await db.insert(schema.tenants).values([
    { id: tenantId, name: 'alpha' },
    { id: suspendedTenantId, name: 'frozen', status: 'suspended' },
  ]);
  await db.insert(schema.users).values([
    { id: uuidv7(), email: 'owner@alpha.test', passwordHash, tenantId, tenantRole: 'owner' },
    {
      id: uuidv7(),
      email: 'disabled@alpha.test',
      passwordHash,
      status: 'disabled',
      tenantId,
      tenantRole: 'member',
    },
    {
      id: uuidv7(),
      email: 'frozen@frozen.test',
      passwordHash,
      tenantId: suspendedTenantId,
      tenantRole: 'owner',
    },
    { id: uuidv7(), email: 'staff@axor.test', passwordHash, platformRole: 'support' },
  ]);
}

// `origin: null` means "send no Origin header" (undefined would fall back to the trusted default).
function login(email: string, password = PASSWORD, origin: string | null = ORIGIN) {
  return app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    headers: origin === null ? {} : { origin },
    payload: { email, password },
  });
}

function refresh(token: string | undefined, origin: string | null = ORIGIN) {
  return app.inject({
    method: 'POST',
    url: '/api/v1/auth/refresh',
    headers: {
      ...(origin === null ? {} : { origin }),
      ...(token === undefined ? {} : { cookie: `${COOKIE}=${token}` }),
    },
  });
}

function me(accessToken: string) {
  return app.inject({
    method: 'GET',
    url: '/api/v1/auth/me',
    headers: { authorization: `Bearer ${accessToken}` },
  });
}

const cookieOf = (res: { cookies: Array<{ name: string; value: string }> }) =>
  res.cookies.find((c) => c.name === COOKIE)?.value;

async function loggedIn(email = 'owner@alpha.test') {
  const res = await login(email);
  expect(res.statusCode).toBe(200);
  const body = res.json<{ data: { accessToken: string } }>();
  const token = cookieOf(res);
  expect(token).toBeTypeOf('string');
  return { accessToken: body.data.accessToken, refreshToken: token as string, res };
}

beforeAll(async () => {
  expect(new URL(env.DATABASE_URL).pathname).toBe('/axor_test');
  await runMigrations(env.DATABASE_URL);
  passwordHash = await hashPassword(PASSWORD);
});

beforeEach(async () => {
  await truncateDomainTables(db);
  await seedUsers();
  // Fresh app per test: the throttles and rate limiter live in memory.
  app = newApp();
  await app.ready();
});

afterAll(async () => {
  await database.close();
});

describe('login', () => {
  it('issues an access token in the body and the refresh token only in an HttpOnly cookie', async () => {
    const { res, refreshToken } = await loggedIn();
    const body = res.json<{ data: Record<string, unknown> }>();

    expect(body.data['user']).toMatchObject({
      email: 'owner@alpha.test',
      kind: 'tenant',
      role: 'owner',
      tenantId,
    });
    expect(res.body).not.toContain(refreshToken);
    expect(res.body).not.toContain('passwordHash');
    expect(res.headers['cache-control']).toBe('no-store');

    const setCookie = String(res.headers['set-cookie']);
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Strict');
    expect(setCookie).toContain('Path=/api/v1/auth');
  });

  it('stores only the SHA-256 digest of the refresh token', async () => {
    const { refreshToken } = await loggedIn();
    const rows = await db.select().from(schema.refreshSessions);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.tokenHash).toBe(hashRefreshToken(refreshToken));
    expect(rows[0]?.tokenHash).not.toBe(refreshToken);
  });

  it('signs platform staff in without a company', async () => {
    const { res } = await loggedIn('staff@axor.test');
    expect(res.json<{ data: { user: unknown } }>().data.user).toMatchObject({
      kind: 'platform',
      role: 'support',
      tenantId: null,
    });
  });

  it('normalizes the email before lookup', async () => {
    expect((await login('  OWNER@Alpha.TEST ')).statusCode).toBe(200);
  });

  it('returns the SAME 401 for wrong password, unknown email, disabled user and suspended company', async () => {
    const attempts = [
      await login('owner@alpha.test', 'wrong password entirely'),
      await login('nobody@alpha.test'),
      await login('disabled@alpha.test'),
      await login('frozen@frozen.test'),
    ];
    for (const res of attempts) {
      expect(res.statusCode).toBe(401);
      expect(res.headers['set-cookie']).toBeUndefined();
    }
    const bodies = new Set(attempts.map((r) => JSON.stringify(r.json())));
    expect(bodies.size).toBe(1);
  });

  it('rejects unexpected fields and malformed input with a validation error', async () => {
    const extra = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { origin: ORIGIN },
      payload: { email: 'owner@alpha.test', password: PASSWORD, role: 'owner' },
    });
    expect(extra.statusCode).toBe(400);
    expect(extra.json<{ error: { code: string } }>().error.code).toBe('VALIDATION_ERROR');
    expect(extra.body).not.toContain(PASSWORD);

    const missing = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { origin: ORIGIN },
      payload: {},
    });
    expect(missing.statusCode).toBe(400);
  });
});

describe('CSRF: Origin check on cookie-based endpoints', () => {
  it('rejects a missing or foreign Origin on login, refresh and logout', async () => {
    const { refreshToken } = await loggedIn();
    for (const origin of [null, 'https://evil.example', `${ORIGIN}.evil.example`]) {
      expect((await login('owner@alpha.test', PASSWORD, origin)).statusCode).toBe(403);
      expect((await refresh(refreshToken, origin)).statusCode).toBe(403);
      const out = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/logout',
        headers: {
          ...(origin === null ? {} : { origin }),
          cookie: `${COOKIE}=${refreshToken}`,
        },
      });
      expect(out.statusCode).toBe(403);
    }
    // A rejected cross-site request must not have burned the session.
    expect((await refresh(refreshToken)).statusCode).toBe(200);
  });
});

describe('/auth/me and the authenticate hook', () => {
  it('returns the current identity for a valid access token', async () => {
    const { accessToken } = await loggedIn();
    const res = await me(accessToken);
    expect(res.statusCode).toBe(200);
    expect(res.json<{ data: unknown }>().data).toMatchObject({
      email: 'owner@alpha.test',
      role: 'owner',
    });
  });

  it('rejects a missing, malformed or forged token', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/v1/auth/me' })).statusCode).toBe(401);
    expect((await me('not-a-jwt')).statusCode).toBe(401);
    const { accessToken } = await loggedIn();
    const [h, p] = accessToken.split('.');
    expect((await me(`${h}.${p}.forged-signature`)).statusCode).toBe(401);
  });

  it('stops honoring a valid token as soon as the user is disabled (no stale roles in the JWT)', async () => {
    const { accessToken } = await loggedIn();
    expect((await me(accessToken)).statusCode).toBe(200);
    await db
      .update(schema.users)
      .set({ status: 'disabled' })
      .where(eq(schema.users.email, 'owner@alpha.test'));
    expect((await me(accessToken)).statusCode).toBe(401);
  });

  it('stops honoring a valid token as soon as the company is suspended', async () => {
    const { accessToken } = await loggedIn();
    await db.update(schema.tenants).set({ status: 'suspended' }).where(eq(schema.tenants.id, tenantId));
    expect((await me(accessToken)).statusCode).toBe(401);
  });
});

describe('refresh token rotation', () => {
  it('issues a new refresh token and a working access token, and retires the old token', async () => {
    const first = await loggedIn();
    const res = await refresh(first.refreshToken);
    expect(res.statusCode).toBe(200);

    const second = cookieOf(res);
    expect(second).toBeTypeOf('string');
    expect(second).not.toBe(first.refreshToken);
    expect(res.body).not.toContain(second as string);
    expect((await me(res.json<{ data: { accessToken: string } }>().data.accessToken)).statusCode).toBe(200);

    const rows = await db.select().from(schema.refreshSessions);
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((r) => r.familyId)).size).toBe(1);
    expect(rows.filter((r) => r.revokedAt === null)).toHaveLength(1);
  });

  it('revokes the WHOLE family when an old token is replayed (theft detection)', async () => {
    const first = await loggedIn();
    const rotated = await refresh(first.refreshToken);
    const second = cookieOf(rotated) as string;

    const replay = await refresh(first.refreshToken);
    expect(replay.statusCode).toBe(401);

    // The legitimate newest token is now dead too: the attacker and the user are both signed out.
    const afterReplay = await refresh(second);
    expect(afterReplay.statusCode).toBe(401);
    const rows = await db.select().from(schema.refreshSessions);
    expect(rows.every((r) => r.revokedAt !== null)).toBe(true);
  });

  it('rejects an unknown token, a missing cookie and an expired session, and clears the cookie', async () => {
    expect((await refresh('x'.repeat(43))).statusCode).toBe(401);
    expect((await refresh(undefined)).statusCode).toBe(401);

    const { refreshToken } = await loggedIn();
    await db
      .update(schema.refreshSessions)
      .set({ expiresAt: new Date(Date.now() - 1_000) });
    const expired = await refresh(refreshToken);
    expect(expired.statusCode).toBe(401);
    expect(String(expired.headers['set-cookie'])).toContain(`${COOKIE}=;`);
  });

  it('refuses to refresh for a user disabled after login, and kills the family', async () => {
    const { refreshToken } = await loggedIn();
    await db
      .update(schema.users)
      .set({ status: 'disabled' })
      .where(eq(schema.users.email, 'owner@alpha.test'));
    expect((await refresh(refreshToken)).statusCode).toBe(401);
    const rows = await db.select().from(schema.refreshSessions);
    expect(rows.every((r) => r.revokedAt !== null)).toBe(true);
  });

  it('has exactly one winner when the same token is used concurrently', async () => {
    const { refreshToken } = await loggedIn();
    const results = await Promise.all([refresh(refreshToken), refresh(refreshToken)]);
    const statuses = results.map((r) => r.statusCode).sort();
    expect(statuses).toEqual([200, 401]);
  });
});

describe('logout', () => {
  it('revokes the session, clears the cookie and makes the refresh token useless', async () => {
    const { refreshToken } = await loggedIn();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      headers: { origin: ORIGIN, cookie: `${COOKIE}=${refreshToken}` },
    });
    expect(res.statusCode).toBe(204);
    expect(String(res.headers['set-cookie'])).toContain(`${COOKIE}=;`);
    expect((await refresh(refreshToken)).statusCode).toBe(401);
  });

  it('is idempotent: no cookie or an unknown token is still a 204', async () => {
    for (const cookie of [undefined, `${COOKIE}=${'y'.repeat(43)}`]) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/logout',
        headers: { origin: ORIGIN, ...(cookie === undefined ? {} : { cookie }) },
      });
      expect(res.statusCode).toBe(204);
    }
  });
});

describe('brute-force protection', () => {
  it('blocks after 5 failures for the same ip+email, even with the right password, with Retry-After', async () => {
    for (let i = 0; i < 5; i += 1) {
      expect((await login('owner@alpha.test', `wrong password number ${i}`)).statusCode).toBe(401);
    }
    const blocked = await login('owner@alpha.test');
    expect(blocked.statusCode).toBe(429);
    expect(blocked.json<{ error: { code: string } }>().error.code).toBe('TOO_MANY_REQUESTS');
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('throttles an unknown email exactly the same way (no account enumeration)', async () => {
    for (let i = 0; i < 5; i += 1) {
      expect((await login('ghost@alpha.test', `wrong ${i}`)).statusCode).toBe(401);
    }
    expect((await login('ghost@alpha.test')).statusCode).toBe(429);
  });

  it('a successful login resets the per-ip counter', async () => {
    for (let i = 0; i < 4; i += 1) await login('owner@alpha.test', `wrong ${i}`);
    expect((await login('owner@alpha.test')).statusCode).toBe(200);
    for (let i = 0; i < 4; i += 1) {
      expect((await login('owner@alpha.test', `wrong again ${i}`)).statusCode).toBe(401);
    }
  });

  it('applies a per-IP ceiling to all auth routes', async () => {
    const codes: number[] = [];
    for (let i = 0; i < 31; i += 1) {
      codes.push((await refresh(undefined)).statusCode);
    }
    expect(codes.slice(0, 30).every((c) => c === 401)).toBe(true);
    expect(codes[30]).toBe(429);
  });
});

describe('production cookie attributes', () => {
  it('uses the __Secure- prefix and the Secure flag', async () => {
    const prodEnv = loadEnv({ ...process.env, NODE_ENV: 'production', LOG_LEVEL: 'silent' });
    const prodApp = newApp(prodEnv);
    await prodApp.ready();
    try {
      const res = await prodApp.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        headers: { origin: ORIGIN },
        payload: { email: 'owner@alpha.test', password: PASSWORD },
      });
      expect(res.statusCode).toBe(200);
      const setCookie = String(res.headers['set-cookie']);
      expect(setCookie).toContain('__Secure-axor_rt=');
      expect(setCookie).toContain('Secure');
      expect(setCookie).toContain('HttpOnly');
      expect(setCookie).toContain('SameSite=Strict');
    } finally {
      await prodApp.close();
    }
  });
});

describe('register', () => {
  const GOOD = { companyName: 'Beta Logistics', email: 'founder@beta.test', password: PASSWORD };

  function register(payload: Record<string, unknown>, origin: string | null = ORIGIN) {
    return app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers: origin === null ? {} : { origin },
      payload,
    });
  }
  const count = async (table: typeof schema.tenants | typeof schema.users) =>
    (await db.select().from(table)).length;

  it('creates the company and its owner in one go and signs the owner in', async () => {
    const res = await register({ ...GOOD, companyName: '  Beta Logistics  ', email: ' Founder@Beta.TEST ' });
    expect(res.statusCode).toBe(201);
    expect(res.headers['cache-control']).toBe('no-store');

    const refreshToken = cookieOf(res);
    expect(refreshToken).toBeTypeOf('string');
    expect(res.body).not.toContain(refreshToken as string);
    expect(res.body).not.toContain(PASSWORD);
    const body = res.json<{ data: { accessToken: string; user: Record<string, unknown> } }>();
    expect(body.data.user).toMatchObject({ email: 'founder@beta.test', kind: 'tenant', role: 'owner' });

    const [tenant] = await db
      .select()
      .from(schema.tenants)
      .where(eq(schema.tenants.id, body.data.user['tenantId'] as string));
    expect(tenant).toMatchObject({ name: 'Beta Logistics', status: 'active' });

    const [user] = await db.select().from(schema.users).where(eq(schema.users.email, 'founder@beta.test'));
    expect(user?.passwordHash?.startsWith('$argon2id$')).toBe(true);
    expect(user).toMatchObject({ tenantRole: 'owner', platformRole: null, status: 'active' });

    // The returned tokens really work.
    expect((await me(body.data.accessToken)).statusCode).toBe(200);
    expect((await refresh(refreshToken)).statusCode).toBe(200);
  });

  it('writes an audit record for the new company, without credentials', async () => {
    const res = await register(GOOD);
    const tenantIdOfOwner = res.json<{ data: { user: { tenantId: string } } }>().data.user.tenantId;
    const rows = await db
      .select()
      .from(schema.auditLogs)
      .where(eq(schema.auditLogs.tenantId, tenantIdOfOwner));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ action: 'tenant.registered', targetType: 'tenant' });
    expect(JSON.stringify(rows[0])).not.toContain(PASSWORD);
  });

  it('rejects client-supplied role, tenant or status instead of ignoring them (mass assignment)', async () => {
    for (const extra of [
      { role: 'owner' },
      { tenantRole: 'owner' },
      { platformRole: 'owner' },
      { tenantId: tenantId },
      { status: 'active' },
    ]) {
      const res = await register({ ...GOOD, ...extra });
      expect(res.statusCode).toBe(400);
      expect(res.json<{ error: { code: string } }>().error.code).toBe('VALIDATION_ERROR');
    }
    expect(await count(schema.tenants)).toBe(2);
    expect(await count(schema.users)).toBe(4);
  });

  it('enforces the password policy and never echoes the password', async () => {
    for (const password of ['Short1!', 'password1234', 'founder@beta.test-1', 'x'.repeat(129)]) {
      const res = await register({ ...GOOD, password });
      expect(res.statusCode).toBe(400);
      const body = res.json<{ error: { code: string; details: Array<{ path: string }> } }>();
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.details[0]?.path).toBe('password');
      expect(res.body).not.toContain(password);
    }
    expect(await count(schema.tenants)).toBe(2);
  });

  it('validates the email and the company name', async () => {
    for (const bad of [
      { email: 'not-an-email' },
      { email: '' },
      { companyName: 'x' },
      { companyName: '   ' },
      { companyName: 'bad\u0000name' },
      { companyName: 'x'.repeat(201) },
    ]) {
      expect((await register({ ...GOOD, ...bad })).statusCode).toBe(400);
    }
    expect(await count(schema.tenants)).toBe(2);
  });

  it('answers 409 for a taken email (any case) and leaves NO half-created company behind', async () => {
    for (const email of ['owner@alpha.test', 'OWNER@ALPHA.TEST']) {
      const res = await register({ ...GOOD, email });
      expect(res.statusCode).toBe(409);
      expect(res.headers['set-cookie']).toBeUndefined();
    }
    // The tenant insert ran before the user insert failed: the transaction must have rolled it back.
    expect(await count(schema.tenants)).toBe(2);
    expect(await count(schema.users)).toBe(4);
  });

  it('has exactly one winner when the same email registers concurrently', async () => {
    const results = await Promise.all([register(GOOD), register(GOOD)]);
    expect(results.map((r) => r.statusCode).sort()).toEqual([201, 409]);
    expect(await count(schema.tenants)).toBe(3);
  });

  it('rejects a missing or foreign Origin without creating anything', async () => {
    for (const origin of [null, 'https://evil.example']) {
      expect((await register(GOOD, origin)).statusCode).toBe(403);
    }
    expect(await count(schema.tenants)).toBe(2);
  });

  it('limits registrations per IP, with Retry-After', async () => {
    for (let i = 0; i < 5; i += 1) {
      expect((await register({ ...GOOD, email: `founder${i}@beta.test` })).statusCode).toBe(201);
    }
    const blocked = await register({ ...GOOD, email: 'founder99@beta.test' });
    expect(blocked.statusCode).toBe(429);
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
    expect(await count(schema.tenants)).toBe(7);
  });
});
