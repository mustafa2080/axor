import type { MouseEvent, ReactNode } from 'react'
import { ShieldIcon } from '../components/icons.tsx'
import { Loading } from '../components/ui.tsx'
import { PAGE_LABELS, formatDay } from '../lib/page-content.ts'
import type { ContactContent, FaqContent, LegalContent, PageContents, PageKey } from '../lib/page-content.ts'
import { contactHref } from '../lib/site-info.ts'
import { usePageContent } from './usePageContent.ts'
import './info-pages.css'

/**
 * صفحات المعلومات: الأسئلة الشائعة، تواصل معنا، الشروط، الخصوصية (ADR-0028). النصوص بتتكتب من لوحة
 * الإدارة، ومفيش نص افتراضي. كل نص بيتعرض كنص عادي (مش HTML). المجسم 3D زخرفة بس (aria-hidden)،
 * من نفس ألواح ADR-0024 بس بشكل مناسب لكل صفحة.
 */

const GLYPH: Record<PageKey, ReactNode> = {
  faq: '؟',
  contact: '@',
  terms: '§',
  privacy: <ShieldIcon />,
}

/** ثلاث ألواح متراصة بتلف (CSS بس). اللوح العلوي عليه علامة الصفحة. */
function InfoScene({ pageKey }: { pageKey: PageKey }) {
  return (
    <div className="scene info-scene" aria-hidden="true">
      <div className="scene-stage">
        <div className="scene-slab scene-slab-1" />
        <div className="scene-slab scene-slab-2" />
        <div className="scene-slab scene-slab-3">
          <span className="info-glyph">{GLYPH[pageKey]}</span>
        </div>
      </div>
    </div>
  )
}

function Hero({ pageKey, title, note }: { pageKey: PageKey; title: string; note?: string }) {
  return (
    <section className="info-hero" aria-labelledby="info-title">
      <div className="info-hero-text">
        <h1 id="info-title">{title}</h1>
        {note === undefined ? null : <p className="muted">{note}</p>}
      </div>
      <InfoScene pageKey={pageKey} />
    </section>
  )
}

function FaqView({ content }: { content: FaqContent }) {
  return (
    <>
      <Hero pageKey="faq" title={content.title} />
      <ul className="info-list">
        {content.items.map((item, index) => (
          <li key={`${index}-${item.question}`}>
            <details className="info-card faq-item">
              <summary>{item.question}</summary>
              <div className="info-body">
                {item.answer.map((paragraph, i) => (
                  <p key={i}>{paragraph}</p>
                ))}
              </div>
            </details>
          </li>
        ))}
      </ul>
    </>
  )
}

function ContactView({ content }: { content: ContactContent }) {
  const href = contactHref(content.email)
  return (
    <>
      <Hero pageKey="contact" title={content.title} note={content.intro} />
      <ul className="info-list">
        <li className="info-card contact-card">
          <h2>الإيميل</h2>
          {href !== null && content.email !== null ? (
            <a className="contact-mail" href={href} dir="ltr">
              {content.email}
            </a>
          ) : (
            <p className="muted">لسه ما اتحدّدش إيميل رسمي للتواصل.</p>
          )}
        </li>
        {content.details.map((row, index) => (
          <li key={`${index}-${row.label}`} className="info-card contact-card">
            <h2>{row.label}</h2>
            <p>{row.value}</p>
          </li>
        ))}
      </ul>
    </>
  )
}

function LegalView({ pageKey, content }: { pageKey: 'terms' | 'privacy'; content: LegalContent }) {
  return (
    <>
      <Hero pageKey={pageKey} title={content.title} note={`آخر تحديث: ${formatDay(content.updatedOn)}`} />
      <ol className="info-list">
        {content.sections.map((section, index) => (
          <li key={`${index}-${section.heading}`} className="info-card legal-section">
            <h2>
              <span className="info-no" aria-hidden="true">
                {index + 1}
              </span>
              {section.heading}
            </h2>
            <div className="info-body">
              {section.paragraphs.map((paragraph, i) => (
                <p key={i}>{paragraph}</p>
              ))}
            </div>
          </li>
        ))}
      </ol>
    </>
  )
}

/** الصفحة لما ما تتنشرتش: بتقول الحقيقة، ومفيش نص مخترع. */
function Unpublished({ pageKey }: { pageKey: PageKey }) {
  return (
    <>
      <Hero pageKey={pageKey} title={PAGE_LABELS[pageKey]} />
      <p className="info-card info-empty">
        الصفحة دي لسه ما اتنشرتش.{' '}
        <a href="#/" className="info-link">
          الرجوع للرئيسية
        </a>
      </p>
    </>
  )
}

/**
 * عرض المحتوى. نفسه بيتستخدم في الصفحة العامة وفي معاينة لوحة الإدارة (`preview`)، فاللي المدير بيشوفه
 * قبل الحفظ هو اللي الزائر هيشوفه بعده. `content: null` = ما اتنشرتش.
 */
export function PageView({
  pageKey,
  content,
  preview = false,
}: {
  pageKey: PageKey
  content: PageContents[PageKey] | null
  preview?: boolean
}) {
  const Root = preview ? 'div' : 'main'
  const stop = preview ? (event: MouseEvent) => {
    if ((event.target as HTMLElement).closest('a') !== null) event.preventDefault()
  } : undefined
  let body: ReactNode
  if (content === null) body = <Unpublished pageKey={pageKey} />
  else if (pageKey === 'faq') body = <FaqView content={content as FaqContent} />
  else if (pageKey === 'contact') body = <ContactView content={content as ContactContent} />
  else body = <LegalView pageKey={pageKey} content={content as LegalContent} />
  return (
    <Root className={preview ? 'info info-preview' : 'info'} onClick={stop}>
      {body}
    </Root>
  )
}

/** الصفحة العامة لمفتاح واحد: بتحمّل المحتوى وتعرضه. */
export function InfoPage({ pageKey }: { pageKey: PageKey }) {
  const state = usePageContent(pageKey)
  if (state.status === 'loading') {
    return (
      <main className="info">
        <Loading />
      </main>
    )
  }
  if (state.status === 'error') {
    return (
      <main className="info">
        <p className="info-card info-empty" role="alert">
          تعذّر تحميل الصفحة.{' '}
          <button type="button" className="btn btn-small" onClick={state.retry}>
            إعادة المحاولة
          </button>
        </p>
      </main>
    )
  }
  return <PageView pageKey={pageKey} content={state.content} />
}
