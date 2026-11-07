
// بيانات الموقع اللي لازم تتحدد من المدير ومينفعش تتألف. لحد ما تتحدد الصفحة بتقول الحقيقة (مش متاح).

/**
 * إيميل التواصل الرسمي. `null` = لسه ما اتحددش، وصفحة «تواصل معنا» بتقول كده بدل ما تعرض عنوان مخترع.
 * لما المدير يحدده: حط العنوان هنا بس، والصفحة بتعرضه كرابط `mailto:` بعد ما تتأكد إن شكله صالح.
 */
export const CONTACT_EMAIL: string | null = null

const EMAIL = /^[^\s@<>"'()[\]\\,;:]+@[^\s@<>"'()[\]\\,;:]+\.[A-Za-z]{2,}$/

/** رابط `mailto:` لو العنوان صالح، وإلا null (عنوان غلط ما يتحولش لرابط). */
export function contactHref(email: string | null): string | null {
  if (email === null || !EMAIL.test(email) || email.length > 254) return null
  return `mailto:${email}`
}
