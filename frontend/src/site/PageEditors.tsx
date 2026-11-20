import { useEffect, useState } from 'react'
import { ApiError } from '../api/client.ts'
import { getAdminPage, saveAdminPage } from '../api/site.ts'
import type { HomeSetting } from '../api/site.ts'
import { ErrorNote, Field, Loading, Modal } from '../components/ui.tsx'
import { errorMessage } from '../lib/labels.ts'
import {
  PAGE_LABELS,
  PAGE_MAX,
  fromDraft,
  pageProblem,
  readPageContent,
  toDraft,
  todayIso,
} from '../lib/page-content.ts'
import type { ContactDraft, FaqDraft, LegalDraft, PageContents, PageDrafts, PageKey } from '../lib/page-content.ts'
import { useSubmit } from '../lib/useSubmit.ts'
import { PageView } from '../public/InfoPages.tsx'
import { removeAt, replaceAt } from './list-edit.ts'
import { Lines, Row, Section, Text } from './site-fields.tsx'
import './site-editor.css'

// محررات صفحات المعلومات: الأسئلة، تواصل، الشروط، الخصوصية (ADR-0028). مفيش نص افتراضي: الصفحة بتبدأ
// فاضية ومش منشورة، وبتتنشر لما المدير يحفظ محتوى سليم. الخادم هو المرجع في الفحص، والفحص هنا لراحة الكتابة بس.

type PageDraft = PageDrafts[PageKey]
type PageContent = PageContents[PageKey]

const PARAGRAPH_HINT = (maxCount: number, maxLength: number) => `كل سطر فقرة. أقصى ${maxCount} فقرات، والفقرة لحد ${maxLength} حرف.`

function FaqForm({ draft, onChange }: { draft: FaqDraft; onChange: (d: FaqDraft) => void }) {
  return (
    <div className="site-form">
      <Section title="الصفحة">
        <Text label="العنوان" value={draft.title} max={PAGE_MAX.title} onChange={(v) => onChange({ ...draft, title: v })} />
      </Section>
      <Section title="الأسئلة" hint="الأسئلة بتظهر للزائر كأكورديون: السؤال ظاهر والإجابة بتتفتح بالضغط.">
        {draft.items.map((item, i) => (
          <Row key={i} title={`سؤال ${i + 1}`} onRemove={() => onChange({ ...draft, items: removeAt(draft.items, i) })}>
            <Text label="السؤال" value={item.question} max={PAGE_MAX.question} onChange={(v) => onChange({ ...draft, items: replaceAt(draft.items, i, { ...item, question: v }) })} />
            <Lines label="الإجابة" value={item.answer} hint={PARAGRAPH_HINT(PAGE_MAX.answerParagraphs, PAGE_MAX.answerParagraph)} onChange={(v) => onChange({ ...draft, items: replaceAt(draft.items, i, { ...item, answer: v }) })} />
          </Row>
        ))}
        {draft.items.length < PAGE_MAX.faqItems ? (
          <button type="button" className="btn btn-small" onClick={() => onChange({ ...draft, items: [...draft.items, { question: '', answer: '' }] })}>
            إضافة سؤال
          </button>
        ) : null}
      </Section>
    </div>
  )
}

function ContactForm({ draft, onChange }: { draft: ContactDraft; onChange: (d: ContactDraft) => void }) {
  return (
    <div className="site-form">
      <Section title="الصفحة">
        <Text label="العنوان" value={draft.title} max={PAGE_MAX.title} onChange={(v) => onChange({ ...draft, title: v })} />
        <Text label="الوصف" long value={draft.intro} max={PAGE_MAX.intro} onChange={(v) => onChange({ ...draft, intro: v })} />
      </Section>
      <Section title="الإيميل" hint="سيبه فاضي لو لسه ما اتحدّدش إيميل رسمي: الصفحة هتقول كده بدل ما تعرض إيميل مش حقيقي.">
        <Field label="عنوان الإيميل">
          <input type="email" dir="ltr" value={draft.email} maxLength={254} onChange={(e) => onChange({ ...draft, email: e.target.value })} />
        </Field>
      </Section>
      <Section title="تفاصيل تانية" hint="مواعيد الرد، رقم، عنوان… أي سطر بعنوان وقيمة.">
        {draft.details.map((row, i) => (
          <Row key={i} title={`تفصيلة ${i + 1}`} onRemove={() => onChange({ ...draft, details: removeAt(draft.details, i) })}>
            <Text label="الاسم" value={row.label} max={PAGE_MAX.detailLabel} onChange={(v) => onChange({ ...draft, details: replaceAt(draft.details, i, { ...row, label: v }) })} />
            <Text label="القيمة" value={row.value} max={PAGE_MAX.detailValue} onChange={(v) => onChange({ ...draft, details: replaceAt(draft.details, i, { ...row, value: v }) })} />
          </Row>
        ))}
        {draft.details.length < PAGE_MAX.details ? (
          <button type="button" className="btn btn-small" onClick={() => onChange({ ...draft, details: [...draft.details, { label: '', value: '' }] })}>
            إضافة تفصيلة
          </button>
        ) : null}
      </Section>
    </div>
  )
}

function LegalForm({ draft, onChange }: { draft: LegalDraft; onChange: (d: LegalDraft) => void }) {
  return (
    <div className="site-form">
      <Section title="الصفحة" hint="النص القانوني بيحدده صاحب المنصة: ما فيش نص جاهز هنا، اكتبه أو الصقه بعد مراجعته.">
        <Text label="العنوان" value={draft.title} max={PAGE_MAX.title} onChange={(v) => onChange({ ...draft, title: v })} />
        <Text label="تاريخ آخر تحديث" type="date" ltr value={draft.updatedOn} max={10} onChange={(v) => onChange({ ...draft, updatedOn: v })} />
      </Section>
      <Section title="الأقسام">
        {draft.sections.map((section, i) => (
          <Row key={i} title={`قسم ${i + 1}`} onRemove={() => onChange({ ...draft, sections: removeAt(draft.sections, i) })}>
            <Text label="العنوان" value={section.heading} max={PAGE_MAX.heading} onChange={(v) => onChange({ ...draft, sections: replaceAt(draft.sections, i, { ...section, heading: v }) })} />
            <Lines label="النص" value={section.text} hint={PARAGRAPH_HINT(PAGE_MAX.sectionParagraphs, PAGE_MAX.sectionParagraph)} onChange={(v) => onChange({ ...draft, sections: replaceAt(draft.sections, i, { ...section, text: v }) })} />
          </Row>
        ))}
        {draft.sections.length < PAGE_MAX.sections ? (
          <button type="button" className="btn btn-small" onClick={() => onChange({ ...draft, sections: [...draft.sections, { heading: '', text: '' }] })}>
            إضافة قسم
          </button>
        ) : null}
      </Section>
    </div>
  )
}

function Editor({
  pageKey,
  version,
  initial,
  saved,
  onSaved,
  onReload,
}: {
  pageKey: PageKey
  version: number
  initial: PageContent | null
  saved: boolean
  onSaved: (setting: HomeSetting) => void
  onReload: () => void
}) {
  const [draft, setDraft] = useState<PageDraft>(() => toDraft(pageKey, initial, todayIso()))
  // أساس المقارنة: المحتوى المحفوظ بعد ما يعدّي على نفس تحويل المسودة، فترتيب المفاتيح ما يأثرش.
  const [baseline] = useState<string | null>(() =>
    initial === null ? null : JSON.stringify(fromDraft(pageKey, toDraft(pageKey, initial, todayIso()))),
  )
  // رسالة المشكلة بتظهر بعد أول تعديل بس: الصفحة اللي لسه ما اتنشرتش بتبدأ فاضية ومينفعش نصرخ فيه قبل ما يكتب.
  const [touched, setTouched] = useState(false)
  const [conflict, setConflict] = useState(false)
  const [confirmUnpublish, setConfirmUnpublish] = useState(false)
  const { busy, error, run } = useSubmit()
  const edit = (next: PageDraft) => {
    setTouched(true)
    setDraft(next)
  }

  const content = fromDraft(pageKey, draft)
  const problem = pageProblem(pageKey, content)
  const dirty = baseline === null || JSON.stringify(content) !== baseline
  const published = initial !== null

  async function submit(next: PageContent | null) {
    setConflict(false)
    await run(async () => {
      try {
        onSaved(await saveAdminPage(pageKey, version, next))
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
        <h1>{PAGE_LABELS[pageKey]}</h1>
        <div className="form-actions">
          <button type="button" className="btn btn-primary" disabled={busy || !dirty || problem !== null} onClick={() => void submit(content)}>
            {busy ? 'جاري الحفظ…' : published ? 'حفظ' : 'حفظ ونشر'}
          </button>
          <button type="button" className="btn" disabled={busy || !published} onClick={() => setConfirmUnpublish(true)}>
            إلغاء النشر
          </button>
        </div>
      </div>

      {!published && !saved ? <p className="notice">الصفحة دي لسه ما اتنشرتش: الزائر بيشوف «لسه ما اتنشرتش». املا النص واحفظ عشان تتنشر.</p> : null}
      {saved && published && !dirty ? <p className="notice">اتحفظ. الزوار هيشوفوا التعديل خلال ثواني.</p> : null}
      {saved && !published ? <p className="notice">اتشالت من الموقع. الزائر دلوقتي بيشوف «لسه ما اتنشرتش».</p> : null}
      {problem !== null && touched ? <p className="notice">{problem}</p> : null}
      {conflict ? (
        <p className="error-note" role="alert">
          حد تاني حفظ تعديل بعد ما فتحت الصفحة، فتعديلك ما اتحفظش.{' '}
          <button type="button" className="btn btn-small" onClick={onReload}>
            حمّل النسخة الأحدث
          </button>
        </p>
      ) : null}
      <ErrorNote message={error} />

      {pageKey === 'faq' ? (
        <FaqForm draft={draft as FaqDraft} onChange={edit} />
      ) : pageKey === 'contact' ? (
        <ContactForm draft={draft as ContactDraft} onChange={edit} />
      ) : (
        <LegalForm draft={draft as LegalDraft} onChange={edit} />
      )}

      <h2 className="site-preview-title">المعاينة</h2>
      <p className="muted">ده شكل الصفحة بالتعديلات الحالية، حتى قبل الحفظ.</p>
      {problem === null ? (
        <PageView pageKey={pageKey} content={content} preview />
      ) : (
        <p className="notice">المعاينة بتظهر لما المحتوى يبقى سليم.</p>
      )}

      {confirmUnpublish ? (
        <Modal title="إلغاء نشر الصفحة" onClose={() => setConfirmUnpublish(false)}>
          <p>المحتوى المحفوظ هيتمسح والصفحة هتبقى «لسه ما اتنشرتش» للزوار. التغيير ده بيتسجّل في سجل التدقيق.</p>
          <div className="form-actions">
            <button
              type="button"
              className="btn btn-danger"
              disabled={busy}
              onClick={() => {
                setConfirmUnpublish(false)
                void submit(null)
              }}
            >
              تأكيد
            </button>
            <button type="button" className="btn" onClick={() => setConfirmUnpublish(false)}>
              رجوع
            </button>
          </div>
        </Modal>
      ) : null}
    </>
  )
}

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; version: number; content: PageContent | null; saved: boolean }

/** تحرير صفحة معلومات واحدة لموظفي المنصة. المستدعي بيديها `key={pageKey}` عشان الحالة تتصفّر عند تغيير التاب. */
export function PageEditor({ pageKey }: { pageKey: PageKey }) {
  const [state, setState] = useState<State>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let active = true
    getAdminPage(pageKey).then(
      (setting) => {
        if (active) setState({ status: 'ready', version: setting.version, content: readPageContent(pageKey, setting.content), saved: false })
      },
      (caught: unknown) => {
        if (active) setState({ status: 'error', message: errorMessage(caught) })
      },
    )
    return () => {
      active = false
    }
  }, [pageKey, attempt])

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
        pageKey={pageKey}
        version={state.version}
        initial={state.content}
        saved={state.saved}
        onSaved={(setting) =>
          setState({ status: 'ready', version: setting.version, content: readPageContent(pageKey, setting.content), saved: true })
        }
        onReload={reload}
      />
    </section>
  )
}
