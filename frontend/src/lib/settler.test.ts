import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSettler } from './settler.ts'

// أول نتيجة (نجاح أو فشل أو انتهاء المهلة) هي اللي بتتسجّل، والباقي بيتتجاهل. كان في عيب حقيقي: مهلة
// التحميل في صفحات الرئيسية والمعلومات ما كانتش بتتمسح بعد النجاح، فبعد ثواني بتقلب المحتوى اللي اتحمّل
// لخطأ (أو للافتراضي في الرئيسية). الاختبارات دي بتمنع رجوعه.

describe('createSettler', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('does not let the timeout overwrite a result that already arrived', () => {
    const seen: string[] = []
    const waiting = createSettler<string>((value) => seen.push(value), 4000, () => 'timeout')
    waiting.settle('loaded')
    vi.advanceTimersByTime(60_000)
    expect(seen).toEqual(['loaded'])
  })

  it('settles with the timeout value when nothing arrives in time', () => {
    const seen: string[] = []
    createSettler<string>((value) => seen.push(value), 4000, () => 'timeout')
    vi.advanceTimersByTime(3999)
    expect(seen).toEqual([])
    vi.advanceTimersByTime(1)
    expect(seen).toEqual(['timeout'])
  })

  it('ignores a late result after the timeout already settled', () => {
    const seen: string[] = []
    const waiting = createSettler<string>((value) => seen.push(value), 4000, () => 'timeout')
    vi.advanceTimersByTime(4000)
    waiting.settle('too late')
    expect(seen).toEqual(['timeout'])
  })

  it('keeps only the first of several results', () => {
    const seen: string[] = []
    const waiting = createSettler<string>((value) => seen.push(value), 4000, () => 'timeout')
    waiting.settle('first')
    waiting.settle('second')
    expect(seen).toEqual(['first'])
  })

  it('settles nothing after dispose, whether a result or the timeout comes', () => {
    const seen: string[] = []
    const waiting = createSettler<string>((value) => seen.push(value), 4000, () => 'timeout')
    waiting.dispose()
    waiting.settle('after dispose')
    vi.advanceTimersByTime(60_000)
    expect(seen).toEqual([])
  })
})
