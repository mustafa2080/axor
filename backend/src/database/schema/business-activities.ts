import { mysqlTable, uniqueIndex, varchar } from 'drizzle-orm/mysql-core';
import { createdAt, id, updatedAt, uuidRef } from './columns.js';
import type { ActivityStatus } from './enums.js';
import { products } from './products.js';

export const businessActivities = mysqlTable(
  'business_activities',
  {
    id: id(),
    productId: uuidRef('product_id')
      .notNull()
      .references(() => products.id),
    code: varchar('code', { length: 50 }).notNull(),
    name: varchar('name', { length: 200 }).notNull(),
    status: varchar('status', { length: 20 }).$type<ActivityStatus>().notNull().default('active'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('business_activities_product_code_uq').on(t.productId, t.code)],
);
