import { describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { loadEnv } from './config/env.js';

const testUrl = 'mysql://user:pass@127.0.0.1:3306/axor_test';
const testSecret = 'unit-test-secret-that-is-long-enough-123456';
const env = loadEnv({ NODE_ENV: 'test', DATABASE_URL: testUrl, JWT_ACCESS_SECRET: testSecret });

const healthyDeps = { checkDatabase: async () => {} };

describe('app', () => {
  it('GET /api/v1/health returns ok', async () => {
    const app = buildApp(env, healthyDeps);
    const res = await app.inject({ method: 'GET', url: '/api/v1/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });

  it('GET /api/v1/health/ready returns ready when the database responds', async () => {
    const app = buildApp(env, healthyDeps);
    const res = await app.inject({ method: 'GET', url: '/api/v1/health/ready' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ready' });
  });

  it('GET /api/v1/health/ready returns 503 without leaking the database error', async () => {
    const app = buildApp(env, {
      checkDatabase: async () => {
        throw new Error('ECONNREFUSED secret-host:3306');
      },
    });
    const res = await app.inject({ method: 'GET', url: '/api/v1/health/ready' });
    expect(res.statusCode).toBe(503);
    expect(res.body).not.toContain('secret');
    expect(res.json()).toEqual({ status: 'unavailable' });
  });

  it('unknown route returns the unified 404 error shape', async () => {
    const app = buildApp(env, healthyDeps);
    const res = await app.inject({ method: 'GET', url: '/nope' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: { code: 'NOT_FOUND', message: 'Resource not found' } });
  });

  it('unexpected errors do not leak internals', async () => {
    const app = buildApp(env, healthyDeps);
    app.get('/boom', async () => {
      throw new Error('secret db password leaked');
    });
    const res = await app.inject({ method: 'GET', url: '/boom' });
    expect(res.statusCode).toBe(500);
    expect(res.body).not.toContain('secret');
    expect(res.json()).toEqual({
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
    });
  });
});

describe('browser security: Helmet and CORS', () => {
  const webOrigin = new URL(env.WEB_ORIGIN).origin;

  it('sends security headers on success, 404 and 500 responses alike', async () => {
    const app = buildApp(env, healthyDeps);
    app.get('/boom', async () => {
      throw new Error('internal detail');
    });
    for (const [url, status] of [
      ['/api/v1/health', 200],
      ['/nope', 404],
      ['/boom', 500],
    ] as const) {
      const res = await app.inject({ method: 'GET', url });
      expect(res.statusCode).toBe(status);
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['referrer-policy']).toBe('no-referrer');
      expect(res.headers['cross-origin-resource-policy']).toBe('same-site');
      expect(res.headers['x-powered-by']).toBeUndefined();
      const csp = String(res.headers['content-security-policy']);
      expect(csp).toContain("default-src 'none'");
      expect(csp).toContain("frame-ancestors 'none'");
    }
  });

  it('enables HSTS only in production', async () => {
    const dev = await buildApp(env, healthyDeps).inject({ method: 'GET', url: '/api/v1/health' });
    expect(dev.headers['strict-transport-security']).toBeUndefined();

    const prodEnv = loadEnv({
      NODE_ENV: 'production',
      LOG_LEVEL: 'silent',
      DATABASE_URL: testUrl,
      JWT_ACCESS_SECRET: testSecret,
    });
    const prod = await buildApp(prodEnv, healthyDeps).inject({
      method: 'GET',
      url: '/api/v1/health',
    });
    expect(String(prod.headers['strict-transport-security'])).toContain('max-age=31536000');
  });

  it('lets only the configured web origin read responses, with credentials', async () => {
    const app = buildApp(env, healthyDeps);
    const allowed = await app.inject({
      method: 'GET',
      url: '/api/v1/health',
      headers: { origin: webOrigin },
    });
    expect(allowed.headers['access-control-allow-origin']).toBe(webOrigin);
    expect(allowed.headers['access-control-allow-credentials']).toBe('true');
    expect(String(allowed.headers['access-control-expose-headers'])).toContain('x-request-id');
    expect(String(allowed.headers['vary'])).toContain('Origin');

    for (const foreign of ['https://evil.example', `${webOrigin}.evil.example`, 'null']) {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/health',
        headers: { origin: foreign },
      });
      // Without Access-Control-Allow-Origin the browser refuses to expose the response, whatever
      // other CORS headers are present.
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    }
  });

  it('answers a preflight for the web origin and refuses everyone else', async () => {
    const app = buildApp(env, healthyDeps);
    const preflight = (origin: string) =>
      app.inject({
        method: 'OPTIONS',
        url: '/api/v1/auth/login',
        headers: {
          origin,
          'access-control-request-method': 'POST',
          'access-control-request-headers': 'content-type,authorization',
        },
      });

    const ok = await preflight(webOrigin);
    expect(ok.statusCode).toBe(204);
    expect(ok.headers['access-control-allow-origin']).toBe(webOrigin);
    expect(ok.headers['access-control-allow-credentials']).toBe('true');
    expect(String(ok.headers['access-control-allow-methods'])).toContain('POST');
    expect(String(ok.headers['access-control-allow-headers'])).toContain('authorization');
    expect(Number(ok.headers['access-control-max-age'])).toBe(600);

    const foreign = await preflight('https://evil.example');
    expect(foreign.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('loadEnv', () => {
  it('applies safe defaults', () => {
    const parsed = loadEnv({ DATABASE_URL: testUrl, JWT_ACCESS_SECRET: testSecret });
    expect(parsed.API_HOST).toBe('127.0.0.1');
    expect(parsed.API_PORT).toBe(4000);
    expect(parsed.TRUST_PROXY).toBe(false);
    expect(parsed.ACCESS_TOKEN_TTL_SECONDS).toBe(900);
    expect(parsed.REFRESH_TOKEN_TTL_DAYS).toBe(30);
  });

  it('rejects a missing, short or placeholder JWT_ACCESS_SECRET (fail fast)', () => {
    expect(() => loadEnv({ DATABASE_URL: testUrl })).toThrow();
    expect(() => loadEnv({ DATABASE_URL: testUrl, JWT_ACCESS_SECRET: 'short' })).toThrow();
    expect(() =>
      loadEnv({
        DATABASE_URL: testUrl,
        JWT_ACCESS_SECRET: 'CHANGE_ME_this_placeholder_is_long_enough_but_not_allowed',
      }),
    ).toThrow();
  });

  it('rejects an invalid port (fail fast)', () => {
    expect(() =>
      loadEnv({ API_PORT: '99999', DATABASE_URL: testUrl, JWT_ACCESS_SECRET: testSecret }),
    ).toThrow();
  });

  it('rejects a missing or non-mysql DATABASE_URL (fail fast)', () => {
    expect(() => loadEnv({})).toThrow();
    expect(() =>
      loadEnv({ DATABASE_URL: 'postgres://u:p@127.0.0.1/db', JWT_ACCESS_SECRET: testSecret }),
    ).toThrow();
  });
});
