import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { uuidv7 } from '../common/id.js';
import { loadEnv } from '../config/env.js';
import { createDatabase } from '../database/client.js';
import { runMigrations } from '../database/migrate.js';
import { createAuditAdminRepository } from '../database/repositories/audit-admin.repository.js';
import { createCatalogAdminRepository } from '../database/repositories/catalog-admin.repository.js';
import { createCatalogRepository } from '../database/repositories/catalog.repository.js';
import { createMembersRepository } from '../database/repositories/members.repository.js';
import { createSubscriptionsRepository } from '../database/repositories/subscriptions.repository.js';
import { createTenantsAdminRepository } from '../database/repositories/tenants-admin.repository.js';
import * as schema from '../database/schema/index.js';
import { truncateDomainTables } from '../test/db-helpers.js';
import { createAccessTokenService } from './auth/access-token.js';
import { createAuthService } from './auth/auth.service.js';
import { hashPassword } from './auth/password.js';

// Deny by default (TASKS.md, phase C: access tests). Two guarantees:
//  1. Every route the app really registers is listed below with the access it demands. A new route
//     that nobody classified fails here, so "forgot to protect it" cannot ship silently.
//  2. For every protected route, every caller (anonymous + 7 roles) gets exactly the answer the
//     table says: 401 without credentials, 403 for the wrong role, and never a 401/403/5xx for the
//     roles that are allowed. Junk input is sent on purpose: if validation ran BEFORE the access
//     check, a denied caller would see 400 instead of 403 and the test would catch it.
const env = loadEnv(process.env);
const database = createDatabase(env.DATABASE_URL);
const { db } = database;

const PASSWORD = 'correct horse battery staple 42';
const ORIGIN = new URL(env.WEB_ORIGIN).origin;

const TENANT_CALLERS = {
  tenantOwner: 'owner',
  tenantAdmin: 'admin',
  tenantMember: 'member',
  tenantReadOnly: 'read_only',
} as const;
const PLATFORM_CALLERS = {
  platformOwner: 'owner',
  platformAdmin: 'admin',
  platformSupport: 'support',
} as const;

type Caller = keyof typeof TENANT_CALLERS | keyof typeof PLATFORM_CALLERS;
const everyone = [...Object.keys(TENANT_CALLERS), ...Object.keys(PLATFORM_CALLERS)] as Caller[];
const emailOf = (caller: Caller) => `${caller}@route-guard.test`;

/** Who may pass each access rule. Written out by hand, not derived from the production table. */
const RULES = {
  'signed-in': everyone,
  'company-reads-subscriptions': ['tenantOwner', 'tenantAdmin', 'tenantMember', 'tenantReadOnly'],
  'company-manages-subscriptions': ['tenantOwner'],
  'staff-reads-subscriptions': ['platformOwner', 'platformAdmin', 'platformSupport'],
  'staff-manages-subscriptions': ['platformOwner', 'platformAdmin'],
  'staff-manages-catalog': ['platformOwner', 'platformAdmin'],
  'staff-reads-audit': ['platformOwner', 'platformAdmin'],
  'company-reads-members': ['tenantOwner', 'tenantAdmin', 'tenantMember'],
  'company-manages-members': ['tenantOwner', 'tenantAdmin'],
  'staff-reads-tenants': ['platformOwner', 'platformAdmin', 'platformSupport'],
  'staff-manages-tenants': ['platformOwner', 'platformAdmin'],
} satisfies Record<string, Caller[]>;
type Rule = keyof typeof RULES;

const PUBLIC = 'public';
const INVENTORY: Record<string, Rule | typeof PUBLIC> = {
  'GET /api/v1/health': PUBLIC,
  'GET /api/v1/health/ready': PUBLIC,
  'GET /api/v1/catalog/products': PUBLIC,
  'GET /api/v1/catalog/products/:productCode/plans': PUBLIC,
  'POST /api/v1/auth/register': PUBLIC,
  'POST /api/v1/auth/login': PUBLIC,
  'POST /api/v1/auth/refresh': PUBLIC,
  'POST /api/v1/auth/logout': PUBLIC,
  'GET /api/v1/auth/me': 'signed-in',
  'POST /api/v1/auth/change-password': 'signed-in',
  'GET /api/v1/subscriptions': 'company-reads-subscriptions',
  'POST /api/v1/subscriptions/trial': 'company-manages-subscriptions',
  'POST /api/v1/subscriptions/:productCode/cancel': 'company-manages-subscriptions',
  'GET /api/v1/admin/subscriptions': 'staff-reads-subscriptions',
  'POST /api/v1/admin/subscriptions/:id/activate': 'staff-manages-subscriptions',
  'POST /api/v1/admin/subscriptions/:id/cancel': 'staff-manages-subscriptions',
  'POST /api/v1/admin/subscriptions/:id/extend-trial': 'staff-manages-subscriptions',
  'GET /api/v1/admin/catalog': 'staff-manages-catalog',
  'POST /api/v1/admin/catalog/products': 'staff-manages-catalog',
  'PATCH /api/v1/admin/catalog/products/:id': 'staff-manages-catalog',
  'POST /api/v1/admin/catalog/products/:id/activities': 'staff-manages-catalog',
  'PATCH /api/v1/admin/catalog/activities/:id': 'staff-manages-catalog',
  'POST /api/v1/admin/catalog/products/:id/plans': 'staff-manages-catalog',
  'POST /api/v1/admin/catalog/plans/:id/versions': 'staff-manages-catalog',
  'PATCH /api/v1/admin/catalog/plans/:id': 'staff-manages-catalog',
  'GET /api/v1/admin/audit-logs': 'staff-reads-audit',
  'GET /api/v1/members': 'company-reads-members',
  'PATCH /api/v1/members/:id/role': 'company-manages-members',
  'POST /api/v1/members/:id/disable': 'company-manages-members',
  'POST /api/v1/members/:id/enable': 'company-manages-members',
  'GET /api/v1/admin/tenants': 'staff-reads-tenants',
  'POST /api/v1/admin/tenants/:id/suspend': 'staff-manages-tenants',
  'POST /api/v1/admin/tenants/:id/reactivate': 'staff-manages-tenants',
};

type Method = 'GET' | 'POST' | 'PATCH';
const protectedRoutes = Object.entries(INVENTORY).filter(
  (entry): entry is [string, Rule] => entry[1] !== PUBLIC,
);

const found = new Set<string>();
const tokens = new Map<Caller, string>();
const services: Array<ReturnType<typeof createAuthService>> = [];
let app: ReturnType<typeof buildApp>;

function newApp() {
  const accessTokens = createAccessTokenService({
    secret: env.JWT_ACCESS_SECRET,
    ttlSeconds: env.ACCESS_TOKEN_TTL_SECONDS,
    issuer: 'axor-api',
    audience: 'axor-web',
  });
  const auth = createAuthService({ db, accessTokens, refreshTtlDays: env.REFRESH_TOKEN_TTL_DAYS });
  services.push(auth);
  return buildApp(env, {
    checkDatabase: () => database.ping(),
    auth,
    catalog: createCatalogRepository(db),
    catalogAdmin: createCatalogAdminRepository(db),
    subscriptions: createSubscriptionsRepository(db),
    auditAdmin: createAuditAdminRepository(db),
    members: createMembersRepository(db),
    tenantsAdmin: createTenantsAdminRepository(db),
  });
}

async function loginAs(target: ReturnType<typeof buildApp>, caller: Caller): Promise<string> {
  const res = await target.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    headers: { origin: ORIGIN },
    payload: { email: emailOf(caller), password: PASSWORD },
  });
  expect(res.statusCode, caller).toBe(200);
  return res.json<{ data: { accessToken: string } }>().data.accessToken;
}

/**
 * Calls a route the way a careless client would: placeholder ids and a junk body. The trusted
 * Origin is sent like a browser does, because some routes check it (CSRF) and that check would
 * otherwise hide the access check this file is about.
 */
function hit(key: string, caller: Caller | null) {
  const [method, template] = key.split(' ') as [Method, string];
  const token = caller === null ? undefined : tokens.get(caller);
  return app.inject({
    method,
    url: template.replace(':id', uuidv7()).replace(':productCode', 'nope'),
    headers: { origin: ORIGIN, ...(token !== undefined && { authorization: `Bearer ${token}` }) },
    ...(method !== 'GET' && { payload: { junk: true } }),
  });
}

beforeAll(async () => {
  expect(new URL(env.DATABASE_URL).pathname).toBe('/axor_test');
  await runMigrations(env.DATABASE_URL);
  await truncateDomainTables(db);
  const passwordHash = await hashPassword(PASSWORD);
  const tenantId = uuidv7();
  await db.insert(schema.tenants).values({ id: tenantId, name: 'route-guard' });
  await db.insert(schema.users).values([
    ...(Object.keys(TENANT_CALLERS) as Array<keyof typeof TENANT_CALLERS>).map((caller) => ({
      id: uuidv7(),
      email: emailOf(caller),
      passwordHash,
      tenantId,
      tenantRole: TENANT_CALLERS[caller],
    })),
    ...(Object.keys(PLATFORM_CALLERS) as Array<keyof typeof PLATFORM_CALLERS>).map((caller) => ({
      id: uuidv7(),
      email: emailOf(caller),
      passwordHash,
      platformRole: PLATFORM_CALLERS[caller],
    })),
  ]);

  // Log in on a throw-away app so the login throttle of the app under test stays untouched.
  const loginApp = newApp();
  for (const caller of everyone) tokens.set(caller, await loginAs(loginApp, caller));
  await loginApp.close();

  app = newApp();
  // Must run in the same tick as buildApp(): plugins load afterwards and inherit this hook.
  // HEAD and OPTIONS are added by Fastify and the CORS plugin, not by us; HEAD is tested below.
  app.addHook('onRoute', (route) => {
    const methods = Array.isArray(route.method) ? route.method : [route.method];
    for (const method of methods) {
      if (method !== 'HEAD' && method !== 'OPTIONS') found.add(`${method} ${route.url}`);
    }
  });
  await app.ready();
});

afterAll(async () => {
  await app.close();
  for (const service of services) await service.drain();
  await database.close();
});

describe('the route inventory', () => {
  it('lists every registered route, and nothing that does not exist', () => {
    expect([...found].sort()).toEqual(Object.keys(INVENTORY).sort());
  });

  it('keeps public routes to health, the public catalog and the four auth entry points', () => {
    const open = Object.entries(INVENTORY)
      .filter(([, access]) => access === PUBLIC)
      .map(([key]) => key)
      .sort();
    expect(open).toEqual(
      [
        'GET /api/v1/health',
        'GET /api/v1/health/ready',
        'GET /api/v1/catalog/products',
        'GET /api/v1/catalog/products/:productCode/plans',
        'POST /api/v1/auth/register',
        'POST /api/v1/auth/login',
        'POST /api/v1/auth/refresh',
        'POST /api/v1/auth/logout',
      ].sort(),
    );
  });
});

describe.each(protectedRoutes)('%s (%s)', (key, rule) => {
  it('answers 401 to a caller with no credentials, before looking at the input', async () => {
    const res = await hit(key, null);
    expect(res.statusCode).toBe(401);
    expect(res.json<{ error: { code: string } }>().error.code).toBe('UNAUTHORIZED');
  });

  it.each(everyone)('gives %s exactly what the access table says', async (caller) => {
    const res = await hit(key, caller);
    if ((RULES[rule] as Caller[]).includes(caller)) {
      // Past the access check: validation (400), a missing record (404) or success.
      expect([200, 400, 404, 409, 422], `${caller} ${key} -> ${res.body}`).toContain(res.statusCode);
    } else {
      expect(res.statusCode, `${caller} ${key} -> ${res.body}`).toBe(403);
      const body = res.json<{ error: { code: string; message: string } }>();
      expect(body.error.code).toBe('FORBIDDEN');
      expect(res.body).not.toMatch(/platform:|tenant:|subscription:|permission/i);
    }
  });
});

describe('HEAD requests', () => {
  it.each([
    '/auth/me',
    '/subscriptions',
    '/members',
    '/admin/subscriptions',
    '/admin/catalog',
    '/admin/tenants',
    '/admin/audit-logs',
  ])(
    'cannot bypass authentication on %s',
    async (path) => {
      const res = await app.inject({ method: 'HEAD', url: `/api/v1${path}` });
      expect(res.statusCode).toBe(401);
    },
  );
});
