import { api } from './client.ts'
import type { BillingPeriod, PlanFeatures, PlanLimits } from './catalog.ts'
import type { SubscriptionStatus } from './subscriptions.ts'

// شكل ردود الخادم لمسارات الشركة (/subscriptions) والكتالوج العام (/catalog)، من غير أي معرّفات داخلية.

export interface CompanyPlanTerms {
  priceMinor: number
  currency: string
  billingPeriod: BillingPeriod
  trialDays: number
  limits: PlanLimits
  features: PlanFeatures
}

export interface CompanySubscription {
  productCode: string
  productName: string
  planCode: string
  status: SubscriptionStatus
  /** هل الشركة تقدر تستخدم النظام دلوقتي (الحالة + تاريخ النهاية)؟ الخادم هو اللي بيحسبها. */
  entitled: boolean
  trialEndsAt: string | null
  currentPeriodEnd: string | null
  canceledAt: string | null
  version: (CompanyPlanTerms & { version: number; pinned: boolean }) | null
}

export interface PublicActivity {
  code: string
  name: string
}

export interface PublicProduct {
  code: string
  name: string
  status: 'available' | 'coming_soon' | 'disabled'
  activities: PublicActivity[]
}

export interface PublicPlan {
  code: string
  /** null = الباقة لكل أنشطة النظام. */
  activity: string | null
  version: number
  price: { amountMinor: number; currency: string; billingPeriod: BillingPeriod }
  trialDays: number
  limits: PlanLimits
  features: PlanFeatures
}

export const listMySubscriptions = () => api<CompanySubscription[]>('GET', '/subscriptions')

/** الشركة بتحدد النظام والباقة بس. المدة والحالة والتواريخ بيقررها الخادم. */
export const startTrial = (productCode: string, planCode: string) =>
  api<unknown>('POST', '/subscriptions/trial', { productCode, planCode })

export const cancelMySubscription = (productCode: string) =>
  api<unknown>('POST', `/subscriptions/${encodeURIComponent(productCode)}/cancel`)

export const listPublicProducts = () => api<PublicProduct[]>('GET', '/catalog/products')

export const listPublicPlans = (productCode: string) =>
  api<PublicPlan[]>('GET', `/catalog/products/${encodeURIComponent(productCode)}/plans`)

/** الكتالوج العام (من غير دخول): كل الأنظمة، وباقات الأنظمة المتاحة بس. */
export async function loadPublicCatalog(): Promise<{
  products: PublicProduct[]
  plansByProduct: Record<string, PublicPlan[]>
}> {
  const products = await listPublicProducts()
  const available = products.filter((product) => product.status === 'available')
  const lists = await Promise.all(available.map((product) => listPublicPlans(product.code)))
  const plansByProduct: Record<string, PublicPlan[]> = {}
  available.forEach((product, index) => {
    plansByProduct[product.code] = lists[index] ?? []
  })
  return { products, plansByProduct }
}
