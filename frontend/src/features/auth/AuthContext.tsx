import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import {
  apiRequest,
  clearSessionTokens,
  getAccessToken,
  getRefreshToken,
  setSessionTokens,
  type ApiEnvelope,
} from '../../lib/api'
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
  login: (email: string, password: string) => Promise<string[]>
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
        // apiRequest silently refreshes the access token on a 401 before
        // giving up, so a session survives across an 8+ hour shift as long
        // as the refresh token is still valid.
        const me = await apiRequest<ApiEnvelope<Session>>('/api/me')
        setSession(me.data)
      } catch {
        clearSessionTokens()
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

    setSessionTokens(result.data.accessToken, result.data.refreshToken)
    setSession({
      user: result.data.user,
      tenant: result.data.tenant,
      defaultLocation: result.data.defaultLocation,
      roles: result.data.roles,
    })

    return result.data.roles
  }

  const logout = () => {
    const refreshToken = getRefreshToken()
    clearSessionTokens()
    setSession(null)

    if (refreshToken) {
      // Best-effort server-side revocation; don't block the UI on it.
      void apiRequest('/api/auth/logout', {
        method: 'POST',
        body: JSON.stringify({ refreshToken }),
      }).catch(() => {})
    }
  }

  const value = useMemo(() => ({ session, loading, login, logout }), [session, loading])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside AuthProvider.')
  return value
}
