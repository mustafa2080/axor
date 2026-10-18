import { sql } from 'drizzle-orm';
import { check, index, mysqlTable, uniqueIndex, varchar } from 'drizzle-orm/mysql-core';
import { createdAt, dateTime, id, updatedAt, uuidRef } from './columns.js';
import type { PlatformRole, TenantRole, UserStatus } from './enums.js';
import { tenants } from './tenants.js';

export const users = mysqlTable(
  'users',
  {
    id: id(),
    /** Stored normalized (trim + lowercase). */
    email: varchar('email', { length: 320 }).notNull(),
    /** Argon2id hash. Null for an invited user who has not set a password yet. */
    passwordHash: varchar('password_hash', { length: 255 }),
    status: varchar('status', { length: 20 }).$type<UserStatus>().notNull().default('active'),
    /** A user belongs to at most one company (ADR-0003 #1). Null for platform staff. */
    tenantId: uuidRef('tenant_id').references(() => tenants.id),
    tenantRole: varchar('tenant_role', { length: 20 }).$type<TenantRole>(),
    platformRole: varchar('platform_role', { length: 20 }).$type<PlatformRole>(),
    emailVerifiedAt: dateTime('email_verified_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('users_email_uq').on(t.email),
    index('users_tenant_id_idx').on(t.tenantId),
    // Either a company user (tenant + tenant role, no platform role) or platform staff (the reverse).
    check(
      'users_scope_chk',
      sql`(${t.tenantId} IS NOT NULL AND ${t.tenantRole} IS NOT NULL AND ${t.platformRole} IS NULL)
        OR (${t.tenantId} IS NULL AND ${t.tenantRole} IS NULL AND ${t.platformRole} IS NOT NULL)`,
    ),
  ],
);
