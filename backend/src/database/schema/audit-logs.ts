import { index, json, mysqlTable, varchar } from 'drizzle-orm/mysql-core';
import { createdAt, id, uuidRef } from './columns.js';

/**
 * Insert-only audit trail. Deliberately has no foreign keys so that recording an event can
 * never fail or block because of the state of other tables. Never store passwords or tokens in metadata.
 */
export const auditLogs = mysqlTable(
  'audit_logs',
  {
    id: id(),
    actorUserId: uuidRef('actor_user_id'),
    tenantId: uuidRef('tenant_id'),
    action: varchar('action', { length: 100 }).notNull(),
    targetType: varchar('target_type', { length: 50 }),
    targetId: varchar('target_id', { length: 64 }),
    metadata: json('metadata').$type<Record<string, unknown>>(),
    requestId: varchar('request_id', { length: 64 }),
    createdAt: createdAt(),
  },
  (t) => [
    index('audit_logs_tenant_created_idx').on(t.tenantId, t.createdAt),
    index('audit_logs_actor_created_idx').on(t.actorUserId, t.createdAt),
  ],
);
