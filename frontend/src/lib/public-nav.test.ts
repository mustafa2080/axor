import { describe, expect, it } from 'vitest'
import { PUBLIC_ACCOUNT_LINKS, PUBLIC_NAV, isCurrentPublicLink } from './public-nav.ts'
import { isKnownPublicHash } from './routes.ts'

describe('isCurrentPublicLink', () => {
  it('treats the empty hash, # and #/ as the home page', () => {
    for (const hash of ['', '#', '#/']) expect(isCurrentPublicLink('#/', hash)).toBe(true)
    expect(isCurrentPublicLink('#/', '#/plans')).toBe(false)
  })

  it('matches a page ignoring its query string', () => {
    expect(isCurrentPublicLink('#/plans', '#/plans')).toBe(true)
    expect(isCurrentPublicLink('#/register', '#/register?product=a&plan=b')).toBe(true)
    expect(isCurrentPublicLink('#/plans', '#/register')).toBe(false)
  })

  it('does not treat a longer path as a match', () => {
    expect(isCurrentPublicLink('#/plans', '#/plans-evil')).toBe(false)
  })
})

describe('public links', () => {
  it('only point at pages that exist, so a link can never lead to a 404', () => {
    for (const link of [...PUBLIC_NAV, ...PUBLIC_ACCOUNT_LINKS]) {
      expect(isKnownPublicHash(link.href)).toBe(true)
    }
  })

  it('has unique hrefs and non-empty labels', () => {
    const all = [...PUBLIC_NAV, ...PUBLIC_ACCOUNT_LINKS]
    expect(new Set(all.map((link) => link.href)).size).toBe(all.length)
    for (const link of all) expect(link.label.trim()).not.toBe('')
  })
})
