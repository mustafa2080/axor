import { useSyncExternalStore } from 'react'

export type Route = 'products' | 'plans'

function subscribe(callback: () => void): () => void {
  window.addEventListener('hashchange', callback)
  return () => window.removeEventListener('hashchange', callback)
}

/** مسار بسيط على الـ hash (#/products أو #/plans) من غير مكتبة routing. */
export function useRoute(): Route {
  const hash = useSyncExternalStore(
    subscribe,
    () => window.location.hash,
    () => '',
  )
  return hash === '#/plans' ? 'plans' : 'products'
}
