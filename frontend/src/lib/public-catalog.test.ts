import { describe, expect, it } from 'vitest'
import type { PublicPlan, PublicProduct } from '../api/company.ts'
import {
  findActivity,
  findVisibleProduct,
  isSubscribable,
  planActivityName,
  plansForActivity,
  plansHref,
  plansViewOf,
  queryCode,
  systemHref,
  trialLink,
  visibleProducts,
} from './public-catalog.ts'

function product(status: PublicProduct['status'], code = 'sys'): PublicProduct {
  return {
    code,
    name: 'Sys',
    status,
    activities: [
      { code: 'retail', name: 'تجزئة' },
      { code: 'food', name: 'مطاعم' },
    ],
  }
}

function plan(code: string, activity: string | null, trialDays = 14): PublicPlan {
  return {
    code,
    activity,
    version: 1,
    price: { amountMinor: 10000, currency: 'EGP', billingPeriod: 'monthly' },
    trialDays,
    limits: {},
    features: {},
  }
}

describe('isSubscribable / trialLink', () => {
  it('only an available product can be subscribed to', () => {
    expect(isSubscribable(product('available'))).toBe(true)
    expect(isSubscribable(product('coming_soon'))).toBe(false)
    expect(isSubscribable(product('disabled'))).toBe(false)
  })

  it('gives a register link for an available product and a plan with a trial', () => {
    expect(trialLink(product('available', 'sys'), plan('pro', null))).toBe('#/register?product=sys&plan=pro')
  })

  it('gives no link for a coming-soon or disabled product, whatever the plan', () => {
    expect(trialLink(product('coming_soon'), plan('pro', null))).toBeNull()
    expect(trialLink(product('disabled'), plan('pro', null))).toBeNull()
  })

  it('gives no link for a plan without a free trial', () => {
    expect(trialLink(product('available'), plan('pro', null, 0))).toBeNull()
  })
})

describe('queryCode', () => {
  it('reads a well-formed code', () => {
    expect(queryCode('#/system?code=my-sys_1', 'code')).toBe('my-sys_1')
    expect(queryCode('#/system?activity=retail&code=a', 'code')).toBe('a')
  })

  it('rejects missing, repeated, malformed and oversized values', () => {
    expect(queryCode('#/system', 'code')).toBeNull()
    expect(queryCode('#/system?code=a&code=b', 'code')).toBeNull()
    expect(queryCode('#/system?code=A', 'code')).toBeNull()
    expect(queryCode('#/system?code=%3Cscript%3E', 'code')).toBeNull()
    expect(queryCode('#/system?code=-a', 'code')).toBeNull()
    expect(queryCode(`#/system?code=${'a'.repeat(51)}`, 'code')).toBeNull()
    expect(queryCode('#/system?code=', 'code')).toBeNull()
  })
})

describe('plansViewOf', () => {
  it('is compare only for exactly view=compare', () => {
    expect(plansViewOf('#/plans?view=compare')).toBe('compare')
    expect(plansViewOf('#/plans?product=a&view=compare')).toBe('compare')
  })

  it('falls back to cards for anything else', () => {
    for (const hash of ['#/plans', '#/plans?view=cards', '#/plans?view=x', '#/plans?view=compare&view=compare', '#/plans?view=Compare']) {
      expect(plansViewOf(hash), hash).toBe('cards')
    }
  })
})

describe('visibleProducts / findVisibleProduct', () => {
  const all = [product('available', 'a'), product('coming_soon', 'b'), product('disabled', 'c')]

  it('hides disabled products only', () => {
    expect(visibleProducts(all).map((p) => p.code)).toEqual(['a', 'b'])
  })

  it('finds a visible product, and not a disabled, unknown or null one', () => {
    expect(findVisibleProduct(all, 'b')?.code).toBe('b')
    expect(findVisibleProduct(all, 'c')).toBeNull()
    expect(findVisibleProduct(all, 'zzz')).toBeNull()
    expect(findVisibleProduct(all, null)).toBeNull()
  })
})

describe('plansForActivity / findActivity / planActivityName', () => {
  const plans = [plan('all', null), plan('retail-only', 'retail'), plan('food-only', 'food')]

  it('an all-activities plan fits any activity; a dedicated plan fits only its own', () => {
    expect(plansForActivity(plans, 'retail').map((p) => p.code)).toEqual(['all', 'retail-only'])
    expect(plansForActivity(plans, 'food').map((p) => p.code)).toEqual(['all', 'food-only'])
  })

  it('no activity means every plan', () => {
    expect(plansForActivity(plans, null)).toHaveLength(3)
  })

  it('keeps only activities that belong to the product', () => {
    const p = product('available')
    expect(findActivity(p, 'retail')).toBe('retail')
    expect(findActivity(p, 'other')).toBeNull()
    expect(findActivity(p, null)).toBeNull()
  })

  it('names the activity, with a fallback to the code and a label for all', () => {
    const p = product('available')
    expect(planActivityName(p, plan('x', null))).toBe('كل الأنشطة')
    expect(planActivityName(p, plan('x', 'retail'))).toBe('تجزئة')
    expect(planActivityName(p, plan('x', 'gone'))).toBe('gone')
  })
})

describe('plansHref / systemHref', () => {
  it('omits the default view and drops an activity without a product', () => {
    expect(plansHref()).toBe('#/plans')
    expect(plansHref({ activity: 'retail' })).toBe('#/plans')
    expect(plansHref({ product: 'sys' })).toBe('#/plans?product=sys')
    expect(plansHref({ product: 'sys', activity: 'retail', view: 'compare' })).toBe(
      '#/plans?product=sys&activity=retail&view=compare',
    )
    expect(plansHref({ view: 'compare' })).toBe('#/plans?view=compare')
  })

  it('builds a system link, encoding the codes', () => {
    expect(systemHref('sys')).toBe('#/system?code=sys')
    expect(systemHref('sys', 'retail')).toBe('#/system?code=sys&activity=retail')
    expect(systemHref('a&b')).toBe('#/system?code=a%26b')
  })
})
