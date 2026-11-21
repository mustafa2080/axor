import { useCallback, useEffect, useState } from 'react'
import { getOverview } from '../api/overview.ts'
import type { PlatformOverview } from '../api/overview.ts'
import { errorMessage } from '../lib/labels.ts'

export type OverviewState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  // `refreshError`: فشل تحديث لاحق. الأرقام القديمة فاضلة معروضة ومعاها تنبيه، بدل ما تختفي.
  | { status: 'ready'; data: PlatformOverview; loadedAt: Date; refreshError: string | null }

/** يحمّل مؤشرات المنصة، ويدّي `reload` لتحديث يدوي من غير ما الأرقام الحالية تختفي أثناء التحميل. */
export function useOverview() {
  const [state, setState] = useState<OverviewState>({ status: 'loading' })
  const [refreshing, setRefreshing] = useState(false)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let active = true
    getOverview().then(
      (data) => {
        if (!active) return
        setRefreshing(false)
        setState({ status: 'ready', data, loadedAt: new Date(), refreshError: null })
      },
      (error: unknown) => {
        if (!active) return
        setRefreshing(false)
        const message = errorMessage(error)
        setState((current) =>
          current.status === 'ready' ? { ...current, refreshError: message } : { status: 'error', message },
        )
      },
    )
    return () => {
      active = false
    }
  }, [version])

  const reload = useCallback(() => {
    setRefreshing(true)
    setState((current) => (current.status === 'ready' ? current : { status: 'loading' }))
    setVersion((v) => v + 1)
  }, [])

  return { state, refreshing, reload }
}
