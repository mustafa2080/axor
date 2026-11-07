import { Writable } from 'node:stream';
import { setTimeout as sleep } from 'node:timers/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from './app.js';
import { loadEnv } from './config/env.js';

// The request time limit (ADR-0020). The handler cannot be cancelled, so these tests pin both
// halves of the behaviour: the client is answered in time, and the work still runs to the end.

const testUrl = 'mysql://user:pass@127.0.0.1:3306/axor_test';
const testSecret = 'unit-test-secret-that-is-long-enough-123456';
const healthyDeps = { checkDatabase: async () => {} };

function envWith(overrides: Record<string, string> = {}) {
  return loadEnv({
    NODE_ENV: 'test',
    DATABASE_URL: testUrl,
    JWT_ACCESS_SECRET: testSecret,
    ...overrides,
  });
}

function logCapture() {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      lines.push(String(chunk));
      callback();
    },
  });
  return { stream, lines };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('request time limit (ADR-0020)', () => {
  it('answers a slow GET with 504 REQUEST_TIMEOUT, Retry-After and the usual headers', async () => {
    const { stream, lines } = logCapture();
    const app = buildApp(envWith({ REQUEST_HANDLER_TIMEOUT_MS: '50' }), healthyDeps, {
      logStream: stream,
    });
    let finished = false;
    app.get('/slow', async () => {
      await sleep(300);
      finished = true;
      return { ok: true };
    });

    const started = Date.now();
    const res = await app.inject({ method: 'GET', url: '/slow' });

    expect(res.statusCode).toBe(504);
    expect(Date.now() - started).toBeLessThan(250);
    expect(res.headers['retry-after']).toBe('5');
    expect(res.json()).toEqual({
      error: { code: 'REQUEST_TIMEOUT', message: 'The request took too long, please try again shortly' },
    });
    // The answer is a normal one: request id and security headers are still there.
    expect(res.headers['x-request-id']).toBeTruthy();
    expect(String(res.headers['content-security-policy'])).toContain("default-src 'none'");
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(lines.join('')).toContain('request timed out');

    while (!finished) await sleep(20);
    await app.close();
  });

  it('tells a writer the outcome is unknown and never invites a blind retry', async () => {
    const app = buildApp(envWith({ REQUEST_HANDLER_TIMEOUT_MS: '50' }), healthyDeps);
    let finished = 0;
    const slow = async () => {
      await sleep(300);
      finished += 1;
      return { ok: true };
    };
    app.post('/write', slow);
    app.put('/write', slow);
    app.patch('/write', slow);
    app.delete('/write', slow);

    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE'] as const) {
      const res = await app.inject({ method, url: '/write' });
      expect(res.statusCode, method).toBe(504);
      expect(res.headers['retry-after'], method).toBeUndefined();
      const body = res.json<{ error: { code: string; message: string } }>();
      expect(body.error.code, method).toBe('REQUEST_TIMEOUT');
      expect(body.error.message, method).toContain('outcome is unknown');
    }

    while (finished < 4) await sleep(20);
    await app.close();
  });

  it('does not cancel the handler: a write can still complete after its 504', async () => {
    const app = buildApp(envWith({ REQUEST_HANDLER_TIMEOUT_MS: '50' }), healthyDeps);
    let written = false;
    app.post('/write', async () => {
      await sleep(200);
      written = true;
      return { ok: true };
    });

    const res = await app.inject({ method: 'POST', url: '/write' });
    expect(res.statusCode).toBe(504);
    expect(written, 'the 504 arrived before the work finished').toBe(false);

    await sleep(300);
    expect(written, 'the work finished anyway, which is why the 504 says the outcome is unknown').toBe(true);
    await app.close();
  });

  it('survives a handler that fails after the 504 and keeps serving', async () => {
    const app = buildApp(envWith({ REQUEST_HANDLER_TIMEOUT_MS: '50' }), healthyDeps);
    let failed = false;
    app.get('/late-failure', async () => {
      await sleep(150);
      failed = true;
      throw new Error('late failure with a secret detail');
    });

    const res = await app.inject({ method: 'GET', url: '/late-failure' });
    expect(res.statusCode).toBe(504);
    expect(res.body).not.toContain('secret');

    while (!failed) await sleep(20);
    await sleep(50);
    const health = await app.inject({ method: 'GET', url: '/api/v1/health' });
    expect(health.statusCode).toBe(200);
    await app.close();
  });

  it('leaves a request that finishes in time alone, and leaves no timer behind', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const app = buildApp(envWith({ REQUEST_HANDLER_TIMEOUT_MS: '5000' }), healthyDeps);
    app.get('/fast', async () => ({ ok: true }));
    app.get('/fails-fast', async () => {
      throw new Error('boom');
    });
    await app.ready();

    const before = vi.getTimerCount();
    const ok = await app.inject({ method: 'GET', url: '/fast' });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toEqual({ ok: true });
    expect(vi.getTimerCount(), 'the timer of a finished request is cleared').toBe(before);

    const failed = await app.inject({ method: 'GET', url: '/fails-fast' });
    expect(failed.statusCode).toBe(500);
    expect(vi.getTimerCount(), 'the timer of a failed request is cleared too').toBe(before);
    await app.close();
  });

  it('does nothing when the limit is 0', async () => {
    const app = buildApp(envWith({ REQUEST_HANDLER_TIMEOUT_MS: '0' }), healthyDeps);
    app.get('/slow', async () => {
      await sleep(150);
      return { ok: true };
    });
    const res = await app.inject({ method: 'GET', url: '/slow' });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

describe('REQUEST_HANDLER_TIMEOUT_MS in the environment (ADR-0020)', () => {
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

  it('defaults to 30 seconds and rejects values outside 0 to 300000', () => {
    expect(envWith().REQUEST_HANDLER_TIMEOUT_MS).toBe(30_000);
    expect(envWith({ REQUEST_HANDLER_TIMEOUT_MS: '0' }).REQUEST_HANDLER_TIMEOUT_MS).toBe(0);
    for (const bad of ['-1', '300001', 'abc', '1.5']) {
      expect(() => envWith({ REQUEST_HANDLER_TIMEOUT_MS: bad }), bad).toThrow();
    }
  });

  it('accepts the defaults in production, where the request limit exceeds the statement limit', () => {
    const parsed = prod();
    expect(parsed.REQUEST_HANDLER_TIMEOUT_MS).toBe(30_000);
    expect(parsed.DB_STATEMENT_TIMEOUT_MS).toBe(15_000);
  });

  it('refuses to start in production with no request limit', () => {
    expect(() => prod({ REQUEST_HANDLER_TIMEOUT_MS: '0' })).toThrow(/REQUEST_HANDLER_TIMEOUT_MS/);
  });

  it('refuses a request limit that does not outlast the statement limit in production', () => {
    expect(() =>
      prod({ REQUEST_HANDLER_TIMEOUT_MS: '15000', DB_STATEMENT_TIMEOUT_MS: '15000' }),
    ).toThrow(/REQUEST_HANDLER_TIMEOUT_MS must be greater than DB_STATEMENT_TIMEOUT_MS/);
    expect(() =>
      prod({ REQUEST_HANDLER_TIMEOUT_MS: '5000', DB_STATEMENT_TIMEOUT_MS: '15000' }),
    ).toThrow(/REQUEST_HANDLER_TIMEOUT_MS/);
    expect(prod({ REQUEST_HANDLER_TIMEOUT_MS: '15001', DB_STATEMENT_TIMEOUT_MS: '15000' }).REQUEST_HANDLER_TIMEOUT_MS).toBe(15_001);
    // Without a statement limit there is nothing to outlast.
    expect(prod({ REQUEST_HANDLER_TIMEOUT_MS: '5000', DB_STATEMENT_TIMEOUT_MS: '0' }).REQUEST_HANDLER_TIMEOUT_MS).toBe(5000);
  });

  it('allows the same settings outside production, where tests and laptops need them', () => {
    const parsed = envWith({ REQUEST_HANDLER_TIMEOUT_MS: '50', DB_STATEMENT_TIMEOUT_MS: '15000' });
    expect(parsed.REQUEST_HANDLER_TIMEOUT_MS).toBe(50);
  });
});
