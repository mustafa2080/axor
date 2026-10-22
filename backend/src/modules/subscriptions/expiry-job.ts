export interface ExpiryJobOptions {
  /** One pass of the work; resolves with how many subscriptions it expired. */
  run: () => Promise<number>;
  intervalMs: number;
  onResult?: (expired: number) => void;
  /** A failed pass must never crash the server; it is reported and retried on the next tick. */
  onError: (error: unknown) => void;
}

export interface ExpiryJob {
  /** Stops scheduling and waits for a pass that is already running to finish. */
  stop(): Promise<void>;
}

/**
 * Runs `run` every `intervalMs` (ADR-0007). Passes never overlap, a failure never stops the
 * schedule, and the timer never keeps the process alive. Access does not depend on this job:
 * `isEntitled` checks the end date itself; the job only makes the stored status catch up.
 */
export function startExpiryJob(options: ExpiryJobOptions): ExpiryJob {
  let running: Promise<void> | undefined;

  const tick = (): void => {
    if (running !== undefined) return;
    running = options
      .run()
      .then((expired) => options.onResult?.(expired))
      .catch((error: unknown) => options.onError(error))
      .finally(() => {
        running = undefined;
      });
  };

  const timer = setInterval(tick, options.intervalMs);
  timer.unref();
  // First pass right away so a server that was down over an end date catches up on boot.
  tick();

  return {
    async stop() {
      clearInterval(timer);
      await running;
    },
  };
}
