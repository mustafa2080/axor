import { useCallback, useState } from 'react'
import { errorMessage } from './labels.ts'

/** حالة "جاري الإرسال" وآخر خطأ لأي عملية كتابة. run بيرجع true لو العملية نجحت. */
export function useSubmit() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = useCallback(async (action: () => Promise<void>): Promise<boolean> => {
    setBusy(true)
    setError(null)
    try {
      await action()
      return true
    } catch (caught) {
      setError(errorMessage(caught))
      return false
    } finally {
      setBusy(false)
    }
  }, [])

  return { busy, error, setError, run }
}
