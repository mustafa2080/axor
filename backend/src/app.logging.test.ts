import { Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { buildApp } from './app.js';
import { loadEnv } from './config/env.js';
import { AppError, conflict, forbidden, notFound, unauthorized } from './common/errors.js';
import { parseInput } from './common/validation.js';

const env = loadEnv({
  NODE_ENV: 'test',
  DATABASE_URL: 'mysql://user:pass@127.0.0.1:3306/axor_test',
  JWT_ACCESS_SECRET: 'unit-test-secret-that-is-long-enough-123456',
});
const deps = { checkDatabase: async () => {} };

function captureLogs() {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      lines.push(chunk.toString());
      callback();
    },
  });
  return { stream, text: () => lines.join('') };
}

describe('request id', () => {
  it('generates an id when none is sent', async () => {
    const res = await buildApp(env, deps).inject({ method: 'GET', url: '/api/v1/health' });
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('echoes a well-formed incoming id', async () => {
    const res = await buildApp(env, deps).inject({
      method: 'GET',
      url: '/api/v1/health',
      headers: { 'x-request-id': 'trace-abc_123.456' },
    });
    expect(res.headers['x-request-id']).toBe('trace-abc_123.456');
  });

  it('replaces a malformed incoming id (no log injection)', async () => {
    const res = await buildApp(env, deps).inject({
      method: 'GET',
      url: '/api/v1/health',
      headers: { 'x-request-id': 'bad id with spaces' },
    });
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('error handling', () => {
  it('returns AppError (4xx) with its code and message', async () => {
    const app = buildApp(env, deps);
    app.get('/e', async () => {
      throw conflict('Email already in use');
    });
    const res = await app.inject({ method: 'GET', url: '/e' });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ error: { code: 'CONFLICT', message: 'Email already in use' } });
  });

  it('provides factories for the common statuses', () => {
    expect([unauthorized(), forbidden(), notFound()].map((e) => e.statusCode)).toEqual([
      401, 403, 404,
    ]);
  });

  it('hides the message of an AppError with status >= 500', async () => {
    const app = buildApp(env, deps);
    app.get('/e', async () => {
      throw new AppError(500, 'DB_FAIL', 'secret connection string');
    });
    const res = await app.inject({ method: 'GET', url: '/e' });
    expect(res.statusCode).toBe(500);
    expect(res.body).not.toContain('secret');
    expect(res.json()).toEqual({
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
    });
  });

  it('returns 400 for malformed JSON', async () => {
    const app = buildApp(env, deps);
    app.post('/e', async () => ({}));
    const res = await app.inject({
      method: 'POST',
      url: '/e',
      headers: { 'content-type': 'application/json' },
      payload: '{ not json',
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('BAD_REQUEST');
  });

  it('returns 413 for a payload over the body limit', async () => {
    const app = buildApp(env, deps);
    app.post('/e', async () => ({}));
    const res = await app.inject({
      method: 'POST',
      url: '/e',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ blob: 'x'.repeat(1_048_577) }),
    });
    expect(res.statusCode).toBe(413);
  });
});

describe('validation (parseInput)', () => {
  const schema = z.object({ email: z.email(), age: z.number().int().min(18) });

  it('returns the typed value for valid input', () => {
    expect(parseInput(schema, { email: 'a@b.co', age: 20 })).toEqual({ email: 'a@b.co', age: 20 });
  });

  it('responds 400 VALIDATION_ERROR with paths only, never the submitted values', async () => {
    const app = buildApp(env, deps);
    app.post('/v', async (request) => parseInput(schema, request.body));
    const res = await app.inject({
      method: 'POST',
      url: '/v',
      payload: { email: 'not-an-email-SENSITIVE', age: 5 },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.details.map((d: { path: string }) => d.path).sort()).toEqual([
      'age',
      'email',
    ]);
    expect(res.body).not.toContain('SENSITIVE');
  });
});

describe('logging', () => {
  it('redacts credentials and strips query strings', async () => {
    const logs = captureLogs();
    const app = buildApp(env, deps, { logStream: logs.stream });
    app.post('/login', async () => ({ ok: true }));
    await app.inject({
      method: 'POST',
      url: '/login?token=QUERYSECRET',
      headers: { authorization: 'Bearer HEADERSECRET', cookie: 'sid=COOKIESECRET' },
      payload: { password: 'BODYSECRET' },
    });
    const output = logs.text();
    expect(output).toContain('/login');
    for (const secret of ['QUERYSECRET', 'HEADERSECRET', 'COOKIESECRET']) {
      expect(output).not.toContain(secret);
    }
  });

  it('logs unexpected errors server-side but not to the client', async () => {
    const logs = captureLogs();
    const app = buildApp(env, deps, { logStream: logs.stream });
    app.get('/boom', async () => {
      throw new Error('internal detail xyz');
    });
    const res = await app.inject({ method: 'GET', url: '/boom' });
    expect(res.body).not.toContain('xyz');
    expect(logs.text()).toContain('unhandled error');
  });
});
