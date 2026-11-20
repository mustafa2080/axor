import { z } from 'zod';
import { hasNoControl, line } from './home-content.js';

/**
 * The editable content of the four information pages (ADR-0028): FAQ, contact, terms and privacy.
 * Like the home page (ADR-0027) it is validated on every save, so whatever is stored is already
 * safe to hand to the public page. Unlike the home page there is no built-in text: `null` in the
 * database means "not published yet", because these pages carry commitments (terms, privacy) and
 * contact details that only the platform owner can state. Nothing here is ever rendered as HTML.
 */
export const PAGE_KEYS = ['faq', 'contact', 'terms', 'privacy'] as const;
export type PageKey = (typeof PAGE_KEYS)[number];

export function isPageKey(value: string): value is PageKey {
  return (PAGE_KEYS as readonly string[]).includes(value);
}

// One paragraph of plain text: no control characters, so no line breaks inside it.
const paragraph = (max: number) => z.string().trim().min(1).max(max).refine(hasNoControl, 'No control characters');

// A plain address, matched as text (the same pattern as the web app's `contactHref`): one address,
// no display name, no list, no quotes, no brackets.
const EMAIL = /^[^\s@<>"'()[\]\\,;:]+@[^\s@<>"'()[\]\\,;:]+\.[A-Za-z]{2,}$/;
const email = z.string().trim().max(254).regex(EMAIL, 'Must be one plain email address');

// A real calendar day written YYYY-MM-DD (so 2026-02-30 is refused).
const isoDay = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const [year = 0, month = 0, day = 0] = value.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  }, 'Must be a real date');

// A whole page stays small even if every field is at its limit: it is read by every visitor.
const MAX_PAGE_CHARS = 80_000;
const withinBudget = (value: unknown): boolean => JSON.stringify(value).length <= MAX_PAGE_CHARS;

export const faqSchema = z
  .strictObject({
    title: line(80),
    items: z
      .array(
        z.strictObject({
          question: line(160),
          answer: z.array(paragraph(800)).min(1).max(5),
        }),
      )
      .min(1)
      .max(30),
  })
  .refine(withinBudget, 'The page is too long');

export const contactSchema = z
  .strictObject({
    title: line(80),
    intro: line(400),
    // null = no official address yet: the page says so instead of showing a made-up one.
    email: email.nullable(),
    details: z.array(z.strictObject({ label: line(40), value: line(160) })).max(6),
  })
  .refine(withinBudget, 'The page is too long');

// Terms and privacy have the same shape: a dated document made of titled sections of paragraphs.
export const legalSchema = z
  .strictObject({
    title: line(80),
    updatedOn: isoDay,
    sections: z
      .array(
        z.strictObject({
          heading: line(100),
          paragraphs: z.array(paragraph(1500)).min(1).max(10),
        }),
      )
      .min(1)
      .max(20),
  })
  .refine(withinBudget, 'The page is too long');

export const pageSchemas = {
  faq: faqSchema,
  contact: contactSchema,
  terms: legalSchema,
  privacy: legalSchema,
} as const;

export type FaqContent = z.infer<typeof faqSchema>;
export type ContactContent = z.infer<typeof contactSchema>;
export type LegalContent = z.infer<typeof legalSchema>;
