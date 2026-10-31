import { describe, expect, it } from 'vitest';
import { hasFreeSeat, resolveUserSeatLimit, type LimitSource } from './entitlements.js';

const plan = (limits: LimitSource['limits'], entitled = true): LimitSource => ({ entitled, limits });

describe('resolveUserSeatLimit', () => {
  it('has no limit without any subscription', () => {
    expect(resolveUserSeatLimit([])).toEqual({ kind: 'none' });
  });

  it('uses the users limit of an entitled plan', () => {
    expect(resolveUserSeatLimit([plan({ users: 5, shipments: null })])).toEqual({ kind: 'max', max: 5 });
  });

  it('treats null as unlimited', () => {
    expect(resolveUserSeatLimit([plan({ users: null })])).toEqual({ kind: 'none' });
  });

  it('ignores a plan that does not mention users', () => {
    expect(resolveUserSeatLimit([plan({ shipments: 10 })])).toEqual({ kind: 'none' });
    expect(resolveUserSeatLimit([plan({})])).toEqual({ kind: 'none' });
  });

  it('ignores plans that no longer entitle the company, and unresolved versions', () => {
    expect(resolveUserSeatLimit([plan({ users: 1 }, false)])).toEqual({ kind: 'none' });
    expect(resolveUserSeatLimit([plan(null)])).toEqual({ kind: 'none' });
    expect(resolveUserSeatLimit([plan({ users: 1 }, false), plan({ users: 7 })])).toEqual({
      kind: 'max',
      max: 7,
    });
  });

  it('takes the most generous entitled plan, and unlimited beats any number', () => {
    expect(resolveUserSeatLimit([plan({ users: 5 }), plan({ users: 50 })])).toEqual({
      kind: 'max',
      max: 50,
    });
    expect(resolveUserSeatLimit([plan({ users: 5 }), plan({ users: null })])).toEqual({ kind: 'none' });
    expect(resolveUserSeatLimit([plan({ users: null }), plan({ users: 5 })])).toEqual({ kind: 'none' });
  });

  it('keeps zero as a real limit', () => {
    expect(resolveUserSeatLimit([plan({ users: 0 })])).toEqual({ kind: 'max', max: 0 });
  });
});

describe('hasFreeSeat', () => {
  it('allows anyone without a limit', () => {
    expect(hasFreeSeat({ kind: 'none' }, 10_000)).toBe(true);
  });

  it('allows one more only while seats are free', () => {
    expect(hasFreeSeat({ kind: 'max', max: 5 }, 4)).toBe(true);
    expect(hasFreeSeat({ kind: 'max', max: 5 }, 5)).toBe(false);
    expect(hasFreeSeat({ kind: 'max', max: 5 }, 9)).toBe(false);
    expect(hasFreeSeat({ kind: 'max', max: 0 }, 0)).toBe(false);
  });
});
