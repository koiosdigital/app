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
     * Custom-scheme redirect URLs used by ASWebAuthenticationSession /
     * Chrome Custom Tabs on native. Must be registered as valid redirect URIs
     * on the Keycloak client. The scheme is declared in iOS Info.plist
     * (CFBundleURLSchemes) and Android intent filters.
     */
    nativeRedirectUrl: 'net.koiosdigital.app://oauth/callback',
    nativePostLogoutRedirectUrl: 'net.koiosdigital.app://oauth/logout',
    scope: 'openid profile email offline_access',
  },
} as const
