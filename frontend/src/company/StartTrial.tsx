import { useEffect, useState } from 'react'
import { listMySubscriptions, loadPublicCatalog, startTrial } from '../api/company.ts'
import type { PublicPlan, PublicProduct } from '../api/company.ts'
import { ErrorNote, Loading, Modal } from '../components/ui.tsx'
import { buildOffers } from '../lib/company-offers.ts'
import type { Offers } from '../lib/company-offers.ts'
import { errorMessage } from '../lib/labels.ts'
import { useSubmit } from '../lib/useSubmit.ts'
import { useTrialFailed } from '../lib/useRoute.ts'
import { OfferCards } from './OfferCards.tsx'

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: Offers; subscribedCount: number }

async function fetchOffers(): Promise<State> {
  try {
    const [catalog, mine] = await Promise.all([loadPublicCatalog(), listMySubscriptions()])
    const subscribed = new Set(mine.map((item) => item.productCode))
    return {
      status: 'ready',
      data: buildOffers(catalog.products, catalog.plansByProduct, subscribed),
      subscribedCount: subscribed.size,
    }
  } catch (error) {
    return { status: 'error', message: errorMessage(error) }
  }
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
  const trialFailed = useTrialFailed()

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

      {trialFailed ? (
        <p className="notice" role="alert">
          تم إنشاء حسابك بنجاح، لكن معرفناش نبدأ التجربة اللي اخترتها. تقدر تبدأها من هنا بنفسك.
        </p>
      ) : null}

      {state.status === 'loading' ? <Loading /> : null}
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

      {state.status === 'ready' ? (
        <OfferCards
          data={state.data}
          renderAction={(product, plan) => (
            <button
              type="button"
              className="btn btn-primary"
              disabled={!canManage}
              onClick={() => setChoice({ product, plan })}
            >
              ابدأ تجربة {plan.trialDays} يوم
            </button>
          )}
        />
      ) : null}

      {choice === null ? null : (
        <ConfirmModal product={choice.product} plan={choice.plan} onClose={() => setChoice(null)} />
      )}
    </section>
  )
}
