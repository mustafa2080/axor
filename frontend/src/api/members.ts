import { api } from './client.ts'

export type TenantRole = 'owner' | 'admin' | 'member' | 'read_only'
export type MemberStatus = 'active' | 'invited' | 'disabled'

// شكل العضو من GET /members (backend/src/database/repositories/members.repository.ts).
// مفيش hash كلمة سر ولا أي id داخلي غير id العضو نفسه.
export interface Member {
  id: string
  email: string
  status: MemberStatus
  tenantRole: TenantRole
  emailVerifiedAt: string | null
  createdAt: string
}

export const MEMBERS_PAGE_SIZE = 50

export function listMembers(offset: number) {
  const query = new URLSearchParams({ limit: String(MEMBERS_PAGE_SIZE), offset: String(offset) })
  return api<Member[]>('GET', `/members?${query.toString()}`)
}

export function changeMemberRole(id: string, role: TenantRole) {
  return api<Member>('PATCH', `/members/${id}/role`, { role })
}

export function disableMember(id: string) {
  return api<Member>('POST', `/members/${id}/disable`)
}

export function enableMember(id: string) {
  return api<Member>('POST', `/members/${id}/enable`)
}
