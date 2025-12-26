import '@/assets/css/main.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { App as CapacitorApp } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'

import App from './App.vue'
import router from './router'

import ui from '@nuxt/ui/vue-plugin'

const app = createApp(App)

app.use(ui)
app.use(createPinia())
app.use(router)

if (Capacitor.isNativePlatform()) {
    CapacitorApp.addListener('appUrlOpen', ({ url }) => {
        if (!url) {
            return
        }
        try {
            const parsed = new URL(url)
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
