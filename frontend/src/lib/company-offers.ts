import type { PublicPlan, PublicProduct } from '../api/company.ts'

export interface TrialOffer {
  product: PublicProduct
  /** الباقات اللي ليها تجربة مجانية بس. */
  plans: PublicPlan[]
}

export interface Offers {
  offers: TrialOffer[]
  comingSoon: PublicProduct[]
}

const DAY_MS = 86_400_000

/** عدد الأيام المتبقية (بالتقريب لفوق). 0 لو التاريخ عدّى أو غلط. */
export function daysLeft(iso: string | null, now: Date): number {
  if (iso === null) return 0
  const end = Date.parse(iso)
  if (Number.isNaN(end)) return 0
  return Math.max(0, Math.ceil((end - now.getTime()) / DAY_MS))
}

/**
 * العروض اللي الشركة تقدر تبدأ تجربتها: نظام متاح، الشركة معندهاش اشتراك فيه (تجربة واحدة لكل شركة
 * ونظام، والإلغاء بيحرق التجربة)، وفيه باقة ليها أيام تجربة. الخادم بيراجع كل ده تاني عند الطلب.
 */
export function buildOffers(
  products: PublicProduct[],
  plansByProduct: Readonly<Record<string, PublicPlan[]>>,
  subscribedProductCodes: ReadonlySet<string>,
): Offers {
  const offers: TrialOffer[] = []
  for (const product of products) {
    if (product.status !== 'available' || subscribedProductCodes.has(product.code)) continue
    const plans = (plansByProduct[product.code] ?? []).filter((plan) => plan.trialDays > 0)
    if (plans.length > 0) offers.push({ product, plans })
  }
  return { offers, comingSoon: products.filter((product) => product.status === 'coming_soon') }
}
