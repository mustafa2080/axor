import { useState } from 'react'
import type { FormEvent } from 'react'
import { activateSubscription, cancelSubscription, extendTrial } from '../api/subscriptions.ts'
import type { AdminSubscription } from '../api/subscriptions.ts'
import { ErrorNote, Field, Modal } from '../components/ui.tsx'
import { errorMessage } from '../lib/labels.ts'
import { dateInputValue, periodEndIso } from '../lib/subscription-actions.ts'
import type { SubscriptionAction } from '../lib/subscription-actions.ts'

const TITLES: Record<SubscriptionAction, string> = {
  activate: 'تفعيل / تجديد الاشتراك',
  extend: 'تمديد التجربة',
  cancel: 'إلغاء الاشتراك',
}

/** نافذة واحدة للعمليات التلاتة. الخادم بيراجع الحالة والحدود تاني، والواجهة بتتحقق عشان الرسالة تبقى واضحة. */
export function SubscriptionActionModal({
  action,
  subscription,
  onDone,
  onClose,
}: {
  action: SubscriptionAction
  subscription: AdminSubscription
  onDone: () => void
  onClose: () => void
}) {
  const [date, setDate] = useState(() => dateInputValue(new Date(), 30))
  const [days, setDays] = useState('7')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError(null)

    let run: () => Promise<unknown>
    if (action === 'activate') {
      const end = periodEndIso(date, new Date())
      if (end === null) {
        setError('اختار تاريخ نهاية في المستقبل وخلال 5 سنين.')
        return
      }
      run = () => activateSubscription(subscription.id, end)
    } else if (action === 'extend') {
      const count = Number(days)
      if (!Number.isInteger(count) || count < 1 || count > 90) {
        setError('عدد الأيام لازم يكون رقم صحيح من 1 لـ 90.')
        return
      }
      run = () => extendTrial(subscription.id, count)
    } else {
      run = () => cancelSubscription(subscription.id)
    }

    setBusy(true)
    try {
      await run()
      onDone()
      onClose()
    } catch (caught) {
      setError(errorMessage(caught, 'subscription'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title={TITLES[action]} onClose={onClose}>
      <form onSubmit={(event) => void submit(event)} className="form">
        <p className="muted">
          {subscription.tenantName} — <span className="ltr">{subscription.productCode}</span> /{' '}
          <span className="ltr">{subscription.planCode}</span>
        </p>

        {action === 'activate' ? (
          <Field label="نهاية فترة الاشتراك" hint="الوصول بيفضل لحد آخر اليوم ده.">
            <input type="date" value={date} onChange={(event) => setDate(event.target.value)} required />
          </Field>
        ) : null}

        {action === 'extend' ? (
          <Field label="عدد الأيام" hint="بتتحسب من نهاية التجربة الحالية (من 1 لـ 90).">
            <input
              className="narrow"
              type="number"
              min={1}
              max={90}
              value={days}
              onChange={(event) => setDays(event.target.value)}
              required
            />
          </Field>
        ) : null}

        {action === 'cancel' ? (
          <p className="notice">الإلغاء بيقفل وصول الشركة للنظام فوراً. تقدر ترجّع التفعيل بعد كده من «تفعيل».</p>
        ) : null}

        <ErrorNote message={error} />
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'جاري التنفيذ…' : action === 'cancel' ? 'تأكيد الإلغاء' : 'تأكيد'}
          </button>
          <button type="button" className="btn" onClick={onClose} disabled={busy}>
            رجوع
          </button>
        </div>
      </form>
    </Modal>
  )
}
