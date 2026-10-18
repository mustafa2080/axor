import { mysqlTable, uniqueIndex, varchar } from 'drizzle-orm/mysql-core';
import { businessActivities } from './business-activities.js';
import { createdAt, id, updatedAt, uuidRef } from './columns.js';
import type { PlanStatus } from './enums.js';
import { products } from './products.js';

export const plans = mysqlTable(
  'plans',
  {
    id: id(),
    productId: uuidRef('product_id')
      .notNull()
      .references(() => products.id),
    activityId: uuidRef('activity_id').references(() => businessActivities.id),
    code: varchar('code', { length: 50 }).notNull(),
    status: varchar('status', { length: 20 }).$type<PlanStatus>().notNull().default('active'),
    /**
     * The version every non-pinned subscription is entitled to (ADR-0003 #4).
     * Intentionally has no foreign key (it would form a cycle with plan_versions);
     * the application verifies it points at a version of this plan.
     */
    currentVersionId: uuidRef('current_version_id'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('plans_product_code_uq').on(t.productId, t.code)],
);
