import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'net.koiosdigital.app',
  appName: 'Koios Digital',
  webDir: 'dist',
  server: {
    hostname: 'localhost',
    iosScheme: 'https',
    androidScheme: 'https',
    allowNavigation: ['app.koiosdigital.net'],
  },
  ios: {
    contentInset: 'never',
    backgroundColor: '#000000',
  },
  android: {
    allowMixedContent: false,
  },
}

export default config
