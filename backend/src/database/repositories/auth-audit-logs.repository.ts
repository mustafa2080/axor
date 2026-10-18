import { uuidv7 } from '../../common/id.js';
import type { Database } from '../client.js';
import { auditLogs } from '../schema/index.js';
import { assertSafeMetadata } from './tenant-audit-logs.repository.js';

export interface AuthAuditEvent {
  action: string;
  /** The account the event is about. */
  userId: string;
  /** null for platform staff. Always read from the user's database record, never from a request. */
  tenantId: string | null;
  metadata?: Record<string, unknown>;
  requestId?: string;
}

/**
 * Audit writer for authentication events (login, failed login, logout, token-theft detection).
 *
 * It is deliberately NOT tied to a TenantScope: these events happen before any scope exists
 * (ADR-0004 §11). The tenant and the user come from the database record that was just
 * authenticated, never from request input. Insert-only; there is no read path here.
 */
export function createAuthAuditLogsRepository(db: Database['db']) {
  return {
    async record(event: AuthAuditEvent): Promise<void> {
      assertSafeMetadata(event.metadata);
      await db.insert(auditLogs).values({
        id: uuidv7(),
        tenantId: event.tenantId,
        actorUserId: event.userId,
        action: event.action,
        targetType: 'user',
        targetId: event.userId,
        metadata: event.metadata ?? null,
        requestId: event.requestId ?? null,
      });
    },
  };
}

export type AuthAuditLogsRepository = ReturnType<typeof createAuthAuditLogsRepository>;
