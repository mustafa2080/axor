import { forbidden } from '../../common/errors.js';
import type { PlatformRole, TenantRole } from '../../database/schema/index.js';
import type { Principal } from './principal.js';

// Static role -> permission table (ADR-0003 §4). Roles live in code, not in the database, until a
// real need for custom roles appears. Two separate scopes: a tenant role never carries a platform
// permission and vice versa (enforced by the types below and by tests).

export const tenantPermissions = [
  'tenant:read',
  'tenant:update',
  'users:read',
  'users:invite',
  'users:update',
  'users:disable',
  'subscription:read',
  'subscription:manage',
  'audit:read',
] as const;
export type TenantPermission = (typeof tenantPermissions)[number];

export const platformPermissions = [
  'platform:tenants:read',
  'platform:tenants:manage',
  'platform:plans:manage',
  'platform:subscriptions:read',
  'platform:subscriptions:manage',
  'platform:users:read',
  'platform:audit:read',
  /** Entering a company's data is an explicit, audited administrative action (ADR-0003 §4). */
  'platform:tenant-data:access',
] as const;
export type PlatformPermission = (typeof platformPermissions)[number];

export type Permission = TenantPermission | PlatformPermission;

const tenantRoleGrants: Record<TenantRole, readonly TenantPermission[]> = {
  owner: tenantPermissions,
  admin: [
    'tenant:read',
    'tenant:update',
    'users:read',
    'users:invite',
    'users:update',
    'users:disable',
    'subscription:read',
    'audit:read',
  ],
  member: ['tenant:read', 'users:read', 'subscription:read'],
  read_only: ['tenant:read', 'subscription:read'],
};

const platformRoleGrants: Record<PlatformRole, readonly PlatformPermission[]> = {
  owner: platformPermissions,
  admin: [
    'platform:tenants:read',
    'platform:tenants:manage',
    'platform:plans:manage',
    'platform:subscriptions:read',
    'platform:subscriptions:manage',
    'platform:users:read',
    'platform:audit:read',
    'platform:tenant-data:access',
  ],
  support: ['platform:tenants:read', 'platform:subscriptions:read', 'platform:users:read'],
};

export function hasPermission(principal: Principal, permission: Permission): boolean {
  const granted: readonly Permission[] =
    principal.kind === 'tenant'
      ? tenantRoleGrants[principal.role]
      : platformRoleGrants[principal.role];
  return granted.includes(permission);
}

/** Throws 403 unless the principal's role grants the permission. Deny by default. */
export function authorize(principal: Principal, permission: Permission): void {
  if (!hasPermission(principal, permission)) {
    throw forbidden();
  }
}

/** Exposed for tests and for documentation generation. */
export function permissionsOf(principal: Principal): readonly Permission[] {
  return principal.kind === 'tenant'
    ? tenantRoleGrants[principal.role]
    : platformRoleGrants[principal.role];
}
