import { api } from './client.ts'

export type TenantStatus = 'active' | 'suspended' | 'closed'

// شكل الشركة من GET /admin/tenants (backend/src/database/repositories/tenants-admin.repository.ts).
export interface AdminTenant {
  id: string
  name: string
  status: TenantStatus
  closedAt: string | null
  createdAt: string
  userCount: number
}

export const TENANTS_PAGE_SIZE = 50

export function listTenants(status: TenantStatus | null, offset: number) {
  const query = new URLSearchParams({ limit: String(TENANTS_PAGE_SIZE), offset: String(offset) })
  if (status !== null) query.set('status', status)
  return api<AdminTenant[]>('GET', `/admin/tenants?${query.toString()}`)
}

export function suspendTenant(id: string, reason: string) {
  return api<AdminTenant>('POST', `/admin/tenants/${id}/suspend`, { reason })
}

export function reactivateTenant(id: string, reason: string | null) {
  return api<AdminTenant>('POST', `/admin/tenants/${id}/reactivate`, reason === null ? {} : { reason })
}
