import { describe, expect, it } from 'vitest';
import { ok } from './response.js';

describe('ok', () => {
  it('wraps the payload in { data }', () => {
    expect(ok({ id: 1 })).toEqual({ data: { id: 1 } });
  });

  it('adds meta only when provided', () => {
    expect(ok([1, 2], { page: 1, total: 2 })).toEqual({
      data: [1, 2],
      meta: { page: 1, total: 2 },
    });
  });
});
