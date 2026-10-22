import { useState } from 'react'
import type { FormEvent } from 'react'
import { useAuth } from './auth-context.ts'
import { ErrorNote, Field } from '../components/ui.tsx'
import { registerErrorMessage } from '../lib/labels.ts'

/** تسجيل شركة جديدة: الخادم بيعمل الشركة والمالك في transaction واحدة وبيفتح جلسة جاهزة. */
export function RegisterPage() {
  const { signUp } = useAuth()
  const [companyName, setCompanyName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await signUp({ companyName: companyName.trim(), email: email.trim(), password })
      window.location.hash = '#/start'
    } catch (caught) {
      setError(registerErrorMessage(caught))
      setBusy(false)
    }
  }

  return (
    <main className="login">
      <form className="login-card form" onSubmit={(event) => void submit(event)}>
        <h1>AXOR</h1>
        <p className="muted">سجّل شركتك وابدأ تجربة مجانية.</p>
        <Field label="اسم الشركة">
          <input
            value={companyName}
            onChange={(event) => setCompanyName(event.target.value)}
            minLength={2}
            maxLength={200}
            required
            autoFocus
          />
        </Field>
        <Field label="البريد الإلكتروني">
          <input
            className="ltr"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </Field>
        <Field label="كلمة السر" hint="12 حرف على الأقل، وما تحتويش على بريدك ولا تكون شائعة.">
          <input
            className="ltr"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            minLength={12}
            maxLength={128}
            required
          />
        </Field>
        <ErrorNote message={error} />
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'جاري التسجيل…' : 'إنشاء الحساب'}
        </button>
        <p className="muted">
          عندك حساب؟ <a href="#/login">دخول</a>
        </p>
      </form>
    </main>
  )
}
