import type { SubscriptionStatus } from '../../database/schema/index.js';

// Subscription lifecycle rules (ADR-0007). Pure functions, no database: every transition and every
// "may this company use the system right now?" answer goes through here so the rules live in one
// tested place (TASKS.md 4.1: no duplicated subscription logic).

const transitions: Record<SubscriptionStatus, readonly SubscriptionStatus[]> = {
  trialing: ['active', 'canceled', 'expired'],
  // active -> active is a renewal / new period end set by staff.
  active: ['active', 'past_due', 'canceled', 'expired'],
  past_due: ['active', 'canceled', 'expired'],
  canceled: ['active'],
  expired: ['active'],
};

export function canTransition(from: SubscriptionStatus, to: SubscriptionStatus): boolean {
  return transitions[from].includes(to);
}

/** The states a company can cancel from by itself. Canceled and expired ones are already over. */
export function isCancelable(status: SubscriptionStatus): boolean {
  return canTransition(status, 'canceled');
}

export interface EntitlementInput {
  status: SubscriptionStatus;
  currentPeriodEnd: Date | null;
}

/**
 * Whether the subscription gives access at `now` (ADR-0003 §5 step 4).
 * Time is checked here too, so access stops exactly at the end date even if the expiry job has
 * not run yet. A missing end date never grants access.
 */
export function isEntitled(subscription: EntitlementInput, now: Date): boolean {
  if (subscription.status !== 'trialing' && subscription.status !== 'active') return false;
  return subscription.currentPeriodEnd !== null && subscription.currentPeriodEnd.getTime() > now.getTime();
}

const DAY_MS = 86_400_000;

export function addDays(from: Date, days: number): Date {
  return new Date(from.getTime() + days * DAY_MS);
}
