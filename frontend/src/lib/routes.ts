// الروابط (hash) اللي الواجهة بتعرفها. أي رابط غيرها = صفحة 404 بدل ما يتفتح شيء تاني بالصمت.
// دوال نقية عشان تتختبر من غير متصفح.

const HOME = new Set(['', '#', '#/'])
// روابط عامة (قبل الدخول). لو مستخدم مسجّل فتحها بيرجع للرئيسية بدل 404 (رابط تسويقي قديم مثلاً).
const PUBLIC = new Set([
  '#/login',
  '#/register',
  '#/plans',
  '#/systems',
  '#/system',
  '#/trial',
])
const COMPANY = new Set(['#/start', '#/members'])
const PLATFORM = new Set(['#/products', '#/plans', '#/subscriptions', '#/tenants', '#/audit'])

/** المسار من غير الـ query: '#/register?plan=x' ← '#/register'. */
export function hashPath(hash: string): string {
  return hash.split('?')[0] ?? ''
}

export function isKnownPublicHash(hash: string): boolean {
  const path = hashPath(hash)
  return HOME.has(path) || PUBLIC.has(path)
}

export type PublicRoute =
  | 'home'
  | 'login'
  | 'register'
  | 'plans'
  | 'systems'
  | 'system'
  | 'trial'

// مسار الـ hash ← الصفحة. `#/system` بياخد الكود من الـ query (`?code=`) لأن الراوتر مطابقة تامة على مسارات ثابتة.
// الأسئلة الشائعة والتواصل والشروط والخصوصية مش هنا لحد ما نصوصها تتحدد وتتعتمد (docs/designs/public-pages.md §9).
const PUBLIC_ROUTES: Readonly<Record<string, PublicRoute>> = {
  '#/login': 'login',
  '#/register': 'register',
  '#/plans': 'plans',
  '#/systems': 'systems',
  '#/system': 'system',
  '#/trial': 'trial',
}

/**
 * أي صفحة عامة يعرضها الزائر (قبل الدخول) لرابط معروف: الرئيسية للرابط الفاضي و`#` و`#/`، وغير كده
 * بالمسار من غير الـ query. الروابط الغير معروفة بتتعرض 404 قبل ما نوصل هنا (`isKnownPublicHash`).
 */
export function publicRouteOf(hash: string): PublicRoute {
  // Object.hasOwn: عشان `#/constructor` و`#/__proto__` ما يرجّعوش حاجة من الـ prototype.
  const path = hashPath(hash)
  return Object.hasOwn(PUBLIC_ROUTES, path) ? (PUBLIC_ROUTES[path] ?? 'home') : 'home'
}

export function isKnownCompanyHash(hash: string): boolean {
  const path = hashPath(hash)
  return HOME.has(path) || PUBLIC.has(path) || COMPANY.has(path)
}

export function isKnownPlatformHash(hash: string): boolean {
  const path = hashPath(hash)
  return HOME.has(path) || PUBLIC.has(path) || PLATFORM.has(path)
}
