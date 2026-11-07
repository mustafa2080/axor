
// روابط الصفحات العامة (الـ navbar والـ footer) ومنطق «الصفحة الحالية». نقي من غير DOM عشان يتختبر.
// أي رابط بيتضاف هنا لازم صفحته تكون موجودة (الاختبار بيتأكد إن كل رابط معروف في `routes.ts`).

import { hashPath } from './routes.ts'

export interface PublicLink {
  href: string
  label: string
}

export const PUBLIC_NAV: readonly PublicLink[] = [
  { href: '#/', label: 'الرئيسية' },
  { href: '#/systems', label: 'الأنظمة' },
  { href: '#/plans', label: 'الباقات' },
]

/** روابط المعلومات (الـ footer). الأسئلة والتواصل والشروط والخصوصية بتتضاف لما صفحاتها تتبني وتتعتمد. */
export const PUBLIC_INFO_LINKS: readonly PublicLink[] = [{ href: '#/trial', label: 'شروط التجربة المجانية' }]

export const PUBLIC_ACCOUNT_LINKS: readonly PublicLink[] = [
  { href: '#/login', label: 'دخول' },
  { href: '#/register', label: 'تسجيل شركة' },
]

const HOME_PATHS = new Set(['', '#', '#/'])

// صفحات فرعية بتضيّء رابط صفحة أم: تفاصيل نظام (`#/system`) تحت «الأنظمة».
const PARENT_OF: Readonly<Record<string, string>> = { '#/system': '#/systems' }

/** الرابط ده هو الصفحة الحالية؟ الرئيسية بتتطابق مع الـ hash الفاضي و`#` و`#/`. */
export function isCurrentPublicLink(href: string, hash: string): boolean {
  const path = hashPath(hash)
  if (href === '#/') return HOME_PATHS.has(path)
  const current = Object.hasOwn(PARENT_OF, path) ? PARENT_OF[path] : path
  return current === href
}
