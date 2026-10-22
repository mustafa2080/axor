import { ApiError } from '../api/client.ts'
import type {
  ActivityStatus,
  BillingPeriod,
  PlanStatus,
  ProductStatus,
} from '../api/catalog.ts'
import type { SubscriptionStatus } from '../api/subscriptions.ts'

export const productStatusLabel: Record<ProductStatus, string> = {
  available: 'متاح',
  coming_soon: 'قريباً',
  disabled: 'معطّل',
}

export const activityStatusLabel: Record<ActivityStatus, string> = {
  active: 'نشط',
  disabled: 'معطّل',
}

export const planStatusLabel: Record<PlanStatus, string> = {
  active: 'نشطة',
  archived: 'مؤرشفة',
}

export const periodLabel: Record<BillingPeriod, string> = {
  monthly: 'شهري',
  yearly: 'سنوي',
}

export const subscriptionStatusLabel: Record<SubscriptionStatus, string> = {
  trialing: 'تجربة',
  active: 'نشط',
  past_due: 'متأخر السداد',
  canceled: 'ملغي',
  expired: 'منتهي',
}

export const platformRoleLabel: Record<string, string> = {
  owner: 'مالك المنصة',
  admin: 'مدير المنصة',
  support: 'دعم',
}

export const tenantRoleLabel: Record<string, string> = {
  owner: 'مالك الشركة',
  admin: 'مدير',
  member: 'عضو',
  read_only: 'قراءة فقط',
}

interface Issue {
  path: string
  message: string
}

function issuesOf(details: unknown): Issue[] {
  if (!Array.isArray(details)) return []
  return details.filter(
    (item): item is Issue =>
      typeof item === 'object' &&
      item !== null &&
      typeof (item as Issue).path === 'string' &&
      typeof (item as Issue).message === 'string',
  )
}

function retryAfterSeconds(details: unknown): number | null {
  const value = (details as { retryAfterSeconds?: unknown } | null | undefined)?.retryAfterSeconds
  return typeof value === 'number' ? value : null
}

/** رسالة عربي للمستخدم من أي خطأ. الرسائل الإنجليزي اللي من الخادم ما بتتعرضش إلا في أخطاء التحقق. */
export function errorMessage(
  error: unknown,
  context: 'login' | 'general' | 'subscription' = 'general',
): string {
  if (!(error instanceof ApiError)) return 'حصل خطأ غير متوقع. جرّب تاني.'
  switch (error.code) {
    case 'NETWORK_ERROR':
      return 'تعذّر الاتصال بالخادم. اتأكد إن الباك شغّال (pnpm dev:api).'
    case 'TOO_MANY_REQUESTS': {
      const seconds = retryAfterSeconds(error.details)
      return seconds === null
        ? 'محاولات كتير. استنى شوية وجرّب تاني.'
        : `محاولات كتير. جرّب تاني بعد ${seconds} ثانية.`
    }
    case 'UNAUTHORIZED':
      return context === 'login'
        ? 'الإيميل أو كلمة السر غير صحيحة.'
        : 'انتهت الجلسة. سجّل الدخول من جديد.'
    case 'FORBIDDEN':
      return context === 'login'
        ? 'الطلب اتمنع (أصل غير موثوق). افتح اللوحة من http://localhost:5173.'
        : 'مش مسموح لك بالعملية دي.'
    case 'CONFLICT':
      return context === 'subscription'
        ? 'العملية دي مش متاحة لحالة الاشتراك الحالية (ممكن حد غيّره). حدّث القائمة وجرّب تاني.'
        : 'العنصر ده موجود بالفعل (الكود مكرر). اختار كود مختلف.'
    case 'NOT_FOUND':
      return 'العنصر مش موجود. حدّث الصفحة وجرّب تاني.'
    case 'VALIDATION_ERROR': {
      const issues = issuesOf(error.details)
      if (issues.length === 0) return 'البيانات غير صالحة.'
      return `البيانات غير صالحة: ${issues.map((i) => `${i.path || 'الطلب'} (${i.message})`).join('، ')}`
    }
    case 'BAD_REQUEST':
      return `الطلب مرفوض: ${error.message}`
    default:
      return 'حصل خطأ في الخادم. جرّب تاني.'
  }
}

// رسائل سياسة كلمة السر من الخادم (backend/src/modules/auth/auth.service.ts) بالعربي.
const passwordIssueLabel: Record<string, string> = {
  'Password is too short': 'كلمة السر قصيرة (12 حرف على الأقل).',
  'Password is too long': 'كلمة السر طويلة (128 حرف كحد أقصى).',
  'Password is too common': 'كلمة السر شائعة جداً. اختار كلمة أصعب.',
  'Password must not contain your email address': 'كلمة السر ما ينفعش تحتوي على بريدك الإلكتروني.',
}

/** رسالة عربي لأخطاء تسجيل شركة جديدة. التسجيل لازم يقول لو البريد مسجّل (ADR-0004 §10). */
export function registerErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'CONFLICT') return 'البريد ده مسجّل بالفعل. جرّب تسجّل الدخول.'
    if (error.code === 'VALIDATION_ERROR') {
      const parts = issuesOf(error.details).map((issue) => {
        const known = passwordIssueLabel[issue.message]
        if (known !== undefined) return known
        if (issue.path === 'companyName') return 'اسم الشركة غير صالح (من حرفين لـ 200 حرف).'
        if (issue.path === 'email') return 'البريد الإلكتروني غير صالح.'
        if (issue.path === 'password') return 'كلمة السر غير صالحة.'
        return 'البيانات غير صالحة.'
      })
      return parts.length === 0 ? 'البيانات غير صالحة.' : [...new Set(parts)].join(' ')
    }
  }
  return errorMessage(error)
}
