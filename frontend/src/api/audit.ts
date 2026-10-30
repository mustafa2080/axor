import { api } from './client.ts'

// شكل صف سجل التدقيق من GET /admin/audit-logs (backend/src/database/repositories/audit-admin.repository.ts).
export interface AuditEntry {
  id: string
  createdAt: string
  action: string
  actorUserId: string | null
  actorEmail: string | null
  tenantId: string | null
  tenantName: string | null
  targetType: string | null
  targetId: string | null
  metadata: Record<string, unknown> | null
  requestId: string | null
}

export const AUDIT_PAGE_SIZE = 50

export function listAuditLogs(action: string | null, offset: number) {
  const query = new URLSearchParams({ limit: String(AUDIT_PAGE_SIZE), offset: String(offset) })
  if (action !== null) query.set('action', action)
  return api<AuditEntry[]>('GET', `/admin/audit-logs?${query.toString()}`)
}
