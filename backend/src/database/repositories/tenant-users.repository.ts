import { and, asc, eq } from 'drizzle-orm';
import type { TenantScope } from '../../modules/authz/tenant-scope.js';
import type { Database } from '../client.js';
import { users, type TenantRole, type UserStatus } from '../schema/index.js';

/** Columns safe to return to callers. `password_hash` is deliberately not selectable here. */
const publicColumns = {
  id: users.id,
  email: users.email,
  status: users.status,
  tenantRole: users.tenantRole,
  emailVerifiedAt: users.emailVerifiedAt,
  createdAt: users.createdAt,
} as const;

/**
 * Users of ONE company. Every statement is constrained by `scope.tenantId`, so a user id from
 * another company simply does not exist as far as this repository is concerned.
 */
export class TenantUsersRepository {
  constructor(
    private readonly db: Database['db'],
    private readonly scope: TenantScope,
  ) {}

  list() {
    return this.db
      .select(publicColumns)
      .from(users)
      .where(eq(users.tenantId, this.scope.tenantId))
      .orderBy(asc(users.createdAt), asc(users.id));
  }

  async findById(userId: string) {
    const [row] = await this.db
      .select(publicColumns)
      .from(users)
      .where(and(eq(users.id, userId), eq(users.tenantId, this.scope.tenantId)))
      .limit(1);
    return row;
  }

  /** Returns false when no such user exists in this company (including users of other companies). */
  async updateRole(userId: string, role: TenantRole): Promise<boolean> {
    const [result] = await this.db
      .update(users)
      .set({ tenantRole: role })
      .where(and(eq(users.id, userId), eq(users.tenantId, this.scope.tenantId)));
    return result.affectedRows > 0;
  }

  /** Returns false when no such user exists in this company (including users of other companies). */
  async setStatus(userId: string, status: UserStatus): Promise<boolean> {
    const [result] = await this.db
      .update(users)
      .set({ status })
      .where(and(eq(users.id, userId), eq(users.tenantId, this.scope.tenantId)));
    return result.affectedRows > 0;
  }
}
