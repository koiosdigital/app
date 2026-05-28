<template>
  <FullPageLayout class="relative overflow-hidden text-white">
    <!-- Background image -->
    <img
      :src="backgroundUrl"
      alt=""
      aria-hidden="true"
      class="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-25"
    />
    <!-- Dark overlay + warm radial glow -->
    <div class="pointer-events-none absolute inset-0 bg-zinc-950/85" aria-hidden="true"></div>
    <div
      class="pointer-events-none absolute inset-x-0 -top-20 h-72 bg-linear-to-b from-primary-500/25 to-transparent blur-3xl"
      aria-hidden="true"
    ></div>

    <!-- Content: top brand, middle headline, bottom CTA -->
    <div class="relative z-10 flex h-full w-full max-w-md flex-col items-center px-2 py-6">
      <!-- Brand -->
      <header class="flex flex-col items-center pt-6">
        <img :src="logo" alt="Koios Digital" class="h-10 w-auto" />
      </header>

      <!-- Hero copy -->
      <section class="mt-12 flex flex-1 flex-col items-center justify-center gap-4 text-center">
        <h1 class="text-3xl font-semibold leading-tight sm:text-4xl">
          Pair and manage your devices
        </h1>
        <p class="max-w-sm text-base text-white/65">
          One place to provision, configure, and control every Koios Digital product you own.
        </p>
      </section>

      <!-- CTA -->
      <footer class="mt-8 flex w-full flex-col items-center gap-3">
        <UButton
          size="xl"
          color="primary"
          block
          trailing-icon="i-fa6-solid:arrow-right"
          :loading="isAuthorizing"
          @click="startLogin"
        >
          {{ isAuthorizing ? 'Opening sign-in…' : 'Get started' }}
        </UButton>
        <p class="px-4 text-center text-[11px] leading-relaxed text-white/45">
          By continuing you agree to the
          <button class="underline-offset-2 hover:underline" @click="openTerms">Terms</button>
          and acknowledge our
          <button class="underline-offset-2 hover:underline" @click="openPrivacy">
            Privacy Policy
          </button>
          .
        </p>
      </footer>
    </div>
  </FullPageLayout>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useHead } from '@unhead/vue'
import { InAppBrowser } from '@capacitor/inappbrowser'
import FullPageLayout from '@/layouts/FullPageLayout.vue'
import { useAuthStore, OauthUserCancelledError } from '@/stores/auth/auth'
import { LOGIN_DEFAULT_REDIRECT, LOGIN_REDIRECT_STORAGE_KEY } from '@/stores/auth/constants'
import { ENV } from '@/config/environment'
import loginBgImage from '@/assets/images/login-bg.jpg'
import logo from '@/assets/images/logo.png'

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
  try {
    await authStore.beginAuthentication()
  } catch (error) {
    if (!(error instanceof OauthUserCancelledError)) {
      console.error('Sign-in failed', error)
    }
  } finally {
    isAuthorizing.value = false
  }
}

const openTerms = () => {
  InAppBrowser.openInExternalBrowser({ url: `${ENV.supportUrl}/terms` })
}

const openPrivacy = () => {
  InAppBrowser.openInExternalBrowser({ url: `${ENV.supportUrl}/privacy` })
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
