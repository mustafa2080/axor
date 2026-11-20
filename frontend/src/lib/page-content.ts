// المحتوى القابل للتعديل لأربع صفحات معلومات (ADR-0028): الأسئلة الشائعة، تواصل معنا، الشروط، الخصوصية.
// نفس الشكل والحدود اللي الخادم بيتحقق منها في backend/src/modules/site/page-content.ts (الخادم هو المرجع).
// الفرق عن الصفحة الرئيسية: مفيش نص افتراضي. `null` = الصفحة ما اتنشرتش، لأن الشروط والخصوصية وبيانات
// التواصل التزامات بيحددها صاحب المنصة بس، والصفحة بتقول الحقيقة بدل ما تعرض نص مخترع.
// من غير React هنا عشان يتختبر بسهولة.

import { contactHref } from './site-info.ts'
import { hasControl, textProblem } from './home-content.ts'

export const PAGE_KEYS = ['faq', 'contact', 'terms', 'privacy'] as const
export type PageKey = (typeof PAGE_KEYS)[number]

export function isPageKey(value: string): value is PageKey {
  return (PAGE_KEYS as readonly string[]).includes(value)
}

export const PAGE_LABELS: Record<PageKey, string> = {
  faq: 'الأسئلة الشائعة',
  contact: 'تواصل معنا',
  terms: 'الشروط والأحكام',
  privacy: 'سياسة الخصوصية',
}

export const PAGE_HASHES: Record<PageKey, string> = {
  faq: '#/faq',
  contact: '#/contact',
  terms: '#/terms',
  privacy: '#/privacy',
}

export interface FaqContent {
  title: string
  items: Array<{ question: string; answer: string[] }>
}
export interface ContactContent {
  title: string
  intro: string
  /** `null` = لسه ما اتحدّدش إيميل رسمي. */
  email: string | null
  details: Array<{ label: string; value: string }>
}
export interface LegalContent {
  title: string
  /** يوم حقيقي بصيغة YYYY-MM-DD. */
  updatedOn: string
  sections: Array<{ heading: string; paragraphs: string[] }>
}
export interface PageContents {
  faq: FaqContent
  contact: ContactContent
  terms: LegalContent
  privacy: LegalContent
}

// حدود الأطوال والأعداد (نفس حدود الخادم).
export const PAGE_MAX = {
  title: 80,
  faqItems: 30,
  question: 160,
  answerParagraphs: 5,
  answerParagraph: 800,
  intro: 400,
  details: 6,
  detailLabel: 40,
  detailValue: 160,
  sections: 20,
  heading: 100,
  sectionParagraphs: 10,
  sectionParagraph: 1500,
  total: 80_000,
} as const

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const isLine = (value: unknown, max: number): value is string =>
  typeof value === 'string' && value.trim() !== '' && value.length <= max && !hasControl(value)
const isList = (value: unknown, min: number, max: number): value is unknown[] =>
  Array.isArray(value) && value.length >= min && value.length <= max
const isParagraphs = (value: unknown, min: number, maxCount: number, maxLength: number): boolean =>
  isList(value, min, maxCount) && value.every((p) => isLine(p, maxLength))

/** يوم حقيقي بصيغة YYYY-MM-DD (2026-02-30 مش حقيقي). */
export function isRealDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year = 0, month = 0, day = 0] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

/** "2026-11-20" ← "20 نوفمبر 2026". بالتوقيت العالمي عشان اليوم ما يتغيرش حسب جهاز الزائر. */
export function formatDay(day: string): string {
  const date = new Date(`${day}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return day
  return date.toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })
}

/** يوم النهارده بتوقيت الجهاز بصيغة YYYY-MM-DD. */
export function todayIso(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

const withinBudget = (value: unknown): boolean => JSON.stringify(value).length <= PAGE_MAX.total

function readFaq(value: unknown): FaqContent | null {
  if (!isRecord(value) || !isLine(value.title, PAGE_MAX.title) || !isList(value.items, 1, PAGE_MAX.faqItems)) return null
  const ok = value.items.every(
    (item) =>
      isRecord(item) &&
      isLine(item.question, PAGE_MAX.question) &&
      isParagraphs(item.answer, 1, PAGE_MAX.answerParagraphs, PAGE_MAX.answerParagraph),
  )
  return ok && withinBudget(value) ? (value as unknown as FaqContent) : null
}

function readContact(value: unknown): ContactContent | null {
  if (!isRecord(value) || !isLine(value.title, PAGE_MAX.title) || !isLine(value.intro, PAGE_MAX.intro)) return null
  if (value.email !== null && (typeof value.email !== 'string' || contactHref(value.email) === null)) return null
  if (!isList(value.details, 0, PAGE_MAX.details)) return null
  const ok = value.details.every(
    (row) => isRecord(row) && isLine(row.label, PAGE_MAX.detailLabel) && isLine(row.value, PAGE_MAX.detailValue),
  )
  return ok && withinBudget(value) ? (value as unknown as ContactContent) : null
}

function readLegal(value: unknown): LegalContent | null {
  if (!isRecord(value) || !isLine(value.title, PAGE_MAX.title)) return null
  if (typeof value.updatedOn !== 'string' || !isRealDay(value.updatedOn)) return null
  if (!isList(value.sections, 1, PAGE_MAX.sections)) return null
  const ok = value.sections.every(
    (section) =>
      isRecord(section) &&
      isLine(section.heading, PAGE_MAX.heading) &&
      isParagraphs(section.paragraphs, 1, PAGE_MAX.sectionParagraphs, PAGE_MAX.sectionParagraph),
  )
  return ok && withinBudget(value) ? (value as unknown as LegalContent) : null
}

/**
 * المحتوى لو شكله سليم، وإلا null (يعني: الصفحة ما اتنشرتش). الخادم بيتحقق قبل التخزين، فده خط دفاع
 * تاني بس: الصفحة العامة ما بتتكسرش ولا بتعرض حاجة غريبة مهما كان اللي جاي.
 */
export function readPageContent<K extends PageKey>(key: K, value: unknown): PageContents[K] | null {
  const read = key === 'faq' ? readFaq : key === 'contact' ? readContact : readLegal
  return read(value) as PageContents[K] | null
}

// ---------------------------------------------------------------------------------------------
// المسودة اللي المحرر بيشتغل عليها: الفقرات نص واحد (كل سطر فقرة) عشان الكتابة في textarea تفضل طبيعية.
// ---------------------------------------------------------------------------------------------

export interface FaqDraft {
  title: string
  items: Array<{ question: string; answer: string }>
}
export interface ContactDraft {
  title: string
  intro: string
  email: string
  details: Array<{ label: string; value: string }>
}
export interface LegalDraft {
  title: string
  updatedOn: string
  sections: Array<{ heading: string; text: string }>
}
export interface PageDrafts {
  faq: FaqDraft
  contact: ContactDraft
  terms: LegalDraft
  privacy: LegalDraft
}

/** كل سطر غير فاضي فقرة، من غير مسافات زايدة. */
export function splitParagraphs(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '')
}

const joinParagraphs = (list: readonly string[]): string => list.join('\n')

/** مسودة من المحتوى المحفوظ، أو مسودة فاضية (مش صالحة للنشر لحد ما تتملي) لو الصفحة ما اتنشرتش. */
export function toDraft<K extends PageKey>(key: K, content: PageContents[K] | null, today: string): PageDrafts[K] {
  let draft: PageDrafts[PageKey]
  if (key === 'faq') {
    const faq = content as FaqContent | null
    draft =
      faq === null
        ? { title: PAGE_LABELS.faq, items: [{ question: '', answer: '' }] }
        : { title: faq.title, items: faq.items.map((i) => ({ question: i.question, answer: joinParagraphs(i.answer) })) }
  } else if (key === 'contact') {
    const contact = content as ContactContent | null
    draft =
      contact === null
        ? { title: PAGE_LABELS.contact, intro: '', email: '', details: [] }
        : { title: contact.title, intro: contact.intro, email: contact.email ?? '', details: contact.details.map((d) => ({ ...d })) }
  } else {
    const legal = content as LegalContent | null
    draft =
      legal === null
        ? { title: PAGE_LABELS[key], updatedOn: today, sections: [{ heading: '', text: '' }] }
        : {
            title: legal.title,
            updatedOn: legal.updatedOn,
            sections: legal.sections.map((s) => ({ heading: s.heading, text: joinParagraphs(s.paragraphs) })),
          }
  }
  return draft as PageDrafts[K]
}

/** المحتوى الجاهز للإرسال من المسودة (المسافات اتشالت، والنص اتقسّم فقرات، والإيميل الفاضي بقى null). */
export function fromDraft<K extends PageKey>(key: K, draft: PageDrafts[K]): PageContents[K] {
  const t = (s: string) => s.trim()
  let content: PageContents[PageKey]
  if (key === 'faq') {
    const d = draft as FaqDraft
    content = { title: t(d.title), items: d.items.map((i) => ({ question: t(i.question), answer: splitParagraphs(i.answer) })) }
  } else if (key === 'contact') {
    const d = draft as ContactDraft
    content = {
      title: t(d.title),
      intro: t(d.intro),
      email: t(d.email) === '' ? null : t(d.email),
      details: d.details.map((r) => ({ label: t(r.label), value: t(r.value) })),
    }
  } else {
    const d = draft as LegalDraft
    content = {
      title: t(d.title),
      updatedOn: t(d.updatedOn),
      sections: d.sections.map((s) => ({ heading: t(s.heading), paragraphs: splitParagraphs(s.text) })),
    }
  }
  return content as PageContents[K]
}

function paragraphsProblem(label: string, list: readonly string[], maxCount: number, maxLength: number): string | null {
  if (list.length === 0) return `${label}: اكتب فقرة واحدة على الأقل.`
  if (list.length > maxCount) return `${label}: أقصى عدد ${maxCount} فقرات (كل سطر فقرة).`
  for (const paragraph of list) {
    if (paragraph.length > maxLength) return `${label}: أقصى طول للفقرة ${maxLength} حرف.`
    if (hasControl(paragraph)) return `${label}: ممنوع رموز التحكم.`
  }
  return null
}

const firstProblem = (checks: ReadonlyArray<string | null>): string | null => checks.find((p) => p !== null) ?? null

function faqProblem(c: FaqContent): string | null {
  if (c.items.length === 0) return 'الأسئلة: ضيف سؤال واحد على الأقل.'
  if (c.items.length > PAGE_MAX.faqItems) return `الأسئلة: أقصى عدد ${PAGE_MAX.faqItems} سؤال.`
  return firstProblem([
    textProblem('عنوان الصفحة', c.title, PAGE_MAX.title),
    ...c.items.flatMap((item, i) => [
      textProblem(`سؤال ${i + 1} (السؤال)`, item.question, PAGE_MAX.question),
      paragraphsProblem(`سؤال ${i + 1} (الإجابة)`, item.answer, PAGE_MAX.answerParagraphs, PAGE_MAX.answerParagraph),
    ]),
  ])
}

function contactProblem(c: ContactContent): string | null {
  if (c.details.length > PAGE_MAX.details) return `التفاصيل: أقصى عدد ${PAGE_MAX.details} سطور.`
  return firstProblem([
    textProblem('عنوان الصفحة', c.title, PAGE_MAX.title),
    textProblem('الوصف', c.intro, PAGE_MAX.intro),
    c.email !== null && contactHref(c.email) === null ? 'الإيميل: اكتب عنوان واحد صالح، زي name@example.com.' : null,
    ...c.details.flatMap((row, i) => [
      textProblem(`تفصيلة ${i + 1} (الاسم)`, row.label, PAGE_MAX.detailLabel),
      textProblem(`تفصيلة ${i + 1} (القيمة)`, row.value, PAGE_MAX.detailValue),
    ]),
  ])
}

function legalProblem(c: LegalContent): string | null {
  if (c.sections.length === 0) return 'الأقسام: ضيف قسم واحد على الأقل.'
  if (c.sections.length > PAGE_MAX.sections) return `الأقسام: أقصى عدد ${PAGE_MAX.sections} قسم.`
  return firstProblem([
    textProblem('عنوان الصفحة', c.title, PAGE_MAX.title),
    isRealDay(c.updatedOn) ? null : 'التاريخ: لازم يكون يوم حقيقي بصيغة YYYY-MM-DD، زي 2026-11-20.',
    ...c.sections.flatMap((section, i) => [
      textProblem(`قسم ${i + 1} (العنوان)`, section.heading, PAGE_MAX.heading),
      paragraphsProblem(`قسم ${i + 1} (النص)`, section.paragraphs, PAGE_MAX.sectionParagraphs, PAGE_MAX.sectionParagraph),
    ]),
  ])
}

/** أول مشكلة في المحتوى بالعربي، أو null لو سليم. بيتنده قبل الحفظ؛ الخادم بيعيد نفس الفحص. */
export function pageProblem<K extends PageKey>(key: K, content: PageContents[K]): string | null {
  const own = key === 'faq' ? faqProblem(content as FaqContent) : key === 'contact' ? contactProblem(content as ContactContent) : legalProblem(content as LegalContent)
  if (own !== null) return own
  return withinBudget(content) ? null : 'الصفحة طويلة أوي: قصّر النص.'
}

/** أي صفحة معلومات بيعدّلها المحرر من الـ hash (`#/site?page=faq`)، أو null لمحرر الرئيسية. */
export function sitePageOf(hash: string): PageKey | null {
  const query = hash.split('?')[1]
  if (query === undefined) return null
  const page = new URLSearchParams(query).get('page')
  return page !== null && isPageKey(page) ? page : null
}
