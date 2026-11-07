import { Badge } from '../components/ui.tsx'
import {
  findActivity,
  findVisibleProduct,
  isSubscribable,
  plansForActivity,
  plansHref,
  queryCode,
  systemHref,
} from '../lib/public-catalog.ts'
import { useHash } from '../lib/useRoute.ts'
import { CatalogView } from './CatalogView.tsx'
import { FilterLinks } from './FilterLinks.tsx'
import { PlanCard } from './PlanCard.tsx'

/**
 * تفاصيل نظام (`#/system?code=<كود>&activity=<كود>`): الأنشطة، واختيار نشاط بيفلتر الباقات. الكود والنشاط
 * مدخلين من الرابط، فبيتراجعوا على الكتالوج: كود مش معروف (أو نظام معطّل) = «النظام ده مش موجود»، ونشاط
 * مش من أنشطة النظام بيتجاهل. نظام «قريباً» بيعرض الاسم والأنشطة بس، من غير باقات ولا تسجيل.
 */
export function SystemPage() {
  const hash = useHash()
  const code = queryCode(hash, 'code')
  const activityParam = queryCode(hash, 'activity')
  return (
    <main className="content">
      <CatalogView>
        {({ products, plansByProduct }) => {
          const product = findVisibleProduct(products, code)
          if (product === null) {
            return (
              <>
                <div className="page-head">
                  <h1>النظام ده مش موجود</h1>
                </div>
                <p className="empty">
                  الرابط ده مش بيشاور على نظام معروض. <a href="#/systems">شوف كل الأنظمة</a>
                </p>
              </>
            )
          }
          const activity = findActivity(product, activityParam)
          const subscribable = isSubscribable(product)
          const plans = subscribable ? plansForActivity(plansByProduct[product.code] ?? [], activity) : []
          return (
            <>
              <div className="page-head">
                <h1>{product.name}</h1>
                {subscribable ? <Badge tone="good">متاح</Badge> : <Badge tone="muted">قريباً</Badge>}
              </div>
              <p>
                <a href="#/systems">كل الأنظمة</a>
              </p>

              {product.activities.length > 0 ? (
                <section aria-labelledby="system-activities">
                  <h2 id="system-activities">الأنشطة</h2>
                  {subscribable ? (
                    <FilterLinks
                      label="اختيار النشاط"
                      items={[
                        { href: systemHref(product.code), label: 'كل الأنشطة', active: activity === null },
                        ...product.activities.map((item) => ({
                          href: systemHref(product.code, item.code),
                          label: item.name,
                          active: activity === item.code,
                        })),
                      ]}
                    />
                  ) : (
                    <ul className="chips" aria-label="الأنشطة">
                      {product.activities.map((item) => (
                        <li className="chip" key={item.code}>
                          {item.name}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              ) : null}

              {subscribable ? (
                <section aria-labelledby="system-plans">
                  <div className="page-head">
                    <h2 id="system-plans">الباقات</h2>
                    <a className="btn" href={plansHref({ product: product.code, activity, view: 'compare' })}>
                      قارن الباقات
                    </a>
                  </div>
                  {plans.length === 0 ? (
                    <p className="empty">مفيش باقات للنشاط ده دلوقتي.</p>
                  ) : (
                    <ul className="plan-grid">
                      {plans.map((plan) => (
                        <PlanCard key={`${plan.code}:${plan.activity ?? ''}`} product={product} plan={plan} />
                      ))}
                    </ul>
                  )}
                </section>
              ) : (
                <p className="muted">النظام ده لسه مش متاح الاشتراك فيه.</p>
              )}
            </>
          )
        }}
      </CatalogView>
    </main>
  )
}
