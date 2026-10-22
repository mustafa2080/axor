import { AuthProvider } from './auth/AuthProvider.tsx'
import { LoginPage } from './auth/LoginPage.tsx'
import { RegisterPage } from './auth/RegisterPage.tsx'
import { useAuth } from './auth/auth-context.ts'
import { AdminApp } from './catalog/AdminApp.tsx'
import { CompanyApp } from './company/CompanyApp.tsx'
import { usePublicRoute } from './lib/useRoute.ts'
import { PlansPage } from './public/PlansPage.tsx'

function Gate() {
  const { state } = useAuth()
  const publicRoute = usePublicRoute()
  if (state.status === 'loading') return <p className="boot muted">جاري التحميل…</p>
  if (state.status === 'anonymous') {
    if (publicRoute === 'plans') return <PlansPage />
    return publicRoute === 'register' ? <RegisterPage /> : <LoginPage />
  }
  // مستخدم المنصة = لوحة الإدارة، ومستخدم الشركة = لوحة الشركة. الخادم بيفرض الصلاحيات في الحالتين.
  return state.user.kind === 'platform' ? <AdminApp user={state.user} /> : <CompanyApp user={state.user} />
}

export default function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  )
}
