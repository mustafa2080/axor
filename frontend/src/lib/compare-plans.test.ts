import { describe, expect, it } from 'vitest'
import type { PublicPlan } from '../api/company.ts'
import { buildCompareRows, featureCell, limitCell } from './compare-plans.ts'

function plan(code: string, limits: PublicPlan['limits'], features: PublicPlan['features']): PublicPlan {
  return {
    code,
    activity: null,
    version: 1,
    price: { amountMinor: 10000, currency: 'EGP', billingPeriod: 'monthly' },
    trialDays: 14,
    limits,
    features,
  }
}

describe('buildCompareRows', () => {
  it('takes the union of limit and feature keys across plans, sorted', () => {
    const rows = buildCompareRows([
      plan('a', { users: 5, branches: 1 }, { reports: true }),
      plan('b', { users: null, invoices: 100 }, { api: false, reports: true }),
    ])
    expect(rows.limitKeys).toEqual(['branches', 'invoices', 'users'])
    expect(rows.featureKeys).toEqual(['api', 'reports'])
  })

  it('is stable regardless of plan order', () => {
    const a = plan('a', { z: 1, a: 2 }, { y: true })
    const b = plan('b', { m: 1 }, { b: false })
    expect(buildCompareRows([a, b])).toEqual(buildCompareRows([b, a]))
  })

  it('returns empty rows for no plans', () => {
    expect(buildCompareRows([])).toEqual({ limitKeys: [], featureKeys: [] })
  })
})

describe('limitCell', () => {
  const p = plan('a', { users: 5, seats: null }, {})

  it('distinguishes a number, unlimited (null) and a missing key', () => {
    expect(limitCell(p, 'users')).toEqual({ kind: 'value', value: 5 })
    expect(limitCell(p, 'seats')).toEqual({ kind: 'unlimited' })
    expect(limitCell(p, 'branches')).toEqual({ kind: 'missing' })
  })

  it('treats zero as a value, not as missing or unlimited', () => {
    expect(limitCell(plan('z', { users: 0 }, {}), 'users')).toEqual({ kind: 'value', value: 0 })
  })

  it('does not read inherited keys', () => {
    expect(limitCell(p, 'constructor')).toEqual({ kind: 'missing' })
    expect(limitCell(p, '__proto__')).toEqual({ kind: 'missing' })
  })
})

describe('featureCell', () => {
  const p = plan('a', {}, { reports: true, api: false })

  it('distinguishes on, off and missing', () => {
    expect(featureCell(p, 'reports')).toBe('on')
    expect(featureCell(p, 'api')).toBe('off')
    expect(featureCell(p, 'export')).toBe('missing')
  })

  it('does not read inherited keys', () => {
    expect(featureCell(p, 'toString')).toBe('missing')
  })
})
