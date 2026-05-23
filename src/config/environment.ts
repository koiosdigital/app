/**
 * Centralized environment configuration
 */

import { Capacitor } from '@capacitor/core'

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
  googleMapsApiKey: () => {
    switch (Capacitor.getPlatform()) {
      case 'ios':
        return 'AIzaSyCjzcR3dy7ydaxO2UMLq5TkxwClrB4Kj-o'
      case 'android':
        return import.meta.env.VITE_GOOGLE_MAPS_API_KEY_ANDROID
      default:
        return 'AIzaSyD1H49aKouJALZoue_XG0SfnPdHMonUL4s'
    }
  },

  /** OAuth/OIDC Configuration */
  oauth: {
    authority: 'https://sso.koiosdigital.net/realms/kd-prod',
    clientId: 'koios-app',
    redirectPath: '/login/callback',
    postLogoutRedirectPath: '/login',
    scope: 'openid profile email offline_access',
  },
} as const
