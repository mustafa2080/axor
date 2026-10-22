import type { PublicPlan, PublicProduct } from '../api/company.ts'
import type { Offers } from './company-offers.ts'

/** النظام والباقة اللي الزائر اختارهم قبل التسجيل. أكواد بس، من غير أي سعر أو مدة. */
export interface PlanChoice {
  productCode: string
  planCode: string
}

// نفس شكل الأكواد اللي الخادم بيقبله (subscriptions.routes.ts). أي حاجة غيره بتتجاهل.
const CODE = /^[a-z0-9][a-z0-9_-]{0,49}$/

/**
 * بيقرا اختيار الباقة من رابط التسجيل (#/register?product=...&plan=...). بيرجع null لو أي واحد
 * ناقص أو متكرر أو شكله غلط. الرابط مدخل من برّه: ده مجرد اقتراح، والكتالوج والخادم هما اللي بيحكموا.
 */
export function parsePlanChoice(hash: string): PlanChoice | null {
  const queryStart = hash.indexOf('?')
  if (queryStart === -1) return null
  const params = new URLSearchParams(hash.slice(queryStart + 1))
  const products = params.getAll('product')
  const plans = params.getAll('plan')
  const productCode = products[0]
  const planCode = plans[0]
  if (products.length !== 1 || plans.length !== 1) return null
  if (productCode === undefined || planCode === undefined) return null
  if (!CODE.test(productCode) || !CODE.test(planCode)) return null
  return { productCode, planCode }
}

/** رابط صفحة التسجيل، مع الاختيار لو موجود. */
export function registerHash(choice: PlanChoice | null): string {
  if (choice === null) return '#/register'
  const product = encodeURIComponent(choice.productCode)
  const plan = encodeURIComponent(choice.planCode)
  return `#/register?product=${product}&plan=${plan}`
}

/** بيرجّع النظام والباقة لو الاختيار لسه ضمن العروض المتاحة (نظام متاح وباقة بتجربة)، وإلا null. */
export function findOffer(
  offers: Offers,
  choice: PlanChoice,
): { product: PublicProduct; plan: PublicPlan } | null {
  const offer = offers.offers.find((item) => item.product.code === choice.productCode)
  const plan = offer?.plans.find((item) => item.code === choice.planCode)
  return offer === undefined || plan === undefined ? null : { product: offer.product, plan }
}
