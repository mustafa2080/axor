import { useState } from 'react'
import type { FormEvent } from 'react'
import { PLAN_STATUSES } from '../api/catalog.ts'
import type { PlanStatus, PlanVersion, Product, VersionSpec } from '../api/catalog.ts'
import { ErrorNote, Field, Modal } from '../components/ui.tsx'
import { planStatusLabel } from '../lib/labels.ts'
import { useSubmit } from '../lib/useSubmit.ts'
import { VersionFields } from './VersionFields.tsx'
import { draftFromSpec, draftToSpec, emptyDraft, sameSpec } from './version-draft.ts'

const CODE_PATTERN = /^[a-z0-9][a-z0-9_-]{0,49}$/

/** باقة جديدة: بتتعمل بنسختها الأولى (النسخة 1 الحالية) في خطوة واحدة. */
export function NewPlanModal({
  product,
  onSubmit,
  onClose,
}: {
  product: Product
  onSubmit: (input: {
    code: string
    activityCode: string | null
    status: PlanStatus
    version: VersionSpec
  }) => Promise<void>
  onClose: () => void
}) {
  const [code, setCode] = useState('')
  const [activityCode, setActivityCode] = useState('')
  const [status, setStatus] = useState<PlanStatus>('active')
  const [draft, setDraft] = useState(emptyDraft)
  const { busy, error, setError, run } = useSubmit()

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!CODE_PATTERN.test(code)) {
      setError('كود الباقة: حروف إنجليزي صغيرة وأرقام و - و _ بس، وبيبدأ بحرف أو رقم.')
      return
    }
    const result = draftToSpec(draft)
    if (!result.ok) {
      setError(result.error)
      return
    }
    const ok = await run(() =>
      onSubmit({ code, activityCode: activityCode === '' ? null : activityCode, status, version: result.spec }),
    )
    if (ok) onClose()
  }

  return (
    <Modal title={`باقة جديدة في ${product.name}`} onClose={onClose} wide>
      <form onSubmit={(event) => void submit(event)} className="form">
        <div className="grid-2">
          <Field label="كود الباقة" hint="ثابت: مش هتقدر تغيّره بعد الإنشاء.">
            <input className="ltr" value={code} onChange={(event) => setCode(event.target.value)} required />
          </Field>
          <Field label="النشاط" hint="اتركها «كل الأنشطة» لو الباقة لكل أنشطة النظام.">
            <select value={activityCode} onChange={(event) => setActivityCode(event.target.value)}>
              <option value="">كل الأنشطة</option>
              {product.activities.map((activity) => (
                <option key={activity.id} value={activity.code}>
                  {activity.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="الحالة">
            <select value={status} onChange={(event) => setStatus(event.target.value as PlanStatus)}>
              {PLAN_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {planStatusLabel[value]}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <VersionFields draft={draft} onChange={setDraft} />
        <ErrorNote message={error} />
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'جاري الحفظ…' : 'إنشاء الباقة'}
          </button>
          <button type="button" className="btn" onClick={onClose} disabled={busy}>
            إلغاء
          </button>
        </div>
      </form>
    </Modal>
  )
}

/** تعديل السعر أو الحدود أو الميزات: بيعمل نسخة جديدة بتبقى الحالية، والقديمة ما بتتغيرش. */
export function NewVersionModal({
  planCode,
  current,
  onSubmit,
  onClose,
}: {
  planCode: string
  current: PlanVersion | undefined
  onSubmit: (spec: VersionSpec) => Promise<void>
  onClose: () => void
}) {
  const [draft, setDraft] = useState(() => (current === undefined ? emptyDraft() : draftFromSpec(current)))
  const { busy, error, setError, run } = useSubmit()

  async function submit(event: FormEvent) {
    event.preventDefault()
    const result = draftToSpec(draft)
    if (!result.ok) {
      setError(result.error)
      return
    }
    if (current !== undefined && sameSpec(current, result.spec)) {
      setError('مفيش تغيير عن النسخة الحالية.')
      return
    }
    const ok = await run(() => onSubmit(result.spec))
    if (ok) onClose()
  }

  return (
    <Modal title={`نسخة جديدة من الباقة ${planCode}`} onClose={onClose} wide>
      <form onSubmit={(event) => void submit(event)} className="form">
        <p className="notice">
          التعديل بيعمل نسخة جديدة وبتبقى الحالية. النسخ القديمة ما بتتغيرش وتقدر ترجع لها لو غلطت،
          والاشتراكات اللي مش مثبّتة على نسخة معيّنة هتتبع النسخة الجديدة فوراً.
        </p>
        <VersionFields draft={draft} onChange={setDraft} />
        <ErrorNote message={error} />
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'جاري الحفظ…' : 'حفظ كنسخة جديدة'}
          </button>
          <button type="button" className="btn" onClick={onClose} disabled={busy}>
            إلغاء
          </button>
        </div>
      </form>
    </Modal>
  )
}
