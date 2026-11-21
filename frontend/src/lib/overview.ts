// منطق نقي للوحة «نظرة عامة»: تحويل أعداد الحالات لشرايح بنسب، ونص التجارب اللي قربت تخلص بالعربي.
// نقية عشان تتختبر من غير متصفح ولا React.

export type SegmentTone = 'good' | 'info' | 'warn' | 'danger' | 'muted'

export interface Segment {
  key: string
  label: string
  count: number
  /** النسبة من الإجمالي بين 0 و1 (لرسم الشريط). صفر لو الإجمالي صفر. */
  share: number
  /** النسبة لنص العرض، رقم صحيح من 0 لـ 100. */
  percent: number
  tone: SegmentTone
}

/** النسبة من الإجمالي بين 0 و1، وصفر لو الإجمالي صفر أو القيمة مش رقم موجب. */
export function shareOf(count: number, total: number): number {
  if (!Number.isFinite(count) || !Number.isFinite(total) || total <= 0 || count <= 0) return 0
  return Math.min(count / total, 1)
}

/**
 * شرايح الحالات بالترتيب المطلوب. الإجمالي بيتحسب من مجموع الشرايح نفسها، فالنسب دايماً متسقة مع
 * الأعداد المعروضة حتى لو `total` جاي من الخادم مختلف لأي سبب.
 */
export function buildSegments<S extends string>(
  counts: Readonly<Record<S, number>>,
  order: readonly S[],
  labels: Readonly<Record<S, string>>,
  tones: Readonly<Record<S, SegmentTone>>,
): Segment[] {
  const sum = order.reduce((acc, key) => acc + Math.max(0, counts[key]), 0)
  const percents = wholePercents(order.map((key) => Math.max(0, counts[key])))
  return order.map((key, index) => {
    const count = Math.max(0, counts[key])
    return { key, label: labels[key], count, share: shareOf(count, sum), percent: percents[index] ?? 0, tone: tones[key] }
  })
}

/**
 * نسب صحيحة مجموعها 100 بالظبط (طريقة أكبر باقي)، عشان القايمة ما تعرضش 101% من التقريب
 * (12.5 + 12.5 كانوا بيبقوا 13 + 13). الشريحة الفاضية ليها 0 دايماً، والتعادل لأول شريحة في الترتيب.
 * مجموع صفر يرجّع أصفار.
 */
function wholePercents(counts: readonly number[]): number[] {
  const total = counts.reduce((acc, count) => acc + count, 0)
  if (total <= 0) return counts.map(() => 0)
  const floors = counts.map((count) => Math.floor((count * 100) / total))
  let left = 100 - floors.reduce((acc, floor) => acc + floor, 0)
  const byRemainder = counts
    .map((count, index) => ({ index, count, remainder: (count * 100) % total }))
    .filter((item) => item.count > 0)
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index)
  for (const item of byRemainder) {
    if (left <= 0) break
    floors[item.index] = (floors[item.index] ?? 0) + 1
    left -= 1
  }
  return floors
}

/** «يوم» بالجمع الصح: 1 يوم، 2 يومين، 3 لـ 10 أيام، 11 فأكتر يوم. */
export function daysText(days: number): string {
  if (days === 1) return 'يوم'
  if (days === 2) return 'يومين'
  return days >= 3 && days <= 10 ? `${days} أيام` : `${days} يوم`
}

/** جملة التجارب اللي هتخلص خلال المدة، بعدد التجارب بالجمع الصح. */
export function endingSoonText(count: number, days: number): string {
  const window = daysText(days)
  if (count <= 0) return `مفيش تجارب هتخلص خلال ${window}.`
  if (count === 1) return `تجربة واحدة هتخلص خلال ${window}.`
  if (count === 2) return `تجربتين هيخلصوا خلال ${window}.`
  return count <= 10
    ? `${count} تجارب هتخلص خلال ${window}.`
    : `${count} تجربة هتخلص خلال ${window}.`
}

/** وصف الشريط لقارئ الشاشة: «نشطة 2، معلّقة 1». */
export function describeSegments(segments: readonly Segment[]): string {
  return segments.map((segment) => `${segment.label} ${segment.count}`).join('، ')
}
