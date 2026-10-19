import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { login, logout, refreshSession, setSessionLostHandler } from '../api/client.ts'
import { AuthContext } from './auth-context.ts'
import type { AuthContextValue, AuthState } from './auth-context.ts'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' })

  useEffect(() => {
    let active = true
    setSessionLostHandler(() => setState({ status: 'anonymous' }))
    refreshSession()
      .then((session) => {
        if (!active) return
        setState(
          session === null
            ? { status: 'anonymous' }
            : { status: 'authenticated', user: session.user },
        )
      })
      .catch(() => {
        if (active) setState({ status: 'anonymous' })
      })
    return () => {
      active = false
      setSessionLostHandler(null)
    }
  }, [])

  const signIn = useCallback(async (email: string, password: string) => {
    const session = await login(email, password)
    setState({ status: 'authenticated', user: session.user })
  }, [])

  const signOut = useCallback(async () => {
    try {
      await logout()
    } finally {
      setState({ status: 'anonymous' })
    }
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({ state, signIn, signOut }),
    [state, signIn, signOut],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
