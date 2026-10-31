import { and, asc, count, eq, inArray, isNull } from 'drizzle-orm';
import { conflict, forbidden, notFound, planLimitReached } from '../../common/errors.js';
import { uuidv7 } from '../../common/id.js';
import type { TenantScope } from '../../modules/authz/tenant-scope.js';
import { canAssignRole, canManageMember } from '../../modules/members/member-policy.js';
import { hasFreeSeat, resolveUserSeatLimit } from '../../modules/subscriptions/entitlements.js';
import type { Database } from '../client.js';
import { retryOnDeadlock } from '../retry.js';
import {
  auditLogs,
  refreshSessions,
  tenants,
  users,
  type TenantRole,
  type UserStatus,
} from '../schema/index.js';
import { loadTenantSubscriptionViews } from './subscriptions.repository.js';
import { assertSafeMetadata } from './tenant-audit-logs.repository.js';

type Tx = Parameters<Parameters<Database['db']['transaction']>[0]>[0];

/** Columns safe to return to callers. `password_hash` is deliberately not selectable here. */
const publicColumns = {
  id: users.id,
  email: users.email,
  status: users.status,
  tenantRole: users.tenantRole,
  emailVerifiedAt: users.emailVerifiedAt,
  createdAt: users.createdAt,
} as const;

export interface MemberView {
  id: string;
  email: string;
  status: UserStatus;
  tenantRole: TenantRole;
  emailVerifiedAt: Date | null;
  createdAt: Date;
}

export const LAST_OWNER_MESSAGE = 'A company must keep at least one active owner';
export const USER_LIMIT_MESSAGE =
  'Your plan does not allow more users. Upgrade your plan to re-enable this member.';

/**
 * Company members: listing, role changes, disabling and re-enabling (ADR-0011).
 *
 *  - Every statement is constrained by `scope.tenantId`: a user id of another company simply does
 *    not exist here (404), exactly like in TenantUsersRepository.
 *  - Each change locks the company's active owners (fixed order) and then the target row, so two
 *    concurrent changes cannot both remove "the other" last owner.
 *  - The change, the session revocation and the audit row are ONE transaction: no change without
 *    a trace, no half-disabled user.
 *  - Re-enabling takes a seat, so it is checked against the `users` limit of the company's plans
 *    (ADR-0012). The company row is locked first, so two re-enables cannot both take the last seat.
 */
export function createMembersRepository(db: Database['db'], clock: () => Date = () => new Date()) {
  async function lockTarget(tx: Tx, scope: TenantScope, userId: string) {
    const owners = await tx
      .select({ id: users.id })
      .from(users)
      .where(
        and(
          eq(users.tenantId, scope.tenantId),
          eq(users.tenantRole, 'owner'),
          eq(users.status, 'active'),
        ),
      )
      .orderBy(asc(users.id))
      .for('update');
    const [row] = await tx
      .select(publicColumns)
      .from(users)
      .where(and(eq(users.id, userId), eq(users.tenantId, scope.tenantId)))
      .limit(1)
      .for('update');
    if (row === undefined || row.tenantRole === null) throw notFound();
    const target: MemberView = { ...row, tenantRole: row.tenantRole };
    return { activeOwners: owners.length, target };
  }

  async function audit(
    tx: Tx,
    scope: TenantScope,
    action: string,
    targetId: string,
    metadata: Record<string, unknown>,
    requestId: string | undefined,
  ): Promise<void> {
    assertSafeMetadata(metadata);
    await tx.insert(auditLogs).values({
      id: uuidv7(),
      tenantId: scope.tenantId,
      actorUserId: scope.actorUserId,
      action,
      targetType: 'user',
      targetId,
      metadata,
      requestId: requestId ?? null,
    });
  }

  return {
    async list(scope: TenantScope, page: { limit: number; offset: number }) {
      return db
        .select(publicColumns)
        .from(users)
        .where(eq(users.tenantId, scope.tenantId))
        .orderBy(asc(users.createdAt), asc(users.id))
        .limit(page.limit)
        .offset(page.offset);
    },

    /** Owner: any role. Admin: only between member and read_only. Never leaves a company ownerless. */
    changeRole(
      scope: TenantScope,
      actorRole: TenantRole,
      userId: string,
      newRole: TenantRole,
      requestId?: string,
    ): Promise<MemberView> {
      return retryOnDeadlock(() =>
        db.transaction(async (tx) => {
          const { activeOwners, target } = await lockTarget(tx, scope, userId);
          if (!canManageMember(actorRole, target.tenantRole) || !canAssignRole(actorRole, newRole)) {
            throw forbidden();
          }
          if (target.tenantRole === newRole) return target;
          if (target.tenantRole === 'owner' && target.status === 'active' && activeOwners <= 1) {
            throw conflict(LAST_OWNER_MESSAGE);
          }
          await tx
            .update(users)
            .set({ tenantRole: newRole })
            .where(and(eq(users.id, userId), eq(users.tenantId, scope.tenantId)));
          await audit(
            tx,
            scope,
            'member.role_changed',
            userId,
            { from: target.tenantRole, to: newRole },
            requestId,
          );
          return { ...target, tenantRole: newRole };
        }),
      );
    },

    /** Blocks the user at once (status is checked on every request) and ends all their sessions. */
    disable(
      scope: TenantScope,
      actorRole: TenantRole,
      userId: string,
      requestId?: string,
    ): Promise<MemberView> {
      return retryOnDeadlock(() =>
        db.transaction(async (tx) => {
          const { activeOwners, target } = await lockTarget(tx, scope, userId);
          if (!canManageMember(actorRole, target.tenantRole)) throw forbidden();
          if (target.status === 'disabled') return target;
          if (target.status !== 'active') throw conflict('Only an active user can be disabled');
          if (target.tenantRole === 'owner' && activeOwners <= 1) throw conflict(LAST_OWNER_MESSAGE);
          await tx
            .update(users)
            .set({ status: 'disabled' })
            .where(and(eq(users.id, userId), eq(users.tenantId, scope.tenantId)));
          await tx
            .update(refreshSessions)
            .set({ revokedAt: new Date() })
            .where(and(eq(refreshSessions.userId, userId), isNull(refreshSessions.revokedAt)));
          await audit(tx, scope, 'member.disabled', userId, { role: target.tenantRole }, requestId);
          return { ...target, status: 'disabled' as const };
        }),
      );
    },

    /** Only a disabled user comes back; an invited user has to finish the invitation instead. */
    enable(
      scope: TenantScope,
      actorRole: TenantRole,
      userId: string,
      requestId?: string,
    ): Promise<MemberView> {
      return retryOnDeadlock(() =>
        db.transaction(async (tx) => {
          // Company row first: it serializes every seat-taking change of this company.
          await tx
            .select({ id: tenants.id })
            .from(tenants)
            .where(eq(tenants.id, scope.tenantId))
            .limit(1)
            .for('update');
          const { target } = await lockTarget(tx, scope, userId);
          if (!canManageMember(actorRole, target.tenantRole)) throw forbidden();
          if (target.status === 'active') return target;
          if (target.status !== 'disabled') throw conflict('Only a disabled user can be enabled');
          const now = clock();
          const views = await loadTenantSubscriptionViews(tx, scope.tenantId, now);
          const limit = resolveUserSeatLimit(
            views.map((view) => ({ entitled: view.entitled, limits: view.version?.limits ?? null })),
          );
          if (limit.kind === 'max') {
            // Active and invited people hold a seat; disabled ones do not.
            const [row] = await tx
              .select({ occupied: count() })
              .from(users)
              .where(
                and(eq(users.tenantId, scope.tenantId), inArray(users.status, ['active', 'invited'])),
              );
            if (!hasFreeSeat(limit, row?.occupied ?? 0)) throw planLimitReached(USER_LIMIT_MESSAGE);
          }
          await tx
            .update(users)
            .set({ status: 'active' })
            .where(and(eq(users.id, userId), eq(users.tenantId, scope.tenantId)));
          await audit(tx, scope, 'member.enabled', userId, { role: target.tenantRole }, requestId);
          return { ...target, status: 'active' as const };
        }),
      );
    },
  };
}

export type MembersRepository = ReturnType<typeof createMembersRepository>;
