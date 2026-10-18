import type { PlatformRole, TenantRole } from '../../database/schema/index.js';

/**
 * The authenticated caller. It is built ONLY by the authentication layer from the user's
 * database record (ADR-0003 §5), never from the request body, query or headers.
 *
 * A user is either a company user (belongs to exactly one tenant) or platform staff (no tenant).
 */
export interface TenantPrincipal {
  readonly kind: 'tenant';
  readonly userId: string;
  readonly tenantId: string;
  readonly role: TenantRole;
}

export interface PlatformPrincipal {
  readonly kind: 'platform';
  readonly userId: string;
  readonly role: PlatformRole;
}

export type Principal = TenantPrincipal | PlatformPrincipal;
