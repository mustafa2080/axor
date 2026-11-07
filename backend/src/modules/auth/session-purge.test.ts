import { describe, expect, it, vi } from 'vitest';
import { purgeExpiredSessions } from './session-purge.js';

const NOW = new Date('2026-11-07T12:00:00.000Z');
const DAY = 24 * 60 * 60_000;
const options = { graceMs: 7 * DAY, batchSize: 100, maxBatches: 5, clock: () => NOW };

describe('purgeExpiredSessions', () => {
  it('passes "now minus the grace period" as the cutoff', async () => {
    const store = { purgeExpired: vi.fn().mockResolvedValue(0) };
    await purgeExpiredSessions(store, options);
    expect(store.purgeExpired).toHaveBeenCalledWith(new Date(NOW.getTime() - 7 * DAY), 100);
  });

  it('stops after a partial batch and returns the total', async () => {
    const store = { purgeExpired: vi.fn().mockResolvedValueOnce(100).mockResolvedValueOnce(40) };
    expect(await purgeExpiredSessions(store, options)).toBe(140);
    expect(store.purgeExpired).toHaveBeenCalledTimes(2);
  });

  it('never runs more than maxBatches deletes in one pass', async () => {
    const store = { purgeExpired: vi.fn().mockResolvedValue(100) };
    expect(await purgeExpiredSessions(store, options)).toBe(500);
    expect(store.purgeExpired).toHaveBeenCalledTimes(5);
  });

  it('does a single delete when nothing is due', async () => {
    const store = { purgeExpired: vi.fn().mockResolvedValue(0) };
    expect(await purgeExpiredSessions(store, options)).toBe(0);
    expect(store.purgeExpired).toHaveBeenCalledTimes(1);
  });

  it('lets a store error reach the scheduler', async () => {
    const store = { purgeExpired: vi.fn().mockRejectedValue(new Error('db down')) };
    await expect(purgeExpiredSessions(store, options)).rejects.toThrow('db down');
  });
});
