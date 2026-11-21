import { and, eq, gt, lte, sql } from 'drizzle-orm';
import type { Database } from '../client.js';
import {
  subscriptionStatuses,
  subscriptions,
  tenantStatuses,
  tenants,
  type SubscriptionStatus,
  type TenantStatus,
} from '../schema/index.js';

/** A trial counts as "ending soon" when it ends within this many days from now. */
export const TRIALS_ENDING_SOON_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

export type StatusCounts<S extends string> = Record<S, number> & { total: number };

export interface PlatformOverview {
  /** Companies by status. */
  tenants: StatusCounts<TenantStatus>;
  /** Subscriptions by their STORED status (the expiry job keeps it within a minute of reality). */
  subscriptions: StatusCounts<SubscriptionStatus>;
  /** Trials whose end date is in the future but within `trialsEndingSoonDays`. */
  trialsEndingSoon: number;
  trialsEndingSoonDays: number;
}

const countAll = sql<number>`count(*)`.mapWith(Number);

/** Every known status appears with 0 when no row has it, so the client never guesses a missing key. */
function tally<S extends string>(
  statuses: readonly S[],
  rows: ReadonlyArray<{ status: string; n: number }>,
): StatusCounts<S> {
  const counts = Object.fromEntries(statuses.map((status) => [status, 0])) as Record<S, number>;
  let total = 0;
  for (const row of rows) {
    const status = statuses.find((known) => known === row.status);
    if (status === undefined) continue;
    counts[status] += row.n;
    total += row.n;
  }
  return { ...counts, total };
}

/**
 * Platform-wide figures for the admin home (TASKS.md §5.4): how many companies and subscriptions
 * there are per status, and how many trials are about to end.
 *
 * Three small aggregate reads, each over a status index; nothing here is scoped to one company
 * because the caller is platform staff, and the route checks that before this runs. `now` is
 * injectable so the "ending soon" window can be tested without waiting. Deliberately no figure
 * built on `created_at` ("new companies this month"): those columns are filled by the database
 * clock and read back shifted (TASKS.md §10, the time-zone note), so such a number would lie.
 */
export function createOverviewAdminRepository(
  db: Database['db'],
  options: { now?: () => Date } = {},
) {
  const clock = options.now ?? (() => new Date());

  return {
    async summary(): Promise<PlatformOverview> {
      const now = clock();
      const horizon = new Date(now.getTime() + TRIALS_ENDING_SOON_DAYS * DAY_MS);
      const [tenantRows, subscriptionRows, endingSoon] = await Promise.all([
        db.select({ status: tenants.status, n: countAll }).from(tenants).groupBy(tenants.status),
        db
          .select({ status: subscriptions.status, n: countAll })
          .from(subscriptions)
          .groupBy(subscriptions.status),
        db
          .select({ n: countAll })
          .from(subscriptions)
          .where(
            and(
              eq(subscriptions.status, 'trialing'),
              gt(subscriptions.trialEndsAt, now),
              lte(subscriptions.trialEndsAt, horizon),
            ),
          ),
      ]);
      return {
        tenants: tally(tenantStatuses, tenantRows),
        subscriptions: tally(subscriptionStatuses, subscriptionRows),
        trialsEndingSoon: endingSoon[0]?.n ?? 0,
        trialsEndingSoonDays: TRIALS_ENDING_SOON_DAYS,
      };
    },
  };
}

export type OverviewAdminRepository = ReturnType<typeof createOverviewAdminRepository>;
