import { AuthProvider } from './auth/AuthProvider.tsx'
import { LoginPage } from './auth/LoginPage.tsx'
import { RegisterPage } from './auth/RegisterPage.tsx'
import { useAuth } from './auth/auth-context.ts'
import { AdminApp } from './catalog/AdminApp.tsx'
import { CompanyApp } from './company/CompanyApp.tsx'
import { ErrorBoundary } from './components/ErrorBoundary.tsx'
import { NotFoundPage } from './components/ErrorPage.tsx'
import { OfflineBanner } from './components/OfflineBanner.tsx'
import { PublicLayout } from './components/PublicLayout.tsx'
import { Spinner } from './components/ui.tsx'
import { isKnownPublicHash } from './lib/routes.ts'
import type { PublicRoute } from './lib/routes.ts'
import { useHash, usePublicRoute } from './lib/useRoute.ts'
import { HomePage } from './public/HomePage.tsx'
import { PlansPage } from './public/PlansPage.tsx'
import { SystemPage } from './public/SystemPage.tsx'
import { SystemsPage } from './public/SystemsPage.tsx'
import { TrialPage } from './public/TrialPage.tsx'

/** الصفحة العامة لكل مسار. `switch` شامل: لو اتضاف مسار جديد من غير صفحة، الـ typecheck بيفشل. */
function PublicPage({ route }: { route: PublicRoute }) {
  switch (route) {
    case 'plans':
      return <PlansPage />
    case 'systems':
      return <SystemsPage />
    case 'system':
      return <SystemPage />
    case 'trial':
      return <TrialPage />
    case 'register':
      return <RegisterPage />
    case 'login':
      return <LoginPage />
    case 'home':
      return <HomePage />
  }
}

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
    // كل صفحة عامة (حتى الـ 404) جوه نفس الـ navbar والـ footer (ADR-0023).
    if (!isKnownPublicHash(hash)) {
      return (
        <PublicLayout>
          <main className="login">
            <div className="login-card">
              <NotFoundPage />
            </div>
          </main>
        </PublicLayout>
      )
    }
    return (
      <PublicLayout>
        <PublicPage route={publicRoute} />
      </PublicLayout>
    )
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
