import { AuthProvider } from './auth/AuthProvider.tsx'
import { LoginPage } from './auth/LoginPage.tsx'
import { useAuth } from './auth/auth-context.ts'
import { AdminApp } from './catalog/AdminApp.tsx'

function Gate() {
  const { state } = useAuth()
  if (state.status === 'loading') return <p className="boot muted">جاري التحميل…</p>
  if (state.status === 'anonymous') return <LoginPage />
  return <AdminApp user={state.user} />
}

export default function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  )
}
