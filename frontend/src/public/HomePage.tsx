import { useState } from 'react'
import type { MouseEvent, ReactNode } from 'react'
import { BoxIcon, BuildingIcon, LayersIcon, RepeatIcon, ShieldIcon } from '../components/icons.tsx'
import { Loading } from '../components/ui.tsx'
import type { HomeContent, PointIcon } from '../lib/home-content.ts'
import { useHomeContent } from './useHomeContent.ts'

/**
 * الصفحة الرئيسية للزائر (ADR-0023). النصوص والصور والمجسم 3D بتتحكم فيهم لوحة الإدارة (ADR-0027)،
 * وفي محتوى افتراضي لو محدش عدّل حاجة. كل جملة لازم تكون حقيقية في المنتج: مفيش أرقام عملاء ولا أسعار
 * ولا وعود. الباقات والأسعار الفعلية من صفحة الباقات.
 */
const POINT_ICON: Record<PointIcon, ReactNode> = {
  building: <BuildingIcon />,
  shield: <ShieldIcon />,
  box: <BoxIcon />,
  layers: <LayersIcon />,
  repeat: <RepeatIcon />,
}

/** صورة من برّه (قائمة مسموحة فقط، ADR-0027). لو فشلت بتتحمّل مكانها خلفية هادية بدل أيقونة مكسورة. */
function Photo({ url, alt, className }: { url: string; alt: string; className: string }) {
  const [failed, setFailed] = useState(false)
  if (failed) {
    return <span className={`${className} photo-missing`} role={alt === '' ? undefined : 'img'} aria-label={alt === '' ? undefined : alt} />
  }
  return (
    <img
      className={className}
      src={url}
      alt={alt}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  )
}

/** رابط داخلي. في المعاينة جوه لوحة الإدارة بيتعطّل عشان الضغط عليه ما يخرّجش المدير من الصفحة. */
function Link({ href, className, preview, children }: { href: string; className: string; preview: boolean; children: ReactNode }) {
  const stop = preview ? (event: MouseEvent) => event.preventDefault() : undefined
  return (
    <a className={className} href={href} onClick={stop} tabIndex={preview ? -1 : undefined}>
      {children}
    </a>
  )
}

/**
 * عرض المحتوى. نفسه بيتستخدم في الصفحة العامة وفي معاينة لوحة الإدارة (`preview`)، فاللي المدير بيشوفه
 * قبل الحفظ هو اللي الزائر هيشوفه بعده.
 */
export function HomeView({ content, preview = false }: { content: HomeContent; preview?: boolean }) {
  const { hero, scene, steps, points, gallery, final } = content
  const Root = preview ? 'div' : 'main'
  // أول صورة على اللوح العلوي (الأوضح)، وبعدها اللي تحته. الألواح من غير صورة بتفضل بلون الهوية.
  const [top, middle, bottom] = scene.images

  return (
    <Root className={preview ? 'home home-preview' : 'home'}>
      <section className={scene.enabled ? 'home-hero home-hero-split' : 'home-hero'} aria-labelledby="home-title">
        <div className="home-hero-text">
          <h1 id="home-title">{hero.title}</h1>
          <p className="home-lead">{hero.lead}</p>
          <div className="home-cta">
            <Link className="btn btn-primary" href="#/plans" preview={preview}>
              {hero.primaryLabel}
            </Link>
            <Link className="btn" href="#/login" preview={preview}>
              {hero.secondaryLabel}
            </Link>
          </div>
        </div>
        {scene.enabled ? (
          <div className="scene" aria-hidden="true">
            <div className="scene-stage">
              <div className="scene-slab scene-slab-1">
                {bottom === undefined ? null : <Photo key={bottom.url} url={bottom.url} alt="" className="scene-photo" />}
              </div>
              <div className="scene-slab scene-slab-2">
                {middle === undefined ? null : <Photo key={middle.url} url={middle.url} alt="" className="scene-photo" />}
              </div>
              <div className="scene-slab scene-slab-3">
                {top === undefined ? null : <Photo key={top.url} url={top.url} alt="" className="scene-photo" />}
              </div>
            </div>
          </div>
        ) : null}
      </section>

      <section className="home-section" aria-labelledby="home-steps">
        <h2 id="home-steps">{steps.title}</h2>
        <ol className="home-steps">
          {steps.items.map((step, index) => (
            <li key={`${index}-${step.title}`} className="card">
              <span className="home-step-no" aria-hidden="true">
                {index + 1}
              </span>
              <h3>{step.title}</h3>
              <p className="muted">{step.text}</p>
            </li>
          ))}
        </ol>
      </section>

      {gallery.items.length > 0 ? (
        <section className="home-section" aria-labelledby="home-gallery">
          <h2 id="home-gallery">{gallery.title}</h2>
          <ul className="home-gallery">
            {gallery.items.map((item, index) => (
              <li key={`${index}-${item.url}`}>
                <figure className="gallery-card">
                  <Photo key={item.url} url={item.url} alt={item.alt} className="gallery-photo" />
                  <figcaption>{item.caption}</figcaption>
                </figure>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="home-section" aria-labelledby="home-why">
        <h2 id="home-why">{points.title}</h2>
        <ul className="home-points">
          {points.items.map((point, index) => (
            <li key={`${index}-${point.title}`}>
              <span className="home-point-icon" aria-hidden="true">
                {POINT_ICON[point.icon]}
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
        <h2 id="home-final-title">{final.title}</h2>
        <Link className="btn btn-primary" href="#/plans" preview={preview}>
          {final.button}
        </Link>
      </section>
    </Root>
  )
}

export function HomePage() {
  const state = useHomeContent()
  if (state.status === 'loading') {
    return (
      <main className="home">
        <Loading />
      </main>
    )
  }
  return <HomeView content={state.content} />
}
