import { mysqlTable, uniqueIndex, varchar } from 'drizzle-orm/mysql-core';
import { createdAt, id, uuidRef } from './columns.js';
import { products } from './products.js';
import { tenants } from './tenants.js';

/**
 * Trial-abuse guard (ADR-0003 #3): one trial per (company, product) AND one per (email, product).
 * `emailKey` comes from `normalizeEmailKey()` (trim + lowercase + strip "+tag").
 */
export const trialClaims = mysqlTable(
  'trial_claims',
  {
    id: id(),
    productId: uuidRef('product_id')
      .notNull()
      .references(() => products.id),
    tenantId: uuidRef('tenant_id')
      .notNull()
      .references(() => tenants.id),
    emailKey: varchar('email_key', { length: 320 }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('trial_claims_product_email_uq').on(t.productId, t.emailKey),
    uniqueIndex('trial_claims_product_tenant_uq').on(t.productId, t.tenantId),
  ],
);
