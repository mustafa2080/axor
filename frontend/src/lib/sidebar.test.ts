import { describe, expect, it } from 'vitest'
import { parseCollapsed, serializeCollapsed } from './sidebar.ts'

describe('sidebar state', () => {
  it('مفتوحة افتراضياً، ومطويّة بس لو القيمة collapsed', () => {
    expect(parseCollapsed(null)).toBe(false)
    expect(parseCollapsed('open')).toBe(false)
    expect(parseCollapsed('garbage')).toBe(false)
    expect(parseCollapsed('collapsed')).toBe(true)
  })

  it('التخزين والقراءة متطابقين', () => {
    expect(parseCollapsed(serializeCollapsed(true))).toBe(true)
    expect(parseCollapsed(serializeCollapsed(false))).toBe(false)
  })
})
