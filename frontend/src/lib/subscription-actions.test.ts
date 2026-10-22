import { describe, expect, it } from 'vitest'
import { SUBSCRIPTION_STATUSES } from '../api/subscriptions.ts'
import { availableActions, dateInputValue, periodEndIso } from './subscription-actions.ts'

const now = new Date(2026, 9, 22, 12, 0, 0) // 22 أكتوبر 2026 ظهراً بتوقيت الجهاز

describe('availableActions', () => {
  it('matches the backend transition table', () => {
    expect(availableActions('trialing')).toEqual(['extend', 'activate', 'cancel'])
    expect(availableActions('active')).toEqual(['activate', 'cancel'])
    expect(availableActions('past_due')).toEqual(['activate', 'cancel'])
    expect(availableActions('canceled')).toEqual(['activate'])
    expect(availableActions('expired')).toEqual(['activate'])
  })

  it('only offers extend on a running trial', () => {
    for (const status of SUBSCRIPTION_STATUSES) {
      expect(availableActions(status).includes('extend')).toBe(status === 'trialing')
    }
  })
})

describe('periodEndIso', () => {
  it('turns a date into the end of that local day', () => {
    const iso = periodEndIso('2026-11-30', now)
    expect(iso).not.toBeNull()
    const end = new Date(iso as string)
    expect([end.getFullYear(), end.getMonth(), end.getDate()]).toEqual([2026, 10, 30])
    expect([end.getHours(), end.getMinutes(), end.getSeconds()]).toEqual([23, 59, 59])
  })

  it('accepts today (end of day is still in the future) but not yesterday', () => {
    expect(periodEndIso('2026-10-22', now)).not.toBeNull()
    expect(periodEndIso('2026-10-21', now)).toBeNull()
  })

  it('rejects malformed and impossible dates', () => {
    expect(periodEndIso('', now)).toBeNull()
    expect(periodEndIso('22/10/2026', now)).toBeNull()
    expect(periodEndIso('2027-02-31', now)).toBeNull()
    expect(periodEndIso('2027-13-01', now)).toBeNull()
  })

  it('rejects dates more than 5 years ahead', () => {
    expect(periodEndIso('2031-10-01', now)).not.toBeNull()
    expect(periodEndIso('2032-01-01', now)).toBeNull()
  })
})

describe('dateInputValue', () => {
  it('formats a date N days ahead and round-trips through periodEndIso', () => {
    expect(dateInputValue(now, 30)).toBe('2026-11-21')
    expect(periodEndIso(dateInputValue(now, 30), now)).not.toBeNull()
  })
})
