import { describe, expect, it } from 'vitest';
import { generateRefreshToken, hashRefreshToken } from './refresh-token.js';
import { createFailureThrottle } from './login-throttle.js';

function clock(start = 1_000_000) {
  let current = start;
  return {
    now: () => current,
    advance: (ms: number) => {
      current += ms;
    },
  };
}

describe('createFailureThrottle', () => {
  it('does not block until maxFailures is reached', () => {
    const t = createFailureThrottle({ maxFailures: 3, windowMs: 60_000, now: clock().now });
    t.recordFailure('k');
    t.recordFailure('k');
    expect(t.retryAfterSeconds('k')).toBe(0);
    t.recordFailure('k');
    expect(t.retryAfterSeconds('k')).toBeGreaterThan(0);
  });

  it('reports the remaining wait and unblocks when the window ends', () => {
    const c = clock();
    const t = createFailureThrottle({ maxFailures: 1, windowMs: 60_000, now: c.now });
    t.recordFailure('k');
    expect(t.retryAfterSeconds('k')).toBe(60);
    c.advance(59_000);
    expect(t.retryAfterSeconds('k')).toBe(1);
    c.advance(1_000);
    expect(t.retryAfterSeconds('k')).toBe(0);
  });

  it('tracks keys independently', () => {
    const t = createFailureThrottle({ maxFailures: 1, windowMs: 60_000, now: clock().now });
    t.recordFailure('a');
    expect(t.retryAfterSeconds('a')).toBeGreaterThan(0);
    expect(t.retryAfterSeconds('b')).toBe(0);
  });

  it('reset clears a key (successful login)', () => {
    const t = createFailureThrottle({ maxFailures: 1, windowMs: 60_000, now: clock().now });
    t.recordFailure('k');
    t.reset('k');
    expect(t.retryAfterSeconds('k')).toBe(0);
  });

  it('keeps memory bounded: never tracks more than maxEntries keys', () => {
    const t = createFailureThrottle({
      maxFailures: 1,
      windowMs: 60_000,
      maxEntries: 3,
      now: clock().now,
    });
    for (let i = 0; i < 10; i += 1) t.recordFailure(`k${i}`);
    // The oldest keys were evicted, the newest are still blocked.
    expect(t.retryAfterSeconds('k0')).toBe(0);
    expect(t.retryAfterSeconds('k9')).toBeGreaterThan(0);
  });
});

describe('refresh tokens', () => {
  it('generates unique, URL-safe, high-entropy tokens', () => {
    const a = generateRefreshToken();
    const b = generateRefreshToken();
    expect(a.token).not.toBe(b.token);
    expect(a.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('stores only a SHA-256 digest that is not the token itself', () => {
    const { token, tokenHash } = generateRefreshToken();
    expect(tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(tokenHash).not.toContain(token);
    expect(hashRefreshToken(token)).toBe(tokenHash);
  });
});
