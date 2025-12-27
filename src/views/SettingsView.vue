<template>
  <div class="flex min-h-screen flex-col bg-zinc-950">
    <!-- Header -->
    <header class="sticky top-0 z-10 border-b border-white/10 bg-zinc-950/95 backdrop-blur px-5 py-4">
      <div class="flex items-center gap-4">
        <UButton
          color="neutral"
          variant="ghost"
          icon="i-lucide-arrow-left"
          square
          @click="router.push('/')"
        />
        <h1 class="text-xl font-semibold">Settings</h1>
      </div>
    </header>

    <!-- Content -->
    <div class="flex flex-1 flex-col gap-6 p-5">
      <UCard class="bg-white/5">
        <div class="flex flex-col gap-4">
          <div>
            <p class="text-xs uppercase tracking-[0.3em] text-white/60">Account</p>
            <p class="text-lg font-medium">{{ accountLabel }}</p>
          </div>
          <div class="grid gap-2 sm:grid-cols-2">
            <UButton
              color="neutral"
              variant="soft"
              icon="i-lucide-user-cog"
              @click="openAccountPortal"
            >
              Account settings
            </UButton>
            <UButton color="neutral" variant="soft" icon="i-lucide-key-round" @click="openSecurity">
              Security
            </UButton>
          </div>
          <UButton color="primary" variant="ghost" icon="i-lucide-log-out" @click="handleLogout">
            Log out
          </UButton>
        </div>
      </UCard>

      <UCard class="bg-white/5">
        <div class="space-y-3">
          <div>
            <p class="text-xs uppercase tracking-[0.3em] text-white/60">About</p>
            <p class="text-lg font-medium">Koios App</p>
          </div>
          <ul class="space-y-2 text-sm text-white/70">
            <li class="flex items-center justify-between">
              <span>Version</span>
              <span>{{ appVersion }}</span>
            </li>
            <li class="flex items-center justify-between">
              <span>Build channel</span>
              <span class="capitalize">{{ appChannel }}</span>
            </li>
          </ul>
          <div class="flex flex-wrap gap-2">
            <UButton variant="soft" icon="i-lucide-info" @click="openDocs">Support</UButton>
            <UButton variant="soft" icon="i-lucide-mail" @click="contactSupport">Contact</UButton>
          </div>
        </div>
      </UCard>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useHead } from '@unhead/vue'
import { useAuthStore } from '@/stores/auth/auth'
import { ENV } from '@/config/environment'

useHead({
  title: 'Settings | Koios',
  meta: [{ name: 'description', content: 'Manage your Koios account settings' }],
})

const authStore = useAuthStore()
const router = useRouter()

const accountLabel = computed(() =>
  authStore.isLoggedIn ? 'Signed in with Koios ID' : 'Not signed in'
)

const appVersion = ENV.appVersion
const appChannel = ENV.appChannel

const openAccountPortal = () => {
  window.open(ENV.accountPortalUrl, '_blank')
}

const openSecurity = () => {
  window.open(`${ENV.accountPortalUrl}/security`, '_blank')
}

const openDocs = () => {
  window.open(ENV.supportUrl, '_blank')
}

const contactSupport = () => {
  window.location.href = `mailto:${ENV.supportEmail}`
}

const handleLogout = async () => {
  await authStore.logout()
  router.replace('/login')
}
</script>
