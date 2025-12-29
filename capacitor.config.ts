import type { CapacitorConfig } from '@capacitor/cli'

const UNIVERSAL_LINK_HOST = process.env.KOIOS_UNIVERSAL_LINK_HOST ?? 'app.koiosdigital.net'

const config: CapacitorConfig = {
  appId: 'net.koiosdigital.app',
  appName: 'Koios Digital',
  webDir: 'dist',
  server: {
    hostname: 'localhost',
    iosScheme: 'https',
    androidScheme: 'https',
    allowNavigation: [UNIVERSAL_LINK_HOST],
  },
  ios: {
    contentInset: 'automatic',
    backgroundColor: '#000000',
  },
  android: {
    allowMixedContent: false,
  },
}

export default config
