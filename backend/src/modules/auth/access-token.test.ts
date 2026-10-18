import { SignJWT, decodeJwt, decodeProtectedHeader } from 'jose';
import { describe, expect, it } from 'vitest';
import { AppError } from '../../common/errors.js';
import { createAccessTokenService } from './access-token.js';

const SECRET = 'test-secret-that-is-at-least-32-characters-long';
const base = { secret: SECRET, ttlSeconds: 900, issuer: 'axor-api', audience: 'axor-web' };
const USER_ID = '0199aaaa-bbbb-7ccc-8ddd-eeeeffff0001';

function makeClock(start = new Date('2026-10-18T12:00:00Z')) {
  let current = start;
  return {
    clock: () => current,
    advanceSeconds: (s: number) => {
      current = new Date(current.getTime() + s * 1000);
    },
  };
}

async function expectRejected(promise: Promise<unknown>) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(AppError);
  expect((error as AppError).statusCode).toBe(401);
  // One generic message for every failure reason.
  expect((error as AppError).message).toBe('Invalid or expired token');
}

describe('access token service', () => {
  it('round-trips a user id', async () => {
    const service = createAccessTokenService(base);
    const { token, expiresAt } = await service.sign(USER_ID);
    const verified = await service.verify(token);
    expect(verified.userId).toBe(USER_ID);
    expect(verified.tokenId).toMatch(/^[0-9a-f-]{36}$/);
    expect(verified.expiresAt.getTime()).toBe(expiresAt.getTime());
  });

  it('carries only identity claims: no role, tenant, email or permissions', async () => {
    const service = createAccessTokenService(base);
    const { token } = await service.sign(USER_ID);
    expect(Object.keys(decodeJwt(token)).sort()).toEqual(['aud', 'exp', 'iat', 'iss', 'jti', 'sub']);
    expect(decodeProtectedHeader(token)).toEqual({ alg: 'HS256', typ: 'at+jwt' });
  });

  it('issues a different token id each time', async () => {
    const service = createAccessTokenService(base);
    const a = await service.verify((await service.sign(USER_ID)).token);
    const b = await service.verify((await service.sign(USER_ID)).token);
    expect(a.tokenId).not.toBe(b.tokenId);
  });

  it('rejects an expired token but accepts it right up to the expiry', async () => {
    const time = makeClock();
    const service = createAccessTokenService({ ...base, clock: time.clock });
    const { token } = await service.sign(USER_ID);
    time.advanceSeconds(899);
    await expect(service.verify(token)).resolves.toMatchObject({ userId: USER_ID });
    time.advanceSeconds(10); // 909s: past the 900s lifetime and the 5s tolerance
    await expectRejected(service.verify(token));
  });

  it('rejects a tampered payload and a token signed with another secret', async () => {
    const service = createAccessTokenService(base);
    const { token } = await service.sign(USER_ID);
    const [header, , signature] = token.split('.') as [string, string, string];
    const forgedPayload = Buffer.from(
      JSON.stringify({ sub: 'someone-else', jti: 'x', iat: 1, exp: 9999999999, iss: 'axor-api', aud: 'axor-web' }),
    ).toString('base64url');
    await expectRejected(service.verify(`${header}.${forgedPayload}.${signature}`));

    const other = createAccessTokenService({ ...base, secret: 'another-secret-that-is-32-characters-or-more' });
    await expectRejected(service.verify((await other.sign(USER_ID)).token));
  });

  it('rejects alg=none and any algorithm other than HS256', async () => {
    const service = createAccessTokenService(base);
    const payload = { sub: USER_ID, jti: 'abc', iat: 1, exp: 9999999999, iss: 'axor-api', aud: 'axor-web' };
    const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
    const unsecured = `${encode({ alg: 'none', typ: 'at+jwt' })}.${encode(payload)}.`;
    await expectRejected(service.verify(unsecured));

    const hs512 = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS512', typ: 'at+jwt' })
      .setSubject(USER_ID)
      .setJti('abc')
      .setIssuer('axor-api')
      .setAudience('axor-web')
      .setIssuedAt()
      .setExpirationTime('10m')
      .sign(new TextEncoder().encode(SECRET));
    await expectRejected(service.verify(hs512));
  });

  it('rejects a token for another audience, issuer or token type', async () => {
    const service = createAccessTokenService(base);
    const wrongAudience = createAccessTokenService({ ...base, audience: 'someone-else' });
    const wrongIssuer = createAccessTokenService({ ...base, issuer: 'someone-else' });
    await expectRejected(service.verify((await wrongAudience.sign(USER_ID)).token));
    await expectRejected(service.verify((await wrongIssuer.sign(USER_ID)).token));

    const wrongType = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(USER_ID)
      .setJti('abc')
      .setIssuer('axor-api')
      .setAudience('axor-web')
      .setIssuedAt()
      .setExpirationTime('10m')
      .sign(new TextEncoder().encode(SECRET));
    await expectRejected(service.verify(wrongType));
  });

  it('rejects garbage input with the same generic error', async () => {
    const service = createAccessTokenService(base);
    for (const garbage of ['', 'abc', 'a.b.c', 'Bearer xyz']) {
      await expectRejected(service.verify(garbage));
    }
  });

  it('refuses weak configuration at startup', () => {
    expect(() => createAccessTokenService({ ...base, secret: 'too-short' })).toThrow();
    expect(() => createAccessTokenService({ ...base, ttlSeconds: 30 })).toThrow();
    expect(() => createAccessTokenService({ ...base, ttlSeconds: 86_400 })).toThrow();
  });
});
