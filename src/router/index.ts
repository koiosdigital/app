import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import LoginView from '@/views/LoginView.vue'
import LoginCallbackView from '@/views/LoginCallbackView.vue'
import OAuthCallbackView from '@/views/OAuthCallbackView.vue'

// Everything off the launch path is code-split. The initial bundle used to
// carry every view (BLE provisioning, Matrx editors with the Google Maps and
// colour-picker deps, Nemoto, Tranquil, clocks): ~770 KB of JS parsed before
// the device list could paint. Routes resolve their chunk inside the
// navigation, so <component :is> still receives a resolved component and the
// page transition needs no Suspense.
const SettingsView = () => import('@/views/SettingsView.vue')
const SetupNewView = () => import('@/views/setup/SetupNewView.vue')
const SetupBindDpopView = () => import('@/views/setup/SetupBindDpopView.vue')
const SetupCryptoView = () => import('@/views/setup/SetupCryptoView.vue')
const SetupFailedView = () => import('@/views/setup/SetupFailedView.vue')
const SetupNetworkView = () => import('@/views/setup/SetupNetworkView.vue')
const SetupSuccessfulView = () => import('@/views/setup/SetupSuccessfulView.vue')
const SetupLicenseCallbackView = () => import('@/views/setup/SetupLicenseCallbackView.vue')
const ShareAcceptView = () => import('@/views/ShareAcceptView.vue')
const MatrxDeviceView = () => import('@/views/matrx/MatrxDeviceView.vue')
const MatrxDeviceSettingsView = () => import('@/views/matrx/MatrxDeviceSettingsView.vue')
const MatrxAppsView = () => import('@/views/matrx/MatrxAppsView.vue')
const InstallationEditorView = () => import('@/views/matrx/InstallationEditorView.vue')
const NemotoDeviceView = () => import('@/views/nemoto/NemotoDeviceView.vue')
const NemotoDeviceSettingsView = () => import('@/views/nemoto/NemotoDeviceSettingsView.vue')
const NemotoPresetsView = () => import('@/views/nemoto/NemotoPresetsView.vue')
const NemotoPresetEditorView = () => import('@/views/nemoto/NemotoPresetEditorView.vue')
const NemotoMessageView = () => import('@/views/nemoto/NemotoMessageView.vue')
const NemotoInspirationView = () => import('@/views/nemoto/NemotoInspirationView.vue')
const NemotoMessageHistoryView = () => import('@/views/nemoto/NemotoMessageHistoryView.vue')
const NemotoSchedulesView = () => import('@/views/nemoto/NemotoSchedulesView.vue')
const TranquilDeviceView = () => import('@/views/tranquil/TranquilDeviceView.vue')
const TranquilPatternsView = () => import('@/views/tranquil/TranquilPatternsView.vue')
const TranquilPatternDetailView = () => import('@/views/tranquil/TranquilPatternDetailView.vue')
const TranquilPlaylistsView = () => import('@/views/tranquil/TranquilPlaylistsView.vue')
const TranquilPlaylistEditorView = () => import('@/views/tranquil/TranquilPlaylistEditorView.vue')
const TranquilLightingView = () => import('@/views/tranquil/TranquilLightingView.vue')
const TranquilStoreView = () => import('@/views/tranquil/TranquilStoreView.vue')
const TranquilStorePlaylistView = () => import('@/views/tranquil/TranquilStorePlaylistView.vue')
const TranquilSettingsView = () => import('@/views/tranquil/TranquilSettingsView.vue')
const TranquilSchedulesView = () => import('@/views/tranquil/TranquilSchedulesView.vue')
const ClockDeviceView = () => import('@/views/clock/ClockDeviceView.vue')
import { useAuthStore } from '@/stores/auth/auth'
import { useTranquilLocalStore } from '@/stores/tranquilLocal'
import { useTranquilCloudStore } from '@/stores/tranquilCloud'
import { useClockLocalStore } from '@/stores/clockLocal'

const router = createRouter({
  history: createWebHistory('/'),
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomeView,
    },
    {
      path: '/login',
      name: 'login',
      component: LoginView,
    },
    {
      path: '/login/callback',
      name: 'login-callback',
      component: LoginCallbackView,
    },
    {
      path: '/setup/new',
      name: 'setup-new',
      component: SetupNewView,
    },
    {
      path: '/setup/bind_dpop',
      name: 'setup-bind-dpop',
      component: SetupBindDpopView,
    },
    {
      path: '/setup/crypto',
      name: 'setup-crypto',
      component: SetupCryptoView,
    },
    {
      path: '/setup/failed',
      name: 'setup-failed',
      component: SetupFailedView,
    },
    {
      path: '/setup/network',
      name: 'setup-network',
      component: SetupNetworkView,
    },
    {
      path: '/setup/successful',
      name: 'setup-successful',
      component: SetupSuccessfulView,
    },
    {
      path: '/setup/license_callback',
      name: 'setup-license-callback',
      component: SetupLicenseCallbackView,
    },
    {
      path: '/oauth/callback',
      name: 'oauth-callback',
      component: OAuthCallbackView,
    },
    {
      path: '/share/accept',
      name: 'share-accept',
      component: ShareAcceptView,
    },
    {
      path: '/settings',
      name: 'settings',
      component: SettingsView,
    },
    {
      path: '/matrx/:id',
      name: 'matrx-device',
      component: MatrxDeviceView,
    },
    {
      path: '/matrx/:id/settings',
      name: 'matrx-device-settings',
      component: MatrxDeviceSettingsView,
    },
    {
      path: '/matrx/:id/apps',
      name: 'matrx-apps',
      component: MatrxAppsView,
    },
    {
      path: '/matrx/:id/apps/:app_id',
      name: 'matrx-install-app',
      component: InstallationEditorView,
      props: (route) => ({
        deviceId: route.params.id,
        appId: route.params.app_id,
        mode: 'install',
      }),
    },
    {
      path: '/matrx/:id/installations/:installation_id',
      name: 'matrx-edit-installation',
      component: InstallationEditorView,
      props: (route) => ({
        deviceId: route.params.id,
        installationId: route.params.installation_id,
        mode: 'edit',
      }),
    },
    {
      path: '/nemoto/:id',
      name: 'nemoto-device',
      component: NemotoDeviceView,
    },
    {
      path: '/nemoto/:id/settings',
      name: 'nemoto-device-settings',
      component: NemotoDeviceSettingsView,
    },
    {
      path: '/nemoto/:id/presets',
      name: 'nemoto-presets',
      component: NemotoPresetsView,
    },
    {
      path: '/nemoto/:id/presets/new',
      name: 'nemoto-preset-new',
      component: NemotoPresetEditorView,
      props: (route) => ({ deviceId: route.params.id, mode: 'create' }),
    },
    {
      path: '/nemoto/:id/presets/:preset_id',
      name: 'nemoto-preset-edit',
      component: NemotoPresetEditorView,
      props: (route) => ({
        deviceId: route.params.id,
        presetId: Number(route.params.preset_id),
        mode: 'edit',
      }),
    },
    {
      path: '/nemoto/:id/message',
      name: 'nemoto-message',
      component: NemotoMessageView,
      props: (route) => ({ deviceId: route.params.id }),
    },
    {
      path: '/nemoto/:id/history',
      name: 'nemoto-message-history',
      component: NemotoMessageHistoryView,
      props: (route) => ({ deviceId: route.params.id }),
    },
    {
      path: '/nemoto/:id/inspiration',
      name: 'nemoto-inspiration',
      component: NemotoInspirationView,
      props: (route) => ({ deviceId: route.params.id }),
    },
    {
      path: '/nemoto/:id/schedules',
      name: 'nemoto-schedules',
      component: NemotoSchedulesView,
    },
    {
      // LAN-direct Tranquil table, keyed by its mDNS service name. The active
      // connection is set up in HomeView.openLocalDevice before navigation.
      path: '/tranquil/local/:id',
      name: 'tranquil-local-device',
      component: TranquilDeviceView,
    },
    {
      path: '/tranquil/local/:id/patterns',
      name: 'tranquil-local-patterns',
      component: TranquilPatternsView,
    },
    {
      path: '/tranquil/local/:id/patterns/:uuid',
      name: 'tranquil-local-pattern-detail',
      component: TranquilPatternDetailView,
    },
    {
      path: '/tranquil/local/:id/playlists',
      name: 'tranquil-local-playlists',
      component: TranquilPlaylistsView,
    },
    {
      path: '/tranquil/local/:id/playlists/:uuid',
      name: 'tranquil-local-playlist-editor',
      component: TranquilPlaylistEditorView,
    },
    {
      path: '/tranquil/local/:id/lighting',
      name: 'tranquil-local-lighting',
      component: TranquilLightingView,
    },
    {
      path: '/tranquil/local/:id/store',
      name: 'tranquil-local-store',
      component: TranquilStoreView,
    },
    {
      path: '/tranquil/local/:id/store/playlists/:uuid',
      name: 'tranquil-local-store-playlist',
      component: TranquilStorePlaylistView,
    },
    {
      path: '/tranquil/local/:id/settings',
      name: 'tranquil-local-settings',
      component: TranquilSettingsView,
    },
    {
      path: '/tranquil/local/:id/schedules',
      name: 'tranquil-local-schedules',
      component: TranquilSchedulesView,
    },
    // Cloud control (off-LAN) reuses the same views via the mode-aware
    // useTranquilControl() resolver. Lighting works over the cloud too (the
    // device mirrors its LED state); motion config / calibration (settings)
    // stay LAN-only, so they have no cloud route.
    {
      path: '/tranquil/cloud/:id/lighting',
      name: 'tranquil-cloud-lighting',
      component: TranquilLightingView,
    },
    {
      path: '/tranquil/cloud/:id/schedules',
      name: 'tranquil-cloud-schedules',
      component: TranquilSchedulesView,
    },
    {
      path: '/tranquil/cloud/:id',
      name: 'tranquil-cloud-device',
      component: TranquilDeviceView,
    },
    {
      path: '/tranquil/cloud/:id/patterns',
      name: 'tranquil-cloud-patterns',
      component: TranquilPatternsView,
    },
    {
      path: '/tranquil/cloud/:id/patterns/:uuid',
      name: 'tranquil-cloud-pattern-detail',
      component: TranquilPatternDetailView,
    },
    {
      path: '/tranquil/cloud/:id/playlists',
      name: 'tranquil-cloud-playlists',
      component: TranquilPlaylistsView,
    },
    {
      path: '/tranquil/cloud/:id/playlists/:uuid',
      name: 'tranquil-cloud-playlist-editor',
      component: TranquilPlaylistEditorView,
    },
    {
      path: '/tranquil/cloud/:id/store',
      name: 'tranquil-cloud-store',
      component: TranquilStoreView,
    },
    {
      path: '/tranquil/cloud/:id/store/playlists/:uuid',
      name: 'tranquil-cloud-store-playlist',
      component: TranquilStorePlaylistView,
    },
    {
      // LAN-direct clock (nixie/wordclock/fibonacci), keyed by its mDNS service
      // name. The active connection is set up in HomeView.openLocalDevice.
      path: '/clock/local/:id',
      name: 'clock-local-device',
      component: ClockDeviceView,
    },
  ],
})

const PUBLIC_PATHS = new Set([
  '/login',
  '/login/callback',
  '/setup/license_callback',
  '/oauth/callback',
])
let authInitialized = false

router.beforeEach(async (to) => {
  const authStore = useAuthStore()

  if (!authInitialized) {
    await authStore.initialize()
    authInitialized = true
  }

  if (PUBLIC_PATHS.has(to.path)) {
    return true
  }

  if (!authStore.isLoggedIn) {
    return {
      path: '/login',
      query: to.fullPath && to.fullPath !== '/' ? { redirect: to.fullPath } : undefined,
    }
  }

  return true
})

// Own the LAN-direct Tranquil connection at the section level: it persists while
// the user moves between a table's controls/patterns/store/settings pages and is
// torn down only when they leave the device entirely. (connect() happens in
// HomeView.openLocalDevice.)
const TRANQUIL_PREFIX = '/tranquil/local/'
const TRANQUIL_CLOUD_PREFIX = '/tranquil/cloud/'
const CLOCK_PREFIX = '/clock/local/'
router.afterEach((to, from) => {
  const leftSection = (prefix: string) => from.path.startsWith(prefix) && !to.path.startsWith(prefix)
  if (!leftSection(TRANQUIL_PREFIX) && !leftSection(TRANQUIL_CLOUD_PREFIX) && !leftSection(CLOCK_PREFIX)) {
    return
  }
  // After the page-leave fade: the old view is still mounted while it fades,
  // and tearing the store down under it re-rendered it as "Not connected"
  // (and yanked the teleported tab bar) for the last frames. Re-check the
  // route when the timer fires in case the user already navigated back in.
  setTimeout(() => {
    const path = router.currentRoute.value.path
    if (!path.startsWith(TRANQUIL_PREFIX)) useTranquilLocalStore().disconnect()
    if (!path.startsWith(TRANQUIL_CLOUD_PREFIX)) useTranquilCloudStore().disconnect()
    if (!path.startsWith(CLOCK_PREFIX)) useClockLocalStore().disconnect()
  }, 200)
})

export default router
