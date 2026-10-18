import { describe, expect, it } from 'vitest';
import { AppError } from '../../common/errors.js';
import {
  authorize,
  hasPermission,
  permissionsOf,
  platformPermissions,
  tenantPermissions,
  type Permission,
} from './permissions.js';
import type { PlatformPrincipal, TenantPrincipal } from './principal.js';
import { requireTenantScope } from './tenant-scope.js';

const tenantUser = (role: TenantPrincipal['role']): TenantPrincipal => ({
  kind: 'tenant',
  userId: 'u1',
  tenantId: 't1',
  role,
});
const staff = (role: PlatformPrincipal['role']): PlatformPrincipal => ({
  kind: 'platform',
  userId: 's1',
  role,
});

// Written out by hand on purpose: changing a role's permissions must be a visible, reviewed edit
// of this table, not a side effect of editing permissions.ts.
const expectedTenant: Record<TenantPrincipal['role'], readonly Permission[]> = {
  owner: [
    'tenant:read',
    'tenant:update',
    'users:read',
    'users:invite',
    'users:update',
    'users:disable',
    'subscription:read',
    'subscription:manage',
    'audit:read',
  ],
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

const expectedPlatform: Record<PlatformPrincipal['role'], readonly Permission[]> = {
  owner: [
    'platform:tenants:read',
    'platform:tenants:manage',
    'platform:plans:manage',
    'platform:subscriptions:read',
    'platform:subscriptions:manage',
    'platform:users:read',
    'platform:audit:read',
    'platform:tenant-data:access',
  ],
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

const allPermissions: readonly Permission[] = [...tenantPermissions, ...platformPermissions];

describe('RBAC: every role against every permission', () => {
  for (const [role, expected] of Object.entries(expectedTenant)) {
    it(`tenant ${role} gets exactly its documented permissions`, () => {
      const principal = tenantUser(role as TenantPrincipal['role']);
      for (const permission of allPermissions) {
        expect(hasPermission(principal, permission), `${role} / ${permission}`).toBe(
          expected.includes(permission),
        );
      }
    });
  }

  for (const [role, expected] of Object.entries(expectedPlatform)) {
    it(`platform ${role} gets exactly its documented permissions`, () => {
      const principal = staff(role as PlatformPrincipal['role']);
      for (const permission of allPermissions) {
        expect(hasPermission(principal, permission), `${role} / ${permission}`).toBe(
          expected.includes(permission),
        );
      }
    });
  }
});

describe('RBAC: scope separation', () => {
  it('no tenant role ever holds a platform permission', () => {
    for (const role of Object.keys(expectedTenant)) {
      const granted = permissionsOf(tenantUser(role as TenantPrincipal['role']));
      for (const permission of granted) {
        expect(permission.startsWith('platform:')).toBe(false);
      }
    }
  });

  it('no platform role holds a tenant permission', () => {
    for (const role of Object.keys(expectedPlatform)) {
      const granted = permissionsOf(staff(role as PlatformPrincipal['role']));
      for (const permission of granted) {
        expect(permission.startsWith('platform:')).toBe(true);
      }
    }
  });

  it('only the tenant owner can manage the subscription', () => {
    expect(hasPermission(tenantUser('owner'), 'subscription:manage')).toBe(true);
    expect(hasPermission(tenantUser('admin'), 'subscription:manage')).toBe(false);
  });

  it('support staff cannot enter company data or change anything', () => {
    const support = staff('support');
    expect(hasPermission(support, 'platform:tenant-data:access')).toBe(false);
    expect(hasPermission(support, 'platform:tenants:manage')).toBe(false);
    expect(hasPermission(support, 'platform:plans:manage')).toBe(false);
  });
});

describe('authorize()', () => {
  it('passes when granted', () => {
    expect(() => authorize(tenantUser('member'), 'users:read')).not.toThrow();
  });

  it('throws a 403 AppError when not granted', () => {
    try {
      authorize(tenantUser('read_only'), 'users:invite');
      expect.unreachable('authorize should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).statusCode).toBe(403);
      expect((error as AppError).code).toBe('FORBIDDEN');
    }
  });
});

describe('requireTenantScope()', () => {
  it('derives the scope from the principal, and the scope cannot be altered', () => {
    const scope = requireTenantScope(tenantUser('member'));
    expect(scope.tenantId).toBe('t1');
    expect(scope.actorUserId).toBe('u1');
    expect(Object.isFrozen(scope)).toBe(true);
  });

  it('refuses platform staff: they have no company context of their own', () => {
    for (const role of Object.keys(expectedPlatform)) {
      try {
        requireTenantScope(staff(role as PlatformPrincipal['role']));
        expect.unreachable('requireTenantScope should have thrown');
      } catch (error) {
        expect((error as AppError).statusCode).toBe(403);
      }
    }
  });
});
