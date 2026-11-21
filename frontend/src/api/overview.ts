import { api } from './client.ts'
import type { SubscriptionStatus } from './subscriptions.ts'
import type { TenantStatus } from './tenants.ts'

export type StatusCounts<S extends string> = Record<S, number> & { total: number }

// شكل الرد من GET /admin/overview (backend/src/database/repositories/overview-admin.repository.ts).
// كل الحالات موجودة دايماً (صفر لو مفيش)، ومفيش أي اسم شركة أو بريد، أرقام بس.
export interface PlatformOverview {
  tenants: StatusCounts<TenantStatus>
  subscriptions: StatusCounts<SubscriptionStatus>
  trialsEndingSoon: number
  trialsEndingSoonDays: number
}

export const getOverview = () => api<PlatformOverview>('GET', '/admin/overview')
