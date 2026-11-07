import { useEffect, useState } from 'react'
import { ErrorNote, Loading } from '../components/ui.tsx'
import { OfferCards } from '../company/OfferCards.tsx'
import { registerHash } from '../lib/plan-choice.ts'
import { fetchOffers } from './offers-state.ts'
import type { OffersState } from './offers-state.ts'

/**
 * الباقات المتاحة للزائر (من غير دخول): يختار نظام وباقة، وبعدها يكمّل للتسجيل. الصفحة بتعرض الكتالوج
 * العام بس؛ الاختيار بيروح في الرابط كأكواد، والخادم هو اللي بيحدد المدة والحالة عند بدء التجربة.
 */
export function PlansPage() {
  const [state, setState] = useState<OffersState>({ status: 'loading' })
  const [version, setVersion] = useState(0)

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
      <main className="content">
        <div className="page-head">
          <h1>اختار الباقة وابدأ تجربة مجانية</h1>
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

        {state.status === 'ready' && state.data.offers.length === 0 ? (
          <p className="empty">مفيش باقات بتجربة مجانية متاحة دلوقتي.</p>
        ) : null}

        {state.status === 'ready' ? (
          <OfferCards
            data={state.data}
            renderAction={(product, plan) => (
              <a
                className="btn btn-primary"
                href={registerHash({ productCode: product.code, planCode: plan.code })}
              >
                ابدأ تجربة {plan.trialDays} يوم
              </a>
            )}
          />
        ) : null}
      </main>
  )
}
