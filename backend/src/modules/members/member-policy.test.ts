import { describe, expect, it } from 'vitest';
import { tenantRoles, type TenantRole } from '../../database/schema/index.js';
import { canAssignRole, canManageMember } from './member-policy.js';

// Written out by hand (not derived from the implementation): who may touch whom.
const MANAGE: Record<TenantRole, TenantRole[]> = {
  owner: ['owner', 'admin', 'member', 'read_only'],
  admin: ['member', 'read_only'],
  member: [],
  read_only: [],
};

describe('canManageMember', () => {
  it.each(tenantRoles)('as %s: exactly the roles the table allows', (actor) => {
    for (const target of tenantRoles) {
      expect(canManageMember(actor, target), `${actor} -> ${target}`).toBe(
        MANAGE[actor].includes(target),
      );
    }
  });

  it('never lets an admin touch another admin or an owner', () => {
    expect(canManageMember('admin', 'admin')).toBe(false);
    expect(canManageMember('admin', 'owner')).toBe(false);
  });
});

describe('canAssignRole', () => {
  it.each(tenantRoles)('as %s: exactly the roles the table allows', (actor) => {
    for (const role of tenantRoles) {
      expect(canAssignRole(actor, role), `${actor} gives ${role}`).toBe(
        MANAGE[actor].includes(role),
      );
    }
  });

  it('never lets an admin promote anyone to admin or owner', () => {
    expect(canAssignRole('admin', 'admin')).toBe(false);
    expect(canAssignRole('admin', 'owner')).toBe(false);
  });
});
