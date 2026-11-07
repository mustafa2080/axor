
import { useCallback, useEffect, useState } from 'react'
import { loadPublicCatalog } from '../api/company.ts'
import type { PublicPlan, PublicProduct } from '../api/company.ts'
import { errorMessage } from '../lib/labels.ts'

export type CatalogState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; products: PublicProduct[]; plansByProduct: Record<string, PublicPlan[]> }

/**
 * الكتالوج العام (أنظمة + باقات الأنظمة المتاحة) للصفحات العامة. من غير دخول. `reload` لإعادة المحاولة بعد خطأ.
 * أي صفحة بتعرض الباقات بتقرا من هنا مباشرة (مش من `buildOffers`) عشان الباقة من غير تجربة ما تختفيش.
 */
export function usePublicCatalog(): { state: CatalogState; reload: () => void } {
  const [state, setState] = useState<CatalogState>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let active = true
    loadPublicCatalog().then(
      (catalog) => {
        if (active) setState({ status: 'ready', ...catalog })
      },
      (error: unknown) => {
        if (active) setState({ status: 'error', message: errorMessage(error) })
      },
    )
    return () => {
      active = false
    }
  }, [attempt])

  const reload = useCallback(() => {
    setState({ status: 'loading' })
    setAttempt((value) => value + 1)
  }, [])

  return { state, reload }
}
