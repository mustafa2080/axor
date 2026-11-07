import { isSubscribable, planActivityName, visibleProducts } from '../lib/public-catalog.ts'
import { CatalogView } from './CatalogView.tsx'

// كل سطر هنا متأكد منه من سلوك الخادم (ADR-0003 و ADR-0007). مفيش كلام عن الدفع لأنه لسه مش مبني.
const STEPS = [
  { title: 'سجّل شركتك', text: 'اسم الشركة وبريدك وكلمة سر. الحساب بيتفتح على طول.' },
  {
    title: 'اختار الباقة',
    text: 'لو اخترت باقة من صفحة الباقات قبل التسجيل، التجربة بتبدأ مباشرة بعد التسجيل. ولو لأ، تبدأها من «ابدأ تجربة» في لوحتك.',
  },
  {
    title: 'جرّب لحد ما المدة تخلص',
    text: 'تاريخ نهاية التجربة والأيام المتبقية ظاهرين في «اشتراكاتي».',
  },
  {
    title: 'عند نهاية المدة',
    text: 'حالة الاشتراك بتتحوّل لمنتهي تلقائياً. وتقدر تلغي التجربة قبل كده من «اشتراكاتي» (مالك الشركة بس).',
  },
] as const

/**
 * شروط التجربة المجانية قبل التسجيل. المدة الفعلية لكل باقة بتتقرا من الكتالوج العام (اللي الخادم بيطبّق منه
 * المدة عند بدء التجربة)، والباقي نص ثابت من السلوك المؤكد. مفيش وعود عن حاجة لسه مش متنفذة.
 */
export function TrialPage() {
  return (
    <main className="content">
      <div className="page-head">
        <h1>شروط التجربة المجانية</h1>
      </div>

      <section aria-labelledby="trial-steps">
        <h2 id="trial-steps">إزاي بتشتغل</h2>
        <ol className="trial-steps">
          {STEPS.map((step, index) => (
            <li className="card" key={step.title}>
              <span className="home-step-no" aria-hidden="true">
                {index + 1}
              </span>
              <h3>{step.title}</h3>
              <p className="muted">{step.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="trial-rules">
        <h2 id="trial-rules">قواعد لازم تعرفها</h2>
        <ul className="trial-rules">
          <li>تجربة واحدة بس لكل شركة في كل نظام، وكمان لكل بريد إلكتروني في كل نظام.</li>
          <li>إلغاء التجربة ما بيرجّعش حقك فيها: مش هتقدر تبدأ تجربة تانية لنفس النظام.</li>
          <li>مدة التجربة بتتحدد من الباقة نفسها، مش من اختيارك.</li>
          <li>بدء التجربة وإلغاؤها من مالك الشركة بس.</li>
        </ul>
      </section>

      <section aria-labelledby="trial-durations">
        <h2 id="trial-durations">مدة التجربة لكل باقة</h2>
        <CatalogView>
          {({ products, plansByProduct }) => {
            const groups = visibleProducts(products)
              .filter(isSubscribable)
              .map((product) => ({
                product,
                plans: (plansByProduct[product.code] ?? []).filter((plan) => plan.trialDays > 0),
              }))
              .filter((group) => group.plans.length > 0)
            if (groups.length === 0) return <p className="empty">مفيش باقات بتجربة مجانية متاحة دلوقتي.</p>
            return (
              <>
                {groups.map(({ product, plans }) => (
                  <div key={product.code}>
                    <h3>{product.name}</h3>
                    <div className="table-wrap" role="region" aria-label={`مدة التجربة: ${product.name}`} tabIndex={0}>
                      <table className="table">
                        <thead>
                          <tr>
                            <th scope="col">الباقة</th>
                            <th scope="col">النشاط</th>
                            <th scope="col">مدة التجربة</th>
                          </tr>
                        </thead>
                        <tbody>
                          {plans.map((plan) => (
                            <tr key={`${plan.code}:${plan.activity ?? ''}`}>
                              <th scope="row">
                                <span className="ltr">{plan.code}</span>
                              </th>
                              <td>{planActivityName(product, plan)}</td>
                              <td>{plan.trialDays} يوم</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </>
            )
          }}
        </CatalogView>
        <p>
          <a className="btn btn-primary" href="#/plans">
            شوف الباقات وابدأ
          </a>
        </p>
      </section>
    </main>
  )
}
