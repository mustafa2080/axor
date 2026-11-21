// عنوان التبويب لكل صفحة (document.title). دوال نقية للاختبار. القوائم هنا بتتبع نفس منطق اختيار
// الصفحة في `PublicPage` و`CompanyApp` و`AdminApp`، وأي رابط مش معروف بيطلع عنوان الـ 404.

import { hashPath, isKnownCompanyHash, isKnownPlatformHash, isKnownPublicHash, publicRouteOf } from './routes.ts'
import type { PublicRoute } from './routes.ts'

export const BRAND = 'AXOR'
const NOT_FOUND = 'الصفحة مش موجودة'

export type Area = 'loading' | 'public' | 'company' | 'platform'

const PUBLIC: Readonly<Record<PublicRoute, string>> = {
  home: 'الرئيسية',
  login: 'تسجيل الدخول',
  register: 'إنشاء حساب',
  plans: 'الباقات',
  systems: 'الأنظمة',
  system: 'تفاصيل النظام',
  trial: 'التجربة المجانية',
  faq: 'الأسئلة الشائعة',
  contact: 'تواصل معنا',
  terms: 'الشروط والأحكام',
  privacy: 'سياسة الخصوصية',
}

const COMPANY: Readonly<Record<string, string>> = {
  '#/start': 'ابدأ تجربة',
  '#/members': 'الأعضاء',
}

const PLATFORM: Readonly<Record<string, string>> = {
  '#/overview': 'نظرة عامة',
  '#/plans': 'الباقات',
  '#/subscriptions': 'الاشتراكات',
  '#/tenants': 'الشركات',
  '#/audit': 'سجل التدقيق',
  '#/site': 'محتوى الموقع',
}

function withBrand(page: string): string {
  return `${page} | ${BRAND}`
}

/** عنوان الصفحة اللي هتتعرض لنفس الـ hash في المنطقة دي (زائر أو شركة أو منصة). */
export function pageTitle(area: Area, hash: string): string {
  const path = hashPath(hash)
  switch (area) {
    case 'loading':
      return BRAND
    case 'public':
      return isKnownPublicHash(hash) ? withBrand(PUBLIC[publicRouteOf(hash)]) : withBrand(NOT_FOUND)
    case 'company':
      if (!isKnownCompanyHash(hash)) return withBrand(NOT_FOUND)
      // أي رابط عام بيفتح «اشتراكاتي» (CompanyApp).
      return withBrand(Object.hasOwn(COMPANY, path) ? (COMPANY[path] ?? 'اشتراكاتي') : 'اشتراكاتي')
    case 'platform':
      if (!isKnownPlatformHash(hash)) return withBrand(NOT_FOUND)
      // أي رابط تاني معروف (الرئيسية والعامة) بيفتح «الأنظمة والأنشطة» (useRoute).
      return withBrand(Object.hasOwn(PLATFORM, path) ? (PLATFORM[path] ?? 'الأنظمة والأنشطة') : 'الأنظمة والأنشطة')
  }
}
