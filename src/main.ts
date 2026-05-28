// Register icons FIRST - before any UI components are imported
import '@/icons'

import '@/assets/css/main.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createHead } from '@unhead/vue/client'
import { App as CapacitorApp } from '@capacitor/app'
import { Browser } from '@capacitor/browser'
import { Capacitor } from '@capacitor/core'

import App from './App.vue'
import router from './router'

import ui from '@nuxt/ui/vue-plugin'

const app = createApp(App)
const head = createHead()

app.use(ui)
app.use(createPinia())
app.use(router)
app.use(head)

if (Capacitor.isNativePlatform()) {
  CapacitorApp.addListener('appUrlOpen', ({ url }) => {
    if (!url) {
      return
    }
    try {
      const parsed = new URL(url)

      // ASWebAuthenticationSession-handled OAuth callbacks (the main login
      // flow) are delivered to the plugin's completion handler — they don't
      // reach this listener. So everything that arrives here is from a
      // SFSafariViewController flow or an external universal-link tap; we
      // need to dismiss the in-app browser either way.
      Browser.close().catch(() => {})

      // kc_action results (delete_account etc.) bypass the OAuth callback
      // views and go straight to /settings, where SettingsView consumes the
      // banner.
      const kcAction = parsed.searchParams.get('kc_action')
      const kcStatus = parsed.searchParams.get('kc_action_status')
      if (kcAction && kcStatus) {
        router.replace({
          path: '/settings',
          query: { kc_action: kcAction, kc_action_status: kcStatus },
        })
        return
      }

      const path = `${parsed.pathname}${parsed.search}${parsed.hash}`
      if (path) {
        router.push(path)
      }
    } catch (error) {
      console.warn('Failed to handle incoming universal link', error)
    }
  })
}

app.mount('#app')
