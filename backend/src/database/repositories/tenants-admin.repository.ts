import { desc, eq, sql } from 'drizzle-orm';
import { conflict, notFound } from '../../common/errors.js';
import { uuidv7 } from '../../common/id.js';
import type { Database } from '../client.js';
import { auditLogs, tenants, users, type TenantStatus } from '../schema/index.js';
import type { AdminContext } from './catalog-admin.repository.js';
import { assertSafeMetadata } from './tenant-audit-logs.repository.js';

type Tx = Parameters<Parameters<Database['db']['transaction']>[0]>[0];

export interface AdminTenantView {
  id: string;
  name: string;
  status: TenantStatus;
  closedAt: Date | null;
  createdAt: Date;
  userCount: number;
}

const userCount = sql<number>`count(${users.id})`.mapWith(Number);
// Every selected tenant column is grouped explicitly, so the query also works with ONLY_FULL_GROUP_BY.
const groupColumns = [tenants.id, tenants.name, tenants.status, tenants.closedAt, tenants.createdAt] as const;

/**
 * Companies as seen by platform staff (ADR-0011): list, suspend and reactivate.
 * Suspending takes effect on the very next request of every user of the company, because
 * authentication reads the company status from the database each time. The mandatory reason and
 * the status change are written in ONE transaction (no change without a trace).
 */
export function createTenantsAdminRepository(db: Database['db']) {
  async function viewOf(exec: Pick<Database['db'], 'select'>, id: string): Promise<AdminTenantView> {
    const [row] = await exec
      .select({
        id: tenants.id,
        name: tenants.name,
        status: tenants.status,
        closedAt: tenants.closedAt,
        createdAt: tenants.createdAt,
        userCount,
      })
      .from(tenants)
      .leftJoin(users, eq(users.tenantId, tenants.id))
      .where(eq(tenants.id, id))
      .groupBy(...groupColumns)
      .limit(1);
    if (row === undefined) throw notFound();
    return row;
  }

  async function audit(
    tx: Tx,
    ctx: AdminContext,
    action: string,
    tenantId: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    assertSafeMetadata(metadata);
    await tx.insert(auditLogs).values({
      id: uuidv7(),
      actorUserId: ctx.actorUserId,
      tenantId,
      action,
      targetType: 'tenant',
      targetId: tenantId,
      metadata,
      requestId: ctx.requestId ?? null,
    });
  }

  /** Locks the company row, so two staff members cannot suspend/reactivate it at the same time. */
  async function lockStatus(tx: Tx, id: string): Promise<TenantStatus> {
    const [row] = await tx
      .select({ status: tenants.status })
      .from(tenants)
      .where(eq(tenants.id, id))
      .limit(1)
      .for('update');
    if (row === undefined) throw notFound();
    return row.status;
  }

  return {
    async list(query: { status?: TenantStatus; limit: number; offset: number }) {
      return db
        .select({
          id: tenants.id,
          name: tenants.name,
          status: tenants.status,
          closedAt: tenants.closedAt,
          createdAt: tenants.createdAt,
          userCount,
        })
        .from(tenants)
        .leftJoin(users, eq(users.tenantId, tenants.id))
        .where(query.status === undefined ? undefined : eq(tenants.status, query.status))
        .groupBy(...groupColumns)
        .orderBy(desc(tenants.createdAt), desc(tenants.id))
        .limit(query.limit)
        .offset(query.offset);
    },

    async suspend(ctx: AdminContext, id: string, reason: string): Promise<AdminTenantView> {
      return db.transaction(async (tx) => {
        const status = await lockStatus(tx, id);
        if (status !== 'active') throw conflict('Only an active company can be suspended');
        await tx.update(tenants).set({ status: 'suspended' }).where(eq(tenants.id, id));
        await audit(tx, ctx, 'tenant.suspended', id, { reason });
        return viewOf(tx, id);
      });
    },

    async reactivate(ctx: AdminContext, id: string, reason?: string): Promise<AdminTenantView> {
      return db.transaction(async (tx) => {
        const status = await lockStatus(tx, id);
        if (status !== 'suspended') throw conflict('Only a suspended company can be reactivated');
        await tx.update(tenants).set({ status: 'active' }).where(eq(tenants.id, id));
        await audit(tx, ctx, 'tenant.reactivated', id, reason === undefined ? {} : { reason });
        return viewOf(tx, id);
      });
    },
  };
}

export type TenantsAdminRepository = ReturnType<typeof createTenantsAdminRepository>;
