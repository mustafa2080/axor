import { lazy, Suspense, useEffect } from 'react'
import { AuthProvider } from './auth/AuthProvider.tsx'
import { LoginPage } from './auth/LoginPage.tsx'
import { RegisterPage } from './auth/RegisterPage.tsx'
import { useAuth } from './auth/auth-context.ts'
import { ErrorBoundary } from './components/ErrorBoundary.tsx'
import { NotFoundPage } from './components/ErrorPage.tsx'
import { OfflineBanner } from './components/OfflineBanner.tsx'
import { PublicLayout } from './components/PublicLayout.tsx'
import { Spinner } from './components/ui.tsx'
import { pageTitle } from './lib/page-title.ts'
import type { Area } from './lib/page-title.ts'
import { isKnownPublicHash } from './lib/routes.ts'
import type { PublicRoute } from './lib/routes.ts'
import { useHash, usePublicRoute } from './lib/useRoute.ts'
import { HomePage } from './public/HomePage.tsx'
import { PlansPage } from './public/PlansPage.tsx'
import { SystemPage } from './public/SystemPage.tsx'
import { SystemsPage } from './public/SystemsPage.tsx'
import { TrialPage } from './public/TrialPage.tsx'

// لوحتا الإدارة والشركة بتتحمّلوا لما المستخدم يدخل بس، فالزائر ما بينزّلهمش (تقسيم الكود).
// لو تحميل الـ chunk فشل (انقطاع نت أو نشر جديد) الـ ErrorBoundary بيعرض صفحة الخطأ.
const AdminApp = lazy(() => import('./catalog/AdminApp.tsx').then((m) => ({ default: m.AdminApp })))
const CompanyApp = lazy(() => import('./company/CompanyApp.tsx').then((m) => ({ default: m.CompanyApp })))

function BootScreen() {
  return (
    <main className="boot" role="status">
      <Spinner />
      <span>جاري التحميل…</span>
    </main>
  )
}

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
  const area: Area =
    state.status === 'loading' ? 'loading' : state.status === 'anonymous' ? 'public' : state.user.kind === 'platform' ? 'platform' : 'company'
  const title = pageTitle(area, hash)
  // عنوان التبويب بيتغير مع كل صفحة. الـ hook قبل أي return عشان ترتيب الـ hooks يفضل ثابت.
  useEffect(() => {
    document.title = title
  }, [title])
  if (state.status === 'loading') {
    return <BootScreen />
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
  return (
    <Suspense fallback={<BootScreen />}>
      {state.user.kind === 'platform' ? <AdminApp user={state.user} /> : <CompanyApp user={state.user} />}
    </Suspense>
  )
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
