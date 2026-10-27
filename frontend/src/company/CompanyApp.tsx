import { useAuth } from '../auth/auth-context.ts'
import type { SessionUser } from '../api/client.ts'
import { NotFoundPage } from '../components/ErrorPage.tsx'
import { BrandMark } from '../components/ui.tsx'
import { tenantRoleLabel } from '../lib/labels.ts'
import { isKnownCompanyHash } from '../lib/routes.ts'
import { useCompanyRoute, useHash } from '../lib/useRoute.ts'
import { MySubscriptions } from './MySubscriptions.tsx'
import { StartTrial } from './StartTrial.tsx'

/**
 * لوحة الشركة: اشتراكاتي وبدء تجربة. الواجهة بتخفي الأزرار حسب الدور للراحة بس؛ الحماية الفعلية
 * في الخادم (بدء التجربة والإلغاء لمالك الشركة بس، والقراءة لكل أدوار الشركة).
 */
export function CompanyApp({ user }: { user: SessionUser }) {
  const { signOut } = useAuth()
  const route = useCompanyRoute()
  const known = isKnownCompanyHash(useHash())
  const canManage = user.kind === 'tenant' && user.role === 'owner'

  return (
    <>
      <header className="topbar">
        <BrandMark />
        <nav aria-label="التنقل الرئيسي">
          <a href="#/" aria-current={known && route === 'subscriptions' ? 'page' : undefined}>
            اشتراكاتي
          </a>
          <a href="#/start" aria-current={known && route === 'start' ? 'page' : undefined}>
            ابدأ تجربة
          </a>
        </nav>
        <div className="user">
          <span className="ltr">{user.email}</span>
          <span className="muted">{tenantRoleLabel[user.role] ?? user.role}</span>
          <button type="button" className="btn btn-small" onClick={() => void signOut()}>
            خروج
          </button>
        </div>
      </header>
      <main className="content">
        {!known ? (
          <NotFoundPage />
        ) : route === 'start' ? (
          <StartTrial canManage={canManage} />
        ) : (
          <MySubscriptions canManage={canManage} />
        )}
      </main>
    </>
  )
}
