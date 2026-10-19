import { useState } from 'react'
import { addPlanVersion, createPlan, updatePlan } from '../api/catalog.ts'
import type { Plan, PlanVersion, Product } from '../api/catalog.ts'
import { Badge, ErrorNote } from '../components/ui.tsx'
import { periodLabel, planStatusLabel } from '../lib/labels.ts'
import { formatPrice } from '../lib/money.ts'
import { useSubmit } from '../lib/useSubmit.ts'
import { NewPlanModal, NewVersionModal } from './PlanModals.tsx'

const formatDate = (iso: string) => new Date(iso).toLocaleString('ar-EG')

function Terms({ version }: { version: PlanVersion }) {
  const limits = Object.entries(version.limits)
  const features = Object.entries(version.features)
  return (
    <div className="terms">
      <p className="price">
        {formatPrice(version.priceMinor, version.currency)} <span className="muted">/ {periodLabel[version.billingPeriod]}</span>
        {version.trialDays > 0 ? <span className="muted"> · تجربة {version.trialDays} يوم</span> : null}
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

function PlanCard({
  plan,
  product,
  busy,
  onNewVersion,
  onToggleStatus,
  onRollback,
}: {
  plan: Plan
  product: Product
  busy: boolean
  onNewVersion: () => void
  onToggleStatus: () => void
  onRollback: (version: PlanVersion) => void
}) {
  const current = plan.versions.find((version) => version.id === plan.currentVersionId)
  const activity = product.activities.find((item) => item.id === plan.activityId)
  const history = [...plan.versions].sort((a, b) => b.version - a.version)

  return (
    <article className={plan.status === 'archived' ? 'card card-archived' : 'card'}>
      <header className="card-head">
        <div>
          <h2>
            <code className="code">{plan.code}</code>
          </h2>
          <p className="muted">{activity === undefined ? 'كل الأنشطة' : `نشاط: ${activity.name}`}</p>
        </div>
        <div className="card-actions">
          <Badge tone={plan.status === 'active' ? 'good' : 'muted'}>{planStatusLabel[plan.status]}</Badge>
          <button type="button" className="btn btn-small btn-primary" onClick={onNewVersion} disabled={busy}>
            تعديل السعر / الحدود
          </button>
          <button type="button" className="btn btn-small" onClick={onToggleStatus} disabled={busy}>
            {plan.status === 'active' ? 'أرشفة' : 'إعادة تفعيل'}
          </button>
        </div>
      </header>

      {current === undefined ? <p className="muted">مفيش نسخة حالية.</p> : <Terms version={current} />}

      <details className="history">
        <summary>سجل النسخ ({plan.versions.length})</summary>
        <table className="table">
          <thead>
            <tr>
              <th>النسخة</th>
              <th>السعر</th>
              <th>اتعملت</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {history.map((version) => (
              <tr key={version.id}>
                <td>v{version.version}</td>
                <td>
                  {formatPrice(version.priceMinor, version.currency)} / {periodLabel[version.billingPeriod]}
                </td>
                <td>{formatDate(version.createdAt)}</td>
                <td className="cell-actions">
                  {version.id === plan.currentVersionId ? (
                    <Badge tone="good">الحالية</Badge>
                  ) : (
                    <button type="button" className="btn btn-small" onClick={() => onRollback(version)} disabled={busy}>
                      رجّع لها
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </article>
  )
}

/** باقات نظام واحد: إضافة، وتعديل السعر والحدود كنسخة جديدة، وأرشفة، والرجوع لنسخة قديمة. */
export function PlansPage({
  products,
  reload,
}: {
  products: Product[]
  reload: () => Promise<void>
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<Plan | null>(null)
  const { busy, error, run } = useSubmit()

  const product = products.find((item) => item.id === selectedId) ?? products[0]
  if (product === undefined) {
    return (
      <section>
        <h1>الباقات</h1>
        <p className="empty">أضف نظام الأول من صفحة «الأنظمة والأنشطة»، وبعدها تقدر تعمل له باقات.</p>
      </section>
    )
  }

  const change = (action: () => Promise<unknown>) =>
    void run(async () => {
      await action()
      await reload()
    })

  const toggleStatus = (plan: Plan) => {
    const archiving = plan.status === 'active'
    const question = archiving
      ? `أرشفة الباقة ${plan.code}؟ مش هتظهر في الكتالوج العام للعملاء الجدد.`
      : `إعادة تفعيل الباقة ${plan.code}؟`
    if (!window.confirm(question)) return
    change(() => updatePlan(plan.id, { status: archiving ? 'archived' : 'active' }))
  }

  const rollback = (plan: Plan, version: PlanVersion) => {
    const question = `الرجوع للنسخة v${version.version} من الباقة ${plan.code}؟ هتبقى هي الحالية فوراً.`
    if (!window.confirm(question)) return
    change(() => updatePlan(plan.id, { currentVersionId: version.id }))
  }

  return (
    <section>
      <div className="page-head">
        <h1>الباقات</h1>
        <div className="card-actions">
          {products.length > 1 ? (
            <select aria-label="النظام" value={product.id} onChange={(event) => setSelectedId(event.target.value)}>
              {products.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          ) : (
            <strong>{product.name}</strong>
          )}
          <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
            + باقة جديدة
          </button>
        </div>
      </div>

      <ErrorNote message={error} />
      {product.plans.length === 0 ? <p className="empty">مفيش باقات للنظام ده لسه.</p> : null}

      {product.plans.map((plan) => (
        <PlanCard
          key={plan.id}
          plan={plan}
          product={product}
          busy={busy}
          onNewVersion={() => setEditing(plan)}
          onToggleStatus={() => toggleStatus(plan)}
          onRollback={(version) => rollback(plan, version)}
        />
      ))}

      {creating ? (
        <NewPlanModal
          product={product}
          onClose={() => setCreating(false)}
          onSubmit={async (input) => {
            await createPlan(product.id, input)
            await reload()
          }}
        />
      ) : null}

      {editing !== null ? (
        <NewVersionModal
          planCode={editing.code}
          current={editing.versions.find((version) => version.id === editing.currentVersionId)}
          onClose={() => setEditing(null)}
          onSubmit={async (spec) => {
            await addPlanVersion(editing.id, spec)
            await reload()
          }}
        />
      ) : null}
    </section>
  )
}
