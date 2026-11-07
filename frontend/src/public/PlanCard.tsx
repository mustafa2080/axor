import type { PublicPlan, PublicProduct } from '../api/company.ts'
import { PlanTerms } from '../company/PlanTerms.tsx'
import { planActivityName, trialLink } from '../lib/public-catalog.ts'

/** زرار بدء التجربة لباقة، أو سبب مكتوب لو مفيش طريق (باقة من غير تجربة). الرابط بييجي من `trialLink` بس. */
export function PlanAction({ product, plan }: { product: PublicProduct; plan: PublicPlan }) {
  const href = trialLink(product, plan)
  if (href !== null) {
    return (
      <a className="btn btn-primary" href={href}>
        ابدأ تجربة {plan.trialDays} يوم
      </a>
    )
  }
  return <span className="muted">من غير تجربة مجانية</span>
}

/** بطاقة باقة واحدة (بدون أي بطاقة جواها). الأرقام كلها من الكتالوج العام. */
export function PlanCard({ product, plan }: { product: PublicProduct; plan: PublicPlan }) {
  return (
    <li className="card plan-card">
      <div className="card-head">
        <div>
          <strong className="ltr">{plan.code}</strong>
          <p className="muted">{planActivityName(product, plan)}</p>
        </div>
        <PlanAction product={product} plan={plan} />
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
    </li>
  )
}
