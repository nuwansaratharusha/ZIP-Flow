import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { apiRequest, clearAccessToken, getAccessToken, setAccessToken, type ApiEnvelope } from '../../lib/api'
import type { AuthUser, LocationSummary, LoginPayload, TenantSummary } from './types'

type Session = {
  user: AuthUser
  tenant: TenantSummary
  defaultLocation?: LocationSummary | null
  roles: string[]
}

type AuthContextValue = {
  session: Session | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const restore = async () => {
      if (!getAccessToken()) {
        setLoading(false)
        return
      }

      try {
        const me = await apiRequest<ApiEnvelope<Session>>('/api/me')
        setSession(me.data)
      } catch {
        clearAccessToken()
      } finally {
        setLoading(false)
      }
    }

    void restore()
  }, [])

  const login = async (email: string, password: string) => {
    const result = await apiRequest<ApiEnvelope<LoginPayload>>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    })

    setAccessToken(result.data.accessToken)
    setSession({
      user: result.data.user,
      tenant: result.data.tenant,
      defaultLocation: result.data.defaultLocation,
      roles: result.data.roles,
    })
  }

  const logout = () => {
    clearAccessToken()
    setSession(null)
  }

  const value = useMemo(() => ({ session, loading, login, logout }), [session, loading])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside AuthProvider.')
  return value
}
