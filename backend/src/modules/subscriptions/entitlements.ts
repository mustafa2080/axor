import type { PlanLimits } from '../../database/schema/index.js';

/**
 * What a company's plans allow, as pure functions (ADR-0012). No database here: the repositories
 * load the subscriptions and call these, so the rules can be tested with plain objects.
 */

/** The plan-limit key that caps how many people a company may have. */
export const USERS_LIMIT_KEY = 'users';

export interface LimitSource {
  /** Whether the subscription gives access right now (status AND end date). */
  entitled: boolean;
  /** Limits of the plan version the subscription is on; null when its version cannot be resolved. */
  limits: PlanLimits | null;
}

export type UserSeatLimit = { kind: 'none' } | { kind: 'max'; max: number };

/**
 * How many people the company may have, across the subscriptions that entitle it right now.
 *
 *  - Only entitled subscriptions count: an expired or canceled plan stops granting its limit.
 *  - A plan that does not mention `users` says nothing about people, and `null` means unlimited.
 *  - With several entitled plans (one per product) the most generous one wins: a company that
 *    pays for a bigger plan on one product is not held to the smaller plan of another.
 *  - No entitled plan says nothing either: there is no limit to apply, and access to the products
 *    is a separate check (`isEntitled`).
 */
export function resolveUserSeatLimit(sources: readonly LimitSource[]): UserSeatLimit {
  let max: number | undefined;
  for (const source of sources) {
    if (!source.entitled || source.limits === null) continue;
    const value = source.limits[USERS_LIMIT_KEY];
    if (value === undefined) continue;
    if (value === null) return { kind: 'none' };
    max = max === undefined ? value : Math.max(max, value);
  }
  return max === undefined ? { kind: 'none' } : { kind: 'max', max };
}

/** Whether one more person fits when `occupied` seats are already taken. */
export function hasFreeSeat(limit: UserSeatLimit, occupied: number): boolean {
  return limit.kind === 'none' || occupied + 1 <= limit.max;
}
