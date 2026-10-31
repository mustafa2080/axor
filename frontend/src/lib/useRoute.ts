import { useMemo, useSyncExternalStore } from 'react'
import { parsePlanChoice } from './plan-choice.ts'
import type { PlanChoice } from './plan-choice.ts'
import { hashPath } from './routes.ts'

export type Route = 'products' | 'plans' | 'subscriptions' | 'tenants' | 'audit'

function subscribe(callback: () => void): () => void {
  window.addEventListener('hashchange', callback)
  return () => window.removeEventListener('hashchange', callback)
}

/** مسار بسيط على الـ hash (#/products أو #/plans أو #/subscriptions) من غير مكتبة routing. */
export function useRoute(): Route {
  const hash = useSyncExternalStore(
    subscribe,
    () => window.location.hash,
    () => '',
  )
  const path = hashPath(hash)
  if (path === '#/plans') return 'plans'
  if (path === '#/subscriptions') return 'subscriptions'
  if (path === '#/tenants') return 'tenants'
  if (path === '#/audit') return 'audit'
  return 'products'
}

const currentHash = () => window.location.hash
const serverHash = () => ''

/** الـ hash الحالي (بيتحدّث مع كل تنقل). بنستخدمه عشان نعرف لو الرابط مش معروف. */
export function useHash(): string {
  return useSyncExternalStore(subscribe, currentHash, serverHash)
}

export type CompanyRoute = 'subscriptions' | 'start' | 'members'

/** الرابط اللي بنوصّل عليه الزائر لو التسجيل نجح وبدء التجربة اللي اختارها فشل. */
export const TRIAL_FAILED_HASH = '#/start?trial=failed'

/** هل الرابط ده معناه «التسجيل تم لكن بدء التجربة فشل»؟ (دالة نقية للاختبار). */
export function isTrialFailedHash(hash: string): boolean {
  return hash === TRIAL_FAILED_HASH
}

/** مسارات لوحة الشركة: #/ (اشتراكاتي) و#/start (ابدأ تجربة، ممكن معاه ?trial=failed) و#/members (الأعضاء). */
export function useCompanyRoute(): CompanyRoute {
  const hash = useSyncExternalStore(subscribe, currentHash, serverHash)
  const path = hash.split('?')[0]
  if (path === '#/start') return 'start'
  if (path === '#/members') return 'members'
  return 'subscriptions'
}

/** true لما الزائر وصل لـ #/start بعد فشل بدء التجربة عقب التسجيل. */
export function useTrialFailed(): boolean {
  const hash = useSyncExternalStore(subscribe, currentHash, serverHash)
  return isTrialFailedHash(hash)
}

export type PublicRoute = 'login' | 'register' | 'plans'

/**
 * قبل الدخول: #/plans لاختيار الباقة، و#/register (ممكن معاه ?product=&plan=) لتسجيل شركة جديدة،
 * وأي حاجة تانية شاشة الدخول.
 */
export function usePublicRoute(): PublicRoute {
  const hash = useSyncExternalStore(subscribe, currentHash, serverHash)
  const path = hash.split('?')[0]
  if (path === '#/register') return 'register'
  if (path === '#/plans') return 'plans'
  return 'login'
}

/** الباقة اللي الزائر اختارها قبل التسجيل (من الرابط)، أو null. */
export function usePlanChoice(): PlanChoice | null {
  const hash = useSyncExternalStore(subscribe, currentHash, serverHash)
  return useMemo(() => parsePlanChoice(hash), [hash])
}
