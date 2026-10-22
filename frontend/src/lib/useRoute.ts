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
