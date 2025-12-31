<template>
  <FullPageLayout class="relative text-white">
    <img
      :src="backgroundUrl"
      alt="background"
      class="absolute inset-0 h-full w-full object-cover opacity-40"
    />
    <div class="absolute inset-0 bg-zinc-900/80"></div>
    <div class="relative z-10 text-center space-y-6 px-6">
      <div class="space-y-2">
        <p class="text-sm uppercase tracking-[0.4em] text-white/70">Koios Digital</p>
        <h1 class="text-4xl font-semibold">Set up your devices</h1>
        <p class="text-white/70">Connect smart matricies, lamps, speakers, sensors, and more.</p>
      </div>
      <UButton
        size="lg"
        color="primary"
        trailing-icon="i-fa6-solid:arrow-right"
        :loading="isAuthorizing"
        @click="startLogin"
      >
        Get Started
      </UButton>
    </div>
  </FullPageLayout>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useHead } from '@unhead/vue'
import FullPageLayout from '@/layouts/FullPageLayout.vue'
import { useAuthStore } from '@/stores/auth/auth'
import { LOGIN_DEFAULT_REDIRECT, LOGIN_REDIRECT_STORAGE_KEY } from '@/stores/auth/constants'
import loginBgImage from '@/assets/images/login-bg.jpg'

useHead({
  title: 'Sign In | Koios Digital',
  meta: [{ name: 'description', content: 'Sign in to manage your Koios Digital devices' }],
})

const authStore = useAuthStore()
const router = useRouter()
const route = useRoute()

const backgroundUrl = loginBgImage

const isAuthorizing = ref(false)

const redirectTarget = computed(() => {
  const redirectParam = route.query.redirect
  if (typeof redirectParam === 'string' && redirectParam.length) {
    return redirectParam
  }
  return LOGIN_DEFAULT_REDIRECT
})

const persistRedirectTarget = () => {
  if (typeof window === 'undefined') {
    return
  }
  sessionStorage.setItem(LOGIN_REDIRECT_STORAGE_KEY, redirectTarget.value)
}

const startLogin = async () => {
  if (isAuthorizing.value) return
  isAuthorizing.value = true
  persistRedirectTarget()
  await authStore.beginAuthentication()
  isAuthorizing.value = false
}

watch(
  () => authStore.isLoggedIn,
  (isLoggedIn) => {
    if (isLoggedIn) {
      router.replace(redirectTarget.value)
    }
  },
  { immediate: true },
)
</script>
