import { useEffect, useState } from 'react'
import { ApiError } from '../api/client.ts'
import { getAdminHome, saveAdminHome } from '../api/site.ts'
import type { HomeSetting } from '../api/site.ts'
import { ErrorNote, Field, Loading, Modal } from '../components/ui.tsx'
import { MAX, POINT_ICONS, homeContentProblem, pointIconLabel, readHomeContent, trimHomeContent } from '../lib/home-content.ts'
import type { HomeContent, PointIcon } from '../lib/home-content.ts'
import { errorMessage } from '../lib/labels.ts'
import { PAGE_KEYS, PAGE_LABELS, sitePageOf } from '../lib/page-content.ts'
import { useHash } from '../lib/useRoute.ts'
import { useSubmit } from '../lib/useSubmit.ts'
import { HomeView } from '../public/HomePage.tsx'
import { PageEditor } from './PageEditors.tsx'
import { removeAt, replaceAt } from './list-edit.ts'
import { Row, Section, Text } from './site-fields.tsx'
import './site-editor.css'

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; version: number; content: HomeContent; saved: boolean }

const IMAGE_HINT = 'رابط صورة https من images.unsplash.com أو images.pexels.com بس.'

function Editor({
  version,
  initial,
  saved,
  onSaved,
  onReload,
}: {
  version: number
  initial: HomeContent
  saved: boolean
  onSaved: (setting: HomeSetting) => void
  onReload: () => void
}) {
  const [draft, setDraft] = useState<HomeContent>(initial)
  const [conflict, setConflict] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const { busy, error, run } = useSubmit()
  const change = (fn: (d: HomeContent) => HomeContent) => setDraft(fn)

  const problem = homeContentProblem(draft)
  const trimmed = trimHomeContent(draft)
  const dirty = JSON.stringify(trimmed) !== JSON.stringify(initial)

  async function submit(content: HomeContent | null) {
    setConflict(false)
    await run(async () => {
      try {
        onSaved(await saveAdminHome(version, content))
      } catch (caught) {
        if (caught instanceof ApiError && caught.code === 'CONTENT_CHANGED') {
          setConflict(true)
          return
        }
        throw caught
      }
    })
  }

  return (
    <>
      <div className="page-head">
        <h1>الصفحة الرئيسية</h1>
        <div className="form-actions">
          <button type="button" className="btn btn-primary" disabled={busy || !dirty || problem !== null} onClick={() => void submit(trimmed)}>
            {busy ? 'جاري الحفظ…' : 'حفظ'}
          </button>
          <button type="button" className="btn" disabled={busy} onClick={() => setConfirmReset(true)}>
            رجّع الافتراضي
          </button>
        </div>
      </div>

      {saved && !dirty ? <p className="notice">اتحفظ. الزوار هيشوفوا التعديل خلال ثواني.</p> : null}
      {problem !== null && dirty ? <p className="notice">{problem}</p> : null}
      {conflict ? (
        <p className="error-note" role="alert">
          حد تاني حفظ تعديل بعد ما فتحت الصفحة، فتعديلك ما اتحفظش.{' '}
          <button type="button" className="btn btn-small" onClick={onReload}>
            حمّل النسخة الأحدث
          </button>
        </p>
      ) : null}
      <ErrorNote message={error} />

      <div className="site-form">
        <Section title="الواجهة (أول الصفحة)">
          <Text label="العنوان" value={draft.hero.title} max={MAX.heroTitle} onChange={(v) => change((d) => ({ ...d, hero: { ...d.hero, title: v } }))} />
          <Text label="الوصف" long value={draft.hero.lead} max={MAX.heroLead} onChange={(v) => change((d) => ({ ...d, hero: { ...d.hero, lead: v } }))} />
          <Text label="نص زر الباقات" value={draft.hero.primaryLabel} max={MAX.button} onChange={(v) => change((d) => ({ ...d, hero: { ...d.hero, primaryLabel: v } }))} />
          <Text label="نص زر الدخول" value={draft.hero.secondaryLabel} max={MAX.button} onChange={(v) => change((d) => ({ ...d, hero: { ...d.hero, secondaryLabel: v } }))} />
        </Section>

        <Section title="المجسم 3D" hint="ألواح متراصة بتلف جنب العنوان. الصورة الأولى على اللوح الأعلى. من غير صور بتفضل الألواح بلون الهوية.">
          <label className="check">
            <input type="checkbox" checked={draft.scene.enabled} onChange={(e) => change((d) => ({ ...d, scene: { ...d.scene, enabled: e.target.checked } }))} />
            <span>إظهار المجسم</span>
          </label>
          {draft.scene.images.map((image, i) => (
            <Row key={i} title={`صورة ${i + 1}`} onRemove={() => change((d) => ({ ...d, scene: { ...d.scene, images: removeAt(d.scene.images, i) } }))}>
              <Field label="الرابط" hint={IMAGE_HINT}>
                <input type="url" dir="ltr" value={image.url} maxLength={MAX.url} onChange={(e) => change((d) => ({ ...d, scene: { ...d.scene, images: replaceAt(d.scene.images, i, { ...image, url: e.target.value }) } }))} />
              </Field>
              <Text label="وصف الصورة" value={image.alt} max={MAX.alt} onChange={(v) => change((d) => ({ ...d, scene: { ...d.scene, images: replaceAt(d.scene.images, i, { ...image, alt: v }) } }))} />
            </Row>
          ))}
          {draft.scene.images.length < MAX.sceneImages ? (
            <button type="button" className="btn btn-small" onClick={() => change((d) => ({ ...d, scene: { ...d.scene, images: [...d.scene.images, { url: '', alt: '' }] } }))}>
              إضافة صورة
            </button>
          ) : null}
        </Section>

        <Section title="الخطوات">
          <Text label="عنوان القسم" value={draft.steps.title} max={MAX.heading} onChange={(v) => change((d) => ({ ...d, steps: { ...d.steps, title: v } }))} />
          {draft.steps.items.map((step, i) => (
            <Row key={i} title={`خطوة ${i + 1}`} onRemove={() => change((d) => ({ ...d, steps: { ...d.steps, items: removeAt(d.steps.items, i) } }))}>
              <Text label="العنوان" value={step.title} max={MAX.itemTitle} onChange={(v) => change((d) => ({ ...d, steps: { ...d.steps, items: replaceAt(d.steps.items, i, { ...step, title: v }) } }))} />
              <Text label="الشرح" value={step.text} max={MAX.itemText} onChange={(v) => change((d) => ({ ...d, steps: { ...d.steps, items: replaceAt(d.steps.items, i, { ...step, text: v }) } }))} />
            </Row>
          ))}
          {draft.steps.items.length < MAX.steps ? (
            <button type="button" className="btn btn-small" onClick={() => change((d) => ({ ...d, steps: { ...d.steps, items: [...d.steps.items, { title: '', text: '' }] } }))}>
              إضافة خطوة
            </button>
          ) : null}
        </Section>

        <Section title="معرض الصور" hint="لو فضّيته القسم كله بيختفي من الصفحة.">
          <Text label="عنوان القسم" value={draft.gallery.title} max={MAX.heading} onChange={(v) => change((d) => ({ ...d, gallery: { ...d.gallery, title: v } }))} />
          {draft.gallery.items.map((item, i) => (
            <Row key={i} title={`صورة ${i + 1}`} onRemove={() => change((d) => ({ ...d, gallery: { ...d.gallery, items: removeAt(d.gallery.items, i) } }))}>
              <Field label="الرابط" hint={IMAGE_HINT}>
                <input type="url" dir="ltr" value={item.url} maxLength={MAX.url} onChange={(e) => change((d) => ({ ...d, gallery: { ...d.gallery, items: replaceAt(d.gallery.items, i, { ...item, url: e.target.value }) } }))} />
              </Field>
              <Text label="وصف الصورة" value={item.alt} max={MAX.alt} onChange={(v) => change((d) => ({ ...d, gallery: { ...d.gallery, items: replaceAt(d.gallery.items, i, { ...item, alt: v }) } }))} />
              <Text label="التعليق" value={item.caption} max={MAX.caption} onChange={(v) => change((d) => ({ ...d, gallery: { ...d.gallery, items: replaceAt(d.gallery.items, i, { ...item, caption: v }) } }))} />
            </Row>
          ))}
          {draft.gallery.items.length < MAX.galleryItems ? (
            <button type="button" className="btn btn-small" onClick={() => change((d) => ({ ...d, gallery: { ...d.gallery, items: [...d.gallery.items, { url: '', alt: '', caption: '' }] } }))}>
              إضافة صورة
            </button>
          ) : null}
        </Section>

        <Section title="المميزات">
          <Text label="عنوان القسم" value={draft.points.title} max={MAX.heading} onChange={(v) => change((d) => ({ ...d, points: { ...d.points, title: v } }))} />
          {draft.points.items.map((point, i) => (
            <Row key={i} title={`ميزة ${i + 1}`} onRemove={() => change((d) => ({ ...d, points: { ...d.points, items: removeAt(d.points.items, i) } }))}>
              <Field label="الأيقونة">
                <select value={point.icon} onChange={(e) => change((d) => ({ ...d, points: { ...d.points, items: replaceAt(d.points.items, i, { ...point, icon: e.target.value as PointIcon }) } }))}>
                  {POINT_ICONS.map((icon) => (
                    <option key={icon} value={icon}>
                      {pointIconLabel[icon]}
                    </option>
                  ))}
                </select>
              </Field>
              <Text label="العنوان" value={point.title} max={MAX.itemTitle} onChange={(v) => change((d) => ({ ...d, points: { ...d.points, items: replaceAt(d.points.items, i, { ...point, title: v }) } }))} />
              <Text label="الشرح" value={point.text} max={MAX.itemText} onChange={(v) => change((d) => ({ ...d, points: { ...d.points, items: replaceAt(d.points.items, i, { ...point, text: v }) } }))} />
            </Row>
          ))}
          {draft.points.items.length < MAX.points ? (
            <button type="button" className="btn btn-small" onClick={() => change((d) => ({ ...d, points: { ...d.points, items: [...d.points.items, { icon: 'box', title: '', text: '' }] } }))}>
              إضافة ميزة
            </button>
          ) : null}
        </Section>

        <Section title="الدعوة الأخيرة">
          <Text label="العنوان" value={draft.final.title} max={MAX.heading} onChange={(v) => change((d) => ({ ...d, final: { ...d.final, title: v } }))} />
          <Text label="نص الزر" value={draft.final.button} max={MAX.button} onChange={(v) => change((d) => ({ ...d, final: { ...d.final, button: v } }))} />
        </Section>
      </div>

      <h2 className="site-preview-title">المعاينة</h2>
      <p className="muted">ده شكل الصفحة بالتعديلات الحالية، حتى قبل الحفظ.</p>
      <HomeView content={draft} preview />

      {confirmReset ? (
        <Modal title="رجّع المحتوى الافتراضي" onClose={() => setConfirmReset(false)}>
          <p>كل التعديلات المحفوظة هتتمسح والصفحة هترجع للمحتوى الافتراضي. التغيير ده بيتسجّل في سجل التدقيق.</p>
          <div className="form-actions">
            <button
              type="button"
              className="btn btn-danger"
              disabled={busy}
              onClick={() => {
                setConfirmReset(false)
                void submit(null)
              }}
            >
              تأكيد
            </button>
            <button type="button" className="btn" onClick={() => setConfirmReset(false)}>
              رجوع
            </button>
          </div>
        </Modal>
      ) : null}
    </>
  )
}

/** تحرير الصفحة الرئيسية لموظفي المنصة: نصوص وصور والمجسم 3D، مع معاينة حيّة (ADR-0027). */
function HomeSite() {
  const [state, setState] = useState<State>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let active = true
    getAdminHome().then(
      (setting) => {
        if (active) setState({ status: 'ready', version: setting.version, content: readHomeContent(setting.content), saved: false })
      },
      (caught: unknown) => {
        if (active) setState({ status: 'error', message: errorMessage(caught) })
      },
    )
    return () => {
      active = false
    }
  }, [attempt])

  const reload = () => {
    setState({ status: 'loading' })
    setAttempt((n) => n + 1)
  }

  if (state.status === 'loading') return <Loading />
  if (state.status === 'error') {
    return (
      <>
        <ErrorNote message={state.message} />
        <button type="button" className="btn" onClick={reload}>
          إعادة المحاولة
        </button>
      </>
    )
  }
  return (
    <section>
      <Editor
        key={state.version}
        version={state.version}
        initial={state.content}
        saved={state.saved}
        onSaved={(setting) =>
          setState({ status: 'ready', version: setting.version, content: readHomeContent(setting.content), saved: true })
        }
        onReload={reload}
      />
    </section>
  )
}

/**
 * محتوى الموقع العام لموظفي المنصة: الصفحة الرئيسية (ADR-0027) وصفحات المعلومات الأربع (ADR-0028) في تابات.
 * التاب في الـ hash (`#/site?page=faq`) فالرابط بيتشارك وزر الرجوع بيشتغل. تغيير التاب بيفتح محرر جديد،
 * فأي تعديل ما اتحفظش في التاب القديم بيضيع.
 */
export function SitePage() {
  const hash = useHash()
  const page = sitePageOf(hash)
  return (
    <>
      <nav className="site-tabs" aria-label="صفحات الموقع">
        <a href="#/site" aria-current={page === null ? 'page' : undefined}>
          الرئيسية
        </a>
        {PAGE_KEYS.map((key) => (
          <a key={key} href={`#/site?page=${key}`} aria-current={page === key ? 'page' : undefined}>
            {PAGE_LABELS[key]}
          </a>
        ))}
      </nav>
      {page === null ? <HomeSite /> : <PageEditor key={page} pageKey={page} />}
    </>
  )
}
