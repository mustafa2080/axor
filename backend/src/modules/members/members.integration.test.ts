import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../app.js';
import { AppError } from '../../common/errors.js';
import { uuidv7 } from '../../common/id.js';
import { loadEnv } from '../../config/env.js';
import { createDatabase } from '../../database/client.js';
import { runMigrations } from '../../database/migrate.js';
import { createMembersRepository } from '../../database/repositories/members.repository.js';
import * as schema from '../../database/schema/index.js';
import { truncateDomainTables } from '../../test/db-helpers.js';
import { createAccessTokenService } from '../auth/access-token.js';
import { createAuthService } from '../auth/auth.service.js';
import { hashPassword } from '../auth/password.js';
import { requireTenantScope } from '../authz/tenant-scope.js';

// /members on a real MariaDB (axor_test): who may see and change a company's people (ADR-0011),
// the "never leave a company without an owner" rule (also under concurrency), that disabling ends
// every session at once, that nothing crosses into another company, and that every change leaves
// an audit row.
const env = loadEnv(process.env);
const database = createDatabase(env.DATABASE_URL);
const { db } = database;

const PASSWORD = 'correct horse battery staple 42';
const ORIGIN = new URL(env.WEB_ORIGIN).origin;

let app: ReturnType<typeof buildApp>;
let authService: ReturnType<typeof createAuthService> | undefined;
let passwordHash: string;
const tokenCache = new Map<string, string>();
const ids = {
  tenantA: '',
  tenantB: '',
  owner: '',
  admin: '',
  admin2: '',
  member: '',
  readOnly: '',
  ownerB: '',
  memberB: '',
};

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
    members: createMembersRepository(db),
  });
}

async function loginResponse(email: string) {
  return app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    headers: { origin: ORIGIN },
    payload: { email, password: PASSWORD },
  });
}

async function login(email: string): Promise<string> {
  const cached = tokenCache.get(email);
  if (cached !== undefined) return cached;
  const res = await loginResponse(email);
  expect(res.statusCode).toBe(200);
  const token = res.json<{ data: { accessToken: string } }>().data.accessToken;
  tokenCache.set(email, token);
  return token;
}

type Method = 'GET' | 'PATCH' | 'POST';
async function call(
  method: Method,
  path: string,
  as: string | null,
  payload?: Record<string, unknown>,
  headers: Record<string, string> = {},
) {
  const token = as === null ? null : await login(as);
  return app.inject({
    method,
    url: `/api/v1${path}`,
    headers: { ...(token !== null && { authorization: `Bearer ${token}` }), ...headers },
    ...(payload !== undefined && { payload }),
  });
}

type Member = { id: string; email: string; status: string; tenantRole: string };
const data = (res: { json: <T>() => T }) => res.json<{ data: Member }>().data;

const auditRows = (action: string) =>
  db.select().from(schema.auditLogs).where(eq(schema.auditLogs.action, action));
const roleOf = async (id: string) =>
  (await db.select().from(schema.users).where(eq(schema.users.id, id)))[0]?.tenantRole;
const statusOf = async (id: string) =>
  (await db.select().from(schema.users).where(eq(schema.users.id, id)))[0]?.status;

beforeAll(async () => {
  expect(new URL(env.DATABASE_URL).pathname).toBe('/axor_test');
  await runMigrations(env.DATABASE_URL);
  passwordHash = await hashPassword(PASSWORD);
});

beforeEach(async () => {
  await authService?.drain();
  await truncateDomainTables(db);
  tokenCache.clear();
  for (const key of Object.keys(ids) as Array<keyof typeof ids>) ids[key] = uuidv7();
  await db.insert(schema.tenants).values([
    { id: ids.tenantA, name: 'alpha' },
    { id: ids.tenantB, name: 'beta' },
  ]);
  const company = (
    id: string,
    email: string,
    tenantId: string,
    tenantRole: schema.TenantRole,
  ) => ({ id, email, passwordHash, tenantId, tenantRole });
  await db.insert(schema.users).values([
    company(ids.owner, 'owner@alpha.test', ids.tenantA, 'owner'),
    company(ids.admin, 'admin@alpha.test', ids.tenantA, 'admin'),
    company(ids.admin2, 'admin2@alpha.test', ids.tenantA, 'admin'),
    company(ids.member, 'member@alpha.test', ids.tenantA, 'member'),
    company(ids.readOnly, 'readonly@alpha.test', ids.tenantA, 'read_only'),
    company(ids.ownerB, 'owner@beta.test', ids.tenantB, 'owner'),
    company(ids.memberB, 'member@beta.test', ids.tenantB, 'member'),
    { id: uuidv7(), email: 'staff@axor.test', passwordHash, platformRole: 'admin' as const },
  ]);
  app = newApp();
});

afterAll(async () => {
  await authService?.drain();
  await database.close();
});

describe('listing members', () => {
  it('needs a token, and company access (platform staff have no company of their own)', async () => {
    expect((await call('GET', '/members', null)).statusCode).toBe(401);
    expect((await call('GET', '/members', 'staff@axor.test')).statusCode).toBe(403);
  });

  it('lets owner, admin and member read, but not read_only', async () => {
    for (const email of ['owner@alpha.test', 'admin@alpha.test', 'member@alpha.test']) {
      const res = await call('GET', '/members', email);
      expect(res.statusCode, email).toBe(200);
      expect(res.headers['cache-control']).toBe('no-store');
    }
    expect((await call('GET', '/members', 'readonly@alpha.test')).statusCode).toBe(403);
  });

  it('returns only the caller\u2019s own company and never credentials', async () => {
    const res = await call('GET', '/members', 'owner@alpha.test');
    const list = res.json<{ data: Member[] }>().data;
    expect(list.map((entry) => entry.email).sort()).toEqual([
      'admin2@alpha.test',
      'admin@alpha.test',
      'member@alpha.test',
      'owner@alpha.test',
      'readonly@alpha.test',
    ]);
    expect(res.body).not.toContain(passwordHash);
    expect(res.body).not.toMatch(/passwordHash|password_hash|tenantId|platformRole/);
  });

  it('pages with limit and offset, and rejects unknown or oversized query values', async () => {
    const first = await call('GET', '/members?limit=2&offset=0', 'owner@alpha.test');
    const second = await call('GET', '/members?limit=2&offset=2', 'owner@alpha.test');
    const a = first.json<{ data: Member[]; meta: { limit: number; offset: number } }>();
    const b = second.json<{ data: Member[] }>();
    expect(a.data).toHaveLength(2);
    expect(a.meta).toEqual({ limit: 2, offset: 0 });
    expect(b.data.map((entry) => entry.id)).not.toContain(a.data[0]?.id);
    for (const query of ['?foo=1', '?limit=1000', '?offset=-1']) {
      expect((await call('GET', `/members${query}`, 'owner@alpha.test')).statusCode, query).toBe(400);
    }
  });
});

describe('changing a role', () => {
  it('lets the owner promote a member to admin, and writes one audit row', async () => {
    const res = await call(
      'PATCH',
      `/members/${ids.member}/role`,
      'owner@alpha.test',
      { role: 'admin' },
      { 'x-request-id': 'req-members-0001' },
    );
    expect(res.statusCode).toBe(200);
    expect(data(res)).toMatchObject({ id: ids.member, tenantRole: 'admin' });
    expect(await roleOf(ids.member)).toBe('admin');
    const rows = await auditRows('member.role_changed');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      tenantId: ids.tenantA,
      actorUserId: ids.owner,
      targetType: 'user',
      targetId: ids.member,
      metadata: { from: 'member', to: 'admin' },
      requestId: 'req-members-0001',
    });
  });

  it('lets an admin move a member to read_only and back', async () => {
    const down = await call('PATCH', `/members/${ids.member}/role`, 'admin@alpha.test', { role: 'read_only' });
    expect(down.statusCode).toBe(200);
    const up = await call('PATCH', `/members/${ids.member}/role`, 'admin@alpha.test', { role: 'member' });
    expect(up.statusCode).toBe(200);
    expect(await auditRows('member.role_changed')).toHaveLength(2);
  });

  it.each([
    ['promote a member to admin', 'member', 'admin'],
    ['promote a member to owner', 'member', 'owner'],
    ['change another admin', 'admin2', 'member'],
    ['change the owner', 'owner', 'member'],
  ] as const)('forbids an admin to %s, and changes nothing', async (_name, target, newRole) => {
    const before = await roleOf(ids[target]);
    const res = await call('PATCH', `/members/${ids[target]}/role`, 'admin@alpha.test', { role: newRole });
    expect(res.statusCode).toBe(403);
    expect(res.json<{ error: { code: string } }>().error.code).toBe('FORBIDDEN');
    expect(await roleOf(ids[target])).toBe(before);
    expect(await auditRows('member.role_changed')).toHaveLength(0);
  });

  it('forbids members and read_only users to change roles', async () => {
    for (const email of ['member@alpha.test', 'readonly@alpha.test']) {
      const res = await call('PATCH', `/members/${ids.readOnly}/role`, email, { role: 'member' });
      expect(res.statusCode, email).toBe(403);
    }
  });

  it('does nothing, and writes no audit row, when the role is already that role', async () => {
    const res = await call('PATCH', `/members/${ids.member}/role`, 'owner@alpha.test', { role: 'member' });
    expect(res.statusCode).toBe(200);
    expect(await auditRows('member.role_changed')).toHaveLength(0);
  });

  it('refuses to demote the only active owner, even if the owner asks for it', async () => {
    const res = await call('PATCH', `/members/${ids.owner}/role`, 'owner@alpha.test', { role: 'admin' });
    expect(res.statusCode).toBe(409);
    expect(await roleOf(ids.owner)).toBe('owner');
  });

  it('allows demoting an owner while another active owner remains', async () => {
    await call('PATCH', `/members/${ids.admin}/role`, 'owner@alpha.test', { role: 'owner' });
    const res = await call('PATCH', `/members/${ids.owner}/role`, 'owner@alpha.test', { role: 'admin' });
    expect(res.statusCode).toBe(200);
    expect(await roleOf(ids.owner)).toBe('admin');
  });

  it('does not count a disabled owner as "another owner"', async () => {
    await db.update(schema.users).set({ tenantRole: 'owner', status: 'disabled' }).where(eq(schema.users.id, ids.admin2));
    const res = await call('PATCH', `/members/${ids.owner}/role`, 'owner@alpha.test', { role: 'admin' });
    expect(res.statusCode).toBe(409);
  });

  it('cannot reach a user of another company: 404, nothing changes', async () => {
    const res = await call('PATCH', `/members/${ids.memberB}/role`, 'owner@alpha.test', { role: 'admin' });
    expect(res.statusCode).toBe(404);
    expect(await roleOf(ids.memberB)).toBe('member');
    expect(await auditRows('member.role_changed')).toHaveLength(0);
  });

  it.each([
    ['an unknown key (tenantId)', { role: 'admin', tenantId: uuidv7() }],
    ['a platform role', { role: 'support' }],
    ['an unknown role', { role: 'superuser' }],
    ['no role', {}],
  ])('rejects %s with 400', async (_name, payload) => {
    const res = await call('PATCH', `/members/${ids.member}/role`, 'owner@alpha.test', payload);
    expect(res.statusCode).toBe(400);
    expect(await roleOf(ids.member)).toBe('member');
  });

  it('rejects a malformed id with 400', async () => {
    const res = await call('PATCH', '/members/not-a-uuid/role', 'owner@alpha.test', { role: 'admin' });
    expect(res.statusCode).toBe(400);
  });

  it('takes effect on the very next request of the person whose role changed', async () => {
    expect((await call('GET', '/members', 'member@alpha.test')).statusCode).toBe(200);
    await call('PATCH', `/members/${ids.member}/role`, 'owner@alpha.test', { role: 'read_only' });
    // Same access token as before: the role is read from the database on every request.
    expect((await call('GET', '/members', 'member@alpha.test')).statusCode).toBe(403);
  });
});

describe('disabling and enabling', () => {
  it('lets an admin disable a member: blocked at once, sessions revoked, audited', async () => {
    await login('member@alpha.test');
    const live = await db
      .select()
      .from(schema.refreshSessions)
      .where(eq(schema.refreshSessions.userId, ids.member));
    expect(live.length).toBeGreaterThan(0);

    const res = await call('POST', `/members/${ids.member}/disable`, 'admin@alpha.test', undefined, {
      'x-request-id': 'req-members-0002',
    });
    expect(res.statusCode).toBe(200);
    expect(data(res)).toMatchObject({ id: ids.member, status: 'disabled' });
    expect(await statusOf(ids.member)).toBe('disabled');

    // The access token it already holds, and a fresh login, are both refused.
    expect((await call('GET', '/members', 'member@alpha.test')).statusCode).toBe(401);
    expect((await loginResponse('member@alpha.test')).statusCode).toBe(401);

    const sessions = await db
      .select()
      .from(schema.refreshSessions)
      .where(and(eq(schema.refreshSessions.userId, ids.member)));
    expect(sessions.every((session) => session.revokedAt !== null)).toBe(true);

    const rows = await auditRows('member.disabled');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      tenantId: ids.tenantA,
      actorUserId: ids.admin,
      targetId: ids.member,
      metadata: { role: 'member' },
      requestId: 'req-members-0002',
    });
  });

  it.each([
    ['another admin', 'admin2'],
    ['the owner', 'owner'],
  ] as const)('forbids an admin to disable %s', async (_name, target) => {
    const res = await call('POST', `/members/${ids[target]}/disable`, 'admin@alpha.test');
    expect(res.statusCode).toBe(403);
    expect(await statusOf(ids[target])).toBe('active');
    expect(await auditRows('member.disabled')).toHaveLength(0);
  });

  it('forbids members and read_only users to disable anyone', async () => {
    for (const email of ['member@alpha.test', 'readonly@alpha.test']) {
      expect((await call('POST', `/members/${ids.readOnly}/disable`, email)).statusCode, email).toBe(403);
    }
  });

  it('refuses to disable the only active owner', async () => {
    const res = await call('POST', `/members/${ids.owner}/disable`, 'owner@alpha.test');
    expect(res.statusCode).toBe(409);
    expect(await statusOf(ids.owner)).toBe('active');
  });

  it('lets an owner disable another owner when one remains', async () => {
    await call('PATCH', `/members/${ids.admin}/role`, 'owner@alpha.test', { role: 'owner' });
    const res = await call('POST', `/members/${ids.admin}/disable`, 'owner@alpha.test');
    expect(res.statusCode).toBe(200);
  });

  it('is idempotent: disabling a disabled user answers 200 and audits once', async () => {
    await call('POST', `/members/${ids.member}/disable`, 'admin@alpha.test');
    const again = await call('POST', `/members/${ids.member}/disable`, 'admin@alpha.test');
    expect(again.statusCode).toBe(200);
    expect(await auditRows('member.disabled')).toHaveLength(1);
  });

  it('only disables active users: an invited user answers 409', async () => {
    const invited = uuidv7();
    await db.insert(schema.users).values({
      id: invited,
      email: 'invited@alpha.test',
      passwordHash: null,
      status: 'invited',
      tenantId: ids.tenantA,
      tenantRole: 'member',
    });
    expect((await call('POST', `/members/${invited}/disable`, 'owner@alpha.test')).statusCode).toBe(409);
    expect((await call('POST', `/members/${invited}/enable`, 'owner@alpha.test')).statusCode).toBe(409);
    expect(await statusOf(invited)).toBe('invited');
  });

  it('enables a disabled user again: they can sign in, and it is audited', async () => {
    await call('POST', `/members/${ids.member}/disable`, 'admin@alpha.test');
    const res = await call('POST', `/members/${ids.member}/enable`, 'admin@alpha.test');
    expect(res.statusCode).toBe(200);
    expect(data(res)).toMatchObject({ status: 'active' });
    expect((await loginResponse('member@alpha.test')).statusCode).toBe(200);
    const rows = await auditRows('member.enabled');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ tenantId: ids.tenantA, actorUserId: ids.admin, targetId: ids.member });
  });

  it('enabling an already active user answers 200 and writes no audit row', async () => {
    const res = await call('POST', `/members/${ids.member}/enable`, 'admin@alpha.test');
    expect(res.statusCode).toBe(200);
    expect(await auditRows('member.enabled')).toHaveLength(0);
  });

  it('forbids an admin to re-enable another admin', async () => {
    await db.update(schema.users).set({ status: 'disabled' }).where(eq(schema.users.id, ids.admin2));
    const res = await call('POST', `/members/${ids.admin2}/enable`, 'admin@alpha.test');
    expect(res.statusCode).toBe(403);
    expect(await statusOf(ids.admin2)).toBe('disabled');
  });

  it('cannot reach a user of another company: 404 for disable and enable', async () => {
    for (const action of ['disable', 'enable']) {
      const res = await call('POST', `/members/${ids.memberB}/${action}`, 'owner@alpha.test');
      expect(res.statusCode, action).toBe(404);
    }
    expect(await statusOf(ids.memberB)).toBe('active');
  });
});

// Called on the repository directly (not through HTTP) on purpose: over HTTP the second request
// would race with the first one's authentication, and the test would be about timing, not about
// the owner rule. Here both calls carry the actor role they had when they started.
describe('two owners acting at the same moment', () => {
  const members = createMembersRepository(db);
  const scopeOf = (userId: string) =>
    requireTenantScope({ kind: 'tenant', userId, tenantId: ids.tenantA, role: 'owner' });
  const activeOwners = () =>
    db
      .select()
      .from(schema.users)
      .where(
        and(
          eq(schema.users.tenantId, ids.tenantA),
          eq(schema.users.tenantRole, 'owner'),
          eq(schema.users.status, 'active'),
        ),
      );

  beforeEach(async () => {
    await db.update(schema.users).set({ tenantRole: 'owner' }).where(eq(schema.users.id, ids.admin));
  });

  async function exactlyOneWins(results: PromiseSettledResult<unknown>[]) {
    const lost = results.filter((result) => result.status === 'rejected');
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(lost).toHaveLength(1);
    const reason = (lost[0] as PromiseRejectedResult).reason as unknown;
    expect(reason).toBeInstanceOf(AppError);
    expect((reason as AppError).statusCode).toBe(409);
    expect(await activeOwners()).toHaveLength(1);
  }

  it('cannot demote each other: exactly one wins and an owner remains', async () => {
    await exactlyOneWins(
      await Promise.allSettled([
        members.changeRole(scopeOf(ids.owner), 'owner', ids.admin, 'member'),
        members.changeRole(scopeOf(ids.admin), 'owner', ids.owner, 'member'),
      ]),
    );
  });

  it('cannot disable each other: exactly one wins and an owner remains', async () => {
    await exactlyOneWins(
      await Promise.allSettled([
        members.disable(scopeOf(ids.owner), 'owner', ids.admin),
        members.disable(scopeOf(ids.admin), 'owner', ids.owner),
      ]),
    );
  });

  it('cannot mix a demotion and a disable to get rid of both owners', async () => {
    await exactlyOneWins(
      await Promise.allSettled([
        members.changeRole(scopeOf(ids.owner), 'owner', ids.admin, 'read_only'),
        members.disable(scopeOf(ids.admin), 'owner', ids.owner),
      ]),
    );
  });
});

// Re-enabling a member takes a seat, so it must respect the `users` limit of the plans that entitle
// the company right now (ADR-0012). Disabled people do not hold a seat; invited ones do.
describe('plan user limit on re-enabling', () => {
  const DAY = 86_400_000;
  let extra1 = '';
  let extra2 = '';

  async function subscribe(
    limits: Record<string, number | null>,
    options: { status?: 'trialing' | 'active' | 'canceled'; endsInMs?: number; code?: string } = {},
  ) {
    const productId = uuidv7();
    const planId = uuidv7();
    const versionId = uuidv7();
    const code = options.code ?? 'stark';
    await db.insert(schema.products).values({ id: productId, code, name: code, status: 'available' });
    await db
      .insert(schema.plans)
      .values({ id: planId, productId, code: 'basic', status: 'active', currentVersionId: versionId });
    await db.insert(schema.planVersions).values({
      id: versionId,
      planId,
      version: 1,
      priceMinor: 49900,
      currency: 'EGP',
      billingPeriod: 'monthly',
      trialDays: 14,
      limits,
      features: {},
    });
    await db.insert(schema.subscriptions).values({
      id: uuidv7(),
      tenantId: ids.tenantA,
      productId,
      planId,
      status: options.status ?? 'active',
      currentPeriodEnd: new Date(Date.now() + (options.endsInMs ?? 30 * DAY)),
    });
  }

  const setStatus = (id: string, status: schema.UserStatus) =>
    db.update(schema.users).set({ status }).where(eq(schema.users.id, id));
  const enableAs = (id: string) => call('POST', `/members/${id}/enable`, 'owner@alpha.test');
  const enabledAudit = () => auditRows('member.enabled');

  // Company A: owner, admin, admin2, member, readOnly are active (5 seats) + two disabled people.
  beforeEach(async () => {
    extra1 = uuidv7();
    extra2 = uuidv7();
    await db.insert(schema.users).values([
      { id: extra1, email: 'extra1@alpha.test', passwordHash, tenantId: ids.tenantA, tenantRole: 'member' as const, status: 'disabled' as const },
      { id: extra2, email: 'extra2@alpha.test', passwordHash, tenantId: ids.tenantA, tenantRole: 'member' as const, status: 'disabled' as const },
    ]);
  });

  it('refuses at the limit with PLAN_LIMIT_REACHED and changes nothing', async () => {
    await subscribe({ users: 5 });
    const res = await enableAs(extra1);
    expect(res.statusCode).toBe(409);
    expect(res.json<{ error: { code: string } }>().error.code).toBe('PLAN_LIMIT_REACHED');
    expect(await statusOf(extra1)).toBe('disabled');
    expect(await enabledAudit()).toHaveLength(0);
  });

  it('allows it once a seat is freed, and then refuses the next one', async () => {
    await subscribe({ users: 5 });
    await setStatus(ids.member, 'disabled');
    expect((await enableAs(extra1)).statusCode).toBe(200);
    expect(await statusOf(extra1)).toBe('active');
    expect(await enabledAudit()).toHaveLength(1);
    expect((await enableAs(extra2)).statusCode).toBe(409);
    expect(await statusOf(extra2)).toBe('disabled');
  });

  it('counts invited people as holding a seat', async () => {
    await subscribe({ users: 5 });
    await setStatus(ids.member, 'invited');
    expect((await enableAs(extra1)).statusCode).toBe(409);
  });

  it('does not limit a plan with users: null, a plan without a users limit, or no plan at all', async () => {
    await subscribe({ users: null });
    expect((await enableAs(extra1)).statusCode).toBe(200);
    await db.delete(schema.subscriptions);
    expect((await enableAs(extra2)).statusCode).toBe(200);
  });

  it('ignores a plan that no longer entitles the company (expired or canceled)', async () => {
    await subscribe({ users: 1 }, { endsInMs: -DAY, code: 'old' });
    await subscribe({ users: 1 }, { status: 'canceled', code: 'gone' });
    expect((await enableAs(extra1)).statusCode).toBe(200);
  });

  it('takes the most generous entitled plan when the company has several', async () => {
    await subscribe({ users: 5 }, { code: 'small' });
    await subscribe({ users: 6 }, { code: 'big' });
    expect((await enableAs(extra1)).statusCode).toBe(200);
    expect((await enableAs(extra2)).statusCode).toBe(409);
  });

  it('does not count another company\u2019s people', async () => {
    await subscribe({ users: 6 });
    await db.insert(schema.users).values(
      Array.from({ length: 10 }, (_, index) => ({
        id: uuidv7(),
        email: `filler${index}@beta.test`,
        passwordHash,
        tenantId: ids.tenantB,
        tenantRole: 'member' as const,
      })),
    );
    expect((await enableAs(extra1)).statusCode).toBe(200);
  });

  // Repository directly, like the owner tests: HTTP would make this about request timing.
  it('lets exactly one of two simultaneous re-enables take the last seat', async () => {
    await subscribe({ users: 6 });
    const members = createMembersRepository(db);
    const scope = requireTenantScope({
      kind: 'tenant',
      userId: ids.owner,
      tenantId: ids.tenantA,
      role: 'owner',
    });
    const results = await Promise.allSettled([
      members.enable(scope, 'owner', extra1),
      members.enable(scope, 'owner', extra2),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const lost = results.find((result) => result.status === 'rejected') as PromiseRejectedResult;
    expect(lost.reason).toBeInstanceOf(AppError);
    expect((lost.reason as AppError).code).toBe('PLAN_LIMIT_REACHED');
    const active = await db
      .select()
      .from(schema.users)
      .where(and(eq(schema.users.tenantId, ids.tenantA), eq(schema.users.status, 'active')));
    expect(active).toHaveLength(6);
  });
});
