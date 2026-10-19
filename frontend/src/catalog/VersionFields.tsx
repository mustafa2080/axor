import { BILLING_PERIODS } from '../api/catalog.ts'
import type { BillingPeriod } from '../api/catalog.ts'
import { Field } from '../components/ui.tsx'
import { periodLabel } from '../lib/labels.ts'
import { newRowId } from './version-draft.ts'
import type { FeatureRow, LimitRow, VersionDraft } from './version-draft.ts'

/** حقول نسخة الباقة (السعر والعملة والفترة والتجربة والحدود والميزات). Controlled بالكامل. */
export function VersionFields({
  draft,
  onChange,
}: {
  draft: VersionDraft
  onChange: (next: VersionDraft) => void
}) {
  const set = <K extends keyof VersionDraft>(key: K, value: VersionDraft[K]) =>
    onChange({ ...draft, [key]: value })

  const updateLimit = (id: number, patch: Partial<LimitRow>) =>
    set(
      'limits',
      draft.limits.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    )
  const updateFeature = (id: number, patch: Partial<FeatureRow>) =>
    set(
      'features',
      draft.features.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    )

  return (
    <>
      <div className="grid-2">
        <Field label="السعر" hint="بالوحدة الكبيرة، مثلاً 199.50">
          <input
            className="ltr"
            inputMode="decimal"
            value={draft.price}
            onChange={(event) => set('price', event.target.value)}
            required
          />
        </Field>
        <Field label="العملة" hint="3 حروف، مثلاً EGP">
          <input
            className="ltr"
            value={draft.currency}
            maxLength={3}
            onChange={(event) => set('currency', event.target.value.toUpperCase())}
            required
          />
        </Field>
        <Field label="فترة الفوترة">
          <select
            value={draft.billingPeriod}
            onChange={(event) => set('billingPeriod', event.target.value as BillingPeriod)}
          >
            {BILLING_PERIODS.map((period) => (
              <option key={period} value={period}>
                {periodLabel[period]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="أيام التجربة المجانية" hint="0 = من غير تجربة">
          <input
            className="ltr"
            inputMode="numeric"
            value={draft.trialDays}
            onChange={(event) => set('trialDays', event.target.value)}
            required
          />
        </Field>
      </div>

      <fieldset className="rows">
        <legend>الحدود (مثلاً users أو shipments_per_month)</legend>
        {draft.limits.map((row) => (
          <div className="row" key={row.id}>
            <input
              className="ltr"
              aria-label="اسم الحد"
              placeholder="users"
              value={row.key}
              onChange={(event) => updateLimit(row.id, { key: event.target.value })}
            />
            <input
              className="ltr narrow"
              aria-label="قيمة الحد"
              inputMode="numeric"
              value={row.unlimited ? '' : row.value}
              disabled={row.unlimited}
              placeholder={row.unlimited ? '∞' : '0'}
              onChange={(event) => updateLimit(row.id, { value: event.target.value })}
            />
            <label className="check">
              <input
                type="checkbox"
                checked={row.unlimited}
                onChange={(event) => updateLimit(row.id, { unlimited: event.target.checked })}
              />
              غير محدود
            </label>
            <button
              type="button"
              className="icon-btn"
              aria-label="حذف الحد"
              onClick={() =>
                set(
                  'limits',
                  draft.limits.filter((item) => item.id !== row.id),
                )
              }
            >
              ×
            </button>
          </div>
        ))}
        <button
          type="button"
          className="btn btn-small"
          onClick={() =>
            set('limits', [...draft.limits, { id: newRowId(), key: '', value: '', unlimited: false }])
          }
        >
          + إضافة حد
        </button>
      </fieldset>

      <fieldset className="rows">
        <legend>الميزات (مثلاً api_access)</legend>
        {draft.features.map((row) => (
          <div className="row" key={row.id}>
            <input
              className="ltr"
              aria-label="اسم الميزة"
              placeholder="api_access"
              value={row.key}
              onChange={(event) => updateFeature(row.id, { key: event.target.value })}
            />
            <label className="check">
              <input
                type="checkbox"
                checked={row.enabled}
                onChange={(event) => updateFeature(row.id, { enabled: event.target.checked })}
              />
              مفعّلة
            </label>
            <button
              type="button"
              className="icon-btn"
              aria-label="حذف الميزة"
              onClick={() =>
                set(
                  'features',
                  draft.features.filter((item) => item.id !== row.id),
                )
              }
            >
              ×
            </button>
          </div>
        ))}
        <button
          type="button"
          className="btn btn-small"
          onClick={() =>
            set('features', [...draft.features, { id: newRowId(), key: '', enabled: true }])
          }
        >
          + إضافة ميزة
        </button>
      </fieldset>
    </>
  )
}
