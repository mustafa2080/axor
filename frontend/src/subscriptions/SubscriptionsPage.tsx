import { useEffect, useState } from 'react'
import {
  SUBSCRIPTIONS_PAGE_SIZE,
  SUBSCRIPTION_STATUSES,
  listSubscriptions,
} from '../api/subscriptions.ts'
import type { AdminSubscription, SubscriptionStatus } from '../api/subscriptions.ts'
import { Badge, ErrorNote } from '../components/ui.tsx'
import type { Tone } from '../components/ui.tsx'
import { errorMessage, subscriptionStatusLabel } from '../lib/labels.ts'
import { availableActions } from '../lib/subscription-actions.ts'
import type { SubscriptionAction } from '../lib/subscription-actions.ts'
import { SubscriptionActionModal } from './SubscriptionActionModal.tsx'

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; items: AdminSubscription[]; hasMore: boolean }

const statusTone: Record<SubscriptionStatus, Tone> = {
  trialing: 'info',
  active: 'good',
  past_due: 'warn',
  canceled: 'muted',
  expired: 'muted',
}

const actionLabel: Record<SubscriptionAction, string> = {
  activate: 'تفعيل',
  extend: 'تمديد',
  cancel: 'إلغاء',
}

const dateFormat = new Intl.DateTimeFormat('ar-EG-u-nu-latn', { dateStyle: 'medium' })
const formatDate = (iso: string | null) => (iso === null ? '—' : dateFormat.format(new Date(iso)))

async function fetchFirstPage(filter: SubscriptionStatus | null): Promise<State> {
  try {
    const items = await listSubscriptions(filter, 0)
    return { status: 'ready', items, hasMore: items.length === SUBSCRIPTIONS_PAGE_SIZE }
  } catch (error) {
    return { status: 'error', message: errorMessage(error) }
  }
}

/** اشتراكات كل الشركات: عرض بفلتر الحالة، وتفعيل/تجديد وتمديد تجربة وإلغاء. */
export function SubscriptionsPage() {
  const [filter, setFilter] = useState<SubscriptionStatus | null>(null)
  const [state, setState] = useState<State>({ status: 'loading' })
  const [version, setVersion] = useState(0)
  const [loadingMore, setLoadingMore] = useState(false)
  const [moreError, setMoreError] = useState<string | null>(null)
  const [dialog, setDialog] = useState<{ action: SubscriptionAction; subscription: AdminSubscription } | null>(
    null,
  )

  useEffect(() => {
    let active = true
    void fetchFirstPage(filter).then((next) => {
      if (active) setState(next)
    })
    return () => {
      active = false
    }
  }, [filter, version])

  async function loadMore() {
    if (state.status !== 'ready') return
    setLoadingMore(true)
    setMoreError(null)
    try {
      const next = await listSubscriptions(filter, state.items.length)
      setState({
        status: 'ready',
        items: [...state.items, ...next],
        hasMore: next.length === SUBSCRIPTIONS_PAGE_SIZE,
      })
    } catch (error) {
      setMoreError(errorMessage(error))
    } finally {
      setLoadingMore(false)
    }
  }

  return (
    <section>
      <div className="page-head">
        <h1>الاشتراكات والتجارب</h1>
        <label className="check">
          <span>الحالة:</span>
          <select
            value={filter ?? ''}
            onChange={(event) => {
              const value = event.target.value
              setState({ status: 'loading' })
              setFilter(value === '' ? null : (value as SubscriptionStatus))
            }}
          >
            <option value="">الكل</option>
            {SUBSCRIPTION_STATUSES.map((status) => (
              <option key={status} value={status}>
                {subscriptionStatusLabel[status]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {state.status === 'loading' ? <p className="muted">جاري التحميل…</p> : null}
      {state.status === 'error' ? (
        <>
          <ErrorNote message={state.message} />
          <button type="button" className="btn" onClick={() => setVersion((v) => v + 1)}>
            إعادة المحاولة
          </button>
        </>
      ) : null}

      {state.status === 'ready' && state.items.length === 0 ? (
        <p className="empty">مفيش اشتراكات{filter === null ? ' لسه.' : ' بالحالة دي.'}</p>
      ) : null}

      {state.status === 'ready' && state.items.length > 0 ? (
        <article className="card">
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>الشركة</th>
                  <th>النظام / الباقة</th>
                  <th>الحالة</th>
                  <th>الوصول</th>
                  <th>تنتهي في</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {state.items.map((item) => (
                  <tr key={item.id}>
                    <td>{item.tenantName}</td>
                    <td>
                      <code className="code">
                        {item.productCode} / {item.planCode}
                      </code>
                    </td>
                    <td>
                      <Badge tone={statusTone[item.status]}>{subscriptionStatusLabel[item.status]}</Badge>
                    </td>
                    <td>
                      <Badge tone={item.entitled ? 'good' : 'muted'}>{item.entitled ? 'مفتوح' : 'مقفول'}</Badge>
                    </td>
                    <td>{formatDate(item.currentPeriodEnd)}</td>
                    <td className="cell-actions">
                      {availableActions(item.status).map((action) => (
                        <button
                          key={action}
                          type="button"
                          className="btn btn-small"
                          onClick={() => setDialog({ action, subscription: item })}
                        >
                          {actionLabel[action]}
                        </button>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ErrorNote message={moreError} />
          {state.hasMore ? (
            <p>
              <button type="button" className="btn" onClick={() => void loadMore()} disabled={loadingMore}>
                {loadingMore ? 'جاري التحميل…' : 'تحميل المزيد'}
              </button>
            </p>
          ) : null}
        </article>
      ) : null}

      {dialog === null ? null : (
        <SubscriptionActionModal
          action={dialog.action}
          subscription={dialog.subscription}
          onDone={() => setVersion((v) => v + 1)}
          onClose={() => setDialog(null)}
        />
      )}
    </section>
  )
}
