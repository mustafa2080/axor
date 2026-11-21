import { describe, expect, it } from 'vitest'
import { buildSegments, daysText, describeSegments, endingSoonText, shareOf } from './overview.ts'

const order = ['active', 'suspended', 'closed'] as const
const labels = { active: 'نشطة', suspended: 'معلّقة', closed: 'مقفولة' }
const tones = { active: 'good', suspended: 'warn', closed: 'muted' } as const

describe('shareOf', () => {
  it('is the fraction of the total', () => {
    expect(shareOf(1, 4)).toBe(0.25)
    expect(shareOf(4, 4)).toBe(1)
  })

  it('is zero for an empty total, an empty count, or bad numbers', () => {
    expect(shareOf(0, 10)).toBe(0)
    expect(shareOf(5, 0)).toBe(0)
    expect(shareOf(-3, 10)).toBe(0)
    expect(shareOf(Number.NaN, 10)).toBe(0)
    expect(shareOf(3, Number.POSITIVE_INFINITY)).toBe(0)
  })

  it('never goes over one', () => {
    expect(shareOf(9, 3)).toBe(1)
  })
})

describe('buildSegments', () => {
  it('keeps the requested order, labels and tones', () => {
    const segments = buildSegments({ active: 6, suspended: 3, closed: 1 }, order, labels, tones)
    expect(segments.map((s) => s.key)).toEqual(['active', 'suspended', 'closed'])
    expect(segments.map((s) => s.label)).toEqual(['نشطة', 'معلّقة', 'مقفولة'])
    expect(segments.map((s) => s.tone)).toEqual(['good', 'warn', 'muted'])
  })

  it('computes shares and whole-number percents from the segments themselves', () => {
    const segments = buildSegments({ active: 6, suspended: 3, closed: 1 }, order, labels, tones)
    expect(segments.map((s) => s.share)).toEqual([0.6, 0.3, 0.1])
    expect(segments.map((s) => s.percent)).toEqual([60, 30, 10])
  })

  it('has every share at zero when nothing exists, instead of dividing by zero', () => {
    const segments = buildSegments({ active: 0, suspended: 0, closed: 0 }, order, labels, tones)
    expect(segments.every((s) => s.share === 0 && s.percent === 0 && s.count === 0)).toBe(true)
  })

  it('treats a negative count as zero so the bar can never be drawn backwards', () => {
    const segments = buildSegments({ active: 4, suspended: -2, closed: 0 }, order, labels, tones)
    expect(segments[1]?.count).toBe(0)
    expect(segments[0]?.share).toBe(1)
  })

  it('rounds the percent only for the text, the bar keeps the exact share', () => {
    const segments = buildSegments({ active: 1, suspended: 2, closed: 0 }, order, labels, tones)
    expect(segments[0]?.percent).toBe(33)
    expect(segments[0]?.share).toBeCloseTo(1 / 3, 10)
  })
})

describe('buildSegments percents add up', () => {
  const subOrder = ['trialing', 'active', 'past_due', 'canceled', 'expired'] as const
  const subLabels = { trialing: 'تجربة', active: 'نشط', past_due: 'متأخر', canceled: 'ملغي', expired: 'منتهي' }
  const subTones = { trialing: 'info', active: 'good', past_due: 'warn', canceled: 'muted', expired: 'danger' } as const

  it('shows 100 in total for the real 1/1/0/2/4 case instead of 101', () => {
    const segments = buildSegments({ trialing: 1, active: 1, past_due: 0, canceled: 2, expired: 4 }, subOrder, subLabels, subTones)
    expect(segments.map((s) => s.percent)).toEqual([13, 12, 0, 25, 50])
    expect(segments.reduce((sum, s) => sum + s.percent, 0)).toBe(100)
  })

  it('always totals 100 when something exists, and never gives a percent to an empty segment', () => {
    for (let a = 0; a <= 7; a++) {
      for (let b = 0; b <= 7; b++) {
        for (let c = 0; c <= 7; c++) {
          if (a + b + c === 0) continue
          const segments = buildSegments({ active: a, suspended: b, closed: c }, order, labels, tones)
          expect(segments.reduce((sum, s) => sum + s.percent, 0), `${a}/${b}/${c}`).toBe(100)
          expect(segments.every((s) => s.count > 0 || s.percent === 0), `${a}/${b}/${c}`).toBe(true)
        }
      }
    }
  })
})

describe('daysText', () => {
  it.each([
    [1, 'يوم'],
    [2, 'يومين'],
    [3, '3 أيام'],
    [7, '7 أيام'],
    [10, '10 أيام'],
    [11, '11 يوم'],
    [30, '30 يوم'],
  ])('%i days reads %s', (days, expected) => {
    expect(daysText(days)).toBe(expected)
  })
})

describe('endingSoonText', () => {
  it.each([
    [0, 'مفيش تجارب هتخلص خلال 7 أيام.'],
    [1, 'تجربة واحدة هتخلص خلال 7 أيام.'],
    [2, 'تجربتين هيخلصوا خلال 7 أيام.'],
    [3, '3 تجارب هتخلص خلال 7 أيام.'],
    [10, '10 تجارب هتخلص خلال 7 أيام.'],
    [11, '11 تجربة هتخلص خلال 7 أيام.'],
    [250, '250 تجربة هتخلص خلال 7 أيام.'],
  ])('%i trials reads: %s', (count, expected) => {
    expect(endingSoonText(count, 7)).toBe(expected)
  })

  it('uses the window the server reports, not a fixed seven', () => {
    expect(endingSoonText(1, 14)).toBe('تجربة واحدة هتخلص خلال 14 يوم.')
    expect(endingSoonText(0, 2)).toBe('مفيش تجارب هتخلص خلال يومين.')
  })

  it('treats a negative count like none', () => {
    expect(endingSoonText(-1, 7)).toBe('مفيش تجارب هتخلص خلال 7 أيام.')
  })
})

describe('describeSegments', () => {
  it('lists each label with its count, for screen readers', () => {
    const segments = buildSegments({ active: 2, suspended: 1, closed: 0 }, order, labels, tones)
    expect(describeSegments(segments)).toBe('نشطة 2، معلّقة 1، مقفولة 0')
  })
})
