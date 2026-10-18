import { describe, expect, it } from 'vitest';
import { normalizeEmailKey } from './email.js';
import { uuidv7 } from './id.js';

describe('normalizeEmailKey', () => {
  it('trims and lowercases', () => {
    expect(normalizeEmailKey('  Ali@Example.COM ')).toBe('ali@example.com');
  });

  it('drops a +tag from the local part only', () => {
    expect(normalizeEmailKey('ali+trial2@example.com')).toBe('ali@example.com');
    expect(normalizeEmailKey('ali@ex+ample.com')).toBe('ali@ex+ample.com');
  });

  it('keeps a leading plus (not a tag)', () => {
    expect(normalizeEmailKey('+ali@example.com')).toBe('+ali@example.com');
  });

  it('rejects malformed addresses', () => {
    expect(() => normalizeEmailKey('no-at-sign')).toThrow();
    expect(() => normalizeEmailKey('@example.com')).toThrow();
    expect(() => normalizeEmailKey('ali@')).toThrow();
  });
});

describe('uuidv7', () => {
  const pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

  it('produces a valid RFC 9562 version 7 UUID', () => {
    expect(uuidv7()).toMatch(pattern);
  });

  it('encodes the timestamp in the first 48 bits', () => {
    const now = 1_760_000_000_000;
    const hex = uuidv7(now).replace(/-/g, '').slice(0, 12);
    expect(Number.parseInt(hex, 16)).toBe(now);
  });

  it('sorts by creation time', () => {
    const a = uuidv7(1_000);
    const b = uuidv7(2_000);
    expect(a < b).toBe(true);
  });

  it('does not collide for ids generated in the same millisecond', () => {
    const ids = new Set(Array.from({ length: 1_000 }, () => uuidv7(5_000)));
    expect(ids.size).toBe(1_000);
  });
});
