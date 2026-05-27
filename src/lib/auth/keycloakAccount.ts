import { ENV } from '@/config/environment'
import { useAuthStore } from '@/stores/auth/auth'

/**
 * Keycloak Account REST API client.
 * Lets the signed-in user manage their own profile, sessions, and account
 * without leaving the app. Backed by `{authority}/account/*` endpoints.
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

const ACCOUNT_BASE = `${ENV.oauth.authority}/account`

async function authedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const authStore = useAuthStore()
  const token = await authStore.getAccessToken()
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

  async listSessions(): Promise<AccountSession[]> {
    const response = await authedFetch('/sessions')
    if (!response.ok) await parseError(response, 'Failed to load sessions')
    return (await response.json()) as AccountSession[]
  },

  async revokeSession(id: string): Promise<void> {
    const response = await authedFetch(`/sessions/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    })
    if (!response.ok) await parseError(response, 'Failed to revoke session')
  },

  async revokeAllOtherSessions(): Promise<void> {
    const response = await authedFetch('/sessions?current=false', {
      method: 'DELETE',
    })
    if (!response.ok) await parseError(response, 'Failed to revoke sessions')
  },

  /**
   * Deletes the signed-in user's account. Requires the realm to have the
   * "Delete Account" capability enabled and the user to hold the
   * `delete-account` role. Returns 403 otherwise.
   */
  async deleteAccount(): Promise<void> {
    const response = await authedFetch('/', { method: 'DELETE' })
    if (!response.ok) await parseError(response, 'Failed to delete account')
  },
}
