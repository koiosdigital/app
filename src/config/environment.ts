/**
 * Centralized environment configuration
 * All environment variables should be accessed through this module
 */

export const ENV = {
  /** App URLs */
  appUrl: import.meta.env.VITE_APP_URL ?? 'https://app.koiosdigital.net',
  appNativeUrl:
    import.meta.env.VITE_APP_NATIVE_URL ?? import.meta.env.VITE_APP_URL ?? 'https://app.koiosdigital.net',

  /** API Configuration */
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? 'https://api.koiosdigital.net',

  /** External URLs */
  accountPortalUrl:
    import.meta.env.VITE_ACCOUNT_PORTAL_URL ??
    'https://sso.koiosdigital.net/realms/kd-prod/account',
  supportUrl: import.meta.env.VITE_SUPPORT_URL ?? 'https://koiosdigital.net/support',
  supportEmail: import.meta.env.VITE_SUPPORT_EMAIL ?? 'support@koiosdigital.net',

  /** App Metadata */
  appChannel: import.meta.env.VITE_APP_CHANNEL ?? 'prod',
  appVersion: import.meta.env.VITE_APP_VERSION ?? '1.0.0',

  /** OAuth/OIDC Configuration */
  oauth: {
    authority: 'https://sso.koiosdigital.net/realms/kd-prod',
    clientId: 'koios-app',
    redirectPath: '/login/callback',
    postLogoutRedirectPath: '/login',
    scope: 'openid profile email offline_access',
  },
} as const

/** Check if running in development mode */
export const isDev = import.meta.env.DEV

/** Check if running in production mode */
export const isProd = import.meta.env.PROD
