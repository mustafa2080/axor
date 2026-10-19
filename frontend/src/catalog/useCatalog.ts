import { useCallback, useEffect, useState } from 'react'
import { listCatalog } from '../api/catalog.ts'
import type { Product } from '../api/catalog.ts'
import { errorMessage } from '../lib/labels.ts'

export type CatalogState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; products: Product[] }

async function load(): Promise<CatalogState> {
  try {
    return { status: 'ready', products: await listCatalog() }
  } catch (error) {
    return { status: 'error', message: errorMessage(error) }
  }
}

/** بيحمّل الكتالوج الكامل مرة، و reload بيحدّثه بعد أي تعديل (الأحجام صغيرة فالتحميل الكامل كفاية). */
export function useCatalog() {
  const [state, setState] = useState<CatalogState>({ status: 'loading' })

  const reload = useCallback(async () => {
    setState(await load())
  }, [])

  useEffect(() => {
    let active = true
    void load().then((next) => {
      if (active) setState(next)
    })
    return () => {
      active = false
    }
  }, [])

  return { state, reload }
}
