import { describe, expect, it } from 'vitest';
import { PAGE_KEYS, contactSchema, faqSchema, isPageKey, legalSchema, pageSchemas } from './page-content.js';

// The editable content of the four information pages (ADR-0028): what is accepted, and what is
// refused, before anything reaches the database or a visitor's browser.

const faq = {
  title: 'Questions',
  items: [{ question: 'What is AXOR?', answer: ['One platform.', 'Many systems.'] }],
};
const contact = {
  title: 'Contact',
  intro: 'Write to us.',
  email: 'hello@example.com',
  details: [{ label: 'Hours', value: 'Sun to Thu' }],
};
const legal = {
  title: 'Terms',
  updatedOn: '2026-11-20',
  sections: [{ heading: 'Use', paragraphs: ['Be kind.'] }],
};

describe('page keys', () => {
  it('knows exactly the four information pages', () => {
    expect([...PAGE_KEYS]).toEqual(['faq', 'contact', 'terms', 'privacy']);
    for (const key of PAGE_KEYS) expect(isPageKey(key), key).toBe(true);
  });

  it('does not treat anything else as a page, including inherited object keys', () => {
    for (const key of ['home', '', 'FAQ', 'faq ', 'constructor', '__proto__', 'toString']) {
      expect(isPageKey(key), key).toBe(false);
    }
  });

  it('has a schema for every key, and terms and privacy share the legal one', () => {
    expect(Object.keys(pageSchemas).sort()).toEqual([...PAGE_KEYS].sort());
    expect(pageSchemas.terms).toBe(legalSchema);
    expect(pageSchemas.privacy).toBe(legalSchema);
  });
});

describe('faq', () => {
  it('accepts a question with one or more answer paragraphs', () => {
    expect(faqSchema.safeParse(faq).success).toBe(true);
  });

  it('needs at least one question and refuses more than 30', () => {
    expect(faqSchema.safeParse({ ...faq, items: [] }).success).toBe(false);
    const many = Array.from({ length: 31 }, (_, i) => ({ question: `Q${i}`, answer: ['A'] }));
    expect(faqSchema.safeParse({ ...faq, items: many }).success).toBe(false);
  });

  it('needs an answer, and refuses unknown fields', () => {
    expect(faqSchema.safeParse({ ...faq, items: [{ question: 'Q', answer: [] }] }).success).toBe(false);
    expect(faqSchema.safeParse({ ...faq, extra: 1 }).success).toBe(false);
    expect(faqSchema.safeParse({ ...faq, items: [{ question: 'Q', answer: ['A'], html: '<b>' }] }).success).toBe(false);
  });
});

describe('contact', () => {
  it('accepts an email, or none yet (null)', () => {
    expect(contactSchema.safeParse(contact).success).toBe(true);
    expect(contactSchema.safeParse({ ...contact, email: null, details: [] }).success).toBe(true);
  });

  it('refuses an email that is not one plain address', () => {
    for (const email of ['not-an-email', 'a@b', 'a b@c.com', 'a@b.com, c@d.com', '<a@b.com>', 'javascript:alert(1)']) {
      expect(contactSchema.safeParse({ ...contact, email }).success, email).toBe(false);
    }
  });

  it('allows at most 6 detail lines', () => {
    const details = Array.from({ length: 7 }, (_, i) => ({ label: `L${i}`, value: 'v' }));
    expect(contactSchema.safeParse({ ...contact, details }).success).toBe(false);
  });
});

describe('legal documents (terms and privacy)', () => {
  it('accepts sections of paragraphs and a real calendar date', () => {
    expect(legalSchema.safeParse(legal).success).toBe(true);
  });

  it('refuses a date that is not a real day', () => {
    for (const updatedOn of ['2026-13-01', '2026-02-30', '20/11/2026', '2026-1-1', '']) {
      expect(legalSchema.safeParse({ ...legal, updatedOn }).success, updatedOn).toBe(false);
    }
  });

  it('needs at least one section with at least one paragraph', () => {
    expect(legalSchema.safeParse({ ...legal, sections: [] }).success).toBe(false);
    expect(legalSchema.safeParse({ ...legal, sections: [{ heading: 'Use', paragraphs: [] }] }).success).toBe(false);
  });

  it('refuses a document over the total size budget', () => {
    const paragraph = 'x'.repeat(1500);
    const sections = Array.from({ length: 20 }, (_, i) => ({ heading: `S${i}`, paragraphs: Array(10).fill(paragraph) }));
    expect(legalSchema.safeParse({ ...legal, sections }).success).toBe(false);
  });
});

describe('every text field is one plain line or paragraph', () => {
  it('refuses control characters and blank text', () => {
    expect(faqSchema.safeParse({ ...faq, title: 'a\nb' }).success).toBe(false);
    expect(faqSchema.safeParse({ ...faq, title: '   ' }).success).toBe(false);
    expect(legalSchema.safeParse({ ...legal, sections: [{ heading: 'H', paragraphs: ['a\u0000b'] }] }).success).toBe(false);
    expect(contactSchema.safeParse({ ...contact, intro: 'a\tb' }).success).toBe(false);
  });
});
