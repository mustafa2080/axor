import { describe, expect, it } from 'vitest'
import { hashPath, isKnownCompanyHash, isKnownPlatformHash, isKnownPublicHash, publicRouteOf } from './routes.ts'

describe('publicRouteOf', () => {
  it('shows the home page for the empty hash, # and #/', () => {
    for (const hash of ['', '#', '#/']) expect(publicRouteOf(hash), hash).toBe('home')
  })

  it('maps each public page, ignoring the query string', () => {
    expect(publicRouteOf('#/login')).toBe('login')
    expect(publicRouteOf('#/plans')).toBe('plans')
    expect(publicRouteOf('#/register')).toBe('register')
    expect(publicRouteOf('#/register?product=a&plan=b')).toBe('register')
  })

  it('maps the catalog pages, taking the system code from the query', () => {
    expect(publicRouteOf('#/systems')).toBe('systems')
    expect(publicRouteOf('#/system?code=sys')).toBe('system')
    expect(publicRouteOf('#/system?code=sys&activity=retail')).toBe('system')
    expect(publicRouteOf('#/trial')).toBe('trial')
    expect(publicRouteOf('#/plans?product=sys&view=compare')).toBe('plans')
  })

  it('does not read inherited object keys as routes', () => {
    for (const hash of ['#/constructor', '#/__proto__', '#/toString']) expect(publicRouteOf(hash), hash).toBe('home')
  })
})

describe('hashPath', () => {
  it('drops the query string', () => {
    expect(hashPath('#/register?product=demo-sub&plan=demo-trial')).toBe('#/register')
    expect(hashPath('#/start?trial=failed')).toBe('#/start')
    expect(hashPath('#/plans')).toBe('#/plans')
    expect(hashPath('')).toBe('')
  })
})

describe('isKnownPublicHash', () => {
  it('accepts home and the public pages, with or without a query', () => {
    for (const hash of ['', '#', '#/', '#/login', '#/register', '#/plans', '#/register?product=a&plan=b', '#/systems', '#/system?code=a', '#/trial', '#/plans?view=compare']) {
      expect(isKnownPublicHash(hash), hash).toBe(true)
    }
  })

  it('does not accept the pages that are not built yet', () => {
    for (const hash of ['#/faq', '#/contact', '#/terms', '#/privacy', '#/system/sys', '#/systems/x']) {
      expect(isKnownPublicHash(hash), hash).toBe(false)
    }
  })

  it('rejects unknown links and links that belong to signed-in areas', () => {
    for (const hash of ['#/nope', '#/start', '#/members', '#/tenants', '#/products', '#/subscriptions', '#/login/extra', '#/Login', '#//']) {
      expect(isKnownPublicHash(hash), hash).toBe(false)
    }
  })
})

describe('isKnownCompanyHash', () => {
  it('accepts the company area, home, and public links (old marketing links are not 404)', () => {
    for (const hash of ['#/', '#/start', '#/members', '#/start?trial=failed', '#/plans', '#/login', '#/register']) {
      expect(isKnownCompanyHash(hash), hash).toBe(true)
    }
  })

  it('rejects platform-only and unknown links', () => {
    for (const hash of ['#/products', '#/subscriptions', '#/tenants', '#/audit', '#/admin', '#/start/x']) {
      expect(isKnownCompanyHash(hash), hash).toBe(false)
    }
  })
})

describe('isKnownPlatformHash', () => {
  it('accepts the platform area, home, and public links', () => {
    for (const hash of ['#/', '#/products', '#/plans', '#/subscriptions', '#/tenants', '#/audit', '#/login', '#/register']) {
      expect(isKnownPlatformHash(hash), hash).toBe(true)
    }
  })

  it('rejects company-only and unknown links', () => {
    for (const hash of ['#/start', '#/members', '#/nope', '#/products/1']) {
      expect(isKnownPlatformHash(hash), hash).toBe(false)
    }
  })
})
