import { Badge } from '../components/ui.tsx'
import { isSubscribable, plansHref, systemHref, visibleProducts } from '../lib/public-catalog.ts'
import { CatalogView } from './CatalogView.tsx'

/**
 * الأنظمة للزائر: كارت لكل نظام فيه الحالة والأنشطة. «متاح» ليه زرار للباقات، و«قريباً» من غير أي طريق
 * للتسجيل (بس سبب مكتوب). الأنظمة المعطّلة مش بتظهر. الكتالوج العام فيه الاسم والأنشطة بس، فمفيش وصف مخترع.
 */
export function SystemsPage() {
  return (
    <main className="content">
      <div className="page-head">
        <h1>الأنظمة</h1>
      </div>
      <CatalogView>
        {({ products }) => {
          const visible = visibleProducts(products)
          if (visible.length === 0) return <p className="empty">مفيش أنظمة معروضة دلوقتي.</p>
          return (
            <ul className="system-grid">
              {visible.map((product) => (
                <li className="card system-card" key={product.code} data-status={product.status}>
                  <div className="card-head">
                    <h2>{product.name}</h2>
                    {isSubscribable(product) ? <Badge tone="good">متاح</Badge> : <Badge tone="muted">قريباً</Badge>}
                  </div>
                  {product.activities.length > 0 ? (
                    <ul className="chips" aria-label="الأنشطة">
                      {product.activities.map((activity) => (
                        <li className="chip" key={activity.code}>
                          {activity.name}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <div className="system-actions">
                    {isSubscribable(product) ? (
                      <a className="btn btn-primary" href={plansHref({ product: product.code })}>
                        شوف الباقات
                      </a>
                    ) : (
                      <p className="muted">مش متاح الاشتراك فيه لسه.</p>
                    )}
                    <a className="btn" href={systemHref(product.code)}>
                      التفاصيل
                    </a>
                  </div>
                </li>
              ))}
            </ul>
          )
        }}
      </CatalogView>
    </main>
  )
}
