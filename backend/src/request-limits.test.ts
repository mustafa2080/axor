import { describe, expect, it } from 'vitest';
import {
  HEADERS_TIMEOUT_MS,
  MAX_BODY_BYTES,
  MAX_PARAM_LENGTH,
  REQUEST_TIMEOUT_MS,
  buildApp,
} from './app.js';
import { loadEnv } from './config/env.js';

// Request size, content type and time limits (ADR-0015). The API reads small JSON bodies only and
// has no upload feature, so anything bigger, slower or in another format is refused early.

const env = loadEnv({
  NODE_ENV: 'test',
  DATABASE_URL: 'mysql://user:pass@127.0.0.1:3306/axor_test',
  JWT_ACCESS_SECRET: 'unit-test-secret-that-is-long-enough-123456',
});

function appWithEchoRoutes() {
  const app = buildApp(env, { checkDatabase: async () => {} });
  app.post('/e', async () => ({ ok: true }));
  app.get('/p/:id', async () => ({ ok: true }));
  return app;
}

// A JSON body of exactly `bytes` bytes: {"b":"xxx..."}
function jsonBodyOfSize(bytes: number): string {
  const overhead = JSON.stringify({ b: '' }).length;
  return JSON.stringify({ b: 'x'.repeat(bytes - overhead) });
}

const JSON_HEADERS = { 'content-type': 'application/json' };

describe('body size', () => {
  it('keeps the limit small: far below the old 1 MiB, still roomy for real requests', () => {
    expect(MAX_BODY_BYTES).toBeLessThanOrEqual(131_072);
    expect(MAX_BODY_BYTES).toBeGreaterThanOrEqual(16_384);
  });

  it('accepts a body exactly at the limit', async () => {
    const res = await appWithEchoRoutes().inject({
      method: 'POST',
      url: '/e',
      headers: JSON_HEADERS,
      payload: jsonBodyOfSize(MAX_BODY_BYTES),
    });
    expect(res.statusCode).toBe(200);
  });

  it('refuses a body one byte over the limit with 413', async () => {
    const res = await appWithEchoRoutes().inject({
      method: 'POST',
      url: '/e',
      headers: JSON_HEADERS,
      payload: jsonBodyOfSize(MAX_BODY_BYTES + 1),
    });
    expect(res.statusCode).toBe(413);
    expect(res.json().error.code).toBe('BAD_REQUEST');
  });

  it('refuses early when the declared Content-Length is already over the limit', async () => {
    const res = await appWithEchoRoutes().inject({
      method: 'POST',
      url: '/e',
      headers: { ...JSON_HEADERS, 'content-length': String(MAX_BODY_BYTES * 50) },
      payload: '{}',
    });
    expect(res.statusCode).toBe(413);
  });
});

describe('content type', () => {
  it('accepts JSON, with or without a charset', async () => {
    const app = appWithEchoRoutes();
    for (const contentType of ['application/json', 'application/json; charset=utf-8']) {
      const res = await app.inject({
        method: 'POST',
        url: '/e',
        headers: { 'content-type': contentType },
        payload: '{}',
      });
      expect(res.statusCode, contentType).toBe(200);
    }
  });

  it('answers 415 to every other body format, uploads included', async () => {
    const app = appWithEchoRoutes();
    const others = [
      'text/plain',
      'text/html',
      'application/xml',
      'application/x-www-form-urlencoded',
      'application/octet-stream',
      'multipart/form-data; boundary=----axor',
    ];
    for (const contentType of others) {
      const res = await app.inject({
        method: 'POST',
        url: '/e',
        headers: { 'content-type': contentType },
        payload: 'a=b',
      });
      expect(res.statusCode, contentType).toBe(415);
    }
  });
});

describe('path parameters', () => {
  it('accepts a parameter at the length limit and rejects a longer one', async () => {
    const app = appWithEchoRoutes();
    const ok = await app.inject({ method: 'GET', url: `/p/${'a'.repeat(MAX_PARAM_LENGTH)}` });
    expect(ok.statusCode).toBe(200);
    const tooLong = await app.inject({
      method: 'GET',
      url: `/p/${'a'.repeat(MAX_PARAM_LENGTH + 1)}`,
    });
    expect(tooLong.statusCode).toBe(414);
  });
});

describe('time limits', () => {
  it('cuts off slow requests and slow headers', () => {
    const { server } = appWithEchoRoutes();
    expect(server.requestTimeout).toBe(REQUEST_TIMEOUT_MS);
    expect(server.headersTimeout).toBe(HEADERS_TIMEOUT_MS);
    expect(REQUEST_TIMEOUT_MS).toBeGreaterThan(0);
    expect(REQUEST_TIMEOUT_MS).toBeLessThanOrEqual(60_000);
    expect(HEADERS_TIMEOUT_MS).toBeGreaterThan(0);
    expect(HEADERS_TIMEOUT_MS).toBeLessThanOrEqual(REQUEST_TIMEOUT_MS);
  });
});
