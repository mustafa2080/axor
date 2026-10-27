import { useCallback, useState } from 'react'
import { errorMessage } from './labels.ts'
import { useSingleFlight } from './useSingleFlight.ts'

/**
 * حالة "جاري الإرسال" وآخر خطأ لأي عملية كتابة. run بيرجع true لو العملية نجحت.
 * نداء تاني أثناء عملية شغّالة (نقر مزدوج) بيتتجاهل ويرجع false من غير ما يغيّر الخطأ الظاهر.
 */
export function useSubmit() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const once = useSingleFlight()

  const run = useCallback(
    async (action: () => Promise<void>): Promise<boolean> => {
      const flight = await once(async () => {
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
      })
      return flight.started && flight.value
    },
    [once],
  )

  return { busy, error, setError, run }
}
