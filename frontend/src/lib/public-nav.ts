// روابط الصفحات العامة (الـ navbar والـ footer) ومنطق «الصفحة الحالية». نقي من غير DOM عشان يتختبر.
// الصفحات اللي مش موجودة (الشروط والخصوصية والتواصل) مش بتتحط هنا لحد ما تتبني وتتعتمد.

import { hashPath } from './routes.ts'

export interface PublicLink {
  href: string
  label: string
}

export const PUBLIC_NAV: readonly PublicLink[] = [
  { href: '#/', label: 'الرئيسية' },
  { href: '#/plans', label: 'الباقات' },
]

export const PUBLIC_ACCOUNT_LINKS: readonly PublicLink[] = [
  { href: '#/login', label: 'دخول' },
  { href: '#/register', label: 'تسجيل شركة' },
]

const HOME_PATHS = new Set(['', '#', '#/'])

/** الرابط ده هو الصفحة الحالية؟ الرئيسية بتتطابق مع الـ hash الفاضي و`#` و`#/`. */
export function isCurrentPublicLink(href: string, hash: string): boolean {
  const path = hashPath(hash)
  if (href === '#/') return HOME_PATHS.has(path)
  return path === href
}
