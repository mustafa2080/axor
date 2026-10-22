import type { SubscriptionStatus } from '../api/subscriptions.ts'

export type SubscriptionAction = 'activate' | 'extend' | 'cancel'

/**
 * العمليات المتاحة لكل حالة. نفس جدول الانتقالات في الباك (subscription-state.ts)؛ الخادم هو
 * اللي بيفرضه فعلاً، والواجهة بتخفي الأزرار اللي هتترفض بس.
 */
export function availableActions(status: SubscriptionStatus): SubscriptionAction[] {
  switch (status) {
    case 'trialing':
      return ['extend', 'activate', 'cancel']
    case 'active':
    case 'past_due':
      return ['activate', 'cancel']
    case 'canceled':
    case 'expired':
      return ['activate']
  }
}

const DAY_MS = 86_400_000
/** نفس حد الباك (MAX_ACTIVATION_YEARS = 5). */
const MAX_DAYS_AHEAD = 365 * 5

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

/** تاريخ بعد `days` يوم بصيغة YYYY-MM-DD (بتوقيت الجهاز) لقيمة <input type="date"> الافتراضية. */
export function dateInputValue(now: Date, days: number): string {
  const date = new Date(now.getTime() + days * DAY_MS)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/**
 * بيحوّل تاريخ من <input type="date"> لنهاية اليوم ده (23:59:59 بتوقيت الجهاز) بصيغة ISO.
 * بيرجّع null لو التاريخ غلط، أو مش في المستقبل، أو أبعد من 5 سنين.
 */
export function periodEndIso(value: string, now: Date): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (match === null) return null
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])]
  const end = new Date(year, month - 1, day, 23, 59, 59)
  // new Date بيصحّح 31 فبراير لـ 3 مارس؛ لازم الرجوع يطلع نفس اليوم.
  if (end.getFullYear() !== year || end.getMonth() !== month - 1 || end.getDate() !== day) return null
  if (end.getTime() <= now.getTime()) return null
  if (end.getTime() > now.getTime() + MAX_DAYS_AHEAD * DAY_MS) return null
  return end.toISOString()
}
