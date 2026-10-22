import { describe, expect, it } from 'vitest'
import type { PublicPlan, PublicProduct } from '../api/company.ts'
import { buildOffers } from './company-offers.ts'
import { findOffer, parsePlanChoice, registerHash } from './plan-choice.ts'

describe('parsePlanChoice', () => {
  it('بيقرا النظام والباقة من رابط التسجيل', () => {
    expect(parsePlanChoice('#/register?product=stark&plan=pro-monthly')).toEqual({
      productCode: 'stark',
      planCode: 'pro-monthly',
    })
  })

  it('null لو مفيش اختيار أو واحد منهم ناقص', () => {
    expect(parsePlanChoice('#/register')).toBeNull()
    expect(parsePlanChoice('#/register?product=stark')).toBeNull()
    expect(parsePlanChoice('#/register?plan=pro')).toBeNull()
    expect(parsePlanChoice('#/register?product=&plan=pro')).toBeNull()
  })

  it('null لو القيمة متكررة (مفيش تخمين لأي واحدة)', () => {
    expect(parsePlanChoice('#/register?product=a&product=b&plan=pro')).toBeNull()
    expect(parsePlanChoice('#/register?product=a&plan=x&plan=y')).toBeNull()
  })

  it('null لو الكود شكله غلط (حروف كبيرة أو رموز أو أطول من 50)', () => {
    expect(parsePlanChoice('#/register?product=STARK&plan=pro')).toBeNull()
    expect(parsePlanChoice('#/register?product=a/b&plan=pro')).toBeNull()
    expect(parsePlanChoice('#/register?product=%3Cscript%3E&plan=pro')).toBeNull()
    expect(parsePlanChoice(`#/register?product=${'a'.repeat(51)}&plan=pro`)).toBeNull()
  })

  it('بيتجاهل أي بارامترات تانية', () => {
    expect(parsePlanChoice('#/register?product=stark&plan=pro&utm=x')).toEqual({
      productCode: 'stark',
      planCode: 'pro',
    })
  })
})

describe('registerHash', () => {
  it('من غير اختيار بيرجع رابط التسجيل العادي', () => {
    expect(registerHash(null)).toBe('#/register')
  })

  it('مع اختيار بيرجع رابط يتقرا تاني بنفس القيم', () => {
    const choice = { productCode: 'stark', planCode: 'pro_1' }
    expect(parsePlanChoice(registerHash(choice))).toEqual(choice)
  })
})

describe('findOffer', () => {
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
  const offers = buildOffers(
    [product('stark', 'available'), product('caprina', 'coming_soon')],
    { stark: [plan('pro', 14), plan('free', 0)], caprina: [plan('pro', 14)] },
    new Set(),
  )

  it('بيلاقي النظام والباقة المتاحين', () => {
    const found = findOffer(offers, { productCode: 'stark', planCode: 'pro' })
    expect(found?.product.code).toBe('stark')
    expect(found?.plan.code).toBe('pro')
  })

  it('null لباقة من غير تجربة، أو نظام قريباً، أو كود مش موجود', () => {
    expect(findOffer(offers, { productCode: 'stark', planCode: 'free' })).toBeNull()
    expect(findOffer(offers, { productCode: 'caprina', planCode: 'pro' })).toBeNull()
    expect(findOffer(offers, { productCode: 'stark', planCode: 'nope' })).toBeNull()
    expect(findOffer(offers, { productCode: 'nope', planCode: 'pro' })).toBeNull()
  })
})
