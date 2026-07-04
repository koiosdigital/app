/// <reference types="@capawesome/capacitor-live-update" />
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
  plugins: {
    LiveUpdate: {
      // Self-hosted Koios App Updates server. `serverDomain` is the bare host —
      // no scheme, no path — and the plugin builds
      // https://{serverDomain}/v1/apps/{appId}/… itself. `appId` selects the app
      // on the update server (distinct from the native bundle id above).
      appId: 'dc8b2938-7719-4e32-aa65-8cc1215a3bd0',
      serverDomain: 'app-updates.api.koios.sh',
      defaultChannel: 'production',
      // 'background' = auto-sync on load + foreground; a new bundle is downloaded
      // in the background and applied on the next cold start. Requires
      // LiveUpdate.ready() at boot (see src/main.ts) or the bundle auto-rolls-back
      // after readyTimeout.
      autoUpdateStrategy: 'background',
      readyTimeout: 10000,
      autoDeleteBundles: true,
      autoBlockRolledBackBundles: true,
      httpTimeout: 60000,
      // publicKey intentionally omitted → checksum-only integrity until bundle
      // signing is verified end-to-end. Setting it makes the device reject any
      // unsigned bundle.
    },
  },
}

export default config
