import { describe, expect, it, vi } from 'vitest';
import { buildApp } from '../../app.js';
import { unauthorized } from '../../common/errors.js';
import { loadEnv } from '../../config/env.js';
import type { AuthService } from './auth.service.js';
import { generateRefreshToken, isWellFormedRefreshToken } from './refresh-token.js';

// Input shape checks for the two untrusted values that do not come in a body: the refresh cookie
// and the Authorization header. Junk must be rejected before it is hashed or looked up.

const env = loadEnv({
  NODE_ENV: 'test',
  DATABASE_URL: 'mysql://user:pass@127.0.0.1:3306/axor_test',
  JWT_ACCESS_SECRET: 'unit-test-secret-that-is-long-enough-123456',
});
const ORIGIN = new URL(env.WEB_ORIGIN).origin;

function setup() {
  const auth = {
    refresh: vi.fn().mockRejectedValue(unauthorized('Invalid or expired session')),
    logout: vi.fn().mockResolvedValue(undefined),
    authenticate: vi.fn().mockRejectedValue(unauthorized()),
  };
  const app = buildApp(env, { checkDatabase: async () => {}, auth: auth as unknown as AuthService });
  return { app, auth };
}

const cookieOf = (value: string) => ({ origin: ORIGIN, cookie: `axor_rt=${encodeURIComponent(value)}` });

describe('isWellFormedRefreshToken', () => {
  it('accepts every token we generate', () => {
    for (let i = 0; i < 50; i += 1) expect(isWellFormedRefreshToken(generateRefreshToken().token)).toBe(true);
  });

  it('rejects anything else', () => {
    const good = generateRefreshToken().token;
    for (const junk of ['', 'abc', `${good}x`, good.slice(1), `${good.slice(1)}!`, 'a'.repeat(5000), `${good}\n`]) {
      expect(isWellFormedRefreshToken(junk), JSON.stringify(junk.slice(0, 20))).toBe(false);
    }
  });
});

describe('refresh cookie', () => {
  it('lets a well-formed token through to the service', async () => {
    const { app, auth } = setup();
    const res = await app.inject({ method: 'POST', url: '/api/v1/auth/refresh', headers: cookieOf(generateRefreshToken().token) });
    expect(res.statusCode).toBe(401); // the mocked service says the session is dead
    expect(auth.refresh).toHaveBeenCalledTimes(1);
  });

  it('answers 401 and clears the cookie for a malformed token, without calling the service', async () => {
    for (const junk of ['short', 'x'.repeat(4000), `${generateRefreshToken().token}!`]) {
      const { app, auth } = setup();
      const res = await app.inject({ method: 'POST', url: '/api/v1/auth/refresh', headers: cookieOf(junk) });
      expect(res.statusCode, junk.slice(0, 10)).toBe(401);
      expect(String(res.headers['set-cookie'])).toContain('axor_rt=;');
      expect(auth.refresh).not.toHaveBeenCalled();
    }
  });

  it('logout revokes only a well-formed token, and always answers 204', async () => {
    const { app, auth } = setup();
    const junk = await app.inject({ method: 'POST', url: '/api/v1/auth/logout', headers: cookieOf('not-a-token') });
    expect(junk.statusCode).toBe(204);
    expect(auth.logout).not.toHaveBeenCalled();

    const good = await app.inject({ method: 'POST', url: '/api/v1/auth/logout', headers: cookieOf(generateRefreshToken().token) });
    expect(good.statusCode).toBe(204);
    expect(auth.logout).toHaveBeenCalledTimes(1);
  });
});

describe('Authorization header', () => {
  it('rejects an oversized bearer token before the service sees it', async () => {
    const { app, auth } = setup();
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { authorization: `Bearer ${'a'.repeat(3000)}` },
    });
    expect(res.statusCode).toBe(401);
    expect(auth.authenticate).not.toHaveBeenCalled();
  });

  it('still passes a normal-sized token to the service', async () => {
    const { app, auth } = setup();
    await app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: { authorization: `Bearer ${'a'.repeat(900)}` } });
    expect(auth.authenticate).toHaveBeenCalledTimes(1);
  });
});
