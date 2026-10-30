import { useEffect, useState } from 'react'
import { cancelMySubscription, listMySubscriptions } from '../api/company.ts'
import type { CompanySubscription } from '../api/company.ts'
import type { SubscriptionStatus } from '../api/subscriptions.ts'
import { Badge, ErrorNote, Loading, Modal } from '../components/ui.tsx'
import type { Tone } from '../components/ui.tsx'
import { daysLeft } from '../lib/company-offers.ts'
import { errorMessage, subscriptionStatusLabel } from '../lib/labels.ts'
import { availableActions } from '../lib/subscription-actions.ts'
import { useSubmit } from '../lib/useSubmit.ts'
import { PlanTerms } from './PlanTerms.tsx'

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; items: CompanySubscription[]; loadedAt: Date }

const statusTone: Record<SubscriptionStatus, Tone> = {
  trialing: 'info',
  active: 'good',
  past_due: 'warn',
  canceled: 'muted',
  expired: 'muted',
}

const dateFormat = new Intl.DateTimeFormat('ar-EG-u-nu-latn', { dateStyle: 'medium' })
const formatDate = (iso: string | null) => (iso === null ? '—' : dateFormat.format(new Date(iso)))

async function fetchSubscriptions(): Promise<State> {
  try {
    return { status: 'ready', items: await listMySubscriptions(), loadedAt: new Date() }
  } catch (error) {
    return { status: 'error', message: errorMessage(error) }
  }
}

/** نهاية التجربة للتجارب، ونهاية الفترة للباقي. */
function endOf(item: CompanySubscription): string | null {
  return item.status === 'trialing' ? (item.trialEndsAt ?? item.currentPeriodEnd) : item.currentPeriodEnd
}

function statusNote(item: CompanySubscription): string | null {
  switch (item.status) {
    case 'canceled':
      return 'الاشتراك ده اتلغى. للتفعيل من جديد كلّم الدعم.'
    case 'expired':
      return 'الاشتراك انتهى. للتفعيل أو التجديد كلّم الدعم.'
    case 'past_due':
      return 'فيه تأخير في السداد. كلّم الدعم عشان الوصول ما يتقفلش.'
    default:
      return null
  }
}

function CancelModal({
  item,
  onDone,
  onClose,
}: {
  item: CompanySubscription
  onDone: () => void
  onClose: () => void
}) {
  const { busy, error, run } = useSubmit()
  async function confirm() {
    const ok = await run(async () => {
      await cancelMySubscription(item.productCode)
    })
    if (ok) {
      onDone()
      onClose()
    }
  }
  return (
    <Modal title="إلغاء الاشتراك" onClose={onClose}>
      <div className="form">
        <p>
          هتلغي اشتراكك في <strong>{item.productName}</strong>.
        </p>
        <p className="notice">
          الوصول للنظام بيتقفل فوراً، والتجربة المجانية للنظام ده مش هتتكرر. لو عايز تفعّله تاني هتحتاج الدعم.
        </p>
        <ErrorNote message={error} />
        <div className="form-actions">
          <button type="button" className="btn btn-danger" disabled={busy} onClick={() => void confirm()}>
            {busy ? 'جاري الإلغاء…' : 'تأكيد الإلغاء'}
          </button>
          <button type="button" className="btn" disabled={busy} onClick={onClose}>
            رجوع
          </button>
        </div>
      </div>
    </Modal>
  )
}

/** اشتراكات الشركة الحالية. الإلغاء لمالك الشركة بس (الخادم بيفرض نفس القاعدة). */
export function MySubscriptions({ canManage }: { canManage: boolean }) {
  const [state, setState] = useState<State>({ status: 'loading' })
  const [version, setVersion] = useState(0)
  const [canceling, setCanceling] = useState<CompanySubscription | null>(null)

  useEffect(() => {
    let active = true
    void fetchSubscriptions().then((next) => {
      if (active) setState(next)
    })
    return () => {
      active = false
    }
  }, [version])

  return (
    <section>
      <div className="page-head">
        <h1>اشتراكاتي</h1>
        <a className="btn" href="#/start">
          ابدأ تجربة
        </a>
      </div>

      {state.status === 'loading' ? <Loading /> : null}
      {state.status === 'error' ? (
        <>
          <ErrorNote message={state.message} />
          <button type="button" className="btn" onClick={() => setVersion((v) => v + 1)}>
            إعادة المحاولة
          </button>
        </>
      ) : null}

      {state.status === 'ready' && state.items.length === 0 ? (
        <p className="empty">
          مفيش اشتراكات لسه. <a href="#/start">ابدأ تجربة مجانية</a> لأول نظام.
        </p>
      ) : null}

      {state.status === 'ready'
        ? state.items.map((item) => {
            const left = daysLeft(endOf(item), state.loadedAt)
            const note = statusNote(item)
            return (
              <article className="card" key={item.productCode}>
                <div className="card-head">
                  <div>
                    <h2>{item.productName}</h2>
                    <p className="code">{item.planCode}</p>
                  </div>
                  <div className="card-actions">
                    <Badge tone={statusTone[item.status]}>{subscriptionStatusLabel[item.status]}</Badge>
                    <Badge tone={item.entitled ? 'good' : 'muted'}>{item.entitled ? 'الوصول مفتوح' : 'الوصول مقفول'}</Badge>
                  </div>
                </div>
                <p className="muted">
                  {item.status === 'canceled'
                    ? `اتلغى في: ${formatDate(item.canceledAt)}`
                    : `${item.status === 'trialing' ? 'التجربة بتنتهي' : 'الفترة بتنتهي'}: ${formatDate(endOf(item))}`}
                  {item.entitled && left > 0 ? ` (فاضل ${left} يوم)` : ''}
                </p>
                {item.version === null ? null : <PlanTerms terms={item.version} />}
                {note === null ? null : <p className="notice">{note}</p>}
                {canManage && availableActions(item.status).includes('cancel') ? (
                  <p>
                    <button type="button" className="btn btn-small" onClick={() => setCanceling(item)}>
                      إلغاء الاشتراك
                    </button>
                  </p>
                ) : null}
              </article>
            )
          })
        : null}

      {canceling === null ? null : (
        <CancelModal
          item={canceling}
          onDone={() => setVersion((v) => v + 1)}
          onClose={() => setCanceling(null)}
        />
      )}
    </section>
  )
}
