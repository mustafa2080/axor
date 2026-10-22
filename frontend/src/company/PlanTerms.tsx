import type { CompanyPlanTerms } from '../api/company.ts'
import { periodLabel } from '../lib/labels.ts'
import { formatPrice } from '../lib/money.ts'

/** السعر والحدود والميزات لنسخة باقة. للعرض بس، الأرقام كلها جاية من الخادم. */
export function PlanTerms({ terms, showTrial = false }: { terms: CompanyPlanTerms; showTrial?: boolean }) {
  const limits = Object.entries(terms.limits)
  const features = Object.entries(terms.features)
  return (
    <div className="terms">
      <p className="price">
        {formatPrice(terms.priceMinor, terms.currency)}{' '}
        <span className="muted">/ {periodLabel[terms.billingPeriod]}</span>
        {showTrial && terms.trialDays > 0 ? <span className="muted"> · تجربة {terms.trialDays} يوم</span> : null}
      </p>
      {limits.length > 0 ? (
        <ul className="chips" aria-label="الحدود">
          {limits.map(([key, value]) => (
            <li key={key} className="chip">
              <code>{key}</code>: {value === null ? 'غير محدود' : value}
            </li>
          ))}
        </ul>
      ) : null}
      {features.length > 0 ? (
        <ul className="chips" aria-label="الميزات">
          {features.map(([key, enabled]) => (
            <li key={key} className={enabled ? 'chip chip-on' : 'chip chip-off'}>
              {enabled ? '✓' : '✗'} <code>{key}</code>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
