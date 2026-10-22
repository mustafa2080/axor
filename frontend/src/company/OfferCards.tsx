import type { ReactNode } from 'react'
import type { PublicPlan, PublicProduct } from '../api/company.ts'
import { Badge } from '../components/ui.tsx'
import type { Offers } from '../lib/company-offers.ts'
import { PlanTerms } from './PlanTerms.tsx'

function activityName(product: PublicProduct, plan: PublicPlan): string {
  if (plan.activity === null) return 'كل الأنشطة'
  return product.activities.find((activity) => activity.code === plan.activity)?.name ?? plan.activity
}

/**
 * عروض التجربة (نظام ← باقات) وقسم «قريباً». بيتستخدم في لوحة الشركة وفي صفحة الباقات العامة؛
 * الزرار بتاع كل باقة بييجي من برّه (`renderAction`) لأنه بيختلف: بدء تجربة، أو كمّل للتسجيل.
 */
export function OfferCards({
  data,
  renderAction,
}: {
  data: Offers
  renderAction: (product: PublicProduct, plan: PublicPlan) => ReactNode
}) {
  return (
    <>
      {data.offers.map(({ product, plans }) => (
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
                {renderAction(product, plan)}
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
      ))}

      {data.comingSoon.length > 0 ? (
        <article className="card card-archived">
          <h2>قريباً</h2>
          <ul>
            {data.comingSoon.map((product) => (
              <li key={product.code}>
                {product.name} <Badge tone="muted">قريباً</Badge>
              </li>
            ))}
          </ul>
          <p className="muted">الأنظمة دي مش متاح الاشتراك فيها لسه.</p>
        </article>
      ) : null}
    </>
  )
}
