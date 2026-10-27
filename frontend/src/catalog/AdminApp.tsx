import { useAuth } from '../auth/auth-context.ts'
import type { SessionUser } from '../api/client.ts'
import { ErrorPage, NotFoundPage } from '../components/ErrorPage.tsx'
import { BrandMark, ErrorNote, Loading } from '../components/ui.tsx'
import { platformRoleLabel } from '../lib/labels.ts'
import { isKnownPlatformHash } from '../lib/routes.ts'
import { useHash, useRoute } from '../lib/useRoute.ts'
import { SubscriptionsPage } from '../subscriptions/SubscriptionsPage.tsx'
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

  return (
    <>
      <header className="topbar">
        <BrandMark />
        <nav aria-label="التنقل الرئيسي">
          <a href="#/products" aria-current={known && route === 'products' ? 'page' : undefined}>
            الأنظمة والأنشطة
          </a>
          <a href="#/plans" aria-current={known && route === 'plans' ? 'page' : undefined}>
            الباقات
          </a>
          <a href="#/subscriptions" aria-current={known && route === 'subscriptions' ? 'page' : undefined}>
            الاشتراكات
          </a>
        </nav>
        <div className="user">
          <span className="ltr">{user.email}</span>
          <span className="muted">{platformRoleLabel[user.role] ?? user.role}</span>
          <button type="button" className="btn btn-small" onClick={onSignOut}>
            خروج
          </button>
        </div>
      </header>
      <main className="content">
        {!known ? <NotFoundPage /> : null}
        {known && route === 'subscriptions' ? <SubscriptionsPage /> : null}
        {known && route !== 'subscriptions' && state.status === 'loading' ? <Loading /> : null}
        {known && route !== 'subscriptions' && state.status === 'error' ? (
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
      </main>
    </>
  )
}

/** لوحة إدارة الكتالوج. مفتوحة لمالك ومدير المنصة بس (الخادم بيفرض نفس القاعدة لكل طلب). */
export function AdminApp({ user }: { user: SessionUser }) {
  const { signOut } = useAuth()
  const allowed = user.kind === 'platform' && (user.role === 'owner' || user.role === 'admin')
  const out = () => void signOut()
  return allowed ? <Dashboard user={user} onSignOut={out} /> : <AccessDenied onSignOut={out} />
}
