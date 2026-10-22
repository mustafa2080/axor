import { useState } from 'react'
import type { FormEvent } from 'react'
import { useAuth } from './auth-context.ts'
import { ErrorNote, Field } from '../components/ui.tsx'
import { errorMessage } from '../lib/labels.ts'

export function LoginPage() {
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await signIn(email.trim(), password)
    } catch (caught) {
      setError(errorMessage(caught, 'login'))
      setBusy(false)
    }
  }

  return (
    <main className="login">
      <form className="login-card form" onSubmit={(event) => void submit(event)}>
        <h1>AXOR</h1>
        <p className="muted">سجّل الدخول لحسابك.</p>
        <Field label="البريد الإلكتروني">
          <input
            className="ltr"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            autoFocus
          />
        </Field>
        <Field label="كلمة السر">
          <input
            className="ltr"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </Field>
        <ErrorNote message={error} />
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'جاري الدخول…' : 'دخول'}
        </button>
        <p className="muted">
          معندكش حساب؟ <a href="#/register">سجّل شركتك</a>
        </p>
      </form>
    </main>
  )
}
