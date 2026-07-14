import { Capacitor } from '@capacitor/core'
import { Oauth, ErrorCode as OauthErrorCode } from '@capawesome-team/capacitor-oauth'
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
 * Indicates the user cancelled the OAuth flow (closed the
 * ASWebAuthenticationSession / Custom Tab / popup). Callers can treat this as
 * a non-error to silently abandon the login attempt.
 */
export class OauthUserCancelledError extends Error {
  constructor() {
    super('User cancelled the sign-in flow')
    this.name = 'OauthUserCancelledError'
  }
}

export const isOauthUserCancelled = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') return false
  const code = (error as { code?: unknown }).code
  if (code === OauthErrorCode.UserCanceled) return true
  // The plugin's web implementation carries the error code in `data.code`
  // (CapacitorException convention) rather than on the error itself.
  const data = (error as { data?: { code?: unknown } }).data
  return data?.code === OauthErrorCode.UserCanceled
}

const resolveBrowserBaseUrl = () => {
  if (typeof window === 'undefined') {
    return ENV.appUrl
  }
  return window.location.origin
}

const getRedirectUrl = () => {
  const { oauth } = ENV
  return Capacitor.isNativePlatform()
    ? oauth.nativeRedirectUrl
    : `${resolveBrowserBaseUrl()}${oauth.redirectPath}`
}

const getPostLogoutRedirectUrl = () => {
  const { oauth } = ENV
  return Capacitor.isNativePlatform()
    ? oauth.nativePostLogoutRedirectUrl
    : `${resolveBrowserBaseUrl()}${oauth.postLogoutRedirectPath}`
}

type PluginTokenResult = {
  accessToken: string
  accessTokenExpirationDate?: number
  idToken?: string
  refreshToken?: string
  scope?: string
}

const mapPluginResult = (result: PluginTokenResult): OidcCallbackTokens => ({
  accessToken: result.accessToken,
  refreshToken: result.refreshToken,
  idToken: result.idToken,
  scope: result.scope,
  expiresAt: result.accessTokenExpirationDate
    ? Math.floor(result.accessTokenExpirationDate / 1000)
    : undefined,
})

/**
 * OIDC Client for Koios authentication, backed by
 * @capawesome-team/capacitor-oauth on every platform.
 *
 * Native (iOS/Android): the plugin wraps AppAuth (ASWebAuthenticationSession
 * on iOS, Chrome Custom Tabs on Android) and handles PKCE, the in-app auth
 * window, the redirect callback, and token exchange internally — `login()`
 * resolves directly with the tokens.
 *
 * Web: the plugin performs a standard full-page redirect flow with PKCE.
 * The LoginCallbackView completes it via {@link completeAuthentication},
 * which exchanges the code client-side.
 */
export class KoiosOidcClient {
  /**
   * Begin the OIDC authentication flow.
   *
   * Native: resolves with tokens after the user completes the in-app auth
   * window. The caller is responsible for persisting the returned tokens.
   *
   * Web: triggers a top-level redirect; the returned promise never settles
   * (the page navigates away). The LoginCallbackView then calls
   * {@link completeAuthentication}.
   */
  static async beginAuthentication(): Promise<OidcCallbackTokens | undefined> {
    const { oauth } = ENV
    try {
      const result = await Oauth.login({
        issuerUrl: oauth.authority,
        clientId: oauth.clientId,
        redirectUrl: getRedirectUrl(),
        scopes: oauth.scope.split(' ').filter(Boolean),
        prefersEphemeralWebBrowserSession: false,
      })
      return mapPluginResult(result)
    } catch (error) {
      if (isOauthUserCancelled(error)) {
        throw new OauthUserCancelledError()
      }
      throw error
    }
  }

  /**
   * Complete the OIDC redirect callback. Web-only — on native, tokens are
   * delivered directly by {@link beginAuthentication}. Reads the code from
   * the current URL and exchanges it (PKCE) against the token endpoint.
   */
  static async completeAuthentication(): Promise<OidcCallbackTokens> {
    if (Capacitor.isNativePlatform()) {
      throw new Error('completeAuthentication is not used on native; tokens are returned by login()')
    }
    const result = await Oauth.handleRedirectCallback()
    return mapPluginResult(result)
  }

  /**
   * Refresh the access token.
   */
  static async refreshToken(refreshToken: string): Promise<TokenResponse> {
    const { oauth } = ENV
    const result = await Oauth.refreshToken({
      issuerUrl: oauth.authority,
      clientId: oauth.clientId,
      refreshToken,
    })
    return {
      access_token: result.accessToken,
      refresh_token: result.refreshToken,
      id_token: result.idToken,
      scope: result.scope,
      token_type: result.tokenType ?? 'Bearer',
      expires_in: result.accessTokenExpirationDate
        ? Math.max(0, Math.floor((result.accessTokenExpirationDate - Date.now()) / 1000))
        : 0,
    }
  }

  /**
   * Initiates logout flow via Keycloak's end-session endpoint.
   *
   * Native: presents the end-session page in the in-app auth window and
   * dismisses on the post-logout redirect. With an `id_token_hint` supplied,
   * Keycloak completes without user interaction.
   *
   * Web: triggers a top-level redirect to the end-session endpoint; the
   * returned promise never settles (the page navigates away).
   */
  static async logout(opts: { refreshToken?: string; idToken?: string } = {}) {
    const { oauth } = ENV
    try {
      await Oauth.logout({
        issuerUrl: oauth.authority,
        idToken: opts.idToken,
        postLogoutRedirectUrl: getPostLogoutRedirectUrl(),
        prefersEphemeralWebBrowserSession: false,
      })
    } catch (error) {
      // Treat user cancel as success — the local tokens are already cleared.
      if (!isOauthUserCancelled(error)) throw error
    }
  }
}
