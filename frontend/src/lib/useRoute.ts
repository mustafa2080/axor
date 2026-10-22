import { useSyncExternalStore } from 'react'

export type Route = 'products' | 'plans' | 'subscriptions'

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
  if (hash === '#/plans') return 'plans'
  if (hash === '#/subscriptions') return 'subscriptions'
  return 'products'
}

const currentHash = () => window.location.hash
const serverHash = () => ''

export type CompanyRoute = 'subscriptions' | 'start'

/** مسارات لوحة الشركة: #/ (اشتراكاتي) و#/start (ابدأ تجربة). */
export function useCompanyRoute(): CompanyRoute {
  const hash = useSyncExternalStore(subscribe, currentHash, serverHash)
  return hash === '#/start' ? 'start' : 'subscriptions'
}

export type PublicRoute = 'login' | 'register'

/** قبل الدخول: #/register لتسجيل شركة جديدة، وأي حاجة تانية شاشة الدخول. */
export function usePublicRoute(): PublicRoute {
  const hash = useSyncExternalStore(subscribe, currentHash, serverHash)
  return hash === '#/register' ? 'register' : 'login'
}
