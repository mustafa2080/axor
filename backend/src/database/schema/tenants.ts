import { index, mysqlTable, varchar } from 'drizzle-orm/mysql-core';
import { createdAt, dateTime, id, updatedAt } from './columns.js';
import type { TenantStatus } from './enums.js';

export const tenants = mysqlTable(
  'tenants',
  {
    id: id(),
    name: varchar('name', { length: 200 }).notNull(),
    status: varchar('status', { length: 20 }).$type<TenantStatus>().notNull().default('active'),
    /** Closing a company only sets status = closed and this timestamp; data is retained (ADR-0003 #5). */
    closedAt: dateTime('closed_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    // Admin company list: newest first, optionally one status (ADR-0018). The id keeps the sort total.
    index('tenants_created_idx').on(t.createdAt, t.id),
    index('tenants_status_created_idx').on(t.status, t.createdAt, t.id),
  ],
);
