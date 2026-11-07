
// منطق نقي للصفحات العامة (الأنظمة والباقات والمقارنة). مفيش DOM ولا شبكة هنا عشان يتختبر.
// الرابط مدخل من برّه: أي كود بيتفحص شكله، وبعدها بيتراجع على الكتالوج. الخادم هو اللي بيحكم عند الاشتراك.

import type { PublicPlan, PublicProduct } from '../api/company.ts'
import { registerHash } from './plan-choice.ts'

// نفس شكل الأكواد اللي الخادم بيقبله (plan-choice.ts).
const CODE = /^[a-z0-9][a-z0-9_-]{0,49}$/

/**
 * الاشتراك مسموح للنظام ده؟ «متاح» بس. الخادم هو اللي بيفرض ده (subscriptions.repository.ts)،
 * والواجهة بتخفي أي طريق للتسجيل لنظام «قريباً» بدل ما تعتمد على رفض الخادم.
 */
export function isSubscribable(product: PublicProduct): boolean {
  return product.status === 'available'
}

/**
 * رابط بدء التجربة لباقة، أو null لو مفيش طريق ليه: النظام مش متاح، أو الباقة من غير تجربة مجانية
 * (التسجيل بيبدأ تجربة بس، ومفيش دفع). كل مكان بيعرض زرار «ابدأ تجربة» لازم يعدّي من هنا.
 */
export function trialLink(product: PublicProduct, plan: PublicPlan): string | null {
  if (!isSubscribable(product) || plan.trialDays <= 0) return null
  return registerHash({ productCode: product.code, planCode: plan.code })
}

/** قيمة باراميتر واحد من الـ query، أو null لو غايب أو متكرر أو شكله غلط. */
export function queryCode(hash: string, name: string): string | null {
  const queryStart = hash.indexOf('?')
  if (queryStart === -1) return null
  const values = new URLSearchParams(hash.slice(queryStart + 1)).getAll(name)
  const value = values[0]
  if (values.length !== 1 || value === undefined || !CODE.test(value)) return null
  return value
}

export type PlansView = 'cards' | 'compare'

/** وضع عرض صفحة الباقات من `?view=`. أي حاجة غير `compare` = كروت. */
export function plansViewOf(hash: string): PlansView {
  const params = new URLSearchParams(hash.includes('?') ? hash.slice(hash.indexOf('?') + 1) : '')
  const values = params.getAll('view')
  return values.length === 1 && values[0] === 'compare' ? 'compare' : 'cards'
}

/** الأنظمة اللي الزائر يشوفها: كل حاجة ما عدا المعطّل (الخادم بيستبعده أصلاً، وده دفاع إضافي). */
export function visibleProducts(products: readonly PublicProduct[]): PublicProduct[] {
  return products.filter((product) => product.status !== 'disabled')
}

export function findVisibleProduct(
  products: readonly PublicProduct[],
  code: string | null,
): PublicProduct | null {
  if (code === null) return null
  return visibleProducts(products).find((product) => product.code === code) ?? null
}

/** اسم النشاط المعروض للباقة (null = كل الأنشطة). */
export function planActivityName(product: PublicProduct, plan: PublicPlan): string {
  if (plan.activity === null) return 'كل الأنشطة'
  return product.activities.find((activity) => activity.code === plan.activity)?.name ?? plan.activity
}

/**
 * الباقات المناسبة لنشاط معيّن: الباقة اللي لكل الأنشطة (`activity: null`) بتناسب أي نشاط، والباقة
 * المخصصة بتظهر لنشاطها بس. من غير نشاط (null) = كل الباقات.
 */
export function plansForActivity(plans: readonly PublicPlan[], activityCode: string | null): PublicPlan[] {
  if (activityCode === null) return [...plans]
  return plans.filter((plan) => plan.activity === null || plan.activity === activityCode)
}

/** النشاط المختار لو هو فعلاً من أنشطة النظام، وإلا null (بيتجاهل). */
export function findActivity(product: PublicProduct, code: string | null): string | null {
  if (code === null) return null
  return product.activities.some((activity) => activity.code === code) ? code : null
}

export interface PlansLinkOptions {
  product?: string | null
  activity?: string | null
  view?: PlansView
}

/** رابط صفحة الباقات بفلاتر. الأكواد بتتعمل لها encode، والوضع الافتراضي (كروت) مش بيتكتب. */
export function plansHref({ product = null, activity = null, view = 'cards' }: PlansLinkOptions = {}): string {
  const params = new URLSearchParams()
  if (product !== null) params.set('product', product)
  if (product !== null && activity !== null) params.set('activity', activity)
  if (view === 'compare') params.set('view', 'compare')
  const query = params.toString()
  return query === '' ? '#/plans' : `#/plans?${query}`
}

/** رابط تفاصيل نظام، ومعاه نشاط لو اتحدد. */
export function systemHref(code: string, activity: string | null = null): string {
  const params = new URLSearchParams({ code })
  if (activity !== null) params.set('activity', activity)
  return `#/system?${params.toString()}`
}
