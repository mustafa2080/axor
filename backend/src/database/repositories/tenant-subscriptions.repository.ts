import { and, asc, eq } from 'drizzle-orm';
import type { TenantScope } from '../../modules/authz/tenant-scope.js';
import type { Database } from '../client.js';
import { subscriptions } from '../schema/index.js';

/** Subscriptions of ONE company. Creation and plan logic come later, with the trial rules. */
export class TenantSubscriptionsRepository {
  constructor(
    private readonly db: Database['db'],
    private readonly scope: TenantScope,
  ) {}

  list() {
    return this.db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.tenantId, this.scope.tenantId))
      .orderBy(asc(subscriptions.createdAt), asc(subscriptions.id));
  }

  async findByProduct(productId: string) {
    const [row] = await this.db
      .select()
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.tenantId, this.scope.tenantId),
          eq(subscriptions.productId, productId),
        ),
      )
      .limit(1);
    return row;
  }
}
