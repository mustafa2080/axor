import { offlineMessage } from '../lib/error-pages.ts'
import { useOnlineStatus } from '../lib/useOnlineStatus.ts'

/**
 * شريط بيظهر لما المتصفح يفقد الاتصال. الحاوية ثابتة في الصفحة (aria-live) والنص بس هو اللي
 * بيظهر ويختفي، لأن قارئ الشاشة مش بيعلن عن عنصر live بيتضاف مع محتواه في نفس اللحظة.
 */
export function OfflineBanner() {
  const online = useOnlineStatus()
  return (
    <div role="status" aria-live="polite">
      {online ? null : <p className="offline-banner">{offlineMessage}</p>}
    </div>
  )
}
