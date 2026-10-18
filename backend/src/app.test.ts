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
