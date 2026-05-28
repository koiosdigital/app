import { ENV } from '@/config/environment'
import { useAuthStore } from '@/stores/auth/auth'

/**
 * Keycloak Account REST API client.
 * In-app profile / sessions / account management, no external browser. Calls
 * `{authority}/account/*` with the user's bearer token.
 *
 * Server-side prerequisites on Keycloak:
 *   1. koios-app client must have an "Audience" protocol mapper that adds
 *      `account` to the access token's `aud` claim.
 *   2. The built-in `account` client must list the WebView origins
 *      (capacitor://localhost, https://localhost, ionic://localhost, and the
 *      web origin) in Web Origins so CORS preflight passes.
 */

export interface AccountProfile {
  username: string
  firstName?: string
  lastName?: string
  email?: string
  emailVerified?: boolean
  attributes?: Record<string, string[]>
}

export interface AccountSessionClient {
  clientId: string
  clientName?: string
}

export interface AccountSession {
  id: string
  ipAddress?: string
  started?: number
  lastAccess?: number
  expires?: number
  browser?: string
  current?: boolean
  clients?: AccountSessionClient[]
}

/**
 * Matches Keycloak's `DeviceRepresentation`. The Account Console UI calls
 * `/sessions/devices` (not `/sessions`) because it aggregates BOTH online and
 * offline user sessions, grouped per physical device. `/sessions` alone only
 * returns online sessions and is empty whenever the user signed in with the
 * `offline_access` scope.
 */
export interface AccountDevice {
  id?: string
  ipAddress?: string
  os?: string
  osVersion?: string
  browser?: string
  device?: string
  lastAccess?: number
  current?: boolean
  mobile?: boolean
  sessions: AccountSession[]
}

const ACCOUNT_BASE = `${ENV.oauth.authority}/account`

async function authedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await useAuthStore().getAccessToken()
  if (!token) {
    throw new Error('Not signed in')
  }

  const headers = new Headers(init.headers)
  headers.set('Authorization', `Bearer ${token}`)
  headers.set('Accept', 'application/json')
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  return fetch(`${ACCOUNT_BASE}${path}`, { ...init, headers })
}

async function parseError(response: Response, fallback: string): Promise<never> {
  let message = fallback
  try {
    const body = await response.json()
    if (typeof body?.errorMessage === 'string') message = body.errorMessage
    else if (typeof body?.error === 'string') message = body.error
    else if (typeof body?.message === 'string') message = body.message
  } catch {
    // Non-JSON body — keep fallback
  }
  throw new Error(`${message} (${response.status})`)
}

export const keycloakAccountApi = {
  async getProfile(): Promise<AccountProfile> {
    const response = await authedFetch('/')
    if (!response.ok) await parseError(response, 'Failed to load profile')
    return (await response.json()) as AccountProfile
  },

  async updateProfile(updates: Partial<AccountProfile>): Promise<void> {
    // Keycloak expects the full profile object on POST; merge with the
    // current server-side profile to avoid wiping unsent fields.
    const current = await this.getProfile()
    const payload: AccountProfile = {
      ...current,
      ...updates,
      attributes: {
        ...(current.attributes ?? {}),
        ...(updates.attributes ?? {}),
      },
    }
    const response = await authedFetch('/', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
    if (!response.ok) await parseError(response, 'Failed to update profile')
  },

  async listDevices(): Promise<AccountDevice[]> {
    const response = await authedFetch('/sessions/devices')
    if (!response.ok) await parseError(response, 'Failed to load sessions')
    return (await response.json()) as AccountDevice[]
  },

  async revokeSession(id: string): Promise<void> {
    const response = await authedFetch(`/sessions/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    })
    if (!response.ok) await parseError(response, 'Failed to revoke session')
  },

  async revokeAllOtherSessions(): Promise<void> {
    // ?current=false (also the default) keeps the current session alive and
    // kills every other one. ?current=true would log the user out everywhere.
    const response = await authedFetch('/sessions?current=false', {
      method: 'DELETE',
    })
    if (!response.ok) await parseError(response, 'Failed to revoke sessions')
  },

  // Account deletion is intentionally not exposed here — the Keycloak Account
  // REST API has no DELETE endpoint (verified against the AccountRestService
  // source on `main`). Self-deletion in Keycloak runs through the
  // `delete_account` required action, which requires the user to confirm
  // their identity in Keycloak's hosted UI.
}
