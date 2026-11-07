import { useAuth } from '../auth/auth-context.ts'
import type { SessionUser } from '../api/client.ts'
import { NotFoundPage } from '../components/ErrorPage.tsx'
import { AppShell } from '../components/AppShell.tsx'
import type { NavItem } from '../components/AppShell.tsx'
import { PlayIcon, RepeatIcon, UsersIcon } from '../components/icons.tsx'
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

  const items: NavItem[] = [
    { href: '#/', label: 'اشتراكاتي', icon: <RepeatIcon />, current: known && route === 'subscriptions' },
    { href: '#/start', label: 'ابدأ تجربة', icon: <PlayIcon />, current: known && route === 'start' },
    ...(canSeeMembers
      ? [{ href: '#/members', label: 'الأعضاء', icon: <UsersIcon />, current: known && route === 'members' }]
      : []),
  ]

  return (
    <AppShell
      items={items}
      user={user}
      roleLabel={tenantRoleLabel[user.role] ?? user.role}
      onSignOut={() => void signOut()}
    >
        {!known ? (
          <NotFoundPage />
        ) : route === 'start' ? (
          <StartTrial canManage={canManage} />
        ) : route === 'members' ? (
          <MembersPage user={user} />
        ) : (
          <MySubscriptions canManage={canManage} />
        )}
    </AppShell>
  )
}
