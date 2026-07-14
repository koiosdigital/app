/**
 * OAuth flow composable for third-party "app install" OAuth2 authorization.
 *
 * The plugin presents the authorization page in place — an
 * ASWebAuthenticationSession on iOS, a popup on web — intercepts the redirect
 * back to the app's callback URL, and resolves with the raw callback URL. No
 * deep links, session persistence, or postMessage protocol involved: the app
 * never leaves the foreground, so the caller receives the authorization code
 * directly and passes it to the backend handler for the token exchange.
 */

import { ref } from 'vue'
import { Capacitor } from '@capacitor/core'
import { Oauth } from '@capawesome-team/capacitor-oauth'
import { isOauthUserCancelled } from '@/stores/auth/oauthlib'
import { decodeState, isStateExpired, type OAuthState } from '@/utils/oauthState'
import { ENV } from '@/config/environment'

/**
 * The app's OAuth callback landing URL, intercepted by Oauth.authorize.
 * Users register this URL as the redirect URI on their own OAuth clients,
 * and the redirect_uri sent for the token exchange must match it exactly.
 */
export function getOAuthCallbackUri(): string {
  if (Capacitor.isNativePlatform()) return `${ENV.appNativeUrl}/oauth/callback`
  // OAuth providers often don't accept localhost - use 127.0.0.1 instead
  const baseUrl = window.location.origin.replace('://localhost', '://127.0.0.1')
  return `${baseUrl}/oauth/callback`
}

export interface OAuthFlowOptions {
  onSuccess: (code: string, state: OAuthState) => Promise<void> | void
  onError?: (error: Error) => void
}

export function useOAuthFlow(options: OAuthFlowOptions) {
  const isConnecting = ref(false)
  const error = ref<string | null>(null)

  /**
   * Run the authorization flow for a caller-built authorization URL.
   * `redirectUrl` must be the same redirect_uri embedded in `authUrl`.
   * Resolves after onSuccess/onError has completed. A user-cancelled flow
   * resolves silently.
   */
  async function startFlow(authUrl: string, redirectUrl: string) {
    error.value = null
    isConnecting.value = true

    try {
      const sentState = new URL(authUrl).searchParams.get('state')
      if (!sentState) {
        throw new Error('Missing state parameter in auth URL')
      }

      const { callbackUrl } = await Oauth.authorize({ url: authUrl, redirectUrl })
      const params = new URL(callbackUrl).searchParams

      const oauthError = params.get('error')
      if (oauthError) {
        throw new Error(params.get('error_description') || oauthError)
      }

      const code = params.get('code')
      const returnedState = params.get('state')
      if (!code || !returnedState) {
        throw new Error('Missing authorization code or state in callback')
      }
      if (returnedState !== sentState) {
        throw new Error('State mismatch - possible CSRF attack')
      }

      const state = decodeState(returnedState)
      if (!state) {
        throw new Error('Invalid state parameter')
      }
      if (isStateExpired(state)) {
        throw new Error('OAuth session expired. Please try again.')
      }

      await options.onSuccess(code, state)
    } catch (err) {
      if (isOauthUserCancelled(err)) {
        return
      }
      const e = err instanceof Error ? err : new Error(String(err))
      error.value = e.message
      options.onError?.(e)
    } finally {
      isConnecting.value = false
    }
  }

  return {
    startFlow,
    isConnecting,
    error,
  }
}

export interface WebCallbackFlowOptions {
  onSuccess: (params: Record<string, string>) => Promise<void> | void
  onError?: (error: Error) => void
}

/**
 * Generic web-callback login for `webcallback` schema fields — provider auth
 * flows that predate OAuth2 (e.g. last.fm's token handshake). Unlike OAuth2
 * there is no `state` parameter on the authorization request: when the
 * provider echoes our callback URL verbatim (redirect_param fields), the
 * encoded state rides inside `redirectUrl` itself and round-trips with it.
 * Every query param the callback lands with (minus `state`) is handed to
 * onSuccess.
 */
export function useWebCallbackFlow(options: WebCallbackFlowOptions) {
  const isConnecting = ref(false)
  const error = ref<string | null>(null)

  /**
   * When `redirectUrl` carries an encoded `state` query param, the callback
   * must echo it back and it is verified; without one (providers that only
   * redirect to a pre-registered callback) verification is skipped.
   * `successParam` names the callback query param that must be present for
   * the login to count; omit it to accept any error-free callback.
   */
  async function startFlow(authUrl: string, redirectUrl: string, successParam?: string) {
    error.value = null
    isConnecting.value = true

    try {
      const sentState = new URL(redirectUrl).searchParams.get('state')

      const { callbackUrl } = await Oauth.authorize({ url: authUrl, redirectUrl })
      const params = new URL(callbackUrl).searchParams

      const callbackError = params.get('error')
      if (callbackError) {
        throw new Error(params.get('error_description') || callbackError)
      }

      if (sentState) {
        const returnedState = params.get('state')
        if (returnedState !== sentState) {
          throw new Error('State mismatch - possible CSRF attack')
        }

        const state = decodeState(returnedState)
        if (!state) {
          throw new Error('Invalid state parameter')
        }
        if (isStateExpired(state)) {
          throw new Error('Login session expired. Please try again.')
        }
      }

      if (successParam && !params.get(successParam)) {
        throw new Error(`Login did not complete (missing ${successParam})`)
      }

      const callbackParams: Record<string, string> = {}
      params.forEach((value, key) => {
        if (key !== 'state') callbackParams[key] = value
      })

      await options.onSuccess(callbackParams)
    } catch (err) {
      if (isOauthUserCancelled(err)) {
        return
      }
      const e = err instanceof Error ? err : new Error(String(err))
      error.value = e.message
      options.onError?.(e)
    } finally {
      isConnecting.value = false
    }
  }

  return {
    startFlow,
    isConnecting,
    error,
  }
}
