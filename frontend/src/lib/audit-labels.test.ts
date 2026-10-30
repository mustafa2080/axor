import { describe, expect, it } from 'vitest'
import { AUDIT_ACTIONS, auditActionLabel, formatAuditDetails, isWarningAction } from './audit-labels.ts'

describe('auditActionLabel', () => {
  it('translates known actions', () => {
    expect(auditActionLabel('auth.login')).toBe('تسجيل دخول')
    expect(auditActionLabel('subscription.canceled')).toBe('إلغاء اشتراك')
  })

  it('shows an unknown action by its code, so no event is hidden', () => {
    expect(auditActionLabel('billing.refunded')).toBe('billing.refunded')
  })

  it('lists only dotted action codes', () => {
    expect(AUDIT_ACTIONS.length).toBeGreaterThan(10)
    for (const action of AUDIT_ACTIONS) expect(action).toMatch(/^[a-z]+\.[a-z_]+$/)
  })
})

describe('isWarningAction', () => {
  it('marks failures and suspected session theft', () => {
    expect(isWarningAction('auth.login_failed')).toBe(true)
    expect(isWarningAction('auth.refresh_reuse_detected')).toBe(true)
    expect(isWarningAction('auth.login')).toBe(false)
  })
})

describe('formatAuditDetails', () => {
  it('returns null when there is nothing to show', () => {
    expect(formatAuditDetails(null)).toBeNull()
    expect(formatAuditDetails({})).toBeNull()
  })

  it('prints metadata on one line', () => {
    expect(formatAuditDetails({ from: 'trialing', to: 'canceled' })).toBe('{"from":"trialing","to":"canceled"}')
  })

  it('truncates long metadata', () => {
    const text = formatAuditDetails({ note: 'x'.repeat(500) })
    expect(text).not.toBeNull()
    expect(text?.length).toBe(160)
    expect(text?.endsWith('…')).toBe(true)
  })
})
