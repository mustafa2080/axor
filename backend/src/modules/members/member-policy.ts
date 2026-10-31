import type { TenantRole } from '../../database/schema/index.js';

// Who may change whom inside a company (ADR-0011 §2). Pure functions, so the rules are easy to
// read and test without a database. The permission to manage members at all (`users:update`,
// `users:disable`) is checked separately by `authorize`; this is the second, finer question.

/** Roles a company admin may manage and hand out. Anything above it is the owner's decision. */
const ADMIN_MANAGED: readonly TenantRole[] = ['member', 'read_only'];

/** May this actor change an existing user who currently has `targetRole`? */
export function canManageMember(actorRole: TenantRole, targetRole: TenantRole): boolean {
  if (actorRole === 'owner') return true;
  if (actorRole === 'admin') return ADMIN_MANAGED.includes(targetRole);
  return false;
}

/** May this actor give `newRole` to somebody? */
export function canAssignRole(actorRole: TenantRole, newRole: TenantRole): boolean {
  if (actorRole === 'owner') return true;
  if (actorRole === 'admin') return ADMIN_MANAGED.includes(newRole);
  return false;
}
