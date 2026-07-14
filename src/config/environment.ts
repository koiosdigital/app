/**
 * Centralized environment configuration
 */

const isDev = import.meta.env.DEV && false

export const ENV = {
  /** App URLs */
  appUrl: 'https://app.koiosdigital.net',
  appNativeUrl: 'https://app.koiosdigital.net',

  /** API Configuration */
  apiBaseUrl: isDev ? 'http://localhost:9090' : 'https://api.koiosdigital.net',

  /** External URLs */
  accountPortalUrl: 'https://sso.koiosdigital.net/realms/kd-prod/account',
  supportUrl: 'https://koiosdigital.net/support',
  supportEmail: 'support@koiosdigital.net',

  /** App Metadata */
  appChannel: isDev ? 'dev' : 'prod',
  appVersion: '1.0.0',

  /** Google Maps */
  googleMapsApiKey: 'AIzaSyD1H49aKouJALZoue_XG0SfnPdHMonUL4s',

  /** OAuth/OIDC Configuration */
  oauth: {
    authority: 'https://sso.koiosdigital.net/realms/kd-prod',
    clientId: 'koios-app',
    redirectPath: '/login/callback',
    postLogoutRedirectPath: '/login',
    /**
     * Redirect URLs used by ASWebAuthenticationSession (iOS) / Chrome Custom
     * Tabs (Android) on native. Must be registered as valid redirect URIs on
     * the Keycloak client.
     *
     * iOS uses HTTPS callbacks (ASWebAuthenticationSession.Callback.https,
     * iOS 17.4+): the session intercepts the redirect itself — no universal
     * link or custom scheme involved. Requires app.koiosdigital.net to be a
     * `webcredentials` associated domain with a matching AASA file.
     *
     * Android keeps the custom scheme, declared in its intent filters.
     */
    nativeRedirectUrl: 'https://app.koiosdigital.net/login/callback',
    nativePostLogoutRedirectUrl: 'https://app.koiosdigital.net/login',
    scope: 'openid profile email offline_access',
  },
} as const
