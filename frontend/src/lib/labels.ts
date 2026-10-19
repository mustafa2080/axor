import { ApiError } from '../api/client.ts'
import type {
  ActivityStatus,
  BillingPeriod,
  PlanStatus,
  ProductStatus,
} from '../api/catalog.ts'

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

export const platformRoleLabel: Record<string, string> = {
  owner: 'مالك المنصة',
  admin: 'مدير المنصة',
  support: 'دعم',
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
export function errorMessage(error: unknown, context: 'login' | 'general' = 'general'): string {
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
      return 'العنصر ده موجود بالفعل (الكود مكرر). اختار كود مختلف.'
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
