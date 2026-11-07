
// جدول مقارنة الباقات (نقي). الصفوف = اتحاد كل الحدود وكل الميزات في الباقات اللي بتتقارن، فالباقة
// اللي مفيهاش حد أو ميزة معينة بتبان «—» (مش صفر ولا ✗): غياب القيمة مش هو نفس «معطّلة».

import type { PublicPlan } from '../api/company.ts'

export interface CompareRows {
  limitKeys: string[]
  featureKeys: string[]
}

/** اتحاد مفاتيح الحدود والميزات بترتيب ثابت (ألفبائي) عشان الجدول ما يتبدّلش من تحميل لتحميل. */
export function buildCompareRows(plans: readonly PublicPlan[]): CompareRows {
  const limits = new Set<string>()
  const features = new Set<string>()
  for (const plan of plans) {
    for (const key of Object.keys(plan.limits)) limits.add(key)
    for (const key of Object.keys(plan.features)) features.add(key)
  }
  const sorted = (keys: Set<string>) => [...keys].sort((a, b) => a.localeCompare(b, 'en'))
  return { limitKeys: sorted(limits), featureKeys: sorted(features) }
}

export type LimitCell = { kind: 'missing' } | { kind: 'unlimited' } | { kind: 'value'; value: number }

/** خلية حد: غايب، أو `null` (غير محدود)، أو رقم. */
export function limitCell(plan: PublicPlan, key: string): LimitCell {
  if (!Object.hasOwn(plan.limits, key)) return { kind: 'missing' }
  const value = plan.limits[key]
  return value === null || value === undefined ? { kind: 'unlimited' } : { kind: 'value', value }
}

export type FeatureCell = 'missing' | 'on' | 'off'

export function featureCell(plan: PublicPlan, key: string): FeatureCell {
  if (!Object.hasOwn(plan.features, key)) return 'missing'
  return plan.features[key] === true ? 'on' : 'off'
}

/** أقصى عدد أعمدة بنعرضه من غير scroll أفقي؛ الباقي بيتمرر جوه الحاوية. */
export const COMPARE_COMFORTABLE_COLUMNS = 4
