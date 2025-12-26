import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { Preferences } from '@capacitor/preferences'
import { KoiosOidcClient } from './oauthlib'
import { jwtDecode } from 'jwt-decode'

const TOKEN_KEYS = {
  ACCESS: 'access_token',
  REFRESH: 'refresh_token',
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
    const [accessResult, refreshResult] = await Promise.all([
      Preferences.get({ key: TOKEN_KEYS.ACCESS }),
      Preferences.get({ key: TOKEN_KEYS.REFRESH }),
    ])

    accessToken.value = accessResult.value ?? undefined
    refreshToken.value = refreshResult.value ?? undefined

    // Auto-refresh if access token is expired but refresh token exists
    if (accessTokenExpired.value && refreshToken.value) {
      await refreshAccessToken()
    }
  }

  /**
   * Persist tokens to storage and update reactive state
   */
  async function persistTokens(nextAccessToken?: string, nextRefreshToken?: string) {
    accessToken.value = nextAccessToken
    refreshToken.value = nextRefreshToken

    await Promise.all([
      setOrRemovePreference(TOKEN_KEYS.ACCESS, nextAccessToken),
      setOrRemovePreference(TOKEN_KEYS.REFRESH, nextRefreshToken),
    ])
  }

  /**
   * Initiate OAuth login flow
   */
  async function beginAuthentication() {
    await KoiosOidcClient.beginAuthentication()
  }

  /**
   * Complete OAuth callback and store tokens
   */
  async function completeAuthentication(callbackUrl?: string) {
    const tokens = await KoiosOidcClient.completeAuthentication(callbackUrl)

    if (!tokens.accessToken) {
      throw new Error('OIDC callback missing access token')
    }

    await persistTokens(tokens.accessToken, tokens.refreshToken)
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
      await persistTokens(response.access_token, response.refresh_token ?? refreshToken.value)
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
    await persistTokens(undefined, undefined)

    try {
      await KoiosOidcClient.logout()
    } catch (error) {
      console.warn('Remote logout failed', error)
    }
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
    refreshAccessToken,
    logout,
  }
})
