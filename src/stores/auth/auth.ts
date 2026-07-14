import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { Preferences } from '@capacitor/preferences'
import { KoiosOidcClient, OauthUserCancelledError } from './oauthlib'
import { jwtDecode } from 'jwt-decode'

const TOKEN_KEYS = {
  ACCESS: 'access_token',
  REFRESH: 'refresh_token',
  ID: 'id_token',
} as const

type JwtPayload = {
  exp: number
  sub: string
  [key: string]: unknown
}

/**
 * Helper to set or remove a preference
 */
async function setOrRemovePreference(key: string, value?: string) {
  if (value) {
    await Preferences.set({ key, value })
  } else {
    await Preferences.remove({ key })
  }
}

/**
 * Authentication store
 * Manages user authentication state and tokens
 */
export const useAuthStore = defineStore('auth', () => {
  // State
  const accessToken = ref<string>()
  const refreshToken = ref<string>()
  const idToken = ref<string>()

  // Computed
  const accessTokenExpired = computed(() => {
    if (!accessToken.value) return true

    try {
      const decoded = jwtDecode<JwtPayload>(accessToken.value)
      const currentTime = Math.floor(Date.now() / 1000)
      return decoded.exp < currentTime
    } catch (error) {
      console.error('Failed to decode access token', error)
      return true
    }
  })

  const isLoggedIn = computed(() => {
    return accessToken.value !== undefined && !accessTokenExpired.value
  })

  // Actions

  /**
   * Initialize auth state from stored tokens
   * Should be called on app startup
   */
  async function initialize() {
    const [accessResult, refreshResult, idResult] = await Promise.all([
      Preferences.get({ key: TOKEN_KEYS.ACCESS }),
      Preferences.get({ key: TOKEN_KEYS.REFRESH }),
      Preferences.get({ key: TOKEN_KEYS.ID }),
    ])

    accessToken.value = accessResult.value ?? undefined
    refreshToken.value = refreshResult.value ?? undefined
    idToken.value = idResult.value ?? undefined

    // Auto-refresh if access token is expired but refresh token exists
    if (accessTokenExpired.value && refreshToken.value) {
      await refreshAccessToken()
    }
  }

  /**
   * Persist tokens to storage and update reactive state
   */
  async function persistTokens(
    nextAccessToken?: string,
    nextRefreshToken?: string,
    nextIdToken?: string,
  ) {
    accessToken.value = nextAccessToken
    refreshToken.value = nextRefreshToken
    idToken.value = nextIdToken

    await Promise.all([
      setOrRemovePreference(TOKEN_KEYS.ACCESS, nextAccessToken),
      setOrRemovePreference(TOKEN_KEYS.REFRESH, nextRefreshToken),
      setOrRemovePreference(TOKEN_KEYS.ID, nextIdToken),
    ])
  }

  /**
   * Initiate OAuth login flow.
   *
   * Native: returns once the in-app auth window completes and tokens have
   * been persisted. Throws {@link OauthUserCancelledError} if the user closes
   * the auth window.
   *
   * Web: triggers a top-level redirect; resolution happens via the callback
   * view calling {@link completeAuthentication}.
   */
  async function beginAuthentication() {
    const tokens = await KoiosOidcClient.beginAuthentication()
    if (tokens?.accessToken) {
      await persistTokens(tokens.accessToken, tokens.refreshToken, tokens.idToken)
    }
  }

  /**
   * Complete OAuth callback and store tokens (web only).
   */
  async function completeAuthentication() {
    const tokens = await KoiosOidcClient.completeAuthentication()

    if (!tokens.accessToken) {
      throw new Error('OIDC callback missing access token')
    }

    await persistTokens(tokens.accessToken, tokens.refreshToken, tokens.idToken)
    return tokens
  }

  /**
   * Refresh the access token using the refresh token
   */
  async function refreshAccessToken(): Promise<string | undefined> {
    if (!refreshToken.value) {
      await logout()
      return undefined
    }

    try {
      const response = await KoiosOidcClient.refreshToken(refreshToken.value)
      await persistTokens(
        response.access_token,
        response.refresh_token ?? refreshToken.value,
        response.id_token ?? idToken.value,
      )
      return accessToken.value
    } catch (error) {
      console.error('Token refresh failed', error)
      await logout()
      return undefined
    }
  }

  /**
   * Get a valid access token, refreshing if necessary
   */
  async function getAccessToken(): Promise<string | undefined> {
    if (accessToken.value && !accessTokenExpired.value) {
      return accessToken.value
    }

    if (refreshToken.value) {
      return await refreshAccessToken()
    }

    return undefined
  }

  /**
   * Log out the user and clear all tokens
   */
  async function logout() {
    // Capture the id token before clearing — it's used as the id_token_hint
    // for the end-session call so Keycloak can drop the session silently
    // without asking the user to confirm.
    const idTokenForLogout = idToken.value
    await persistTokens(undefined, undefined, undefined)

    try {
      await KoiosOidcClient.logout({ idToken: idTokenForLogout })
    } catch (error) {
      console.warn('Remote logout failed', error)
    }
  }

  /**
   * Returns the current id_token (if any). Used as id_token_hint for the
   * Keycloak delete_account required-action flow — Keycloak rejects the
   * request without it.
   */
  function getIdToken(): string | undefined {
    return idToken.value
  }

  return {
    // State
    isLoggedIn,
    accessTokenExpired,

    // Actions
    initialize,
    beginAuthentication,
    completeAuthentication,
    getAccessToken,
    getIdToken,
    refreshAccessToken,
    logout,
  }
})

export { OauthUserCancelledError }
