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

// A person edits only their own display name (ADR-0013), on a real MariaDB (axor_test).
const env = loadEnv(process.env);
const database = createDatabase(env.DATABASE_URL);
const { db } = database;

const ORIGIN = new URL(env.WEB_ORIGIN).origin;
const PASSWORD = 'correct horse battery staple 42';
const EMAIL = 'owner@alpha.test';
const OTHER_EMAIL = 'member@alpha.test';

let app: ReturnType<typeof buildApp>;
let authService: ReturnType<typeof createAuthService> | undefined;
let userId: string;
let otherUserId: string;

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

function patch(accessToken: string | null, payload: unknown, origin: string | null = ORIGIN) {
  return app.inject({
    method: 'PATCH',
    url: '/api/v1/auth/me',
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

async function storedName(id: string): Promise<string | null | undefined> {
  const [row] = await db.select().from(schema.users).where(eq(schema.users.id, id));
  return row?.fullName;
}

beforeAll(async () => {
  expect(new URL(env.DATABASE_URL).pathname).toBe('/axor_test');
  await runMigrations(env.DATABASE_URL);
});

beforeEach(async () => {
  await authService?.drain();
  await truncateDomainTables(db);
  const tenantId = uuidv7();
  userId = uuidv7();
  otherUserId = uuidv7();
  const passwordHash = await hashPassword(PASSWORD);
  await db.insert(schema.tenants).values({ id: tenantId, name: 'alpha' });
  await db.insert(schema.users).values([
    { id: userId, email: EMAIL, passwordHash, tenantId, tenantRole: 'owner' },
    { id: otherUserId, email: OTHER_EMAIL, passwordHash, tenantId, tenantRole: 'member' },
  ]);
  app = newApp();
  await app.ready();
});

afterAll(async () => {
  await authService?.drain();
  await database.close();
});

describe('PATCH /auth/me', () => {
  it('starts without a name, sets one, shows it on /auth/me, and trims it', async () => {
    const token = await tokenFor(EMAIL);
    expect((await me(token)).json<{ data: { fullName: string | null } }>().data.fullName).toBeNull();

    const res = await patch(token, { fullName: '  منى السيد  ' });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ data: { fullName: string; email: string } }>().data).toMatchObject({
      fullName: 'منى السيد',
      email: EMAIL,
    });
    expect(await storedName(userId)).toBe('منى السيد');
    expect((await me(token)).json<{ data: { fullName: string } }>().data.fullName).toBe('منى السيد');
  });

  it('clears the name with null or an empty string', async () => {
    const token = await tokenFor(EMAIL);
    await patch(token, { fullName: 'Mona' });
    expect((await patch(token, { fullName: null })).statusCode).toBe(200);
    expect(await storedName(userId)).toBeNull();
    await patch(token, { fullName: 'Mona' });
    expect((await patch(token, { fullName: '   ' })).statusCode).toBe(200);
    expect(await storedName(userId)).toBeNull();
  });

  it('only ever changes the caller’s own row', async () => {
    const token = await tokenFor(EMAIL);
    await patch(token, { fullName: 'Owner Name' });
    expect(await storedName(otherUserId)).toBeNull();
  });

  it('rejects every field except fullName, so role, status and email cannot be set here', async () => {
    const token = await tokenFor(EMAIL);
    for (const extra of [
      { tenantRole: 'owner' },
      { status: 'active' },
      { email: 'x@y.test' },
      { userId: otherUserId },
      { passwordHash: 'x' },
    ]) {
      const res = await patch(token, { fullName: 'Mona', ...extra });
      expect(res.statusCode, JSON.stringify(extra)).toBe(400);
    }
    expect(await storedName(userId)).toBeNull();
  });

  it('refuses a name that is too long, not a string, or has control characters', async () => {
    const token = await tokenFor(EMAIL);
    for (const fullName of ['x'.repeat(101), 42, 'bad\u0000name', 'line\nbreak', undefined]) {
      const res = await patch(token, fullName === undefined ? {} : { fullName });
      expect(res.statusCode, String(fullName)).toBe(400);
    }
    expect((await patch(token, { fullName: 'x'.repeat(100) })).statusCode).toBe(200);
  });

  it('needs a signed-in caller and a trusted origin', async () => {
    const token = await tokenFor(EMAIL);
    expect((await patch(null, { fullName: 'Mona' })).statusCode).toBe(401);
    expect((await patch(token, { fullName: 'Mona' }, 'https://evil.example')).statusCode).toBe(403);
    expect((await patch(token, { fullName: 'Mona' }, null)).statusCode).toBe(403);
    expect(await storedName(userId)).toBeNull();
  });

  it('records that the name changed, without the name itself', async () => {
    const token = await tokenFor(EMAIL);
    await patch(token, { fullName: 'Secret Person' });
    await authService?.drain();
    const rows = await db
      .select()
      .from(schema.auditLogs)
      .where(eq(schema.auditLogs.action, 'auth.profile_updated'));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ actorUserId: userId, metadata: { field: 'full_name', cleared: false } });
    expect(JSON.stringify(rows[0])).not.toContain('Secret Person');
  });
});
