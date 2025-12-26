import { Capacitor } from '@capacitor/core'
import { UserManager, WebStorageStateStore, type UserManagerSettings, type User } from 'oidc-client-ts'
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
const resolveBaseUrl = () => (Capacitor.isNativePlatform() ? ENV.appNativeUrl : resolveBrowserBaseUrl())

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
 * OIDC Client for Koios authentication
 * Handles OAuth/OIDC flows with best practices for PKCE
 */
export class KoiosOidcClient {
  /**
   * Initiates the OIDC authentication flow
   * Redirects user to the identity provider login page
   */
  static beginAuthentication() {
    return getUserManager().signinRedirect()
  }

  /**
   * Completes the OIDC authentication callback
   * Parses the callback URL and extracts tokens
   */
  static async completeAuthentication(callbackUrl?: string): Promise<OidcCallbackTokens> {
    const user = await getUserManager().signinRedirectCallback(callbackUrl)
    return mapUserToTokens(user)
  }

  /**
   * Exchanges a refresh token for a new access token
   */
  static async refreshToken(refreshToken: string): Promise<TokenResponse> {
    return exchangeRefreshToken(refreshToken)
  }

  /**
   * Initiates logout flow
   * Redirects to identity provider logout and clears session
   */
  static async logout() {
    return getUserManager().signoutRedirect()
  }

  /**
   * Removes local user state without server-side logout
   * Useful for silent cleanup
   */
  static async removeUser() {
    return getUserManager().removeUser()
  }
}
