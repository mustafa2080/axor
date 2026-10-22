import { describe, expect, it } from 'vitest'
import { TRIAL_FAILED_HASH, isTrialFailedHash } from './useRoute.ts'

describe('isTrialFailedHash', () => {
  it('recognizes only the exact redirect used after a failed trial start', () => {
    expect(isTrialFailedHash(TRIAL_FAILED_HASH)).toBe(true)
    expect(isTrialFailedHash('#/start')).toBe(false)
    expect(isTrialFailedHash('#/')).toBe(false)
    expect(isTrialFailedHash('')).toBe(false)
    expect(isTrialFailedHash('#/start?trial=failed&x=1')).toBe(false)
    expect(isTrialFailedHash('#/start?trial=ok')).toBe(false)
  })

  it('stays inside the company start route', () => {
    expect(TRIAL_FAILED_HASH.split('?')[0]).toBe('#/start')
  })
})
