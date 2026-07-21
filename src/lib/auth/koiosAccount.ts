import { ENV } from '@/config/environment'
import { useAuthStore } from '@/stores/auth/auth'

/**
 * Koios SSO account API client.
 *
 * In-app profile / security / session management against the Koios auth
 * service's `/api/auth/*` endpoints (NOT Keycloak). Every request carries the
 * user's OAuth access token as a Bearer credential — the auth service's
 * `requireAuth` guard accepts it directly, so no browser round-trip is needed
 * for any of these actions.
 */

const API_BASE = `${ENV.oauth.authority}/api/auth`

// --- Response shapes (mirror the auth service handlers) --------------------

export interface AccountUser {
  id: string
  email: string
  emailVerified: boolean
  firstName: string
  lastName: string
  createdAt: number
  hasPassword: boolean
  isFederated: boolean
  isAdmin: boolean
}

export interface MeResponse {
  user: AccountUser
  roles: string[]
  session: { id: string; authMethod: string; createdAt: number; expiresAt: number } | null
}

export interface TwoFactorFactor {
  id: string
  type: string
  name: string
  verified: boolean
  createdAt: number
  lastUsedAt: number | null
}

export interface TwoFactorList {
  factors: TwoFactorFactor[]
  remainingBackupCodes: number
}

export interface AddFactorResponse {
  factorId: string
  secret: string
  setupUri: string
}

export interface AccountSession {
  id: string
  current: boolean
  authMethod: string
  ssoProvider: string | null
  ipAddress: string
  userAgent: string
  createdAt: number
  lastActivityAt: number
  expiresAt: number
}

// --- Transport -------------------------------------------------------------

async function authedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await useAuthStore().getAccessToken()
  if (!token) throw new Error('Not signed in')

  const headers = new Headers(init.headers)
  headers.set('Authorization', `Bearer ${token}`)
  headers.set('Accept', 'application/json')
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  return fetch(`${API_BASE}${path}`, { ...init, headers })
}

/**
 * Read a Nitro/h3 error body and throw a plain Error carrying the server's
 * message. h3's createError serialises as `{ statusCode, statusMessage,
 * message, data }`, so `message` holds our human text.
 */
async function parseError(response: Response, fallback: string): Promise<never> {
  let message = fallback
  try {
    const body = await response.json()
    if (typeof body?.message === 'string' && body.message) message = body.message
    else if (typeof body?.statusMessage === 'string' && body.statusMessage)
      message = body.statusMessage
    else if (typeof body?.error === 'string' && body.error) message = body.error
  } catch {
    // Non-JSON body — keep fallback.
  }
  throw new Error(message)
}

async function requestJson<T>(path: string, init: RequestInit, fallbackError: string): Promise<T> {
  const response = await authedFetch(path, init)
  if (!response.ok) await parseError(response, fallbackError)
  return (await response.json()) as T
}

// --- API -------------------------------------------------------------------

export const koiosAccountApi = {
  // Profile ----------------------------------------------------------------
  getMe(): Promise<MeResponse> {
    return requestJson<MeResponse>('/me', {}, 'Failed to load account')
  },

  updateProfile(updates: {
    firstName?: string
    lastName?: string
  }): Promise<{ user: AccountUser }> {
    return requestJson(
      '/profile',
      { method: 'PUT', body: JSON.stringify(updates) },
      'Failed to update profile',
    )
  },

  // Email ------------------------------------------------------------------
  changeEmail(payload: { email: string; currentPassword?: string }): Promise<{
    success: boolean
    message: string
    user: { email: string; emailVerified: boolean }
  }> {
    return requestJson(
      '/email',
      { method: 'PATCH', body: JSON.stringify(payload) },
      'Failed to change email',
    )
  },

  resendVerification(): Promise<{ success: boolean; message: string }> {
    return requestJson('/resend-verification', { method: 'POST' }, 'Failed to resend verification')
  },

  // Password ---------------------------------------------------------------
  changePassword(payload: {
    currentPassword: string
    newPassword: string
  }): Promise<{ success: boolean; message: string }> {
    return requestJson(
      '/change-password',
      { method: 'POST', body: JSON.stringify(payload) },
      'Failed to change password',
    )
  },

  // Two-factor -------------------------------------------------------------
  list2FA(): Promise<TwoFactorList> {
    return requestJson<TwoFactorList>('/2fa/factors', {}, 'Failed to load two-factor settings')
  },

  addFactor(name: string): Promise<AddFactorResponse> {
    return requestJson(
      '/2fa/factors',
      { method: 'POST', body: JSON.stringify({ name }) },
      'Failed to start authenticator setup',
    )
  },

  verifyFactor(id: string, code: string): Promise<{ success: boolean; backupCodes?: string[] }> {
    return requestJson(
      `/2fa/factors/${encodeURIComponent(id)}/verify`,
      { method: 'POST', body: JSON.stringify({ code }) },
      'Failed to verify code',
    )
  },

  deleteFactor(id: string): Promise<{ success: boolean; has2FA: boolean }> {
    return requestJson(
      `/2fa/factors/${encodeURIComponent(id)}`,
      { method: 'DELETE' },
      'Failed to remove authenticator',
    )
  },

  regenerateBackupCodes(password: string): Promise<{ backupCodes: string[] }> {
    return requestJson(
      '/2fa/backup-codes',
      { method: 'POST', body: JSON.stringify({ password }) },
      'Failed to regenerate backup codes',
    )
  },

  // Sessions ---------------------------------------------------------------
  listSessions(): Promise<{ sessions: AccountSession[] }> {
    return requestJson('/sessions', {}, 'Failed to load sessions')
  },

  revokeSession(id: string): Promise<{ success: boolean; revokedCurrent: boolean }> {
    return requestJson(
      `/sessions/${encodeURIComponent(id)}`,
      { method: 'DELETE' },
      'Failed to revoke session',
    )
  },

  revokeOtherSessions(): Promise<{ success: boolean; revoked: number }> {
    return requestJson('/sessions', { method: 'DELETE' }, 'Failed to revoke sessions')
  },

  // Danger zone ------------------------------------------------------------
  deactivate(password?: string): Promise<{ success: boolean; message: string }> {
    return requestJson(
      '/me/deactivate',
      { method: 'POST', body: JSON.stringify(password ? { password } : {}) },
      'Failed to deactivate account',
    )
  },
}
