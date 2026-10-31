import { describe, expect, it } from 'vitest'
import type { Member } from '../api/members.ts'
import { assignableRoles, canManageMember, memberActions, normalizeReason } from './member-rules.ts'

const member = (overrides: Partial<Member>): Member => ({
  id: 'u2',
  email: 'm@example.test',
  status: 'active',
  tenantRole: 'member',
  emailVerifiedAt: null,
  createdAt: '2026-10-01T00:00:00.000Z',
  ...overrides,
})

describe('canManageMember', () => {
  it('lets an owner manage everyone and an admin only member and read_only', () => {
    for (const role of ['owner', 'admin', 'member', 'read_only'] as const) {
      expect(canManageMember('owner', role)).toBe(true)
    }
    expect(canManageMember('admin', 'member')).toBe(true)
    expect(canManageMember('admin', 'read_only')).toBe(true)
    expect(canManageMember('admin', 'admin')).toBe(false)
    expect(canManageMember('admin', 'owner')).toBe(false)
  })

  it('gives member, read_only and unknown roles no management at all', () => {
    for (const actor of ['member', 'read_only', 'support', '']) {
      expect(canManageMember(actor, 'member')).toBe(false)
    }
  })
})

describe('assignableRoles', () => {
  it('offers all four roles to an owner and only member/read_only to an admin', () => {
    expect(assignableRoles('owner', 'member')).toEqual(['owner', 'admin', 'member', 'read_only'])
    expect(assignableRoles('admin', 'member')).toEqual(['member', 'read_only'])
  })

  it('offers nothing when the actor may not touch the target', () => {
    expect(assignableRoles('admin', 'owner')).toEqual([])
    expect(assignableRoles('member', 'read_only')).toEqual([])
  })
})

describe('memberActions', () => {
  const owner = { id: 'u1', role: 'owner' }

  it('offers role change and disable for an active member, enable for a disabled one', () => {
    expect(memberActions(owner, member({}))).toEqual({ canChangeRole: true, canDisable: true, canEnable: false })
    expect(memberActions(owner, member({ status: 'disabled' }))).toEqual({
      canChangeRole: true,
      canDisable: false,
      canEnable: true,
    })
  })

  it('offers neither disable nor enable for an invited user (the invitation has to be finished)', () => {
    const actions = memberActions(owner, member({ status: 'invited' }))
    expect(actions.canDisable).toBe(false)
    expect(actions.canEnable).toBe(false)
  })

  it('hides every action on your own row', () => {
    expect(memberActions(owner, member({ id: 'u1', tenantRole: 'owner' }))).toEqual({
      canChangeRole: false,
      canDisable: false,
      canEnable: false,
    })
  })

  it('hides every action on an owner when the actor is an admin', () => {
    const admin = { id: 'u3', role: 'admin' }
    expect(memberActions(admin, member({ tenantRole: 'owner' })).canChangeRole).toBe(false)
    expect(memberActions(admin, member({ tenantRole: 'member' })).canChangeRole).toBe(true)
  })
})

describe('normalizeReason', () => {
  it('trims and accepts 3 to 500 characters', () => {
    expect(normalizeReason('  عدم السداد  ')).toBe('عدم السداد')
    expect(normalizeReason('abc')).toBe('abc')
    expect(normalizeReason('x'.repeat(500))).toHaveLength(500)
  })

  it('rejects too short (after trimming) and too long reasons', () => {
    expect(normalizeReason('')).toBeNull()
    expect(normalizeReason('  ab  ')).toBeNull()
    expect(normalizeReason('x'.repeat(501))).toBeNull()
  })
})
