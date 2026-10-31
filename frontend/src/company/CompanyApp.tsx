import { useAuth } from '../auth/auth-context.ts'
import type { SessionUser } from '../api/client.ts'
import { NotFoundPage } from '../components/ErrorPage.tsx'
import { BrandMark } from '../components/ui.tsx'
import { tenantRoleLabel } from '../lib/labels.ts'
import { isKnownCompanyHash } from '../lib/routes.ts'
import { useCompanyRoute, useHash } from '../lib/useRoute.ts'
import { MembersPage } from './MembersPage.tsx'
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
  // قراءة الأعضاء لمالك الشركة والمدير والعضو (users:read). الخادم هو اللي بيحسم.
  const canSeeMembers = user.kind === 'tenant' && user.role !== 'read_only'

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
          {canSeeMembers ? (
            <a href="#/members" aria-current={known && route === 'members' ? 'page' : undefined}>
              الأعضاء
            </a>
          ) : null}
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
        ) : route === 'members' ? (
          <MembersPage user={user} />
        ) : (
          <MySubscriptions canManage={canManage} />
        )}
      </main>
    </>
  )
}
