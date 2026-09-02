const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5080'
const TOKEN_KEY = 'zipflow_access_token'
const REFRESH_TOKEN_KEY = 'zipflow_refresh_token'

export type ApiEnvelope<T> = {
  success: boolean
  data: T
  message?: string | null
}

type RefreshEnvelope = ApiEnvelope<{ accessToken: string; refreshToken: string }>

export function getAccessToken() {
  return localStorage.getItem(TOKEN_KEY)
}

export function setAccessToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearAccessToken() {
  localStorage.removeItem(TOKEN_KEY)
}

export function getRefreshToken() {
  return localStorage.getItem(REFRESH_TOKEN_KEY)
}

export function setRefreshToken(token: string) {
  localStorage.setItem(REFRESH_TOKEN_KEY, token)
}

export function clearRefreshToken() {
  localStorage.removeItem(REFRESH_TOKEN_KEY)
}

export function setSessionTokens(accessToken: string, refreshToken: string) {
  setAccessToken(accessToken)
  setRefreshToken(refreshToken)
}

export function clearSessionTokens() {
  clearAccessToken()
  clearRefreshToken()
}

// Dedupe concurrent refresh attempts: if several requests 401 at once, only
// one call to /api/auth/refresh should go out; everyone else waits on it.
let refreshInFlight: Promise<string> | null = null

async function refreshAccessToken(): Promise<string> {
  if (refreshInFlight) return refreshInFlight

  refreshInFlight = (async () => {
    const refreshToken = getRefreshToken()
    if (!refreshToken) {
      throw new Error('No refresh token available.')
    }

    const response = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    })

    if (!response.ok) {
      throw new Error('Session refresh failed.')
    }

    const body = (await response.json().catch(() => null)) as RefreshEnvelope | null
    if (!body?.data?.accessToken || !body.data.refreshToken) {
      throw new Error('Session refresh failed.')
    }

    setSessionTokens(body.data.accessToken, body.data.refreshToken)
    return body.data.accessToken
  })()

  try {
    return await refreshInFlight
  } finally {
    refreshInFlight = null
  }
}

async function performRequest(path: string, init: RequestInit, token: string | null) {
  const headers = new Headers(init.headers)
  headers.set('Content-Type', 'application/json')
  if (token) headers.set('Authorization', `Bearer ${token}`)

  return fetch(`${API_BASE_URL}${path}`, { ...init, headers })
}

// File upload: like apiRequest but sends FormData (no forced JSON content-type,
// so the browser sets the multipart boundary). Same auth + refresh behaviour.
async function performUpload(path: string, formData: FormData, token: string | null) {
  const headers = new Headers()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  return fetch(`${API_BASE_URL}${path}`, { method: 'POST', body: formData, headers })
}

export async function apiUpload<T>(path: string, formData: FormData): Promise<T> {
  let response = await performUpload(path, formData, getAccessToken())

  if (response.status === 401) {
    try {
      const newAccessToken = await refreshAccessToken()
      response = await performUpload(path, formData, newAccessToken)
    } catch {
      clearSessionTokens()
      throw new Error('Your session is not valid. Please sign in again.')
    }
  }

  const body = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(body?.message ?? `Request failed with status ${response.status}.`)
  }
  return body as T
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response = await performRequest(path, init, getAccessToken())

  if (response.status === 401) {
    // Access token may simply have expired mid-shift — try a silent refresh
    // and retry the original request once before giving up on the session.
    try {
      const newAccessToken = await refreshAccessToken()
      response = await performRequest(path, init, newAccessToken)
    } catch {
      clearSessionTokens()
      throw new Error('Your session is not valid. Please sign in again.')
    }

    if (response.status === 401) {
      clearSessionTokens()
      throw new Error('Your session is not valid. Please sign in again.')
    }
  }

  const body = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(body?.message ?? `Request failed with status ${response.status}.`)
  }

  return body as T
}
