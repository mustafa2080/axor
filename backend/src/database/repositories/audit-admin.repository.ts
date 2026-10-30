import { and, desc, eq } from 'drizzle-orm';
import type { Database } from '../client.js';
import { auditLogs, tenants, users } from '../schema/index.js';

export interface AuditAdminQuery {
  action?: string;
  tenantId?: string;
  actorUserId?: string;
  limit: number;
  offset: number;
}

export interface AuditAdminEntry {
  id: string;
  createdAt: string;
  action: string;
  actorUserId: string | null;
  actorEmail: string | null;
  tenantId: string | null;
  tenantName: string | null;
  targetType: string | null;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
  requestId: string | null;
}

/**
 * Read side of the audit trail for platform staff (ADR-0010). Insert-only tables stay insert-only:
 * this repository has no write path. audit_logs has no foreign keys on purpose, so names come from
 * LEFT JOINs and a missing user or company simply shows as null instead of dropping the row.
 * Writers already refuse credentials in metadata (assertSafeMetadata), so rows are returned as stored.
 */
export function createAuditAdminRepository(db: Database['db']) {
  return {
    async list(query: AuditAdminQuery): Promise<AuditAdminEntry[]> {
      const filters = [
        query.action === undefined ? undefined : eq(auditLogs.action, query.action),
        query.tenantId === undefined ? undefined : eq(auditLogs.tenantId, query.tenantId),
        query.actorUserId === undefined ? undefined : eq(auditLogs.actorUserId, query.actorUserId),
      ].filter((filter) => filter !== undefined);

      const rows = await db
        .select({
          id: auditLogs.id,
          createdAt: auditLogs.createdAt,
          action: auditLogs.action,
          actorUserId: auditLogs.actorUserId,
          actorEmail: users.email,
          tenantId: auditLogs.tenantId,
          tenantName: tenants.name,
          targetType: auditLogs.targetType,
          targetId: auditLogs.targetId,
          metadata: auditLogs.metadata,
          requestId: auditLogs.requestId,
        })
        .from(auditLogs)
        .leftJoin(users, eq(users.id, auditLogs.actorUserId))
        .leftJoin(tenants, eq(tenants.id, auditLogs.tenantId))
        .where(filters.length === 0 ? undefined : and(...filters))
        .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
        .limit(query.limit)
        .offset(query.offset);

      return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }));
    },
  };
}

export type AuditAdminRepository = ReturnType<typeof createAuditAdminRepository>;
