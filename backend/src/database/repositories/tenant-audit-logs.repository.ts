import { desc, eq } from 'drizzle-orm';
import { uuidv7 } from '../../common/id.js';
import type { TenantScope } from '../../modules/authz/tenant-scope.js';
import type { Database } from '../client.js';
import { auditLogs } from '../schema/index.js';

const MAX_PAGE_SIZE = 200;
const FORBIDDEN_KEY = /pass(word)?|token|secret|authorization|cookie/i;

/** Audit metadata must never carry credentials (ADR-0003 §3). Checked at any depth. */
export function assertSafeMetadata(value: unknown, path = 'metadata'): void {
  if (value === null || typeof value !== 'object') {
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_KEY.test(key)) {
      throw new Error(`Audit ${path} must not contain sensitive key "${key}"`);
    }
    assertSafeMetadata(child, `${path}.${key}`);
  }
}

export interface AuditEvent {
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
  requestId?: string;
}

/**
 * Audit trail of ONE company. The tenant and the actor come from the scope, never from the caller,
 * so an event can neither be written into nor read from another company's trail.
 */
export class TenantAuditLogsRepository {
  constructor(
    private readonly db: Database['db'],
    private readonly scope: TenantScope,
  ) {}

  async record(event: AuditEvent): Promise<string> {
    assertSafeMetadata(event.metadata);
    const id = uuidv7();
    await this.db.insert(auditLogs).values({
      id,
      tenantId: this.scope.tenantId,
      actorUserId: this.scope.actorUserId,
      action: event.action,
      targetType: event.targetType ?? null,
      targetId: event.targetId ?? null,
      metadata: event.metadata ?? null,
      requestId: event.requestId ?? null,
    });
    return id;
  }

  /** Newest first. The page size is capped so one request cannot dump the whole trail. */
  list(limit = 50) {
    const pageSize = Math.min(Math.max(Math.trunc(limit), 1), MAX_PAGE_SIZE);
    return this.db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.tenantId, this.scope.tenantId))
      .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
      .limit(pageSize);
  }
}
