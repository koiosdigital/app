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
import { Oauth } from '@capawesome-team/capacitor-oauth'
import { isOauthUserCancelled } from '@/stores/auth/oauthlib'
import { decodeState, isStateExpired, type OAuthState } from '@/utils/oauthState'

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
