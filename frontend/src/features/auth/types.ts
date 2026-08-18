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
  user: AuthUser
  tenant: TenantSummary
  defaultLocation?: LocationSummary | null
  roles: string[]
}
