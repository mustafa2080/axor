import { describe, expect, it } from 'vitest'
import { THEME_COLOR, nextTheme, parseStoredTheme, resolveTheme } from './theme.ts'

describe('theme', () => {
  it('بيقبل light وdark بس من التخزين', () => {
    expect(parseStoredTheme('light')).toBe('light')
    expect(parseStoredTheme('dark')).toBe('dark')
    expect(parseStoredTheme(null)).toBeNull()
    expect(parseStoredTheme('')).toBeNull()
    expect(parseStoredTheme('DARK')).toBeNull()
    expect(parseStoredTheme('system')).toBeNull()
  })

  it('الاختيار الصريح بيغلب إعداد الجهاز، ومن غيره بنتبع الجهاز', () => {
    expect(resolveTheme('light', true)).toBe('light')
    expect(resolveTheme('dark', false)).toBe('dark')
    expect(resolveTheme(null, true)).toBe('dark')
    expect(resolveTheme(null, false)).toBe('light')
  })

  it('التبديل بيقلب الوضع', () => {
    expect(nextTheme('light')).toBe('dark')
    expect(nextTheme('dark')).toBe('light')
  })

  it('لكل وضع لون theme-color', () => {
    expect(THEME_COLOR.light).not.toBe(THEME_COLOR.dark)
  })
})
