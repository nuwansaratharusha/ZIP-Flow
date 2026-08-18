const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5080'
const TOKEN_KEY = 'zipflow_access_token'

export type ApiEnvelope<T> = {
  success: boolean
  data: T
  message?: string | null
}

export function getAccessToken() {
  return localStorage.getItem(TOKEN_KEY)
}

export function setAccessToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearAccessToken() {
  localStorage.removeItem(TOKEN_KEY)
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  headers.set('Content-Type', 'application/json')

  const token = getAccessToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const response = await fetch(`${API_BASE_URL}${path}`, { ...init, headers })

  if (response.status === 401) {
    clearAccessToken()
    throw new Error('Your session is not valid. Please sign in again.')
  }

  const body = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(body?.message ?? `Request failed with status ${response.status}.`)
  }

  return body as T
}
