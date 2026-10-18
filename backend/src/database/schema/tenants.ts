import { mysqlTable, varchar } from 'drizzle-orm/mysql-core';
import { createdAt, dateTime, id, updatedAt } from './columns.js';
import type { TenantStatus } from './enums.js';

export const tenants = mysqlTable('tenants', {
  id: id(),
  name: varchar('name', { length: 200 }).notNull(),
  status: varchar('status', { length: 20 }).$type<TenantStatus>().notNull().default('active'),
  /** Closing a company only sets status = closed and this timestamp; data is retained (ADR-0003 #5). */
  closedAt: dateTime('closed_at'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});
