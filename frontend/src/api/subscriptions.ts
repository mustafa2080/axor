import { api } from './client.ts'

// قيم الحالات زي ما هي في الباك (backend/src/database/schema/enums.ts).
export const SUBSCRIPTION_STATUSES = ['trialing', 'active', 'past_due', 'canceled', 'expired'] as const
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number]

export interface AdminSubscription {
  id: string
  tenantId: string
  tenantName: string
  productCode: string
  planCode: string
  status: SubscriptionStatus
  /** هل الشركة تقدر تستخدم النظام دلوقتي (الحالة + تاريخ النهاية)؟ الخادم هو اللي بيحسبها. */
  entitled: boolean
  trialEndsAt: string | null
  currentPeriodEnd: string | null
  canceledAt: string | null
  createdAt: string
}

export const SUBSCRIPTIONS_PAGE_SIZE = 50

export function listSubscriptions(status: SubscriptionStatus | null, offset: number) {
  const query = new URLSearchParams({ limit: String(SUBSCRIPTIONS_PAGE_SIZE), offset: String(offset) })
  if (status !== null) query.set('status', status)
  return api<AdminSubscription[]>('GET', `/admin/subscriptions?${query.toString()}`)
}

/** تفعيل أو تجديد لحد تاريخ نهاية (ISO) في المستقبل. */
export const activateSubscription = (id: string, currentPeriodEnd: string) =>
  api<AdminSubscription>('POST', `/admin/subscriptions/${id}/activate`, { currentPeriodEnd })

export const cancelSubscription = (id: string) =>
  api<AdminSubscription>('POST', `/admin/subscriptions/${id}/cancel`)

export const extendTrial = (id: string, days: number) =>
  api<AdminSubscription>('POST', `/admin/subscriptions/${id}/extend-trial`, { days })
