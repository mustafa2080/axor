import { api } from './client.ts'

// قيم الحالات زي ما هي في الباك (backend/src/database/schema/enums.ts).
export const PRODUCT_STATUSES = ['available', 'coming_soon', 'disabled'] as const
export const ACTIVITY_STATUSES = ['active', 'disabled'] as const
export const PLAN_STATUSES = ['active', 'archived'] as const
export const BILLING_PERIODS = ['monthly', 'yearly'] as const

export type ProductStatus = (typeof PRODUCT_STATUSES)[number]
export type ActivityStatus = (typeof ACTIVITY_STATUSES)[number]
export type PlanStatus = (typeof PLAN_STATUSES)[number]
export type BillingPeriod = (typeof BILLING_PERIODS)[number]

/** null = غير محدود. */
export type PlanLimits = Record<string, number | null>
export type PlanFeatures = Record<string, boolean>

export interface Activity {
  id: string
  code: string
  name: string
  status: ActivityStatus
}

export interface VersionSpec {
  priceMinor: number
  currency: string
  billingPeriod: BillingPeriod
  trialDays: number
  limits: PlanLimits
  features: PlanFeatures
}

export interface PlanVersion extends VersionSpec {
  id: string
  version: number
  createdAt: string
}

export interface Plan {
  id: string
  code: string
  /** null = الباقة لكل أنشطة النظام. */
  activityId: string | null
  status: PlanStatus
  currentVersionId: string | null
  versions: PlanVersion[]
}

export interface Product {
  id: string
  code: string
  name: string
  status: ProductStatus
  activities: Activity[]
  plans: Plan[]
}

export const listCatalog = () => api<Product[]>('GET', '/admin/catalog')

export const createProduct = (input: { code: string; name: string; status: ProductStatus }) =>
  api<Product>('POST', '/admin/catalog/products', input)

export const updateProduct = (id: string, changes: { name?: string; status?: ProductStatus }) =>
  api<Product>('PATCH', `/admin/catalog/products/${id}`, changes)

export const createActivity = (
  productId: string,
  input: { code: string; name: string; status: ActivityStatus },
) => api<Activity>('POST', `/admin/catalog/products/${productId}/activities`, input)

export const updateActivity = (id: string, changes: { name?: string; status?: ActivityStatus }) =>
  api<Activity>('PATCH', `/admin/catalog/activities/${id}`, changes)

export const createPlan = (
  productId: string,
  input: { code: string; activityCode: string | null; status: PlanStatus; version: VersionSpec },
) => api<Plan>('POST', `/admin/catalog/products/${productId}/plans`, input)

/** تغيير السعر أو الحدود أو الميزات = نسخة جديدة بتبقى الحالية (النسخ القديمة ما بتتغيرش). */
export const addPlanVersion = (planId: string, spec: VersionSpec) =>
  api<Plan>('POST', `/admin/catalog/plans/${planId}/versions`, spec)

export const updatePlan = (id: string, changes: { status?: PlanStatus; currentVersionId?: string }) =>
  api<Plan>('PATCH', `/admin/catalog/plans/${id}`, changes)
