import type { ReactNode } from 'react'
import { Field } from '../components/ui.tsx'

// مكوّنات مشتركة بين محرر الصفحة الرئيسية (ADR-0027) ومحررات صفحات المعلومات (ADR-0028).

export function Text({
  label,
  value,
  max,
  onChange,
  long = false,
  type = 'text',
  ltr = false,
}: {
  label: string
  value: string
  max: number
  onChange: (v: string) => void
  long?: boolean
  type?: 'text' | 'email' | 'date'
  ltr?: boolean
}) {
  return (
    <Field label={label} hint={`${value.length} / ${max}`}>
      {long ? (
        <textarea rows={3} value={value} maxLength={max} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input type={type} dir={ltr ? 'ltr' : undefined} value={value} maxLength={max} onChange={(e) => onChange(e.target.value)} />
      )}
    </Field>
  )
}

/** نص متعدد الفقرات: كل سطر فقرة. الحدود (عدد الفقرات وطول الفقرة) بتتفحص قبل الحفظ مش بـ maxLength. */
export function Lines({ label, value, hint, onChange }: { label: string; value: string; hint: string; onChange: (v: string) => void }) {
  return (
    <Field label={label} hint={hint}>
      <textarea rows={6} value={value} onChange={(e) => onChange(e.target.value)} />
    </Field>
  )
}

export function Row({ title, onRemove, children }: { title: string; onRemove: () => void; children: ReactNode }) {
  return (
    <div className="site-row">
      <div className="site-row-head">
        <strong>{title}</strong>
        <button type="button" className="btn btn-small" onClick={onRemove}>
          حذف
        </button>
      </div>
      {children}
    </div>
  )
}

export function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <article className="card site-section">
      <h2>{title}</h2>
      {hint === undefined ? null : <p className="muted">{hint}</p>}
      {children}
    </article>
  )
}
