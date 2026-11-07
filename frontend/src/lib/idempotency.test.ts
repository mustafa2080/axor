
import { describe, expect, it } from 'vitest'
import { createKeyHolder, newIdempotencyKey } from './idempotency.ts'

// نفس شكل المفتاح اللي الخادم بيقبله (backend/src/modules/idempotency/idempotency.ts).
const SERVER_KEY_PATTERN = /^[A-Za-z0-9_-]{16,64}$/

describe('newIdempotencyKey', () => {
  it('بيطلع مفتاح بشكل يقبله الخادم، ومختلف في كل مرة', () => {
    const keys = new Set(Array.from({ length: 200 }, () => newIdempotencyKey()))
    expect(keys.size).toBe(200)
    for (const key of keys) expect(key).toMatch(SERVER_KEY_PATTERN)
  })
})

describe('createKeyHolder', () => {
  const counter = () => {
    let n = 0
    return () => `key-${String(++n).padStart(16, '0')}`
  }

  it('نفس البصمة بترجّع نفس المفتاح (إعادة محاولة)', () => {
    const holder = createKeyHolder(counter())
    const first = holder.keyFor('sub-1:7')
    expect(holder.keyFor('sub-1:7')).toBe(first)
    expect(holder.keyFor('sub-1:7')).toBe(first)
  })

  it('بصمة مختلفة (المستخدم غيّر المدخلات) بتاخد مفتاح جديد', () => {
    const holder = createKeyHolder(counter())
    const first = holder.keyFor('sub-1:7')
    const second = holder.keyFor('sub-1:14')
    expect(second).not.toBe(first)
    // الرجوع للبصمة القديمة بعد التغيير عملية جديدة، فمفتاح جديد مش القديم (الخادم كان رفضه 422 بمحتوى مختلف).
    expect(holder.keyFor('sub-1:7')).not.toBe(first)
  })

  it('بعد clear() (نجاح العملية) العملية الجاية بنفس البصمة بتاخد مفتاح جديد', () => {
    const holder = createKeyHolder(counter())
    const first = holder.keyFor('sub-1:7')
    holder.clear()
    expect(holder.keyFor('sub-1:7')).not.toBe(first)
  })

  it('كل holder مستقل عن التاني', () => {
    const a = createKeyHolder(counter())
    const b = createKeyHolder(counter())
    expect(a.keyFor('x')).toBe(b.keyFor('x'))
    a.clear()
    expect(b.keyFor('x')).toBe('key-0000000000000001')
  })
})
