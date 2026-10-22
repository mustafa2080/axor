import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startExpiryJob } from './expiry-job.js';

describe('expiry job', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('runs once at start and then on every interval', async () => {
    const run = vi.fn().mockResolvedValue(0);
    const job = startExpiryJob({ run, intervalMs: 1000, onError: vi.fn() });
    expect(run).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(3000);
    expect(run).toHaveBeenCalledTimes(4);
    await job.stop();
  });

  it('never overlaps two passes', async () => {
    let release: () => void = () => undefined;
    const run = vi.fn().mockImplementation(
      () =>
        new Promise<number>((resolve) => {
          release = () => resolve(1);
        }),
    );
    const job = startExpiryJob({ run, intervalMs: 1000, onError: vi.fn() });
    await vi.advanceTimersByTimeAsync(5000);
    expect(run).toHaveBeenCalledTimes(1);
    release();
    await vi.advanceTimersByTimeAsync(1000);
    expect(run).toHaveBeenCalledTimes(2);
    release();
    await job.stop();
  });

  it('reports a failed pass and keeps running', async () => {
    const boom = new Error('db down');
    const run = vi.fn().mockRejectedValueOnce(boom).mockResolvedValue(2);
    const onError = vi.fn();
    const onResult = vi.fn();
    const job = startExpiryJob({ run, intervalMs: 1000, onError, onResult });
    await vi.advanceTimersByTimeAsync(1000);
    expect(onError).toHaveBeenCalledWith(boom);
    expect(onResult).toHaveBeenCalledWith(2);
    await job.stop();
  });

  it('stops scheduling and waits for the pass in flight', async () => {
    let release: () => void = () => undefined;
    const run = vi.fn().mockImplementation(
      () =>
        new Promise<number>((resolve) => {
          release = () => resolve(0);
        }),
    );
    const job = startExpiryJob({ run, intervalMs: 1000, onError: vi.fn() });
    let stopped = false;
    const stopping = job.stop().then(() => {
      stopped = true;
    });
    await Promise.resolve();
    expect(stopped).toBe(false);
    release();
    await stopping;
    expect(stopped).toBe(true);
    await vi.advanceTimersByTimeAsync(5000);
    expect(run).toHaveBeenCalledTimes(1);
  });
});
