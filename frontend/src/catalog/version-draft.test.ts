import { describe, expect, it } from 'vitest'
import type { VersionSpec } from '../api/catalog.ts'
import { draftFromSpec, draftToSpec, emptyDraft, newRowId, sameSpec } from './version-draft.ts'

const spec: VersionSpec = {
  priceMinor: 19950,
  currency: 'EGP',
  billingPeriod: 'monthly',
  trialDays: 14,
  limits: { users: 5, shipments_per_month: null },
  features: { api_access: true, reports: false },
}

describe('draftToSpec', () => {
  it('round-trips a spec through the form representation', () => {
    const result = draftToSpec(draftFromSpec(spec))
    expect(result).toEqual({ ok: true, spec })
  })

  it('normalizes currency case and converts price to minor units', () => {
    const draft = { ...emptyDraft(), price: '49.9', currency: ' egp ' }
    const result = draftToSpec(draft)
    expect(result.ok && result.spec.priceMinor).toBe(4990)
    expect(result.ok && result.spec.currency).toBe('EGP')
  })

  it('rejects bad price, currency and trial days', () => {
    expect(draftToSpec({ ...emptyDraft(), price: 'x' }).ok).toBe(false)
    expect(draftToSpec({ ...emptyDraft(), price: '10', currency: 'EG' }).ok).toBe(false)
    expect(draftToSpec({ ...emptyDraft(), price: '10', trialDays: '366' }).ok).toBe(false)
    expect(draftToSpec({ ...emptyDraft(), price: '10', trialDays: '-1' }).ok).toBe(false)
  })

  it('rejects invalid and duplicate keys', () => {
    const base = { ...emptyDraft(), price: '10' }
    const row = (key: string) => ({ id: newRowId(), key, value: '1', unlimited: false })
    expect(draftToSpec({ ...base, limits: [row('Users')] }).ok).toBe(false)
    expect(draftToSpec({ ...base, limits: [row('1users')] }).ok).toBe(false)
    expect(draftToSpec({ ...base, limits: [row('users'), row('users')] }).ok).toBe(false)
    expect(draftToSpec({ ...base, limits: [row('constructor')] }).ok).toBe(true)
  })

  it('requires a whole number unless the limit is unlimited', () => {
    const base = { ...emptyDraft(), price: '10' }
    const limit = (value: string, unlimited: boolean) => [
      { id: newRowId(), key: 'users', value, unlimited },
    ]
    expect(draftToSpec({ ...base, limits: limit('1.5', false) }).ok).toBe(false)
    expect(draftToSpec({ ...base, limits: limit('', false) }).ok).toBe(false)
    expect(draftToSpec({ ...base, limits: limit('', true) })).toMatchObject({
      ok: true,
      spec: { limits: { users: null } },
    })
  })
})

describe('sameSpec', () => {
  it('ignores key order but detects any change', () => {
    const reordered: VersionSpec = {
      ...spec,
      limits: { shipments_per_month: null, users: 5 },
      features: { reports: false, api_access: true },
    }
    expect(sameSpec(spec, reordered)).toBe(true)
    expect(sameSpec(spec, { ...spec, priceMinor: 20000 })).toBe(false)
    expect(sameSpec(spec, { ...spec, limits: { users: 5 } })).toBe(false)
    expect(sameSpec(spec, { ...spec, features: { ...spec.features, reports: true } })).toBe(false)
  })
})
