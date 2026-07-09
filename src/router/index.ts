import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import LoginView from '@/views/LoginView.vue'
import LoginCallbackView from '@/views/LoginCallbackView.vue'
import SettingsView from '@/views/SettingsView.vue'
import SetupNewView from '@/views/setup/SetupNewView.vue'
import SetupBindDpopView from '@/views/setup/SetupBindDpopView.vue'
import SetupCryptoView from '@/views/setup/SetupCryptoView.vue'
import SetupFailedView from '@/views/setup/SetupFailedView.vue'
import SetupNetworkView from '@/views/setup/SetupNetworkView.vue'
import SetupSuccessfulView from '@/views/setup/SetupSuccessfulView.vue'
import SetupLicenseCallbackView from '@/views/setup/SetupLicenseCallbackView.vue'
import OAuthCallbackView from '@/views/OAuthCallbackView.vue'
import ShareAcceptView from '@/views/ShareAcceptView.vue'
import MatrxDeviceView from '@/views/matrx/MatrxDeviceView.vue'
import MatrxDeviceSettingsView from '@/views/matrx/MatrxDeviceSettingsView.vue'
import MatrxAppsView from '@/views/matrx/MatrxAppsView.vue'
import InstallationEditorView from '@/views/matrx/InstallationEditorView.vue'
import NemotoDeviceView from '@/views/nemoto/NemotoDeviceView.vue'
import NemotoDeviceSettingsView from '@/views/nemoto/NemotoDeviceSettingsView.vue'
import NemotoPresetsView from '@/views/nemoto/NemotoPresetsView.vue'
import NemotoPresetEditorView from '@/views/nemoto/NemotoPresetEditorView.vue'
import NemotoMessageView from '@/views/nemoto/NemotoMessageView.vue'
import NemotoSchedulesView from '@/views/nemoto/NemotoSchedulesView.vue'
import { useAuthStore } from '@/stores/auth/auth'

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
      path: '/nemoto/:id/schedules',
      name: 'nemoto-schedules',
      component: NemotoSchedulesView,
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

export default router
