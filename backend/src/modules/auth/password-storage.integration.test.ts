import { eq, sql } from 'drizzle-orm';
import type { MySqlTable } from 'drizzle-orm/mysql-core';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../app.js';
import { loadEnv } from '../../config/env.js';
import { createDatabase } from '../../database/client.js';
import { runMigrations } from '../../database/migrate.js';
import * as schema from '../../database/schema/index.js';
import { DOMAIN_TABLES, truncateDomainTables } from '../../test/db-helpers.js';
import { createAccessTokenService } from './access-token.js';
import { createAuthService } from './auth.service.js';
import { verifyPassword } from './password.js';

// What actually ends up in MariaDB (axor_test) and in API responses after real registrations and a
// password change: an Argon2id hash with the documented parameters and a fresh salt per user, and
// the password itself (or an easy re-encoding of it) nowhere in any table or any response.
const env = loadEnv(process.env);
const database = createDatabase(env.DATABASE_URL);
const { db } = database;

const ORIGIN = new URL(env.WEB_ORIGIN).origin;
const PASSWORD = 'correct horse battery staple 42';
const NEW_PASSWORD = 'a completely different passphrase 77';
const ARABIC_PASSWORD = 'كلمة سر طويلة وغريبة جدا 2026';
const HASH_SHAPE = /^\$argon2id\$v=19\$m=19456,t=2,p=1\$[A-Za-z0-9+/]+\$[A-Za-z0-9+/]+$/;

// Every domain table, so a new table that starts holding a password is scanned too.
const TABLES: Record<(typeof DOMAIN_TABLES)[number], MySqlTable> = {
  audit_logs: schema.auditLogs,
  idempotency_keys: schema.idempotencyKeys,
  trial_claims: schema.trialClaims,
  subscription_events: schema.subscriptionEvents,
  subscriptions: schema.subscriptions,
  refresh_sessions: schema.refreshSessions,
  users: schema.users,
  plan_versions: schema.planVersions,
  plans: schema.plans,
  business_activities: schema.businessActivities,
  products: schema.products,
  tenants: schema.tenants,
};

let app: ReturnType<typeof buildApp>;
let authService: ReturnType<typeof createAuthService> | undefined;

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

type Reply = Awaited<ReturnType<typeof app.inject>>;
const seen: Reply[] = [];

async function call(
  method: 'GET' | 'POST',
  url: string,
  payload?: object,
  accessToken?: string,
): Promise<Reply> {
  const res = await app.inject({
    method,
    url: `/api/v1/auth/${url}`,
    headers: {
      origin: ORIGIN,
      ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
    },
    ...(payload ? { payload } : {}),
  });
  seen.push(res);
  return res;
}

const register = (companyName: string, email: string, password: string) =>
  call('POST', 'register', { companyName, email, password });
const tokenOf = (res: Reply) => res.json<{ data: { accessToken: string } }>().data.accessToken;

async function hashOf(email: string): Promise<string> {
  const [row] = await db
    .select({ hash: schema.users.passwordHash })
    .from(schema.users)
    .where(eq(schema.users.email, email));
  expect(row?.hash, `no password hash for ${email}`).toBeTruthy();
  return row?.hash as string;
}

/** Everything stored in the database, one JSON string per table. */
async function dumpAll(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const [name, table] of Object.entries(TABLES)) {
    out[name] = JSON.stringify(await db.select().from(table));
  }
  return out;
}

/** The password and the encodings someone might call "hashing": base64, hex, URL-encoding, reversed. */
function variantsOf(password: string): string[] {
  const bytes = Buffer.from(password, 'utf8');
  return [
    password,
    bytes.toString('base64'),
    bytes.toString('base64url'),
    bytes.toString('hex'),
    encodeURIComponent(password),
    [...password].reverse().join(''),
  ];
}

beforeAll(async () => {
  expect(new URL(env.DATABASE_URL).pathname).toBe('/axor_test');
  await runMigrations(env.DATABASE_URL);
});

beforeEach(async () => {
  await authService?.drain();
  await truncateDomainTables(db);
  seen.length = 0;
  app = newApp();
  await app.ready();
});

afterAll(async () => {
  await authService?.drain();
  await database.close();
});

describe('password storage', () => {
  it('scans every table that exists, so the scan below cannot miss one', async () => {
    const [rows] = (await db.execute(
      sql`SELECT table_name AS name FROM information_schema.tables WHERE table_schema = DATABASE()`,
    )) as unknown as [Array<{ name: string }>, unknown];
    const existing = rows.map((row) => row.name).filter((name) => name !== '__drizzle_migrations');
    expect(existing.sort()).toEqual([...DOMAIN_TABLES].sort());
    expect(Object.keys(TABLES).sort()).toEqual([...DOMAIN_TABLES].sort());
  });

  it('stores an Argon2id hash with the documented cost and a fresh salt for every user', async () => {
    expect((await register('Gamma Co', 'a@gamma.test', PASSWORD)).statusCode).toBe(201);
    expect((await register('Delta Co', 'b@delta.test', PASSWORD)).statusCode).toBe(201);
    expect((await register('Sigma Co', 'c@sigma.test', ARABIC_PASSWORD)).statusCode).toBe(201);
    const [a, b, c] = [
      await hashOf('a@gamma.test'),
      await hashOf('b@delta.test'),
      await hashOf('c@sigma.test'),
    ];
    for (const hash of [a, b, c]) expect(hash).toMatch(HASH_SHAPE);
    // Same password, different users: different salt, so the stored strings differ.
    expect(a).not.toBe(b);
    expect(await verifyPassword(a, PASSWORD)).toBe(true);
    expect(await verifyPassword(b, PASSWORD)).toBe(true);
    expect(await verifyPassword(c, ARABIC_PASSWORD)).toBe(true);
    expect(await verifyPassword(a, ARABIC_PASSWORD)).toBe(false);
  });

  it('replaces the hash on a password change and keeps no copy of either password anywhere', async () => {
    const reg = await register('Gamma Co', 'a@gamma.test', PASSWORD);
    await register('Delta Co', 'b@delta.test', ARABIC_PASSWORD);
    expect(reg.statusCode).toBe(201);
    const before = await hashOf('a@gamma.test');

    const login = await call('POST', 'login', { email: 'a@gamma.test', password: PASSWORD });
    expect(login.statusCode).toBe(200);
    const changed = await call(
      'POST',
      'change-password',
      { currentPassword: PASSWORD, newPassword: NEW_PASSWORD },
      tokenOf(login),
    );
    expect(changed.statusCode).toBe(200);
    // A wrong current password is rejected and must not leave a trace either.
    const wrong = await call(
      'POST',
      'change-password',
      { currentPassword: 'not the password at all 99', newPassword: NEW_PASSWORD },
      tokenOf(await call('POST', 'login', { email: 'a@gamma.test', password: NEW_PASSWORD })),
    );
    expect(wrong.statusCode).toBeGreaterThanOrEqual(400);
    await authService?.drain();

    const after = await hashOf('a@gamma.test');
    expect(after).toMatch(HASH_SHAPE);
    expect(after).not.toBe(before);
    expect(await verifyPassword(after, NEW_PASSWORD)).toBe(true);
    expect(await verifyPassword(after, PASSWORD)).toBe(false);

    const dump = await dumpAll();
    const secrets = [PASSWORD, NEW_PASSWORD, ARABIC_PASSWORD, 'not the password at all 99'];
    for (const [table, content] of Object.entries(dump)) {
      for (const secret of secrets) {
        for (const variant of variantsOf(secret)) {
          expect(content, `${table} contains ${variant === secret ? 'a password' : 'an encoded password'}`).not.toContain(variant);
        }
      }
    }
    // The old hash is gone, not archived anywhere.
    for (const [table, content] of Object.entries(dump)) {
      expect(content, `${table} still holds the replaced hash`).not.toContain(before);
    }
  });

  it('never returns a hash or a password in any response or header', async () => {
    await register('Gamma Co', 'a@gamma.test', PASSWORD);
    const login = await call('POST', 'login', { email: 'a@gamma.test', password: PASSWORD });
    const token = tokenOf(login);
    await call('GET', 'me', undefined, token);
    await call('POST', 'change-password', { currentPassword: PASSWORD, newPassword: NEW_PASSWORD }, token);
    await call('POST', 'login', { email: 'a@gamma.test', password: 'wrong wrong wrong wrong 1' });
    await call('POST', 'login', { email: 'nobody@gamma.test', password: PASSWORD });
    expect(seen.length).toBeGreaterThanOrEqual(6);
    for (const res of seen) {
      const text = `${res.body}\n${JSON.stringify(res.headers)}`;
      expect(text).not.toMatch(/argon2|password_?hash/i);
      for (const secret of [PASSWORD, NEW_PASSWORD]) {
        for (const variant of variantsOf(secret)) expect(text).not.toContain(variant);
      }
    }
  });
});
