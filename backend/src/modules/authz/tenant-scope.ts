import { forbidden } from '../../common/errors.js';
import type { Principal } from './principal.js';

declare const tenantScopeBrand: unique symbol;

/**
 * Proof that the current request is acting inside exactly one company.
 *
 * Every repository for company data takes a TenantScope and adds its `tenantId` to every query
 * (ADR-0003 §1). The brand makes it impossible to build one by hand from a plain object or from
 * request input: the only way to get one is `requireTenantScope(principal)`.
 */
export interface TenantScope {
  readonly [tenantScopeBrand]: true;
  readonly tenantId: string;
  /** The user performing the action, for audit records. */
  readonly actorUserId: string;
}

/**
 * Derives the scope from the authenticated principal. Platform staff have no company of their own,
 * so they get a 403 here; entering a company's data is a separate, explicit and audited flow.
 */
export function requireTenantScope(principal: Principal): TenantScope {
  if (principal.kind !== 'tenant') {
    throw forbidden('A company context is required');
  }
  return Object.freeze({
    tenantId: principal.tenantId,
    actorUserId: principal.userId,
  }) as unknown as TenantScope;
}
