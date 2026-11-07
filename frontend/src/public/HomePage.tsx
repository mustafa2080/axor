import { BoxIcon, BuildingIcon, ShieldIcon } from '../components/icons.tsx'

/**
 * الصفحة الرئيسية للزائر (ADR-0023). نص ثابت من غير طلبات للخادم: كل جملة هنا لازم تكون حقيقية في
 * المنتج الفعلي، ومفيش أرقام عملاء ولا أسعار ولا وعود. الباقات والأسعار الفعلية من صفحة الباقات.
 */
const STEPS = [
  { title: 'اختار النظام', text: 'شوف الأنظمة المتاحة واختار اللي يناسب نشاطك.' },
  { title: 'قارن الباقات', text: 'كل باقة بمميزاتها وحدودها واضحة قبل ما تسجّل.' },
  { title: 'ابدأ تجربة مجانية', text: 'سجّل شركتك وابدأ التجربة، والمدة والحالة بيحددهم الخادم.' },
] as const

const POINTS = [
  { icon: <BuildingIcon />, title: 'حساب لكل شركة', text: 'الشركة بتدير أعضاءها واشتراكاتها من لوحة واحدة.' },
  { icon: <ShieldIcon />, title: 'بيانات معزولة', text: 'بيانات كل شركة مفصولة عن باقي الشركات على مستوى التطبيق.' },
  { icon: <BoxIcon />, title: 'منصة واحدة', text: 'أنظمة متعددة تحت حساب واحد، من غير ما تسجّل من الأول كل مرة.' },
] as const

export function HomePage() {
  return (
    <main className="home">
      <section className="home-hero" aria-labelledby="home-title">
        <h1 id="home-title">منصة واحدة لإدارة أنظمة شركتك</h1>
        <p className="home-lead">
          سجّل شركتك مرة واحدة، واختار الأنظمة والباقات اللي تناسبك، وابدأ بتجربة مجانية.
        </p>
        <div className="home-cta">
          <a className="btn btn-primary" href="#/plans">
            شوف الباقات
          </a>
          <a className="btn" href="#/login">
            عندي حساب
          </a>
        </div>
      </section>

      <section className="home-section" aria-labelledby="home-steps">
        <h2 id="home-steps">إزاي تبدأ</h2>
        <ol className="home-steps">
          {STEPS.map((step, index) => (
            <li key={step.title} className="card">
              <span className="home-step-no" aria-hidden="true">
                {index + 1}
              </span>
              <h3>{step.title}</h3>
              <p className="muted">{step.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="home-section" aria-labelledby="home-why">
        <h2 id="home-why">ليه AXOR</h2>
        <ul className="home-points">
          {POINTS.map((point) => (
            <li key={point.title}>
              <span className="home-point-icon" aria-hidden="true">
                {point.icon}
              </span>
              <div>
                <h3>{point.title}</h3>
                <p className="muted">{point.text}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="home-final" aria-labelledby="home-final-title">
        <h2 id="home-final-title">جاهز تبدأ؟</h2>
        <a className="btn btn-primary" href="#/plans">
          اختار الباقة وابدأ
        </a>
      </section>
    </main>
  )
}
