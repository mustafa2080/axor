import { describe, expect, it } from 'vitest'
import { hashPath, isKnownCompanyHash, isKnownPlatformHash, isKnownPublicHash } from './routes.ts'

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
    for (const hash of ['', '#', '#/', '#/login', '#/register', '#/plans', '#/register?product=a&plan=b']) {
      expect(isKnownPublicHash(hash), hash).toBe(true)
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
