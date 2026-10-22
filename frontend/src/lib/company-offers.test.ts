import { describe, expect, it } from 'vitest'
import type { PublicPlan, PublicProduct } from '../api/company.ts'
import { buildOffers, daysLeft } from './company-offers.ts'

const product = (code: string, status: PublicProduct['status']): PublicProduct => ({
  code,
  name: code,
  status,
  activities: [],
})

const plan = (code: string, trialDays: number): PublicPlan => ({
  code,
  activity: null,
  version: 1,
  price: { amountMinor: 10000, currency: 'EGP', billingPeriod: 'monthly' },
  trialDays,
  limits: {},
  features: {},
})

describe('daysLeft', () => {
  const now = new Date('2026-10-22T10:00:00Z')
  it('بيقرّب لفوق', () => {
    expect(daysLeft('2026-10-23T09:00:00Z', now)).toBe(1)
    expect(daysLeft('2026-10-29T10:00:01Z', now)).toBe(8)
  })
  it('صفر لو عدّى أو null أو غلط', () => {
    expect(daysLeft('2026-10-21T10:00:00Z', now)).toBe(0)
    expect(daysLeft(null, now)).toBe(0)
    expect(daysLeft('مش تاريخ', now)).toBe(0)
  })
})

describe('buildOffers', () => {
  const products = [product('stark', 'available'), product('caprina', 'coming_soon'), product('other', 'available')]

  it('بيعرض النظام المتاح اللي فيه باقة بتجربة، وبيفصل القريباً', () => {
    const result = buildOffers(
      products,
      { stark: [plan('free', 0), plan('pro', 14)], other: [plan('basic', 0)] },
      new Set(),
    )
    expect(result.offers.map((o) => o.product.code)).toEqual(['stark'])
    expect(result.offers[0]?.plans.map((p) => p.code)).toEqual(['pro'])
    expect(result.comingSoon.map((p) => p.code)).toEqual(['caprina'])
  })

  it('بيشيل النظام اللي الشركة عندها اشتراك فيه بأي حالة', () => {
    const result = buildOffers(products, { stark: [plan('pro', 14)] }, new Set(['stark']))
    expect(result.offers).toEqual([])
  })

  it('النظام القريباً مبيتعرضش كعرض حتى لو ليه باقات', () => {
    const result = buildOffers(products, { caprina: [plan('pro', 14)] }, new Set())
    expect(result.offers).toEqual([])
  })
})
