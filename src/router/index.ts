import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import LoginView from '@/views/LoginView.vue'
import LoginCallbackView from '@/views/LoginCallbackView.vue'
import SettingsView from '@/views/SettingsView.vue'
import SetupNewView from '@/views/setup/SetupNewView.vue'
import SetupBindDpopView from '@/views/setup/SetupBindDpopView.vue'
import SetupCryptoView from '@/views/setup/SetupCryptoView.vue'
import SetupEnciphermentParamsView from '@/views/setup/SetupEnciphermentParamsView.vue'
import SetupNetworkView from '@/views/setup/SetupNetworkView.vue'
import SetupSuccessfulView from '@/views/setup/SetupSuccessfulView.vue'
import { useAuthStore } from '@/stores/auth/auth'


const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
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
      path: '/setup/encipherment_params',
      name: 'setup-encipherment-params',
      component: SetupEnciphermentParamsView,
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
      path: '/settings',
      name: 'settings',
      component: SettingsView,
    },
  ],
})

const PUBLIC_PATHS = new Set(['/login', '/login/callback'])
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
    const redirectQuery = to.fullPath && to.fullPath !== '/' ? { redirect: to.fullPath } : undefined
    return {
      path: '/login',
      ...(redirectQuery ? { query: redirectQuery } : {}),
    }
  }

  return true
})

export default router
