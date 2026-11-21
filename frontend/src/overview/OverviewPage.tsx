import './overview.css'
import { ErrorNote, Loading } from '../components/ui.tsx'
import { subscriptionStatusLabel, tenantStatusLabel } from '../lib/labels.ts'
import { buildSegments, endingSoonText } from '../lib/overview.ts'
import type { SegmentTone } from '../lib/overview.ts'
import { StatusPanel } from './StatusPanel.tsx'
import { useOverview } from './useOverview.ts'

const timeFormat = new Intl.DateTimeFormat('ar-EG-u-nu-latn', { timeStyle: 'short' })

const TENANT_ORDER = ['active', 'suspended', 'closed'] as const
const TENANT_TONES: Record<(typeof TENANT_ORDER)[number], SegmentTone> = {
  active: 'good',
  suspended: 'warn',
  closed: 'muted',
}

const SUBSCRIPTION_ORDER = ['trialing', 'active', 'past_due', 'canceled', 'expired'] as const
const SUBSCRIPTION_TONES: Record<(typeof SUBSCRIPTION_ORDER)[number], SegmentTone> = {
  trialing: 'info',
  active: 'good',
  past_due: 'warn',
  canceled: 'muted',
  expired: 'danger',
}

/**
 * نظرة عامة على المنصة (TASKS.md §5.4): أعداد الشركات والاشتراكات حسب الحالة، والتجارب اللي قربت
 * تخلص. أرقام بس من `GET /admin/overview`، والخادم هو اللي بيحدد مين يقدر يشوفها.
 */
export function OverviewPage() {
  const { state, refreshing, reload } = useOverview()

  return (
    <section className="overview">
      <div className="page-head">
        <h1>نظرة عامة</h1>
        <div className="card-actions">
          {state.status === 'ready' ? (
            <span className="muted">آخر تحديث {timeFormat.format(state.loadedAt)}</span>
          ) : null}
          <button type="button" className="btn" onClick={reload} disabled={refreshing || state.status === 'loading'}>
            {refreshing ? 'جاري التحديث…' : 'تحديث'}
          </button>
        </div>
      </div>

      {state.status === 'loading' ? <Loading /> : null}

      {state.status === 'error' ? (
        <>
          <ErrorNote message={state.message} />
          <button type="button" className="btn" onClick={reload} disabled={refreshing}>
            إعادة المحاولة
          </button>
        </>
      ) : null}

      {state.status === 'ready' ? (
        <>
          <ErrorNote message={state.refreshError} />
          {state.data.tenants.total === 0 && state.data.subscriptions.total === 0 ? (
            <p className="empty">لسه مفيش شركات ولا اشتراكات. أول ما حد يسجّل هتظهر هنا.</p>
          ) : null}
          <div className="overview-grid">
            <StatusPanel
              title="الشركات"
              total={state.data.tenants.total}
              totalLabel="شركة"
              segments={buildSegments(state.data.tenants, TENANT_ORDER, tenantStatusLabel, TENANT_TONES)}
              href="#/tenants"
              linkLabel="عرض الشركات"
            />
            <StatusPanel
              title="الاشتراكات"
              total={state.data.subscriptions.total}
              totalLabel="اشتراك"
              segments={buildSegments(
                state.data.subscriptions,
                SUBSCRIPTION_ORDER,
                subscriptionStatusLabel,
                SUBSCRIPTION_TONES,
              )}
              href="#/subscriptions"
              linkLabel="عرض الاشتراكات"
            />
          </div>
          <article className="card overview-trials">
            <div>
              <h2>تجارب قربت تخلص</h2>
              <p className="muted">{endingSoonText(state.data.trialsEndingSoon, state.data.trialsEndingSoonDays)}</p>
            </div>
            <strong className="overview-trials-count">{state.data.trialsEndingSoon}</strong>
          </article>
        </>
      ) : null}
    </section>
  )
}
