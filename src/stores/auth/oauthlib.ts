import { Capacitor } from '@capacitor/core'
import { Oauth, ErrorCode as OauthErrorCode } from '@capawesome-team/capacitor-oauth'
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
 * Indicates the user cancelled the native OAuth flow (closed the
 * ASWebAuthenticationSession / Custom Tab). Callers can treat this as a
 * non-error to silently abandon the login attempt.
 */
export class OauthUserCancelledError extends Error {
  constructor() {
    super('User cancelled the sign-in flow')
    this.name = 'OauthUserCancelledError'
  }
}

const isUserCancelled = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') return false
  const code = (error as { code?: unknown }).code
  return code === OauthErrorCode.UserCanceled
}

const resolveBrowserBaseUrl = () => {
  if (typeof window === 'undefined') {
    return ENV.appUrl
  }
  return window.location.origin
}

const buildWebSettings = (): UserManagerSettings => {
  const { oauth } = ENV
  const baseUrl = resolveBrowserBaseUrl()

  const settings: UserManagerSettings = {
    authority: oauth.authority,
    client_id: oauth.clientId,
    redirect_uri: `${baseUrl}${oauth.redirectPath}`,
    post_logout_redirect_uri: `${baseUrl}${oauth.postLogoutRedirectPath}`,
    response_type: 'code',
    scope: oauth.scope,
    automaticSilentRenew: false,
    monitorSession: false,
    loadUserInfo: true,
    filterProtocolClaims: true,
    validateSubOnSilentRenew: true,
    includeIdTokenInSilentRenew: false,
  }

  if (typeof window !== 'undefined' && window.localStorage) {
    settings.userStore = new WebStorageStateStore({ store: window.localStorage })
  }

  return settings
}

const getUserManager = () => new UserManager(buildWebSettings())

const mapUserToTokens = (user: User): OidcCallbackTokens => ({
  accessToken: user.access_token,
  refreshToken: user.refresh_token,
  idToken: user.id_token,
  scope: user.scope,
  expiresAt: user.expires_at,
})

const encodeForm = (params: Record<string, string | undefined>) =>
  Object.entries(params)
    .filter(([, value]) => value !== undefined)
    .reduce((searchParams, [key, value]) => {
      if (value !== undefined) {
        searchParams.append(key, value)
      }
      return searchParams
    }, new URLSearchParams())

const exchangeRefreshTokenWeb = async (refreshToken: string): Promise<TokenResponse> => {
  const tokenEndpoint = `${ENV.oauth.authority}/protocol/openid-connect/token`

  const response = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
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
 * OIDC Client for Koios authentication.
 *
 * Native (iOS/Android): uses @capawesome-team/capacitor-oauth, which wraps
 * AppAuth (ASWebAuthenticationSession on iOS, Chrome Custom Tabs on Android).
 * The plugin handles PKCE, the in-app auth window, the redirect callback, and
 * token exchange internally — `login()` resolves directly with the tokens.
 *
 * Web: uses oidc-client-ts with the standard redirect flow handled by
 * LoginCallbackView.
 */
export class KoiosOidcClient {
  /**
   * Begin the OIDC authentication flow.
   *
   * Native: resolves with tokens after the user completes the in-app auth
   * window. The caller is responsible for persisting the returned tokens.
   *
   * Web: triggers a top-level redirect; resolves with `undefined`. The
   * LoginCallbackView then calls {@link completeAuthentication}.
   */
  static async beginAuthentication(): Promise<OidcCallbackTokens | undefined> {
    if (Capacitor.isNativePlatform()) {
      const { oauth } = ENV
      try {
        const result = await Oauth.login({
          issuerUrl: oauth.authority,
          clientId: oauth.clientId,
          redirectUrl: oauth.nativeRedirectUrl,
          scopes: oauth.scope.split(' ').filter(Boolean),
          prefersEphemeralWebBrowserSession: false,
        })
        return {
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
          idToken: result.idToken,
          scope: result.scope,
          expiresAt: result.accessTokenExpirationDate
            ? Math.floor(result.accessTokenExpirationDate / 1000)
            : undefined,
        }
      } catch (error) {
        if (isUserCancelled(error)) {
          throw new OauthUserCancelledError()
        }
        throw error
      }
    } else {
      await getUserManager().signinRedirect()
      return undefined
    }
  }

  /**
   * Complete the OIDC redirect callback. Web-only — on native, tokens are
   * delivered directly by {@link beginAuthentication}.
   */
  static async completeAuthentication(callbackUrl?: string): Promise<OidcCallbackTokens> {
    if (Capacitor.isNativePlatform()) {
      throw new Error('completeAuthentication is not used on native; tokens are returned by login()')
    }
    const user = await getUserManager().signinRedirectCallback(callbackUrl)
    return mapUserToTokens(user)
  }

  /**
   * Refresh the access token.
   */
  static async refreshToken(refreshToken: string): Promise<TokenResponse> {
    if (Capacitor.isNativePlatform()) {
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
    return exchangeRefreshTokenWeb(refreshToken)
  }

  /**
   * Initiates logout flow.
   *
   * Native: calls Keycloak's end-session endpoint via the plugin. The plugin
   * presents the same ASWebAuthenticationSession and dismisses on
   * post-logout redirect. If Keycloak is configured with
   * `frontchannel-logout-required: false` and an `id_token_hint` is supplied,
   * this completes without user interaction.
   *
   * Web: standard redirect flow via oidc-client-ts.
   */
  static async logout(opts: { refreshToken?: string; idToken?: string } = {}) {
    if (Capacitor.isNativePlatform()) {
      const { oauth } = ENV
      try {
        await Oauth.logout({
          issuerUrl: oauth.authority,
          idToken: opts.idToken,
          postLogoutRedirectUrl: oauth.nativePostLogoutRedirectUrl,
          prefersEphemeralWebBrowserSession: false,
        })
      } catch (error) {
        // Treat user cancel as success — the local tokens are already cleared.
        if (!isUserCancelled(error)) throw error
      }
      return
    }
    return getUserManager().signoutRedirect()
  }

  /**
   * Removes local user state without server-side logout (web only).
   */
  static async removeUser() {
    if (Capacitor.isNativePlatform()) return
    return getUserManager().removeUser()
  }
}
