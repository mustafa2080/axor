import { bigint, char, int, json, mysqlTable, uniqueIndex, varchar } from 'drizzle-orm/mysql-core';
import { createdAt, id, uuidRef } from './columns.js';
import type { BillingPeriod } from './enums.js';
import { plans } from './plans.js';

/** Numeric limits per plan version; null means unlimited. */
export type PlanLimits = Record<string, number | null>;
/** Boolean feature flags per plan version. */
export type PlanFeatures = Record<string, boolean>;

/** Immutable once created: editing a plan means inserting a new version (ADR-0003 #4). */
export const planVersions = mysqlTable(
  'plan_versions',
  {
    id: id(),
    planId: uuidRef('plan_id')
      .notNull()
      .references(() => plans.id),
    version: int('version').notNull(),
    /** Amount in the smallest currency unit. Never a float (ADR-0003 §2). */
    priceMinor: bigint('price_minor', { mode: 'number', unsigned: true }).notNull(),
    currency: char('currency', { length: 3 }).notNull(),
    billingPeriod: varchar('billing_period', { length: 20 }).$type<BillingPeriod>().notNull(),
    trialDays: int('trial_days', { unsigned: true }).notNull().default(0),
    limits: json('limits').$type<PlanLimits>().notNull(),
    features: json('features').$type<PlanFeatures>().notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('plan_versions_plan_version_uq').on(t.planId, t.version)],
);
