import { useState } from 'react'
import type { FormEvent } from 'react'
import { ErrorNote, Field, Modal } from '../components/ui.tsx'
import { useSubmit } from '../lib/useSubmit.ts'

const CODE_PATTERN = /^[a-z0-9][a-z0-9_-]{0,49}$/

export interface EntityValues<S extends string> {
  code: string
  name: string
  status: S
}

/** فورم موحد للنظام والنشاط: كود واسم وحالة. في التعديل الكود ثابت (مش بيتغير بعد الإنشاء). */
export function EntityFormModal<S extends string>({
  title,
  existing,
  statuses,
  statusLabels,
  defaultStatus,
  onSubmit,
  onClose,
}: {
  title: string
  existing?: EntityValues<S>
  statuses: readonly S[]
  statusLabels: Record<S, string>
  defaultStatus: S
  onSubmit: (values: EntityValues<S>) => Promise<void>
  onClose: () => void
}) {
  const [code, setCode] = useState(existing?.code ?? '')
  const [name, setName] = useState(existing?.name ?? '')
  const [status, setStatus] = useState<S>(existing?.status ?? defaultStatus)
  const { busy, error, setError, run } = useSubmit()

  async function submit(event: FormEvent) {
    event.preventDefault()
    const cleanName = name.trim()
    if (existing === undefined && !CODE_PATTERN.test(code)) {
      setError('الكود: حروف إنجليزي صغيرة وأرقام و - و _ بس، وبيبدأ بحرف أو رقم (لحد 50).')
      return
    }
    if (cleanName.length < 2) {
      setError('الاسم لازم يكون حرفين على الأقل.')
      return
    }
    const ok = await run(() => onSubmit({ code, name: cleanName, status }))
    if (ok) onClose()
  }

  return (
    <Modal title={title} onClose={onClose}>
      <form onSubmit={(event) => void submit(event)} className="form">
        <Field
          label="الكود"
          hint={existing === undefined ? 'ثابت: مش هتقدر تغيّره بعد الإنشاء.' : 'ثابت ومش بيتغيّر.'}
        >
          <input
            className="ltr"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            disabled={existing !== undefined}
            required
          />
        </Field>
        <Field label="الاسم">
          <input value={name} maxLength={200} onChange={(event) => setName(event.target.value)} required />
        </Field>
        <Field label="الحالة">
          <select value={status} onChange={(event) => setStatus(event.target.value as S)}>
            {statuses.map((value) => (
              <option key={value} value={value}>
                {statusLabels[value]}
              </option>
            ))}
          </select>
        </Field>
        <ErrorNote message={error} />
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'جاري الحفظ…' : 'حفظ'}
          </button>
          <button type="button" className="btn" onClick={onClose} disabled={busy}>
            إلغاء
          </button>
        </div>
      </form>
    </Modal>
  )
}
