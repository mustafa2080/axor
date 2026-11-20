import { describe, expect, it } from 'vitest'
import { pageTitle } from './page-title.ts'

describe('pageTitle', () => {
  it('names each public page and ignores the query', () => {
    expect(pageTitle('public', '')).toBe('الرئيسية | AXOR')
    expect(pageTitle('public', '#/')).toBe('الرئيسية | AXOR')
    expect(pageTitle('public', '#/login')).toBe('تسجيل الدخول | AXOR')
    expect(pageTitle('public', '#/register?product=a&plan=b')).toBe('إنشاء حساب | AXOR')
    expect(pageTitle('public', '#/plans?view=compare')).toBe('الباقات | AXOR')
    expect(pageTitle('public', '#/systems')).toBe('الأنظمة | AXOR')
    expect(pageTitle('public', '#/system?code=sys')).toBe('تفاصيل النظام | AXOR')
    expect(pageTitle('public', '#/trial')).toBe('التجربة المجانية | AXOR')
  })

  it('names the staff site editor for the home page and for every information-page tab', () => {
    for (const hash of ['#/site', '#/site?page=faq', '#/site?page=privacy']) {
      expect(pageTitle('platform', hash), hash).toBe('محتوى الموقع | AXOR')
    }
  })

  it('names the four information pages', () => {
    expect(pageTitle('public', '#/faq')).toBe('الأسئلة الشائعة | AXOR')
    expect(pageTitle('public', '#/contact')).toBe('تواصل معنا | AXOR')
    expect(pageTitle('public', '#/terms')).toBe('الشروط والأحكام | AXOR')
    expect(pageTitle('public', '#/privacy')).toBe('سياسة الخصوصية | AXOR')
  })

  it('gives unknown links the 404 title in every area', () => {
    for (const area of ['public', 'company', 'platform'] as const) {
      expect(pageTitle(area, '#/nope'), area).toBe('الصفحة مش موجودة | AXOR')
    }
    // رابط بتاع شركة مش معروف للزائر وللمنصة، والعكس.
    expect(pageTitle('public', '#/members')).toBe('الصفحة مش موجودة | AXOR')
    expect(pageTitle('platform', '#/members')).toBe('الصفحة مش موجودة | AXOR')
    expect(pageTitle('company', '#/tenants')).toBe('الصفحة مش موجودة | AXOR')
  })

  it('names the company pages, and falls back to "my subscriptions" like CompanyApp', () => {
    expect(pageTitle('company', '#/')).toBe('اشتراكاتي | AXOR')
    expect(pageTitle('company', '#/start?trial=failed')).toBe('ابدأ تجربة | AXOR')
    expect(pageTitle('company', '#/members')).toBe('الأعضاء | AXOR')
    expect(pageTitle('company', '#/plans')).toBe('اشتراكاتي | AXOR')
  })

  it('names the platform pages, and falls back to products like AdminApp', () => {
    expect(pageTitle('platform', '#/')).toBe('الأنظمة والأنشطة | AXOR')
    expect(pageTitle('platform', '#/products')).toBe('الأنظمة والأنشطة | AXOR')
    expect(pageTitle('platform', '#/plans')).toBe('الباقات | AXOR')
    expect(pageTitle('platform', '#/subscriptions')).toBe('الاشتراكات | AXOR')
    expect(pageTitle('platform', '#/tenants')).toBe('الشركات | AXOR')
    expect(pageTitle('platform', '#/audit')).toBe('سجل التدقيق | AXOR')
    expect(pageTitle('platform', '#/login')).toBe('الأنظمة والأنشطة | AXOR')
  })

  it('shows only the brand while loading', () => {
    expect(pageTitle('loading', '#/plans')).toBe('AXOR')
  })

  it('does not read inherited object keys as pages', () => {
    for (const hash of ['#/constructor', '#/__proto__', '#/toString']) {
      expect(pageTitle('company', hash), hash).toBe('الصفحة مش موجودة | AXOR')
      expect(pageTitle('platform', hash), hash).toBe('الصفحة مش موجودة | AXOR')
    }
  })
})
