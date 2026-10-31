import { describe, expect, it } from 'vitest'
import { FULL_NAME_MAX, checkFullName, displayName } from './profile-name.ts'

describe('checkFullName', () => {
  it('trims and accepts an ordinary name, Arabic included', () => {
    expect(checkFullName('  سافي أحمد  ')).toEqual({ ok: true, value: 'سافي أحمد' })
  })

  it('treats an empty or blank name as clearing it', () => {
    expect(checkFullName('')).toEqual({ ok: true, value: null })
    expect(checkFullName('   ')).toEqual({ ok: true, value: null })
  })

  it('accepts exactly the maximum length and refuses one more', () => {
    expect(checkFullName('a'.repeat(FULL_NAME_MAX)).ok).toBe(true)
    expect(checkFullName('a'.repeat(FULL_NAME_MAX + 1)).ok).toBe(false)
  })

  it('refuses control characters, including a newline and DEL', () => {
    expect(checkFullName('a\nb').ok).toBe(false)
    expect(checkFullName('a\u0000b').ok).toBe(false)
    expect(checkFullName('a\u007fb').ok).toBe(false)
  })
})

describe('displayName', () => {
  it('prefers the name and falls back to the email', () => {
    expect(displayName({ fullName: 'Sara', email: 's@example.test' })).toBe('Sara')
    expect(displayName({ fullName: null, email: 's@example.test' })).toBe('s@example.test')
    expect(displayName({ fullName: '', email: 's@example.test' })).toBe('s@example.test')
  })
})
