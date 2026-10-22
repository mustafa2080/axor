import { useEffect, useState } from 'react'
import { listMySubscriptions, listPublicPlans, listPublicProducts, startTrial } from '../api/company.ts'
import type { PublicPlan, PublicProduct } from '../api/company.ts'
import { Badge, ErrorNote, Modal } from '../components/ui.tsx'
import { buildOffers } from '../lib/company-offers.ts'
import type { Offers } from '../lib/company-offers.ts'
import { errorMessage } from '../lib/labels.ts'
import { useSubmit } from '../lib/useSubmit.ts'
import { PlanTerms } from './PlanTerms.tsx'

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: Offers; subscribedCount: number }

async function fetchOffers(): Promise<State> {
  try {
    const [products, mine] = await Promise.all([listPublicProducts(), listMySubscriptions()])
    const available = products.filter((product) => product.status === 'available')
    const lists = await Promise.all(available.map((product) => listPublicPlans(product.code)))
    const plansByProduct: Record<string, PublicPlan[]> = {}
    available.forEach((product, index) => {
      plansByProduct[product.code] = lists[index] ?? []
    })
    const subscribed = new Set(mine.map((item) => item.productCode))
    return { status: 'ready', data: buildOffers(products, plansByProduct, subscribed), subscribedCount: subscribed.size }
  } catch (error) {
    return { status: 'error', message: errorMessage(error) }
  }
}

function activityName(product: PublicProduct, plan: PublicPlan): string {
  if (plan.activity === null) return 'كل الأنشطة'
  return product.activities.find((activity) => activity.code === plan.activity)?.name ?? plan.activity
}

function ConfirmModal({
  product,
  plan,
  onClose,
}: {
  product: PublicProduct
  plan: PublicPlan
  onClose: () => void
}) {
  const { busy, error, run } = useSubmit()
  async function confirm() {
    const ok = await run(async () => {
      await startTrial(product.code, plan.code)
    })
    if (ok) window.location.hash = '#/'
  }
  return (
    <Modal title="بدء التجربة المجانية" onClose={onClose}>
      <div className="form">
        <p>
          هتبدأ تجربة مجانية <strong>{plan.trialDays} يوم</strong> لنظام <strong>{product.name}</strong> (باقة{' '}
          <span className="ltr">{plan.code}</span>).
        </p>
        <p className="notice">التجربة مرة واحدة بس لكل نظام، حتى لو اتلغت. المدة بيحددها الخادم.</p>
        <ErrorNote message={error} />
        <div className="form-actions">
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void confirm()}>
            {busy ? 'جاري البدء…' : 'ابدأ التجربة'}
          </button>
          <button type="button" className="btn" disabled={busy} onClick={onClose}>
            رجوع
          </button>
        </div>
      </div>
    </Modal>
  )
}

/** الأنظمة والباقات اللي الشركة تقدر تبدأ تجربتها. بدء التجربة لمالك الشركة بس (الخادم بيفرضها). */
export function StartTrial({ canManage }: { canManage: boolean }) {
  const [state, setState] = useState<State>({ status: 'loading' })
  const [version, setVersion] = useState(0)
  const [choice, setChoice] = useState<{ product: PublicProduct; plan: PublicPlan } | null>(null)

  useEffect(() => {
    let active = true
    void fetchOffers().then((next) => {
      if (active) setState(next)
    })
    return () => {
      active = false
    }
  }, [version])

  return (
    <section>
      <div className="page-head">
        <h1>ابدأ تجربة مجانية</h1>
        <a className="btn" href="#/">
          اشتراكاتي
        </a>
      </div>

      {canManage ? null : <p className="notice">بدء التجربة لمالك الشركة بس.</p>}

      {state.status === 'loading' ? <p className="muted">جاري التحميل…</p> : null}
      {state.status === 'error' ? (
        <>
          <ErrorNote message={state.message} />
          <button type="button" className="btn" onClick={() => setVersion((v) => v + 1)}>
            إعادة المحاولة
          </button>
        </>
      ) : null}

      {state.status === 'ready' && state.data.offers.length === 0 ? (
        <p className="empty">
          {state.subscribedCount > 0
            ? 'بدأت تجربة (أو اشتراك) في كل الأنظمة المتاحة حالياً.'
            : 'مفيش أنظمة بتجربة مجانية متاحة دلوقتي.'}
        </p>
      ) : null}

      {state.status === 'ready'
        ? state.data.offers.map(({ product, plans }) => (
            <article className="card" key={product.code}>
              <div className="card-head">
                <h2>{product.name}</h2>
                <Badge tone="good">متاح</Badge>
              </div>
              {plans.map((plan) => (
                <div className="card" key={plan.code}>
                  <div className="card-head">
                    <div>
                      <strong className="ltr">{plan.code}</strong>
                      <p className="muted">{activityName(product, plan)}</p>
                    </div>
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={!canManage}
                      onClick={() => setChoice({ product, plan })}
                    >
                      ابدأ تجربة {plan.trialDays} يوم
                    </button>
                  </div>
                  <PlanTerms
                    terms={{
                      priceMinor: plan.price.amountMinor,
                      currency: plan.price.currency,
                      billingPeriod: plan.price.billingPeriod,
                      trialDays: plan.trialDays,
                      limits: plan.limits,
                      features: plan.features,
                    }}
                    showTrial
                  />
                </div>
              ))}
            </article>
          ))
        : null}

      {state.status === 'ready' && state.data.comingSoon.length > 0 ? (
        <article className="card card-archived">
          <h2>قريباً</h2>
          <ul>
            {state.data.comingSoon.map((product) => (
              <li key={product.code}>
                {product.name} <Badge tone="muted">قريباً</Badge>
              </li>
            ))}
          </ul>
          <p className="muted">الأنظمة دي مش متاح الاشتراك فيها لسه.</p>
        </article>
      ) : null}

      {choice === null ? null : (
        <ConfirmModal product={choice.product} plan={choice.plan} onClose={() => setChoice(null)} />
      )}
    </section>
  )
}
