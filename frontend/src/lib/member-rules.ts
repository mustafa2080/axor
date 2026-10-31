import type { Member, TenantRole } from '../api/members.ts'

// نفس قواعد backend/src/modules/members/member-policy.ts، بس لإخفاء الأزرار اللي الخادم هيرفضها.
// الحماية الفعلية في الخادم (403 و409)؛ دي للراحة فقط. دوال نقية عشان تتختبر من غير متصفح.

export const TENANT_ROLES: readonly TenantRole[] = ['owner', 'admin', 'member', 'read_only']

const ADMIN_MANAGED: readonly TenantRole[] = ['member', 'read_only']

export function canManageMember(actorRole: string, targetRole: TenantRole): boolean {
  if (actorRole === 'owner') return true
  if (actorRole === 'admin') return ADMIN_MANAGED.includes(targetRole)
  return false
}

/** الأدوار اللي المنفّذ يقدر يدّيها لعضو ماسك دور `targetRole` حالياً (فاضية لو ما يقدرش يعدّله). */
export function assignableRoles(actorRole: string, targetRole: TenantRole): TenantRole[] {
  if (!canManageMember(actorRole, targetRole)) return []
  if (actorRole === 'owner') return [...TENANT_ROLES]
  return [...ADMIN_MANAGED]
}

/** العمليات اللي تظهر لصف عضو. بنخفي كل العمليات على حسابك أنت (الخادم بيسمح بيها لو فيه owner تاني). */
export function memberActions(
  actor: { id: string; role: string },
  member: Member,
): { canChangeRole: boolean; canDisable: boolean; canEnable: boolean } {
  const none = { canChangeRole: false, canDisable: false, canEnable: false }
  if (member.id === actor.id || !canManageMember(actor.role, member.tenantRole)) return none
  return {
    canChangeRole: true,
    canDisable: member.status === 'active',
    canEnable: member.status === 'disabled',
  }
}

export const REASON_MIN = 3
export const REASON_MAX = 500

/** سبب تعليق الشركة (إجباري، من 3 لـ 500 حرف بعد التقليم). بيرجع النص المقلّم أو null لو غير صالح. */
export function normalizeReason(input: string): string | null {
  const reason = input.trim()
  return reason.length >= REASON_MIN && reason.length <= REASON_MAX ? reason : null
}
