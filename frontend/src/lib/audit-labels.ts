// أسماء أحداث سجل التدقيق بالعربي. الأكواد نفسها (auth.login...) هي المرجع في الباك (backend/src).
// أي كود مش في القائمة (حدث جديد لسه ما اتترجمش) بيتعرض بكوده زي ما هو، فمفيش حدث بيختفي من السجل.
export const AUDIT_ACTION_LABELS: Record<string, string> = {
  'auth.login': 'تسجيل دخول',
  'auth.login_failed': 'محاولة دخول فاشلة',
  'auth.logout': 'تسجيل خروج',
  'auth.refresh_reuse_detected': 'اشتباه في سرقة جلسة',
  'auth.password_changed': 'تغيير كلمة المرور',
  'auth.password_change_failed': 'محاولة فاشلة لتغيير كلمة المرور',
  'tenant.registered': 'تسجيل شركة جديدة',
  'tenant.suspended': 'تعليق شركة',
  'tenant.reactivated': 'إعادة تفعيل شركة',
  'member.role_changed': 'تغيير دور عضو',
  'member.disabled': 'تعطيل عضو',
  'member.enabled': 'إعادة تفعيل عضو',
  'subscription.trial_started': 'بدء تجربة',
  'subscription.activated': 'تفعيل اشتراك',
  'subscription.renewed': 'تجديد اشتراك',
  'subscription.trial_extended': 'تمديد تجربة',
  'subscription.canceled': 'إلغاء اشتراك',
  'subscription.expired': 'انتهاء اشتراك',
  'catalog.product_created': 'إنشاء نظام',
  'catalog.product_updated': 'تعديل نظام',
  'catalog.activity_created': 'إنشاء نشاط',
  'catalog.activity_updated': 'تعديل نشاط',
  'catalog.plan_created': 'إنشاء باقة',
  'catalog.plan_version_created': 'إصدار جديد للباقة',
  'catalog.plan_updated': 'تعديل باقة',
}

export const AUDIT_ACTIONS = Object.keys(AUDIT_ACTION_LABELS)

export function auditActionLabel(action: string): string {
  return AUDIT_ACTION_LABELS[action] ?? action
}

/** أحداث بتدل على خطر أمني أو فشل، فبتتعرض بلون تحذير. */
const WARNING_ACTIONS = new Set(['auth.login_failed', 'auth.refresh_reuse_detected', 'auth.password_change_failed'])

export function isWarningAction(action: string): boolean {
  return WARNING_ACTIONS.has(action)
}

const MAX_DETAILS = 160

/** تفاصيل الحدث (metadata) في سطر واحد للعرض فقط. null لو مفيش تفاصيل. */
export function formatAuditDetails(metadata: Record<string, unknown> | null): string | null {
  if (metadata === null || Object.keys(metadata).length === 0) return null
  const text = JSON.stringify(metadata)
  return text.length > MAX_DETAILS ? `${text.slice(0, MAX_DETAILS - 1)}…` : text
}
