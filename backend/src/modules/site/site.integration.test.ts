import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../app.js';
import { uuidv7 } from '../../common/id.js';
import { loadEnv } from '../../config/env.js';
import { createDatabase } from '../../database/client.js';
import { runMigrations } from '../../database/migrate.js';
import { createSiteSettingsRepository } from '../../database/repositories/site-settings.repository.js';
import * as schema from '../../database/schema/index.js';
import { truncateDomainTables } from '../../test/db-helpers.js';
import { createAccessTokenService } from '../auth/access-token.js';
import { createAuthService } from '../auth/auth.service.js';
import { hashPassword } from '../auth/password.js';

// /site/home (public) and /admin/site/home (staff) on a real MariaDB (axor_test): who may edit the
// home page content (ADR-0027), that nothing invalid is ever stored, that two editors cannot
// overwrite each other, and that every save is audited without copying the content.
const env = loadEnv(process.env);
const database = createDatabase(env.DATABASE_URL);
const { db } = database;

const PASSWORD = 'correct horse battery staple 42';
const ORIGIN = new URL(env.WEB_ORIGIN).origin;
const PHOTO = 'https://images.unsplash.com/photo-1553413077-190dd305871c?auto=format&fit=crop&w=800&q=70';

let app: ReturnType<typeof buildApp>;
let authService: ReturnType<typeof createAuthService> | undefined;
let passwordHash: string;
const tokenCache = new Map<string, string>();

const content = (title = 'Title') => ({
  hero: { title, lead: 'Lead', primaryLabel: 'Plans', secondaryLabel: 'Login' },
  scene: { enabled: true, images: [{ url: PHOTO, alt: 'Warehouse' }] },
  steps: { title: 'Steps', items: [{ title: 'One', text: 'First' }] },
  points: { title: 'Why', items: [{ icon: 'shield', title: 'Safe', text: 'Isolated' }] },
  gallery: { title: 'Gallery', items: [{ url: PHOTO, alt: 'Warehouse', caption: 'Warehouse' }] },
  final: { title: 'Ready?', button: 'Start' },
});

function newApp() {
  const accessTokens = createAccessTokenService({
    secret: env.JWT_ACCESS_SECRET,
    ttlSeconds: env.ACCESS_TOKEN_TTL_SECONDS,
    issuer: 'axor-api',
    audience: 'axor-web',
  });
  const auth = createAuthService({ db, accessTokens, refreshTtlDays: env.REFRESH_TOKEN_TTL_DAYS });
  authService = auth;
  return buildApp(env, { checkDatabase: () => database.ping(), auth, site: createSiteSettingsRepository(db) });
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

async function call(method: 'GET' | 'PUT', path: string, as: string | null, payload?: unknown) {
  const token = as === null ? null : await login(as);
  return app.inject({
    method,
    url: `/api/v1${path}`,
    headers: token === null ? {} : { authorization: `Bearer ${token}` },
    ...(payload !== undefined && { payload: payload as Record<string, unknown> }),
  });
}

type Body = { data: { content: unknown; version: number } };
const ADMIN = 'admin@axor.test';
const put = (as: string | null, expectedVersion: number, body: unknown) =>
  call('PUT', '/admin/site/home', as, { expectedVersion, content: body });
const auditRows = () =>
  db.select().from(schema.auditLogs).where(eq(schema.auditLogs.targetType, 'site_setting'));

beforeAll(async () => {
  expect(new URL(env.DATABASE_URL).pathname).toBe('/axor_test');
  await runMigrations(env.DATABASE_URL);
  passwordHash = await hashPassword(PASSWORD);
});

beforeEach(async () => {
  await authService?.drain();
  await truncateDomainTables(db);
  tokenCache.clear();
  const tenantId = uuidv7();
  await db.insert(schema.tenants).values({ id: tenantId, name: 'alpha' });
  await db.insert(schema.users).values([
    { id: uuidv7(), email: 'boss@alpha.test', passwordHash, tenantId, tenantRole: 'owner' },
    { id: uuidv7(), email: 'owner@axor.test', passwordHash, platformRole: 'owner' },
    { id: uuidv7(), email: ADMIN, passwordHash, platformRole: 'admin' },
    { id: uuidv7(), email: 'support@axor.test', passwordHash, platformRole: 'support' },
  ]);
  app = newApp();
});

afterAll(async () => {
  await authService?.drain();
  await database.close();
});

describe('the public read', () => {
  it('returns null content (the built-in default) before anything is saved, without a token', async () => {
    const res = await call('GET', '/site/home', null);
    expect(res.statusCode).toBe(200);
    expect(res.json<Body>().data).toEqual({ content: null, version: 0 });
    expect(res.headers['cache-control']).toBe('public, max-age=30');
  });

  it('returns what staff saved', async () => {
    expect((await put(ADMIN, 0, content('Saved'))).statusCode).toBe(200);
    const body = (await call('GET', '/site/home', null)).json<Body>().data;
    expect(body.version).toBe(1);
    expect(body.content).toEqual(content('Saved'));
  });
});

describe('who may edit', () => {
  it('rejects a request without a token', async () => {
    expect((await call('GET', '/admin/site/home', null)).statusCode).toBe(401);
    expect((await put(null, 0, content())).statusCode).toBe(401);
  });

  it('rejects company users and support, for reading and writing', async () => {
    for (const who of ['boss@alpha.test', 'support@axor.test']) {
      expect((await call('GET', '/admin/site/home', who)).statusCode, who).toBe(403);
      expect((await put(who, 0, content())).statusCode, who).toBe(403);
    }
    expect((await call('GET', '/site/home', null)).json<Body>().data.version).toBe(0);
  });

  it('lets the platform owner and admin edit', async () => {
    expect((await put('owner@axor.test', 0, content('A'))).statusCode).toBe(200);
    const res = await put(ADMIN, 1, content('B'));
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.json<Body>().data.version).toBe(2);
  });
});

describe('saving', () => {
  it('never stores content that fails validation', async () => {
    const bad = content();
    bad.gallery.items[0] = { url: 'https://example.com/a.jpg', alt: 'x', caption: 'x' };
    expect((await put(ADMIN, 0, bad)).statusCode).toBe(400);
    expect((await put(ADMIN, 0, { ...content(), extra: true })).statusCode).toBe(400);
    expect((await call('GET', '/site/home', null)).json<Body>().data.version).toBe(0);
  });

  it('refuses a save from an out-of-date editor and keeps the newer content', async () => {
    expect((await put(ADMIN, 0, content('First'))).statusCode).toBe(200);
    const stale = await put('owner@axor.test', 0, content('Stale'));
    expect(stale.statusCode).toBe(409);
    expect(stale.json<{ error: { code: string } }>().error.code).toBe('CONTENT_CHANGED');
    expect((await call('GET', '/site/home', null)).json<Body>().data.content).toEqual(content('First'));
  });

  it('lets only one of two simultaneous first saves win', async () => {
    const results = await Promise.all([put(ADMIN, 0, content('A')), put('owner@axor.test', 0, content('B'))]);
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 409]);
  });

  it('puts the built-in default back with null content', async () => {
    await put(ADMIN, 0, content());
    const reset = await put(ADMIN, 1, null);
    expect(reset.statusCode).toBe(200);
    expect(reset.json<Body>().data).toMatchObject({ content: null, version: 2 });
    expect((await call('GET', '/site/home', null)).json<Body>().data.content).toBeNull();
  });
});

describe('audit', () => {
  it('records who saved and which versions, without copying the content', async () => {
    await put(ADMIN, 0, content('Secret title'));
    await put(ADMIN, 1, null);
    const rows = await auditRows();
    expect(rows.map((row) => row.action).sort()).toEqual(['site.home_reset', 'site.home_updated']);
    const updated = rows.find((row) => row.action === 'site.home_updated');
    expect(updated?.metadata).toEqual({ setting: 'home', fromVersion: 0, toVersion: 1 });
    expect(JSON.stringify(rows)).not.toContain('Secret title');
  });
});

// ---------------------------------------------------------------------------------------------
// The four information pages (ADR-0028): /site/pages/:key (public) and /admin/site/pages/:key
// (staff). Same rules as the home page, plus: unknown keys are 404, and each key has its own shape.
// ---------------------------------------------------------------------------------------------
const FAQ = { title: 'Questions', items: [{ question: 'What is AXOR?', answer: ['One platform.'] }] };
const CONTACT = { title: 'Contact', intro: 'Write to us.', email: 'hello@example.com', details: [] };
const TERMS = { title: 'Terms', updatedOn: '2026-11-20', sections: [{ heading: 'Use', paragraphs: ['Be kind.'] }] };
const PRIVACY = { ...TERMS, title: 'Privacy' };
const SAMPLE = { faq: FAQ, contact: CONTACT, terms: TERMS, privacy: PRIVACY } as const;
const KEYS = ['faq', 'contact', 'terms', 'privacy'] as const;

const putPage = (as: string | null, key: string, expectedVersion: number, body: unknown) =>
  call('PUT', `/admin/site/pages/${key}`, as, { expectedVersion, content: body });

describe('information pages: the public read', () => {
  it('returns null (not published yet) for every page before anything is saved, without a token', async () => {
    for (const key of KEYS) {
      const res = await call('GET', `/site/pages/${key}`, null);
      expect(res.statusCode, key).toBe(200);
      expect(res.json<Body>().data, key).toEqual({ content: null, version: 0 });
      expect(res.headers['cache-control'], key).toBe('public, max-age=30');
    }
  });

  it('returns what staff saved, for that page only', async () => {
    expect((await putPage(ADMIN, 'faq', 0, FAQ)).statusCode).toBe(200);
    expect((await call('GET', '/site/pages/faq', null)).json<Body>().data).toEqual({ content: FAQ, version: 1 });
    expect((await call('GET', '/site/pages/terms', null)).json<Body>().data).toEqual({ content: null, version: 0 });
    expect((await call('GET', '/site/home', null)).json<Body>().data.version).toBe(0);
  });

  it('answers 404 for a key that is not an information page', async () => {
    for (const key of ['home', 'nope', 'FAQ', 'constructor', '__proto__']) {
      expect((await call('GET', `/site/pages/${key}`, null)).statusCode, key).toBe(404);
    }
  });
});

describe('information pages: who may edit', () => {
  it('rejects a request without a token', async () => {
    expect((await call('GET', '/admin/site/pages/faq', null)).statusCode).toBe(401);
    expect((await putPage(null, 'faq', 0, FAQ)).statusCode).toBe(401);
  });

  it('rejects company users and support, for reading and writing', async () => {
    for (const who of ['boss@alpha.test', 'support@axor.test']) {
      expect((await call('GET', '/admin/site/pages/faq', who)).statusCode, who).toBe(403);
      expect((await putPage(who, 'faq', 0, FAQ)).statusCode, who).toBe(403);
    }
    expect((await call('GET', '/site/pages/faq', null)).json<Body>().data.version).toBe(0);
  });

  it('lets the platform owner and admin edit every page', async () => {
    for (const key of KEYS) {
      const res = await putPage('owner@axor.test', key, 0, SAMPLE[key]);
      expect(res.statusCode, key).toBe(200);
      expect(res.headers['cache-control'], key).toBe('no-store');
      const read = await call('GET', `/admin/site/pages/${key}`, ADMIN);
      expect(read.json<Body>().data, key).toMatchObject({ content: SAMPLE[key], version: 1 });
    }
  });

  it('answers 404 for an unknown key, even for staff', async () => {
    expect((await call('GET', '/admin/site/pages/home', ADMIN)).statusCode).toBe(404);
    expect((await putPage(ADMIN, 'home', 0, FAQ)).statusCode).toBe(404);
    expect((await putPage(ADMIN, 'nope', 0, FAQ)).statusCode).toBe(404);
  });
});

describe('information pages: saving', () => {
  it('never stores content of the wrong shape for that page', async () => {
    expect((await putPage(ADMIN, 'terms', 0, FAQ)).statusCode).toBe(400);
    expect((await putPage(ADMIN, 'faq', 0, TERMS)).statusCode).toBe(400);
    expect((await putPage(ADMIN, 'faq', 0, { ...FAQ, extra: true })).statusCode).toBe(400);
    expect((await putPage(ADMIN, 'contact', 0, { ...CONTACT, email: 'a@b.com, c@d.com' })).statusCode).toBe(400);
    expect((await putPage(ADMIN, 'terms', 0, { ...TERMS, updatedOn: '2026-02-30' })).statusCode).toBe(400);
    for (const key of KEYS) expect((await call('GET', `/site/pages/${key}`, null)).json<Body>().data.version).toBe(0);
  });

  it('accepts a contact page with no email yet', async () => {
    expect((await putPage(ADMIN, 'contact', 0, { ...CONTACT, email: null })).statusCode).toBe(200);
  });

  it('refuses a save from an out-of-date editor and keeps the newer content', async () => {
    expect((await putPage(ADMIN, 'faq', 0, FAQ)).statusCode).toBe(200);
    const stale = await putPage('owner@axor.test', 'faq', 0, { ...FAQ, title: 'Stale' });
    expect(stale.statusCode).toBe(409);
    expect(stale.json<{ error: { code: string } }>().error.code).toBe('CONTENT_CHANGED');
    expect((await call('GET', '/site/pages/faq', null)).json<Body>().data.content).toEqual(FAQ);
  });

  it('keeps the versions of different pages apart', async () => {
    await putPage(ADMIN, 'faq', 0, FAQ);
    await putPage(ADMIN, 'faq', 1, { ...FAQ, title: 'Again' });
    expect((await putPage(ADMIN, 'terms', 0, TERMS)).statusCode).toBe(200);
    expect((await call('GET', '/site/pages/terms', null)).json<Body>().data.version).toBe(1);
  });

  it('unpublishes a page with null content', async () => {
    await putPage(ADMIN, 'privacy', 0, PRIVACY);
    const reset = await putPage(ADMIN, 'privacy', 1, null);
    expect(reset.statusCode).toBe(200);
    expect(reset.json<Body>().data).toMatchObject({ content: null, version: 2 });
    expect((await call('GET', '/site/pages/privacy', null)).json<Body>().data.content).toBeNull();
  });
});

describe('information pages: audit', () => {
  it('records which page, who and which versions, without copying the content', async () => {
    await putPage(ADMIN, 'faq', 0, { ...FAQ, title: 'Secret title' });
    await putPage(ADMIN, 'faq', 1, null);
    const rows = await auditRows();
    expect(rows.map((row) => row.action).sort()).toEqual(['site.page_reset', 'site.page_updated']);
    expect(rows.find((row) => row.action === 'site.page_updated')?.metadata).toEqual({
      setting: 'faq',
      fromVersion: 0,
      toVersion: 1,
    });
    expect(JSON.stringify(rows)).not.toContain('Secret title');
  });

  it('keeps the home page action names unchanged', async () => {
    await put(ADMIN, 0, content());
    expect((await auditRows()).map((row) => row.action)).toEqual(['site.home_updated']);
  });
});
