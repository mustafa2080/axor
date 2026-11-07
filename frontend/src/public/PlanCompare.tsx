import { Fragment } from 'react'
import type { PublicPlan, PublicProduct } from '../api/company.ts'
import { COMPARE_COMFORTABLE_COLUMNS, buildCompareRows, featureCell, limitCell } from '../lib/compare-plans.ts'
import type { FeatureCell, LimitCell } from '../lib/compare-plans.ts'
import { periodLabel } from '../lib/labels.ts'
import { formatPrice } from '../lib/money.ts'
import { planActivityName } from '../lib/public-catalog.ts'
import { PlanAction } from './PlanCard.tsx'

function LimitValue({ cell }: { cell: LimitCell }) {
  if (cell.kind === 'missing') {
    return (
      <>
        <span aria-hidden="true">—</span>
        <span className="sr-only">غير مذكور</span>
      </>
    )
  }
  return <>{cell.kind === 'unlimited' ? 'غير محدود' : cell.value}</>
}

function FeatureValue({ cell }: { cell: FeatureCell }) {
  const mark = cell === 'on' ? '✓' : cell === 'off' ? '✗' : '—'
  const text = cell === 'on' ? 'متاحة' : cell === 'off' ? 'غير متاحة' : 'غير مذكورة'
  return (
    <>
      <span aria-hidden="true">{mark}</span>
      <span className="sr-only">{text}</span>
    </>
  )
}

const planKey = (plan: PublicPlan) => `${plan.code}:${plan.activity ?? ''}`

/**
 * جدول مقارنة باقات نظام واحد: الأعمدة باقات والصفوف السعر والتجربة وكل حد وكل ميزة (اتحاد المفاتيح).
 * الجدول مسطّح من غير أي ميل أو حركة 3D (قاعدة TASKS.md §21). على الموبايل بيتمرر جوه حاويته وعموده الأول
 * ثابت، فالصفحة نفسها ما بتتحركش أفقياً.
 */
export function PlanCompare({ product, plans }: { product: PublicProduct; plans: readonly PublicPlan[] }) {
  const { limitKeys, featureKeys } = buildCompareRows(plans)
  const columns = plans.length + 1
  return (
    <>
      {plans.length > COMPARE_COMFORTABLE_COLUMNS ? (
        <p className="muted">فيه باقات أكتر من اللي بتظهر على الشاشة، مرّر الجدول أفقياً.</p>
      ) : null}
      <div className="table-wrap compare-wrap" role="region" aria-label={`مقارنة باقات ${product.name}`} tabIndex={0}>
        <table className="table compare">
          <thead>
            <tr>
              <th scope="col">
                <span className="sr-only">البند</span>
              </th>
              {plans.map((plan) => (
                <th scope="col" key={planKey(plan)}>
                  <span className="compare-plan ltr">{plan.code}</span>
                  <span className="compare-activity">{planActivityName(product, plan)}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">السعر</th>
              {plans.map((plan) => (
                <td key={planKey(plan)}>
                  {formatPrice(plan.price.amountMinor, plan.price.currency)}{' '}
                  <span className="muted">/ {periodLabel[plan.price.billingPeriod]}</span>
                </td>
              ))}
            </tr>
            <tr>
              <th scope="row">مدة التجربة</th>
              {plans.map((plan) => (
                <td key={planKey(plan)}>{plan.trialDays > 0 ? `${plan.trialDays} يوم` : 'من غير تجربة'}</td>
              ))}
            </tr>
            {limitKeys.length > 0 ? (
              <>
                <tr className="compare-group">
                  <th scope="colgroup" colSpan={columns}>
                    الحدود
                  </th>
                </tr>
                {limitKeys.map((key) => (
                  <tr key={key}>
                    <th scope="row">
                      <code className="ltr">{key}</code>
                    </th>
                    {plans.map((plan) => (
                      <td key={planKey(plan)}>
                        <LimitValue cell={limitCell(plan, key)} />
                      </td>
                    ))}
                  </tr>
                ))}
              </>
            ) : null}
            {featureKeys.length > 0 ? (
              <Fragment>
                <tr className="compare-group">
                  <th scope="colgroup" colSpan={columns}>
                    الميزات
                  </th>
                </tr>
                {featureKeys.map((key) => (
                  <tr key={key}>
                    <th scope="row">
                      <code className="ltr">{key}</code>
                    </th>
                    {plans.map((plan) => (
                      <td key={planKey(plan)}>
                        <FeatureValue cell={featureCell(plan, key)} />
                      </td>
                    ))}
                  </tr>
                ))}
              </Fragment>
            ) : null}
            <tr className="compare-action">
              <th scope="row">
                <span className="sr-only">ابدأ</span>
              </th>
              {plans.map((plan) => (
                <td key={planKey(plan)}>
                  <PlanAction product={product} plan={plan} />
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </>
  )
}
