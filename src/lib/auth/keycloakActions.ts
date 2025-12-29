import { Capacitor } from '@capacitor/core'
import { Browser } from '@capacitor/browser'
import { ENV } from '@/config/environment'

/**
 * Keycloak account management actions
 * @see https://docs.oidc-spa.dev/features/user-account-management
 */
export type KeycloakAction = 'UPDATE_PASSWORD' | 'UPDATE_PROFILE' | 'delete_account'

// Storage keys for PKCE state
const PKCE_VERIFIER_KEY = 'oidc_pkce_verifier'
const OIDC_STATE_KEY = 'oidc_state'

/**
 * Generates a cryptographically random string
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

/**
 * Resolves the base URL for the current platform
 */
const resolveBaseUrl = () => {
  if (Capacitor.isNativePlatform()) {
    return ENV.appNativeUrl
  }
  if (typeof window === 'undefined') {
    return ENV.appUrl
  }
  return window.location.origin
}

/**
 * Navigates to Keycloak to perform a specific account action
 * After completing the action, user is redirected back to the app
 */
export async function goToKeycloakAction(action: KeycloakAction) {
  const { oauth } = ENV
  const baseUrl = resolveBaseUrl()
  const redirectUri = `${baseUrl}${oauth.redirectPath}`

  // Generate PKCE values
  const pkce = await generatePKCE()
  const state = generateRandomString(16)

  // Store PKCE verifier and state for callback
  sessionStorage.setItem(PKCE_VERIFIER_KEY, pkce.verifier)
  sessionStorage.setItem(OIDC_STATE_KEY, state)

  // Build authorization URL with kc_action parameter and PKCE
  const authUrl = new URL(`${oauth.authority}/protocol/openid-connect/auth`)
  authUrl.searchParams.set('client_id', oauth.clientId)
  authUrl.searchParams.set('redirect_uri', redirectUri)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('scope', oauth.scope)
  authUrl.searchParams.set('state', state)
  authUrl.searchParams.set('code_challenge', pkce.challenge)
  authUrl.searchParams.set('code_challenge_method', 'S256')
  authUrl.searchParams.set('kc_action', action)

  if (Capacitor.isNativePlatform()) {
    await Browser.open({ url: authUrl.toString() })
  } else {
    window.location.href = authUrl.toString()
  }
}
