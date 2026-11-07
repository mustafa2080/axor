import { useAuth } from '../auth/auth-context.ts'
import { AuditPage } from '../audit/AuditPage.tsx'
import type { SessionUser } from '../api/client.ts'
import { ErrorPage, NotFoundPage } from '../components/ErrorPage.tsx'
import { ErrorNote, Loading } from '../components/ui.tsx'
import { AppShell } from '../components/AppShell.tsx'
import type { NavItem } from '../components/AppShell.tsx'
import { BoxIcon, BuildingIcon, LayersIcon, RepeatIcon, ShieldIcon } from '../components/icons.tsx'
import { platformRoleLabel } from '../lib/labels.ts'
import { isKnownPlatformHash } from '../lib/routes.ts'
import { useHash, useRoute } from '../lib/useRoute.ts'
import { SubscriptionsPage } from '../subscriptions/SubscriptionsPage.tsx'
import { TenantsPage } from '../tenants/TenantsPage.tsx'
import { ProductsPage } from './ProductsPage.tsx'
import { PlansPage } from './PlansPage.tsx'
import { useCatalog } from './useCatalog.ts'

function AccessDenied({ onSignOut }: { onSignOut: () => void }) {
  return (
    <main className="login">
      <div className="login-card">
        <ErrorPage kind="forbidden" message="اللوحة دي لمالك ومديري المنصة بس. الحساب ده ما عندوش الصلاحية.">
          <button type="button" className="btn btn-primary" onClick={onSignOut}>
            خروج
          </button>
        </ErrorPage>
      </div>
    </main>
  )
}

function Dashboard({ user, onSignOut }: { user: SessionUser; onSignOut: () => void }) {
  const route = useRoute()
  const known = isKnownPlatformHash(useHash())
  const { state, reload } = useCatalog()
  const catalogRoute = route === 'products' || route === 'plans'

  const items: NavItem[] = [
    { href: '#/products', label: 'الأنظمة والأنشطة', icon: <BoxIcon />, current: known && route === 'products' },
    { href: '#/plans', label: 'الباقات', icon: <LayersIcon />, current: known && route === 'plans' },
    { href: '#/subscriptions', label: 'الاشتراكات', icon: <RepeatIcon />, current: known && route === 'subscriptions' },
    { href: '#/tenants', label: 'الشركات', icon: <BuildingIcon />, current: known && route === 'tenants' },
    { href: '#/audit', label: 'سجل التدقيق', icon: <ShieldIcon />, current: known && route === 'audit' },
  ]

  return (
    <AppShell
      items={items}
      user={user}
      roleLabel={platformRoleLabel[user.role] ?? user.role}
      onSignOut={onSignOut}
    >
        {!known ? <NotFoundPage /> : null}
        {known && route === 'subscriptions' ? <SubscriptionsPage /> : null}
        {known && route === 'tenants' ? <TenantsPage /> : null}
        {known && route === 'audit' ? <AuditPage /> : null}
        {known && catalogRoute && state.status === 'loading' ? <Loading /> : null}
        {known && catalogRoute && state.status === 'error' ? (
          <>
            <ErrorNote message={state.message} />
            <button type="button" className="btn" onClick={() => void reload()}>
              إعادة المحاولة
            </button>
          </>
        ) : null}
        {known && state.status === 'ready' && route === 'products' ? (
          <ProductsPage products={state.products} reload={reload} />
        ) : null}
        {known && state.status === 'ready' && route === 'plans' ? (
          <PlansPage products={state.products} reload={reload} />
        ) : null}
    </AppShell>
  )
}

/** لوحة إدارة الكتالوج. مفتوحة لمالك ومدير المنصة بس (الخادم بيفرض نفس القاعدة لكل طلب). */
export function AdminApp({ user }: { user: SessionUser }) {
  const { signOut } = useAuth()
  const allowed = user.kind === 'platform' && (user.role === 'owner' || user.role === 'admin')
  const out = () => void signOut()
  return allowed ? <Dashboard user={user} onSignOut={out} /> : <AccessDenied onSignOut={out} />
}
