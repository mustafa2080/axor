import { AuthProvider } from './auth/AuthProvider.tsx'
import { LoginPage } from './auth/LoginPage.tsx'
import { RegisterPage } from './auth/RegisterPage.tsx'
import { useAuth } from './auth/auth-context.ts'
import { AdminApp } from './catalog/AdminApp.tsx'
import { CompanyApp } from './company/CompanyApp.tsx'
import { ErrorBoundary } from './components/ErrorBoundary.tsx'
import { NotFoundPage } from './components/ErrorPage.tsx'
import { OfflineBanner } from './components/OfflineBanner.tsx'
import { Spinner } from './components/ui.tsx'
import { isKnownPublicHash } from './lib/routes.ts'
import { useHash, usePublicRoute } from './lib/useRoute.ts'
import { PlansPage } from './public/PlansPage.tsx'

function Gate() {
  const { state } = useAuth()
  const publicRoute = usePublicRoute()
  const hash = useHash()
  if (state.status === 'loading') {
    return (
      <main className="boot" role="status">
        <Spinner />
        <span>جاري التحميل…</span>
      </main>
    )
  }
  if (state.status === 'anonymous') {
    if (!isKnownPublicHash(hash)) {
      return (
        <main className="login">
          <div className="login-card">
            <NotFoundPage />
          </div>
        </main>
      )
    }
    if (publicRoute === 'plans') return <PlansPage />
    return publicRoute === 'register' ? <RegisterPage /> : <LoginPage />
  }
  // مستخدم المنصة = لوحة الإدارة، ومستخدم الشركة = لوحة الشركة. الخادم بيفرض الصلاحيات في الحالتين.
  return state.user.kind === 'platform' ? <AdminApp user={state.user} /> : <CompanyApp user={state.user} />
}

export default function App() {
  return (
    <ErrorBoundary>
      <OfflineBanner />
      <AuthProvider>
        <Gate />
      </AuthProvider>
    </ErrorBoundary>
  )
}
