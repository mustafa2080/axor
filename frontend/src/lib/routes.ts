// الروابط (hash) اللي الواجهة بتعرفها. أي رابط غيرها = صفحة 404 بدل ما يتفتح شيء تاني بالصمت.
// دوال نقية عشان تتختبر من غير متصفح.

const HOME = new Set(['', '#', '#/'])
// روابط عامة (قبل الدخول). لو مستخدم مسجّل فتحها بيرجع للرئيسية بدل 404 (رابط تسويقي قديم مثلاً).
const PUBLIC = new Set(['#/login', '#/register', '#/plans'])
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

export type PublicRoute = 'home' | 'login' | 'register' | 'plans'

/**
 * أي صفحة عامة يعرضها الزائر (قبل الدخول) لرابط معروف: الرئيسية للرابط الفاضي و`#` و`#/`، وغير كده
 * بالمسار من غير الـ query. الروابط الغير معروفة بتتعرض 404 قبل ما نوصل هنا (`isKnownPublicHash`).
 */
export function publicRouteOf(hash: string): PublicRoute {
  const path = hashPath(hash)
  if (path === '#/login') return 'login'
  if (path === '#/register') return 'register'
  if (path === '#/plans') return 'plans'
  return 'home'
}

export function isKnownCompanyHash(hash: string): boolean {
  const path = hashPath(hash)
  return HOME.has(path) || PUBLIC.has(path) || COMPANY.has(path)
}

export function isKnownPlatformHash(hash: string): boolean {
  const path = hashPath(hash)
  return HOME.has(path) || PUBLIC.has(path) || PLATFORM.has(path)
}
