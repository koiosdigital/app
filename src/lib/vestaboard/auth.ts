// =============================================================================
// Vestaboard sign-in — Auth0 passwordless email OTP.
//
// Vestaboard's own app has no password: it posts an email to
// /passwordless/start, the user gets a 6-digit code, and that code is exchanged
// at /oauth/token for an access token (sent to the GraphQL API as
// `x-vestaboard-token`) plus a refresh token.
//
// Refresh tokens ROTATE and are single-use — replaying a spent one returns
// `invalid_grant`. The store that owns these tokens must persist the new
// refresh token from every response and coalesce concurrent refreshes.
// =============================================================================

import { nativeFetch } from '@/lib/http/nativeFetch'

const AUTH0_BASE = 'https://vestaboard.auth0.com'

/** Vestaboard's public iOS Auth0 client id, as sent by their app. */
const CLIENT_ID = '2h7PozmBi3wdH62adT1oIRdHwbcznzQc'

/** Their API audience — the token is rejected by the GraphQL API without it. */
const AUDIENCE = 'https://vestaboard.auth0.com/api/v2/'

/** `offline_access` is what gets us a refresh token. */
const SCOPE = 'offline_access openid profile email'

export interface VestaboardTokens {
  accessToken: string
  refreshToken?: string
  /** Epoch milliseconds at which `accessToken` expires. */
  expiresAt: number
}

interface Auth0TokenResponse {
  access_token: string
  refresh_token?: string
  id_token?: string
  expires_in: number
  token_type: string
}

interface Auth0Error {
  error?: string
  error_description?: string
}

export class VestaboardAuthError extends Error {
  readonly code?: string
  constructor(message: string, code?: string) {
    super(message)
    this.name = 'VestaboardAuthError'
    this.code = code
  }
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  let res: Response
  try {
    res = await nativeFetch(`${AUTH0_BASE}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(body),
    })
  } catch (err) {
    // On web this is usually CORS: Auth0 only allows origins registered on the
    // tenant, and ours is not one of them. Native builds go through
    // CapacitorHttp and are unaffected.
    throw new VestaboardAuthError(
      err instanceof Error ? err.message : 'Could not reach Vestaboard',
      'network',
    )
  }

  const text = await res.text()
  let parsed: unknown
  try {
    parsed = text ? JSON.parse(text) : {}
  } catch {
    throw new VestaboardAuthError(`Unexpected response from Vestaboard (${res.status})`)
  }

  if (!res.ok) {
    const { error, error_description } = parsed as Auth0Error
    throw new VestaboardAuthError(
      error_description || error || `Vestaboard sign-in failed (${res.status})`,
      error,
    )
  }
  return parsed as T
}

function toTokens(res: Auth0TokenResponse): VestaboardTokens {
  return {
    accessToken: res.access_token,
    refreshToken: res.refresh_token,
    expiresAt: Date.now() + res.expires_in * 1000,
  }
}

/** Ask Vestaboard to email a 6-digit sign-in code. */
export async function requestEmailCode(email: string): Promise<void> {
  await postJson('/passwordless/start', {
    client_id: CLIENT_ID,
    connection: 'email',
    email: email.trim(),
    send: 'code',
  })
}

/** Exchange the emailed code for tokens. */
export async function verifyEmailCode(email: string, code: string): Promise<VestaboardTokens> {
  const res = await postJson<Auth0TokenResponse>('/oauth/token', {
    client_id: CLIENT_ID,
    grant_type: 'http://auth0.com/oauth/grant-type/passwordless/otp',
    realm: 'email',
    username: email.trim(),
    otp: code.trim(),
    audience: AUDIENCE,
    scope: SCOPE,
  })
  return toTokens(res)
}

/**
 * Trade a refresh token for a fresh access token. The response carries a *new*
 * refresh token which must replace the old one — the old one is now spent.
 */
export async function refreshTokens(refreshToken: string): Promise<VestaboardTokens> {
  const res = await postJson<Auth0TokenResponse>('/oauth/token', {
    client_id: CLIENT_ID,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  })
  return toTokens(res)
}
