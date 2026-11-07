import { ApiError } from '../api/client.ts'
import type {
  ActivityStatus,
  BillingPeriod,
  PlanStatus,
  ProductStatus,
} from '../api/catalog.ts'
import type { SubscriptionStatus } from '../api/subscriptions.ts'
import type { MemberStatus } from '../api/members.ts'
import type { TenantStatus } from '../api/tenants.ts'

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

export const memberStatusLabel: Record<MemberStatus, string> = {
  active: 'نشط',
  invited: 'مدعو',
  disabled: 'معطّل',
}

export const tenantStatusLabel: Record<TenantStatus, string> = {
  active: 'نشطة',
  suspended: 'معلّقة',
  closed: 'مغلقة',
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

/** ثواني الانتظار: من هيدر Retry-After لو موجود، وإلا من details (الخادم بيحطها هناك لـ 429 و409 المفتاح). */
function retryAfterSeconds(error: ApiError): number | null {
  if (error.retryAfterSeconds !== null) return error.retryAfterSeconds
  const value = (error.details as { retryAfterSeconds?: unknown } | null | undefined)?.retryAfterSeconds
  return typeof value === 'number' ? value : null
}

/**
 * retrySafe: العملية دي بتتبعت بمفتاح Idempotency-Key وبيتعاد نفسه في كل محاولة (ADR-0026)،
 * فلو الخادم قال إن نتيجتها مجهولة (504) المستخدم يقدر يضغط تاني من غير ما تتنفّذ مرتين.
 */
export interface ErrorMessageOptions {
  retrySafe?: boolean
}

/** رسالة عربي للمستخدم من أي خطأ. الرسائل الإنجليزي اللي من الخادم ما بتتعرضش إلا في أخطاء التحقق. */
export function errorMessage(
  error: unknown,
  context: 'login' | 'general' | 'subscription' | 'member' | 'tenant' = 'general',
  options: ErrorMessageOptions = {},
): string {
  if (!(error instanceof ApiError)) return 'حصل خطأ غير متوقع. جرّب تاني.'
  switch (error.code) {
    case 'NETWORK_ERROR':
      return 'تعذّر الاتصال بالخادم. اتأكد إن الباك شغّال (pnpm dev:api).'
    case 'TOO_MANY_REQUESTS': {
      const seconds = retryAfterSeconds(error)
      return seconds === null
        ? 'محاولات كتير. استنى شوية وجرّب تاني.'
        : `محاولات كتير. جرّب تاني بعد ${seconds} ثانية.`
    }
    case 'SERVICE_BUSY': {
      // الخادم مشغول ومفيش حاجة اتنفّذت نص تنفيذ (ADR-0019)، فالإعادة آمنة لأي عملية.
      const seconds = retryAfterSeconds(error)
      return seconds === null
        ? 'الخدمة مشغولة دلوقتي. جرّب تاني بعد شوية.'
        : `الخدمة مشغولة دلوقتي. جرّب تاني بعد ${seconds} ثانية.`
    }
    case 'REQUEST_TIMEOUT':
      // ADR-0020: الـ 504 على كتابة معناه إن الشغل ممكن يكون كمّل في الخلفية. القراءة بس هي اللي معاها Retry-After.
      if (retryAfterSeconds(error) !== null) return 'الطلب أخد وقت طويل. جرّب تاني بعد شوية.'
      return options.retrySafe === true
        ? 'الطلب أخد وقت طويل ونتيجته مش معروفة. تقدر تضغط تأكيد تاني: لو العملية اتنفّذت قبل كده مش هتتكرر.'
        : 'الطلب أخد وقت طويل ونتيجته مش معروفة. اتأكد من الحالة الحالية قبل ما تعيد العملية.'
    case 'IDEMPOTENCY_IN_PROGRESS': {
      const seconds = retryAfterSeconds(error)
      return seconds === null
        ? 'نفس العملية لسه بتتنفّذ. استنى شوية وجرّب تاني.'
        : `نفس العملية لسه بتتنفّذ. استنى ${seconds} ثانية وجرّب تاني.`
    }
    case 'IDEMPOTENCY_KEY_REUSED':
      return 'حصل تعارض في تنفيذ العملية. حدّث الصفحة وجرّب تاني.'
    case 'UNAUTHORIZED':
      return context === 'login'
        ? 'الإيميل أو كلمة السر غير صحيحة.'
        : 'انتهت الجلسة. سجّل الدخول من جديد.'
    case 'FORBIDDEN':
      return context === 'login'
        ? 'الطلب اتمنع (أصل غير موثوق). افتح اللوحة من http://localhost:5173.'
        : 'مش مسموح لك بالعملية دي.'
    case 'CONFLICT':
      if (context === 'member') {
        return error.message.includes('at least one active owner')
          ? 'ما ينفعش: لازم يفضل في الشركة مالك نشط واحد على الأقل.'
          : 'العملية دي مش متاحة لحالة العضو الحالية (ممكن حد غيّرها). حدّث القائمة وجرّب تاني.'
      }
      if (context === 'tenant') {
        return 'العملية دي مش متاحة لحالة الشركة الحالية (ممكن حد غيّرها). حدّث القائمة وجرّب تاني.'
      }
      return context === 'subscription'
        ? 'العملية دي مش متاحة لحالة الاشتراك الحالية (ممكن حد غيّره). حدّث القائمة وجرّب تاني.'
        : 'العنصر ده موجود بالفعل (الكود مكرر). اختار كود مختلف.'
    case 'PLAN_LIMIT_REACHED':
      // الحد جاي من باقة الشركة: الحل ترقية الباقة أو تعطيل عضو تاني، مش إعادة المحاولة.
      return 'باقتك الحالية وصلت لأقصى عدد مستخدمين. عطّل عضو تاني أو رقّي الباقة، وبعدها فعّل العضو ده.'
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
