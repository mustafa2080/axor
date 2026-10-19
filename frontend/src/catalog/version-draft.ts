import type { BillingPeriod, VersionSpec } from '../api/catalog.ts'
import { currencyExponent, minorToMajorString, parseMajorToMinor } from '../lib/money.ts'

// مسودة نسخة الباقة زي ما بتتكتب في الفورم (نصوص)، وتحويلها لـ VersionSpec اللي الـ API بيقبله.
// نفس قواعد الباك (catalog-admin.routes.ts)، لكن الخادم هو المرجع النهائي.

export interface LimitRow {
  id: number
  key: string
  value: string
  unlimited: boolean
}

export interface FeatureRow {
  id: number
  key: string
  enabled: boolean
}

export interface VersionDraft {
  price: string
  currency: string
  billingPeriod: BillingPeriod
  trialDays: string
  limits: LimitRow[]
  features: FeatureRow[]
}

export type DraftResult = { ok: true; spec: VersionSpec } | { ok: false; error: string }

const KEY_PATTERN = /^[a-z][a-z0-9_]{0,49}$/
const MAX_KEYS = 50
const MAX_LIMIT = 2_147_483_647

let rowCounter = 0
export const newRowId = (): number => ++rowCounter

export function emptyDraft(): VersionDraft {
  return {
    price: '',
    currency: 'EGP',
    billingPeriod: 'monthly',
    trialDays: '0',
    limits: [],
    features: [],
  }
}

export function draftFromSpec(spec: VersionSpec): VersionDraft {
  return {
    price: minorToMajorString(spec.priceMinor, currencyExponent(spec.currency)),
    currency: spec.currency,
    billingPeriod: spec.billingPeriod,
    trialDays: String(spec.trialDays),
    limits: Object.entries(spec.limits).map(([key, value]) => ({
      id: newRowId(),
      key,
      value: value === null ? '' : String(value),
      unlimited: value === null,
    })),
    features: Object.entries(spec.features).map(([key, enabled]) => ({
      id: newRowId(),
      key,
      enabled,
    })),
  }
}

const fail = (error: string): DraftResult => ({ ok: false, error })

export function draftToSpec(draft: VersionDraft): DraftResult {
  const currency = draft.currency.trim().toUpperCase()
  if (!/^[A-Z]{3}$/.test(currency)) return fail('العملة لازم تكون 3 حروف إنجليزي زي EGP.')

  const priceMinor = parseMajorToMinor(draft.price, currencyExponent(currency))
  if (priceMinor === null) {
    return fail('السعر غير صالح: أرقام موجبة بس، وعدد الخانات العشرية مناسب للعملة.')
  }

  const trialText = draft.trialDays.trim()
  if (!/^\d{1,3}$/.test(trialText) || Number(trialText) > 365) {
    return fail('أيام التجربة لازم تكون رقم من 0 إلى 365.')
  }

  if (draft.limits.length > MAX_KEYS) return fail(`الحدود لا تزيد عن ${MAX_KEYS}.`)
  if (draft.features.length > MAX_KEYS) return fail(`الميزات لا تزيد عن ${MAX_KEYS}.`)

  const limits: Record<string, number | null> = {}
  for (const row of draft.limits) {
    const key = row.key.trim()
    if (!KEY_PATTERN.test(key)) {
      return fail(`اسم الحد "${key}" غير صالح: حروف إنجليزي صغيرة وأرقام و _ وبيبدأ بحرف.`)
    }
    if (Object.hasOwn(limits, key)) return fail(`الحد "${key}" متكرر.`)
    if (row.unlimited) {
      limits[key] = null
      continue
    }
    const text = row.value.trim()
    if (!/^\d{1,10}$/.test(text) || Number(text) > MAX_LIMIT) {
      return fail(`قيمة الحد "${key}" لازم تكون عدد صحيح 0 أو أكتر، أو علّمها غير محدود.`)
    }
    limits[key] = Number(text)
  }

  const features: Record<string, boolean> = {}
  for (const row of draft.features) {
    const key = row.key.trim()
    if (!KEY_PATTERN.test(key)) {
      return fail(`اسم الميزة "${key}" غير صالح: حروف إنجليزي صغيرة وأرقام و _ وبيبدأ بحرف.`)
    }
    if (Object.hasOwn(features, key)) return fail(`الميزة "${key}" متكررة.`)
    features[key] = row.enabled
  }

  return {
    ok: true,
    spec: {
      priceMinor,
      currency,
      billingPeriod: draft.billingPeriod,
      trialDays: Number(trialText),
      limits,
      features,
    },
  }
}

function sameRecord(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const keys = Object.keys(a)
  return keys.length === Object.keys(b).length && keys.every((key) => a[key] === b[key])
}

/** لتجنب نسخة جديدة مطابقة تماماً للحالية. الترتيب مش مهم. */
export function sameSpec(a: VersionSpec, b: VersionSpec): boolean {
  return (
    a.priceMinor === b.priceMinor &&
    a.currency === b.currency &&
    a.billingPeriod === b.billingPeriod &&
    a.trialDays === b.trialDays &&
    sameRecord(a.limits, b.limits) &&
    sameRecord(a.features, b.features)
  )
}
