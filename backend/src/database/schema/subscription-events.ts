import { index, mysqlTable, varchar } from 'drizzle-orm/mysql-core';
import { createdAt, id, uuidRef } from './columns.js';
import type { SubscriptionStatus } from './enums.js';
import { subscriptions } from './subscriptions.js';
import { tenants } from './tenants.js';
import { users } from './users.js';

/** Append-only history of subscription state changes. */
export const subscriptionEvents = mysqlTable(
  'subscription_events',
  {
    id: id(),
    subscriptionId: uuidRef('subscription_id')
      .notNull()
      .references(() => subscriptions.id),
    tenantId: uuidRef('tenant_id')
      .notNull()
      .references(() => tenants.id),
    type: varchar('type', { length: 50 }).notNull(),
    fromStatus: varchar('from_status', { length: 20 }).$type<SubscriptionStatus>(),
    toStatus: varchar('to_status', { length: 20 }).$type<SubscriptionStatus>(),
    actorUserId: uuidRef('actor_user_id').references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [index('subscription_events_sub_created_idx').on(t.subscriptionId, t.createdAt)],
);
