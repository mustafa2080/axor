import { index, mysqlTable, uniqueIndex, varchar } from 'drizzle-orm/mysql-core';
import { createdAt, dateTime, id, updatedAt, uuidRef } from './columns.js';
import type { SubscriptionStatus } from './enums.js';
import { planVersions } from './plan-versions.js';
import { plans } from './plans.js';
import { products } from './products.js';
import { tenants } from './tenants.js';

/** One row per (company, product); history lives in subscription_events. */
export const subscriptions = mysqlTable(
  'subscriptions',
  {
    id: id(),
    tenantId: uuidRef('tenant_id')
      .notNull()
      .references(() => tenants.id),
    productId: uuidRef('product_id')
      .notNull()
      .references(() => products.id),
    planId: uuidRef('plan_id')
      .notNull()
      .references(() => plans.id),
    /**
     * Normally null: entitlements follow the plan's current version.
     * Set only by an admin to freeze a subscription on a specific version (ADR-0003 #4).
     */
    pinnedPlanVersionId: uuidRef('pinned_plan_version_id').references(() => planVersions.id),
    status: varchar('status', { length: 20 })
      .$type<SubscriptionStatus>()
      .notNull()
      .default('trialing'),
    trialEndsAt: dateTime('trial_ends_at'),
    currentPeriodEnd: dateTime('current_period_end'),
    canceledAt: dateTime('canceled_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('subscriptions_tenant_product_uq').on(t.tenantId, t.productId),
    index('subscriptions_status_period_idx').on(t.status, t.currentPeriodEnd),
  ],
);
