import { useState } from 'react'
import {
  ACTIVITY_STATUSES,
  PRODUCT_STATUSES,
  createActivity,
  createProduct,
  updateActivity,
  updateProduct,
} from '../api/catalog.ts'
import type { Activity, ActivityStatus, Product, ProductStatus } from '../api/catalog.ts'
import { Badge } from '../components/ui.tsx'
import type { Tone } from '../components/ui.tsx'
import { activityStatusLabel, productStatusLabel } from '../lib/labels.ts'
import { EntityFormModal } from './EntityFormModal.tsx'

type Dialog =
  | { kind: 'new-product' }
  | { kind: 'edit-product'; product: Product }
  | { kind: 'new-activity'; product: Product }
  | { kind: 'edit-activity'; activity: Activity }

const productTone: Record<ProductStatus, Tone> = {
  available: 'good',
  coming_soon: 'info',
  disabled: 'muted',
}
const activityTone: Record<ActivityStatus, Tone> = { active: 'good', disabled: 'muted' }

/** الأنظمة (STARK وCAPRINA...) وأنشطة كل نظام. */
export function ProductsPage({
  products,
  reload,
}: {
  products: Product[]
  reload: () => Promise<void>
}) {
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const close = () => setDialog(null)

  return (
    <section>
      <div className="page-head">
        <h1>الأنظمة والأنشطة</h1>
        <button type="button" className="btn btn-primary" onClick={() => setDialog({ kind: 'new-product' })}>
          + نظام جديد
        </button>
      </div>

      {products.length === 0 ? (
        <p className="empty">مفيش أنظمة لسه. ابدأ بإضافة أول نظام (مثلاً STARK).</p>
      ) : null}

      {products.map((product) => (
        <article className="card" key={product.id}>
          <header className="card-head">
            <div>
              <h2>{product.name}</h2>
              <code className="code">{product.code}</code>
            </div>
            <div className="card-actions">
              <Badge tone={productTone[product.status]}>{productStatusLabel[product.status]}</Badge>
              <button type="button" className="btn btn-small" onClick={() => setDialog({ kind: 'edit-product', product })}>
                تعديل
              </button>
              <button type="button" className="btn btn-small" onClick={() => setDialog({ kind: 'new-activity', product })}>
                + نشاط
              </button>
            </div>
          </header>

          {product.activities.length === 0 ? (
            <p className="muted">مفيش أنشطة للنظام ده.</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>النشاط</th>
                  <th>الكود</th>
                  <th>الحالة</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {product.activities.map((activity) => (
                  <tr key={activity.id}>
                    <td>{activity.name}</td>
                    <td>
                      <code className="code">{activity.code}</code>
                    </td>
                    <td>
                      <Badge tone={activityTone[activity.status]}>{activityStatusLabel[activity.status]}</Badge>
                    </td>
                    <td className="cell-actions">
                      <button type="button" className="btn btn-small" onClick={() => setDialog({ kind: 'edit-activity', activity })}>
                        تعديل
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </article>
      ))}

      {dialog?.kind === 'new-product' ? (
        <EntityFormModal<ProductStatus>
          title="نظام جديد"
          statuses={PRODUCT_STATUSES}
          statusLabels={productStatusLabel}
          defaultStatus="coming_soon"
          onClose={close}
          onSubmit={async (values) => {
            await createProduct(values)
            await reload()
          }}
        />
      ) : null}

      {dialog?.kind === 'edit-product' ? (
        <EntityFormModal<ProductStatus>
          title={`تعديل النظام: ${dialog.product.name}`}
          existing={dialog.product}
          statuses={PRODUCT_STATUSES}
          statusLabels={productStatusLabel}
          defaultStatus="coming_soon"
          onClose={close}
          onSubmit={async (values) => {
            const { product } = dialog
            const changes = {
              ...(values.name !== product.name && { name: values.name }),
              ...(values.status !== product.status && { status: values.status }),
            }
            if (Object.keys(changes).length > 0) await updateProduct(product.id, changes)
            await reload()
          }}
        />
      ) : null}

      {dialog?.kind === 'new-activity' ? (
        <EntityFormModal<ActivityStatus>
          title={`نشاط جديد في ${dialog.product.name}`}
          statuses={ACTIVITY_STATUSES}
          statusLabels={activityStatusLabel}
          defaultStatus="active"
          onClose={close}
          onSubmit={async (values) => {
            await createActivity(dialog.product.id, values)
            await reload()
          }}
        />
      ) : null}

      {dialog?.kind === 'edit-activity' ? (
        <EntityFormModal<ActivityStatus>
          title={`تعديل النشاط: ${dialog.activity.name}`}
          existing={dialog.activity}
          statuses={ACTIVITY_STATUSES}
          statusLabels={activityStatusLabel}
          defaultStatus="active"
          onClose={close}
          onSubmit={async (values) => {
            const { activity } = dialog
            const changes = {
              ...(values.name !== activity.name && { name: values.name }),
              ...(values.status !== activity.status && { status: values.status }),
            }
            if (Object.keys(changes).length > 0) await updateActivity(activity.id, changes)
            await reload()
          }}
        />
      ) : null}
    </section>
  )
}
