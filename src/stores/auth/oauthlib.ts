import { Capacitor } from '@capacitor/core'
import { InAppBrowser } from '@capacitor/inappbrowser'
import {
  UserManager,
  WebStorageStateStore,
  type UserManagerSettings,
  type User,
} from 'oidc-client-ts'
import { ENV } from '@/config/environment'

type TokenResponse = {
  access_token: string
  refresh_token?: string
  expires_in: number
  id_token?: string
  token_type: string
  scope?: string
}

export type OidcCallbackTokens = {
  accessToken: string
  refreshToken?: string
  expiresAt?: number
  idToken?: string
  scope?: string
}

/**
 * Resolves the base URL for browser (web) environments
 */
const resolveBrowserBaseUrl = () => {
  if (typeof window === 'undefined') {
    return ENV.appUrl
  }
  return window.location.origin
}

/**
 * Resolves the base URL for the current platform (native or web)
 */
const resolveBaseUrl = () =>
  Capacitor.isNativePlatform() ? ENV.appNativeUrl : resolveBrowserBaseUrl()

/**
 * Builds OIDC UserManager settings with proper PKCE configuration
 */
const buildSettings = (): UserManagerSettings => {
  const baseUrl = resolveBaseUrl()
  const { oauth } = ENV

  const settings: UserManagerSettings = {
    authority: oauth.authority,
    client_id: oauth.clientId,
    redirect_uri: `${baseUrl}${oauth.redirectPath}`,
    post_logout_redirect_uri: `${baseUrl}${oauth.postLogoutRedirectPath}`,
    response_type: 'code',
    scope: oauth.scope,

    // PKCE best practices
    automaticSilentRenew: false, // We handle refresh manually
    monitorSession: false, // Not needed for mobile/SPA
    loadUserInfo: true,

    // Additional security settings
    filterProtocolClaims: true,
    validateSubOnSilentRenew: true,
    includeIdTokenInSilentRenew: false,
  }

  // Use localStorage for web state storage
  if (typeof window !== 'undefined' && window.localStorage) {
    settings.userStore = new WebStorageStateStore({ store: window.localStorage })
  }

  return settings
}

/**
 * Gets a fresh UserManager instance with current settings
 */
const getUserManager = () => new UserManager(buildSettings())

/**
 * Maps OIDC User object to our internal token structure
 */
const mapUserToTokens = (user: User): OidcCallbackTokens => ({
  accessToken: user.access_token,
  refreshToken: user.refresh_token,
  idToken: user.id_token,
  scope: user.scope,
  expiresAt: user.expires_at,
})

/**
 * Encodes form data for OAuth token requests
 */
const encodeForm = (params: Record<string, string | undefined>) =>
  Object.entries(params)
    .filter(([, value]) => value !== undefined)
    .reduce((searchParams, [key, value]) => {
      if (value !== undefined) {
        searchParams.append(key, value)
      }
      return searchParams
    }, new URLSearchParams())

/**
 * Exchanges a refresh token for new access token
 */
const exchangeRefreshToken = async (refreshToken: string): Promise<TokenResponse> => {
  const tokenEndpoint = `${ENV.oauth.authority}/protocol/openid-connect/token`

  const response = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: encodeForm({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: ENV.oauth.clientId,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Failed to refresh token: ${response.status} ${errorText}`)
  }

  return (await response.json()) as TokenResponse
}

/**
 * Generates a cryptographically random string for PKCE and state
 */
function generateRandomString(length: number): string {
  const array = new Uint8Array(length)
  crypto.getRandomValues(array)
  return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

/**
 * Generates PKCE code verifier and challenge
 */
async function generatePKCE(): Promise<{ verifier: string; challenge: string }> {
  const verifier = generateRandomString(32)
  const encoder = new TextEncoder()
  const data = encoder.encode(verifier)
  const hash = await crypto.subtle.digest('SHA-256', data)
  const challenge = btoa(String.fromCharCode(...new Uint8Array(hash)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
  return { verifier, challenge }
}

// Storage keys for PKCE state
const PKCE_VERIFIER_KEY = 'oidc_pkce_verifier'
const OIDC_STATE_KEY = 'oidc_state'

/**
 * OIDC Client for Koios authentication
 * Handles OAuth/OIDC flows with best practices for PKCE
 */
export class KoiosOidcClient {
  /**
   * Initiates the OIDC authentication flow
   * On native: Opens in-app browser, deep link brings user back
   * On web: Standard redirect flow
   */
  static async beginAuthentication() {
    if (Capacitor.isNativePlatform()) {
      // Native: Build authorization URL manually with PKCE and open in-app browser
      const { oauth } = ENV
      const baseUrl = resolveBaseUrl()
      const redirectUri = `${baseUrl}${oauth.redirectPath}`

      // Generate PKCE values
      const pkce = await generatePKCE()
      const state = generateRandomString(16)

      // Store PKCE verifier and state for callback
      sessionStorage.setItem(PKCE_VERIFIER_KEY, pkce.verifier)
      sessionStorage.setItem(OIDC_STATE_KEY, state)

      // Build authorization URL
      const authUrl = new URL(`${oauth.authority}/protocol/openid-connect/auth`)
      authUrl.searchParams.set('client_id', oauth.clientId)
      authUrl.searchParams.set('redirect_uri', redirectUri)
      authUrl.searchParams.set('response_type', 'code')
      authUrl.searchParams.set('scope', oauth.scope)
      authUrl.searchParams.set('state', state)
      authUrl.searchParams.set('code_challenge', pkce.challenge)
      authUrl.searchParams.set('code_challenge_method', 'S256')

      // Open in external browser (Safari) so universal links work on redirect
      await InAppBrowser.openInExternalBrowser({ url: authUrl.toString() })
      // Universal link will handle the callback via appUrlOpen listener in main.ts
    } else {
      // Web: Standard redirect using oidc-client-ts
      return getUserManager().signinRedirect()
    }
  }

  /**
   * Completes the OIDC authentication callback
   * Parses the callback URL and extracts tokens
   */
  static async completeAuthentication(callbackUrl?: string): Promise<OidcCallbackTokens> {
    if (Capacitor.isNativePlatform() && callbackUrl) {
      // Native: Handle callback manually with stored PKCE verifier
      const url = new URL(callbackUrl)
      const code = url.searchParams.get('code')
      const state = url.searchParams.get('state')

      // Verify state
      const storedState = sessionStorage.getItem(OIDC_STATE_KEY)
      if (state !== storedState) {
        throw new Error('Invalid state parameter')
      }

      // Get stored PKCE verifier
      const verifier = sessionStorage.getItem(PKCE_VERIFIER_KEY)
      if (!verifier) {
        throw new Error('PKCE verifier not found')
      }

      // Clean up stored values
      sessionStorage.removeItem(PKCE_VERIFIER_KEY)
      sessionStorage.removeItem(OIDC_STATE_KEY)

      if (!code) {
        throw new Error('Authorization code not found in callback')
      }

      // Exchange code for tokens
      const { oauth } = ENV
      const baseUrl = resolveBaseUrl()
      const tokenEndpoint = `${oauth.authority}/protocol/openid-connect/token`

      const response = await fetch(tokenEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: encodeForm({
          grant_type: 'authorization_code',
          client_id: oauth.clientId,
          redirect_uri: `${baseUrl}${oauth.redirectPath}`,
          code,
          code_verifier: verifier,
        }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Token exchange failed: ${response.status} ${errorText}`)
      }

      const tokens = (await response.json()) as TokenResponse

      // System browser closes automatically when universal link triggers the app

      return {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        idToken: tokens.id_token,
        expiresAt: tokens.expires_in
          ? Math.floor(Date.now() / 1000) + tokens.expires_in
          : undefined,
        scope: tokens.scope,
      }
    } else {
      // Web: Use oidc-client-ts
      const user = await getUserManager().signinRedirectCallback(callbackUrl)
      return mapUserToTokens(user)
    }
  }

  /**
   * Exchanges a refresh token for a new access token
   */
  static async refreshToken(refreshToken: string): Promise<TokenResponse> {
    return exchangeRefreshToken(refreshToken)
  }

  /**
   * Initiates logout flow
   * On native: Opens in-app browser for IdP logout
   * On web: Standard redirect flow
   */
  static async logout() {
    if (Capacitor.isNativePlatform()) {
      // Native: Build logout URL and open in-app browser
      const { oauth } = ENV
      const baseUrl = resolveBaseUrl()

      const logoutUrl = new URL(`${oauth.authority}/protocol/openid-connect/logout`)
      logoutUrl.searchParams.set('client_id', oauth.clientId)
      logoutUrl.searchParams.set(
        'post_logout_redirect_uri',
        `${baseUrl}${oauth.postLogoutRedirectPath}`,
      )

      // Open in external browser (Safari) so universal links work on redirect
      await InAppBrowser.openInExternalBrowser({ url: logoutUrl.toString() })
      // User state is cleared by the auth store after this call
    } else {
      // Web: Standard redirect
      return getUserManager().signoutRedirect()
    }
  }

  /**
   * Removes local user state without server-side logout
   * Useful for silent cleanup
   */
  static async removeUser() {
    return getUserManager().removeUser()
  }
}
