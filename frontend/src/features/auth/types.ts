export type AuthUser = {
  id: string
  email: string
  displayName: string
}

export type TenantSummary = {
  id: string
  code: string
  name: string
  currencyCode: string
  currencySymbol: string
}

export type LocationSummary = {
  id: string
  code: string
  name: string
  timeZoneId: string
}

export type LoginPayload = {
  accessToken: string
  expiresAt: string
  refreshToken: string
  refreshTokenExpiresAt: string
  user: AuthUser
  tenant: TenantSummary
  defaultLocation?: LocationSummary | null
  roles: string[]
}
