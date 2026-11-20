import { describe, expect, it } from 'vitest'
import {
  PAGE_KEYS,
  fromDraft,
  isRealDay,
  pageProblem,
  readPageContent,
  sitePageOf,
  splitParagraphs,
  formatDay,
  todayIso,
  toDraft,
} from './page-content.ts'
import type { ContactContent, FaqContent, LegalContent } from './page-content.ts'

// المحتوى القابل للتعديل لصفحات الأسئلة والتواصل والشروط والخصوصية (ADR-0028): قراءة آمنة للصفحة العامة،
// ومسودة نصية للمحرر، وفحص بالعربي قبل الحفظ بنفس حدود الخادم.

const faq: FaqContent = { title: 'الأسئلة', items: [{ question: 'إيه AXOR؟', answer: ['منصة واحدة.', 'أنظمة كتير.'] }] }
const contact: ContactContent = {
  title: 'تواصل معنا',
  intro: 'اكتبلنا.',
  email: 'hello@example.com',
  details: [{ label: 'المواعيد', value: 'الأحد للخميس' }],
}
const legal: LegalContent = {
  title: 'الشروط',
  updatedOn: '2026-11-20',
  sections: [{ heading: 'الاستخدام', paragraphs: ['استخدم المنصة بشكل سليم.'] }],
}

describe('PAGE_KEYS', () => {
  it('lists the four information pages', () => {
    expect([...PAGE_KEYS]).toEqual(['faq', 'contact', 'terms', 'privacy'])
  })
})

describe('readPageContent', () => {
  it('returns valid content as it is', () => {
    expect(readPageContent('faq', faq)).toEqual(faq)
    expect(readPageContent('contact', contact)).toEqual(contact)
    expect(readPageContent('terms', legal)).toEqual(legal)
    expect(readPageContent('privacy', legal)).toEqual(legal)
  })

  it('returns null (not published) for null, for the wrong shape and for the wrong page', () => {
    expect(readPageContent('faq', null)).toBeNull()
    expect(readPageContent('faq', 'text')).toBeNull()
    expect(readPageContent('faq', [])).toBeNull()
    expect(readPageContent('faq', legal)).toBeNull()
    expect(readPageContent('terms', faq)).toBeNull()
  })

  it('refuses stored content that breaks the limits, so the page never shows it', () => {
    expect(readPageContent('faq', { ...faq, items: [] })).toBeNull()
    expect(readPageContent('faq', { ...faq, items: [{ question: 'Q', answer: [] }] })).toBeNull()
    expect(readPageContent('contact', { ...contact, email: 'a@b.com, c@d.com' })).toBeNull()
    expect(readPageContent('contact', { ...contact, email: 'javascript:alert(1)' })).toBeNull()
    expect(readPageContent('terms', { ...legal, updatedOn: '2026-02-30' })).toBeNull()
    expect(readPageContent('terms', { ...legal, sections: [{ heading: 'H', paragraphs: [''] }] })).toBeNull()
  })

  it('accepts a contact page with no email yet', () => {
    expect(readPageContent('contact', { ...contact, email: null })).toEqual({ ...contact, email: null })
  })
})

describe('splitParagraphs', () => {
  it('makes one paragraph per non-empty line, trimmed', () => {
    expect(splitParagraphs('a\n\n  b  \r\nc')).toEqual(['a', 'b', 'c'])
    expect(splitParagraphs('')).toEqual([])
    expect(splitParagraphs(' \n \n')).toEqual([])
  })
})

describe('draft <-> content', () => {
  it('round-trips every page without losing anything', () => {
    expect(fromDraft('faq', toDraft('faq', faq, '2026-11-20'))).toEqual(faq)
    expect(fromDraft('contact', toDraft('contact', contact, '2026-11-20'))).toEqual(contact)
    expect(fromDraft('terms', toDraft('terms', legal, '2026-11-20'))).toEqual(legal)
    expect(fromDraft('privacy', toDraft('privacy', legal, '2026-11-20'))).toEqual(legal)
  })

  it('keeps an email-less contact page email-less', () => {
    const none = { ...contact, email: null }
    expect(fromDraft('contact', toDraft('contact', none, '2026-11-20'))).toEqual(none)
  })

  it('starts an unpublished page from a blank draft that is not valid yet, dated today for legal pages', () => {
    for (const key of PAGE_KEYS) {
      const draft = toDraft(key, null, '2026-11-20')
      expect(pageProblem(key, fromDraft(key, draft)), key).not.toBeNull()
    }
    expect(toDraft('terms', null, '2026-11-20').updatedOn).toBe('2026-11-20')
    expect(toDraft('privacy', null, '2026-11-20').title).toBe('سياسة الخصوصية')
  })

  it('turns the answer text of a draft into paragraphs and back', () => {
    const draft = toDraft('faq', faq, '2026-11-20')
    expect(draft.items[0]?.answer).toBe('منصة واحدة.\nأنظمة كتير.')
  })
})

describe('pageProblem', () => {
  it('accepts valid content', () => {
    expect(pageProblem('faq', faq)).toBeNull()
    expect(pageProblem('contact', contact)).toBeNull()
    expect(pageProblem('terms', legal)).toBeNull()
    expect(pageProblem('contact', { ...contact, email: null, details: [] })).toBeNull()
  })

  it('names the first problem in Arabic, with where it is', () => {
    expect(pageProblem('faq', { ...faq, items: [{ question: ' ', answer: ['x'] }] })).toContain('سؤال 1')
    expect(pageProblem('faq', { ...faq, items: [{ question: 'Q', answer: [] }] })).toContain('سؤال 1')
    expect(pageProblem('contact', { ...contact, email: 'nope' })).toContain('الإيميل')
    expect(pageProblem('terms', { ...legal, updatedOn: '2026-02-30' })).toContain('التاريخ')
    expect(pageProblem('terms', { ...legal, sections: [{ heading: '', paragraphs: ['x'] }] })).toContain('قسم 1')
  })

  it('enforces the same limits as the server', () => {
    const many = Array.from({ length: 31 }, (_, i) => ({ question: `Q${i}`, answer: ['A'] }))
    expect(pageProblem('faq', { ...faq, items: many })).not.toBeNull()
    expect(pageProblem('faq', { ...faq, items: [{ question: 'Q', answer: ['x'.repeat(801)] }] })).not.toBeNull()
    expect(pageProblem('contact', { ...contact, details: Array(7).fill({ label: 'L', value: 'v' }) })).not.toBeNull()
    expect(pageProblem('terms', { ...legal, sections: [{ heading: 'H', paragraphs: ['x'.repeat(1501)] }] })).not.toBeNull()
    const paragraph = 'x'.repeat(1500)
    const huge = Array.from({ length: 20 }, (_, i) => ({ heading: `S${i}`, paragraphs: Array(10).fill(paragraph) as string[] }))
    expect(pageProblem('terms', { ...legal, sections: huge })).not.toBeNull()
  })

  it('refuses control characters inside a paragraph', () => {
    expect(pageProblem('faq', { ...faq, items: [{ question: 'Q', answer: ['a\tb'] }] })).not.toBeNull()
  })
})

describe('isRealDay and todayIso', () => {
  it('accepts only real calendar days written YYYY-MM-DD', () => {
    expect(isRealDay('2026-11-20')).toBe(true)
    expect(isRealDay('2028-02-29')).toBe(true)
    for (const bad of ['2026-02-30', '2026-13-01', '2026-1-1', '20/11/2026', '']) expect(isRealDay(bad), bad).toBe(false)
  })

  it('writes the local day, padded', () => {
    expect(todayIso(new Date(2026, 10, 20))).toBe('2026-11-20')
    expect(todayIso(new Date(2027, 0, 5))).toBe('2027-01-05')
  })
})

describe('formatDay', () => {
  it('بيكتب اليوم بالعربي باسم الشهر، من غير ما يتأثر بتوقيت الجهاز', () => {
    const text = formatDay('2026-11-20')
    expect(text).toContain('نوفمبر')
    expect(text).not.toBe('2026-11-20')
    // أول وآخر اليوم في الشهر لازم يفضلوا في نفس الشهر (التوقيت العالمي ثابت).
    expect(formatDay('2026-12-01')).toContain('ديسمبر')
    expect(formatDay('2026-11-30')).toContain('نوفمبر')
  })

  it('لو الصيغة غلط بيرجّع النص زي ما هو بدل ما يكتب "Invalid Date"', () => {
    expect(formatDay('مش تاريخ')).toBe('مش تاريخ')
  })
})

describe('sitePageOf', () => {
  it('reads which page the staff editor shows from ?page=, and null for the home editor', () => {
    expect(sitePageOf('#/site')).toBeNull()
    expect(sitePageOf('#/site?page=faq')).toBe('faq')
    expect(sitePageOf('#/site?page=privacy')).toBe('privacy')
  })

  it('ignores unknown, empty and inherited values', () => {
    for (const hash of ['#/site?page=home', '#/site?page=', '#/site?page=constructor', '#/site?page=FAQ', '#/site?x=faq', '']) {
      expect(sitePageOf(hash), hash).toBeNull()
    }
  })
})
