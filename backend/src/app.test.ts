import { describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { AppError } from './common/errors.js';
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

  it('a saturated or slow database answers 503 with Retry-After and no internals (ADR-0019)', async () => {
    const busyErrors = [
      // What Drizzle throws: the driver error wrapped as `cause`.
      new Error('Failed query: select secret_table', {
        cause: Object.assign(new Error('Query execution was interrupted (max_statement_time exceeded) secret'), {
          errno: 1969,
          code: 'ER_STATEMENT_TIMEOUT',
        }),
      }),
      new Error('Queue limit reached.'),
    ];
    for (const failure of busyErrors) {
      const app = buildApp(env, healthyDeps);
      app.get('/slow', async () => {
        throw failure;
      });
      const res = await app.inject({ method: 'GET', url: '/slow' });
      expect(res.statusCode).toBe(503);
      expect(res.headers['retry-after']).toBe('5');
      expect(res.body).not.toContain('secret');
      expect(res.json()).toEqual({
        error: { code: 'SERVICE_BUSY', message: 'The service is busy, please try again shortly' },
      });
    }
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
      WEB_ORIGIN: 'https://axor.example',
      DATABASE_URL: testUrl,
      JWT_ACCESS_SECRET: 'q7Vn+3kX9tLw2RzE8yBd5HcAfGm1JsUo4PiNb6TeKxZ0YaCv',
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

  it('sets bounded database limits by default and rejects values outside the safe range (ADR-0019)', () => {
    const parsed = loadEnv({ DATABASE_URL: testUrl, JWT_ACCESS_SECRET: testSecret });
    expect(parsed.DB_POOL_SIZE).toBe(10);
    expect(parsed.DB_POOL_QUEUE_LIMIT).toBe(100);
    expect(parsed.DB_STATEMENT_TIMEOUT_MS).toBe(15_000);

    const base = { DATABASE_URL: testUrl, JWT_ACCESS_SECRET: testSecret };
    expect(loadEnv({ ...base, DB_STATEMENT_TIMEOUT_MS: '0' }).DB_STATEMENT_TIMEOUT_MS).toBe(0);
    for (const bad of [
      { DB_POOL_SIZE: '0' },
      { DB_POOL_SIZE: '101' },
      { DB_POOL_SIZE: 'abc' },
      { DB_POOL_QUEUE_LIMIT: '0' },
      { DB_POOL_QUEUE_LIMIT: '10001' },
      { DB_STATEMENT_TIMEOUT_MS: '-1' },
      { DB_STATEMENT_TIMEOUT_MS: '300001' },
    ]) {
      expect(() => loadEnv({ ...base, ...bad })).toThrow();
    }
  });
});


describe('production hardening (ADR-0016)', () => {
  // A random-looking value, as `deploy.md` tells operators to generate (ADR-0017).
  const strongSecret = 'q7Vn+3kX9tLw2RzE8yBd5HcAfGm1JsUo4PiNb6TeKxZ0YaCv';
  const prod = (overrides: Record<string, string> = {}) =>
    loadEnv({
      NODE_ENV: 'production',
      LOG_LEVEL: 'silent',
      WEB_ORIGIN: 'https://axor.example',
      DATABASE_URL: 'mysql://axor_app:pass@127.0.0.1:3306/axor_prod',
      JWT_ACCESS_SECRET: strongSecret,
      ...overrides,
    });

  it('accepts a sound production configuration', () => {
    expect(prod().NODE_ENV).toBe('production');
    for (const level of ['fatal', 'error', 'warn', 'info', 'silent']) {
      expect(prod({ LOG_LEVEL: level }).LOG_LEVEL).toBe(level);
    }
  });

  it('refuses to start with a guessable JWT_ACCESS_SECRET, and never prints it (ADR-0017)', () => {
    const weak = [
      'a'.repeat(48),
      'abcabcabcabcabcabcabcabcabcabcabcabc',
      '0123456789012345678901234567890123456789',
      testSecret,
      'test-only-access-secret-not-used-anywhere-else-0123456789',
      'Please-ChangeMe-before-going-live-Zq8Xw3Lp9',
      'my-super-Password-for-the-axor-platform-8Qx2',
    ];
    for (const secret of weak) {
      let message = '';
      try {
        prod({ JWT_ACCESS_SECRET: secret });
      } catch (error) {
        message = String(error instanceof Error ? error.message : error);
      }
      expect(message, secret).toContain('JWT_ACCESS_SECRET');
      expect(message, secret).not.toContain(secret);
    }
  });

  it('accepts a random JWT_ACCESS_SECRET, and still allows a plain one outside production', () => {
    expect(prod().JWT_ACCESS_SECRET).toBe(strongSecret);
    expect(
      loadEnv({ NODE_ENV: 'development', DATABASE_URL: testUrl, JWT_ACCESS_SECRET: 'a'.repeat(40) })
        .JWT_ACCESS_SECRET,
    ).toBe('a'.repeat(40));
  });

  it('validates JWT_ACCESS_SECRET_PREVIOUS: optional, blank means unset, never equal or weak (ADR-0017)', () => {
    const previous = 'Zp4Hd8KxQ2mVn7TwLc1RbY6sUe3GjAo9FiNk5XyCq0Dv+Mh';
    expect(prod().JWT_ACCESS_SECRET_PREVIOUS).toBeUndefined();
    expect(prod({ JWT_ACCESS_SECRET_PREVIOUS: '' }).JWT_ACCESS_SECRET_PREVIOUS).toBeUndefined();
    expect(prod({ JWT_ACCESS_SECRET_PREVIOUS: previous }).JWT_ACCESS_SECRET_PREVIOUS).toBe(previous);
    expect(() => prod({ JWT_ACCESS_SECRET_PREVIOUS: strongSecret })).toThrow(/JWT_ACCESS_SECRET_PREVIOUS/);
    expect(() => prod({ JWT_ACCESS_SECRET_PREVIOUS: 'short' })).toThrow(/JWT_ACCESS_SECRET_PREVIOUS/);
    let message = '';
    try {
      prod({ JWT_ACCESS_SECRET_PREVIOUS: 'a'.repeat(48) });
    } catch (error) {
      message = String(error instanceof Error ? error.message : error);
    }
    expect(message).toContain('JWT_ACCESS_SECRET_PREVIOUS');
    expect(message).not.toContain('a'.repeat(48));
  });

  it('refuses to start with a plain-http web origin', () => {
    expect(() => prod({ WEB_ORIGIN: 'http://axor.example' })).toThrow(/WEB_ORIGIN/);
    expect(() => prod({ WEB_ORIGIN: 'http://localhost:5173' })).toThrow(/WEB_ORIGIN/);
  });

  it('refuses to start with debug or trace logging', () => {
    expect(() => prod({ LOG_LEVEL: 'debug' })).toThrow(/LOG_LEVEL/);
    expect(() => prod({ LOG_LEVEL: 'trace' })).toThrow(/LOG_LEVEL/);
  });

  it('refuses to start with the database root user, however it is spelled', () => {
    for (const user of ['root', 'ROOT', '%72oot']) {
      expect(() => prod({ DATABASE_URL: `mysql://${user}:pass@127.0.0.1:3306/axor_prod` })).toThrow(
        /DATABASE_URL/,
      );
    }
  });

  it('reports every problem at once and never echoes the values it rejected', () => {
    let message = '';
    try {
      prod({
        WEB_ORIGIN: 'http://axor.example',
        LOG_LEVEL: 'debug',
        DATABASE_URL: 'mysql://root:hunter2-secret@127.0.0.1:3306/axor_prod',
      });
    } catch (error) {
      message = String(error instanceof Error ? error.message : error);
    }
    expect(message).toContain('WEB_ORIGIN');
    expect(message).toContain('LOG_LEVEL');
    expect(message).toContain('DATABASE_URL');
    expect(message).not.toContain('hunter2-secret');
  });

  it('keeps the same settings allowed outside production, where they are needed', () => {
    for (const nodeEnv of ['development', 'test'] as const) {
      const parsed = loadEnv({
        NODE_ENV: nodeEnv,
        LOG_LEVEL: 'debug',
        WEB_ORIGIN: 'http://localhost:5173',
        DATABASE_URL: 'mysql://root:pass@127.0.0.1:3306/axor_dev',
        JWT_ACCESS_SECRET: testSecret,
      });
      expect(parsed.LOG_LEVEL).toBe('debug');
    }
  });

  it('answers every kind of failure with the unified body only: no stack, no internals', async () => {
    const app = buildApp(prod(), healthyDeps);
    app.get('/boom', async () => {
      throw new Error('db password is hunter2-secret at /srv/axor/db.ts');
    });
    app.get('/boom-app-error', async () => {
      throw new AppError(500, 'DB_FAILURE', 'connection to 10.0.0.5 failed', {
        query: 'SELECT * FROM users',
      });
    });
    app.post('/json', async () => ({ ok: true }));

    const responses = await Promise.all([
      app.inject({ method: 'GET', url: '/boom' }),
      app.inject({ method: 'GET', url: '/boom-app-error' }),
      app.inject({ method: 'GET', url: '/nope' }),
      app.inject({
        method: 'POST',
        url: '/json',
        headers: { 'content-type': 'application/json' },
        payload: '{"a":',
      }),
    ]);
    expect(responses.map((r) => r.statusCode)).toEqual([500, 500, 404, 400]);

    for (const res of responses) {
      const body = res.json<{ error: Record<string, unknown> }>();
      expect(Object.keys(body)).toEqual(['error']);
      expect(Object.keys(body.error).sort()).toEqual(['code', 'message']);
      expect(res.body).not.toMatch(/hunter2|10\.0\.0\.5|SELECT|\/srv\/|\.ts|node_modules|\bat \S+ \(/);
      expect(res.body.toLowerCase()).not.toContain('stack');
      expect(res.headers['x-powered-by']).toBeUndefined();
    }
  });
});
