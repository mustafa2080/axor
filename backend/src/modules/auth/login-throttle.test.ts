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

describe('createFailureThrottle escalation', () => {
  const MIN = 60_000;
  const HOUR = 60 * MIN;
  const escalation = { maxBlockMs: 4 * HOUR, memoryMs: 24 * HOUR };

  function failUntilBlocked(t: ReturnType<typeof createFailureThrottle>, key: string, n: number) {
    for (let i = 0; i < n; i += 1) t.recordFailure(key);
  }

  it('makes each new block twice as long as the one before, up to the cap', () => {
    const c = clock();
    const t = createFailureThrottle({ maxFailures: 2, windowMs: 15 * MIN, escalation, now: c.now });

    failUntilBlocked(t, 'k', 2);
    expect(t.retryAfterSeconds('k')).toBe(15 * 60); // first block: the plain window
    c.advance(15 * MIN);
    expect(t.retryAfterSeconds('k')).toBe(0);

    failUntilBlocked(t, 'k', 2);
    expect(t.retryAfterSeconds('k')).toBe(30 * 60); // second: double
    c.advance(30 * MIN);

    failUntilBlocked(t, 'k', 2);
    expect(t.retryAfterSeconds('k')).toBe(60 * 60); // third: double again
    c.advance(60 * MIN);

    failUntilBlocked(t, 'k', 2);
    expect(t.retryAfterSeconds('k')).toBe(2 * 60 * 60);
    c.advance(2 * HOUR);

    failUntilBlocked(t, 'k', 2);
    expect(t.retryAfterSeconds('k')).toBe(4 * 60 * 60); // would be 4h, exactly the cap
    c.advance(4 * HOUR);

    failUntilBlocked(t, 'k', 2);
    expect(t.retryAfterSeconds('k')).toBe(4 * 60 * 60); // never above the cap
  });

  it('keeps the first block exactly as it was without escalation', () => {
    // The window starts at the first failure, so slow failures give a shorter first block.
    // Each throttle gets its own clock so both see exactly the same moments.
    const plainClock = clock();
    const escClock = clock();
    const plain = createFailureThrottle({ maxFailures: 2, windowMs: 15 * MIN, now: plainClock.now });
    const esc = createFailureThrottle({
      maxFailures: 2,
      windowMs: 15 * MIN,
      escalation,
      now: escClock.now,
    });
    for (const [t, c] of [
      [plain, plainClock],
      [esc, escClock],
    ] as const) {
      t.recordFailure('k');
      c.advance(10 * MIN);
      t.recordFailure('k');
    }
    expect(esc.retryAfterSeconds('k')).toBe(plain.retryAfterSeconds('k'));
    expect(esc.retryAfterSeconds('k')).toBe(5 * 60);
  });

  it('forgives a key after memoryMs without a new block, so it starts from the base window again', () => {
    const c = clock();
    const t = createFailureThrottle({ maxFailures: 2, windowMs: 15 * MIN, escalation, now: c.now });
    failUntilBlocked(t, 'k', 2);
    c.advance(15 * MIN);
    failUntilBlocked(t, 'k', 2);
    expect(t.retryAfterSeconds('k')).toBe(30 * 60);
    c.advance(30 * MIN + 24 * HOUR); // the block ended and a full memory period passed

    failUntilBlocked(t, 'k', 2);
    expect(t.retryAfterSeconds('k')).toBe(15 * 60);
  });

  it('a successful login (reset) clears the earned strikes too', () => {
    const c = clock();
    const t = createFailureThrottle({ maxFailures: 2, windowMs: 15 * MIN, escalation, now: c.now });
    failUntilBlocked(t, 'k', 2);
    c.advance(15 * MIN);
    failUntilBlocked(t, 'k', 2);
    c.advance(30 * MIN);
    t.reset('k');

    failUntilBlocked(t, 'k', 2);
    expect(t.retryAfterSeconds('k')).toBe(15 * 60);
  });

  it('escalates each key on its own', () => {
    const c = clock();
    const t = createFailureThrottle({ maxFailures: 1, windowMs: 15 * MIN, escalation, now: c.now });
    t.recordFailure('a');
    c.advance(15 * MIN);
    t.recordFailure('a');
    t.recordFailure('b');
    expect(t.retryAfterSeconds('a')).toBe(30 * 60);
    expect(t.retryAfterSeconds('b')).toBe(15 * 60);
  });

  it('does not lengthen a block that is already running when more failures arrive', () => {
    const c = clock();
    const t = createFailureThrottle({ maxFailures: 2, windowMs: 15 * MIN, escalation, now: c.now });
    failUntilBlocked(t, 'k', 2);
    c.advance(5 * MIN);
    t.recordFailure('k');
    t.recordFailure('k');
    expect(t.retryAfterSeconds('k')).toBe(10 * 60);
  });

  it('keeps the strike memory bounded as well', () => {
    const c = clock();
    const t = createFailureThrottle({
      maxFailures: 1,
      windowMs: 15 * MIN,
      escalation,
      maxEntries: 3,
      now: c.now,
    });
    // Ten keys earn a strike each; only the newest few are remembered.
    for (let i = 0; i < 10; i += 1) t.recordFailure(`k${i}`);
    c.advance(15 * MIN);
    t.recordFailure('k0'); // forgotten: back to a first block
    t.recordFailure('k9'); // remembered: its second block is double
    expect(t.retryAfterSeconds('k0')).toBe(15 * 60);
    expect(t.retryAfterSeconds('k9')).toBe(30 * 60);
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
