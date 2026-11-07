import { Badge } from '../components/ui.tsx'
import {
  findActivity,
  findVisibleProduct,
  isSubscribable,
  plansForActivity,
  plansHref,
  plansViewOf,
  queryCode,
  visibleProducts,
} from '../lib/public-catalog.ts'
import { useHash } from '../lib/useRoute.ts'
import { CatalogView } from './CatalogView.tsx'
import type { CatalogData } from './CatalogView.tsx'
import { FilterLinks } from './FilterLinks.tsx'
import { PlanCard } from './PlanCard.tsx'
import { PlanCompare } from './PlanCompare.tsx'

const planKey = (code: string, activity: string | null) => `${code}:${activity ?? ''}`

function PlansBody({ data, hash }: { data: CatalogData; hash: string }) {
  const { products, plansByProduct } = data
  const shown = visibleProducts(products)
  const available = shown.filter(isSubscribable)
  const comingSoon = shown.filter((product) => !isSubscribable(product))
  // `?product=` مدخل من الرابط: نظام «متاح» بيتختار، و«قريباً» بيتنبّه عليه، وغير كده الأول المتاح.
  const requested = findVisibleProduct(products, queryCode(hash, 'product'))
  const selected = requested !== null && isSubscribable(requested) ? requested : (available[0] ?? null)
  const view = plansViewOf(hash)
  const activity = selected === null ? null : findActivity(selected, queryCode(hash, 'activity'))
  const plans = selected === null ? [] : plansForActivity(plansByProduct[selected.code] ?? [], activity)

  return (
    <>
      {requested !== null && !isSubscribable(requested) ? (
        <p className="muted" role="status">
          {requested.name}: لسه مش متاح الاشتراك فيه.
        </p>
      ) : null}

      {selected === null ? (
        <p className="empty">مفيش أنظمة متاحة للاشتراك دلوقتي.</p>
      ) : (
        <section aria-labelledby="plans-product">
          <div className="page-head">
            <h2 id="plans-product">{selected.name}</h2>
            <Badge tone="good">متاح</Badge>
          </div>
          {available.length > 1 ? (
            <FilterLinks
              label="اختيار النظام"
              items={available.map((product) => ({
                href: plansHref({ product: product.code, view }),
                label: product.name,
                active: product.code === selected.code,
              }))}
            />
          ) : null}
          {selected.activities.length > 0 ? (
            <FilterLinks
              label="اختيار النشاط"
              items={[
                { href: plansHref({ product: selected.code, view }), label: 'كل الأنشطة', active: activity === null },
                ...selected.activities.map((item) => ({
                  href: plansHref({ product: selected.code, activity: item.code, view }),
                  label: item.name,
                  active: activity === item.code,
                })),
              ]}
            />
          ) : null}
          <FilterLinks
            label="طريقة العرض"
            items={[
              {
                href: plansHref({ product: selected.code, activity, view: 'cards' }),
                label: 'كروت',
                active: view === 'cards',
              },
              {
                href: plansHref({ product: selected.code, activity, view: 'compare' }),
                label: 'مقارنة',
                active: view === 'compare',
              },
            ]}
          />
          {plans.length === 0 ? (
            <p className="empty">{activity === null ? 'مفيش باقات متاحة دلوقتي.' : 'مفيش باقات للنشاط ده دلوقتي.'}</p>
          ) : view === 'compare' ? (
            <PlanCompare product={selected} plans={plans} />
          ) : (
            <ul className="plan-grid">
              {plans.map((plan) => (
                <PlanCard key={planKey(plan.code, plan.activity)} product={selected} plan={plan} />
              ))}
            </ul>
          )}
        </section>
      )}

      {comingSoon.length > 0 ? (
        <section aria-labelledby="plans-soon">
          <h2 id="plans-soon">قريباً</h2>
          <ul className="chips" aria-label="أنظمة قريباً">
            {comingSoon.map((product) => (
              <li className="chip" key={product.code}>
                {product.name} <Badge tone="muted">قريباً</Badge>
              </li>
            ))}
          </ul>
          <p className="muted">الأنظمة دي مش متاح الاشتراك فيها لسه.</p>
        </section>
      ) : null}
    </>
  )
}

/**
 * الباقات للزائر (من غير دخول): نظام ← نشاط ← باقات، بوضعين: كروت ومقارنة. الاختيارات كلها في الرابط
 * (`?product=&activity=&view=`)، وبتتراجع على الكتالوج العام. الخادم هو اللي بيحدد المدة والحالة عند بدء التجربة.
 */
export function PlansPage() {
  const hash = useHash()
  return (
    <main className="content">
      <div className="page-head">
        <h1>اختار الباقة وابدأ تجربة مجانية</h1>
      </div>
      <CatalogView>{(data) => <PlansBody data={data} hash={hash} />}</CatalogView>
    </main>
  )
}
