<template>
  <section class="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
    <div class="space-y-2">
      <p class="text-xs uppercase tracking-[0.35em] text-white/60">Koios login</p>
      <h1 class="text-2xl font-semibold">Finishing sign-in…</h1>
      <p class="text-sm text-white/70">
        {{
          errorMessage
            ? 'We could not finish the redirect.'
            : 'Hang tight while we verify your account.'
        }}
      </p>
    </div>

    <div v-if="errorMessage" class="space-y-4">
      <p class="text-sm text-rose-300">{{ errorMessage }}</p>
      <UButton color="primary" icon="i-fa6-solid:right-to-bracket" @click="retry"
        >Try again</UButton
      >
    </div>

    <USkeleton v-else class="h-1.5 w-48" animation="pulse" />
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useHead } from '@unhead/vue'
import { useAuthStore } from '@/stores/auth/auth'
import { LOGIN_DEFAULT_REDIRECT, LOGIN_REDIRECT_STORAGE_KEY } from '@/stores/auth/constants'

useHead({
  title: 'Signing In... | Koios',
  meta: [{ name: 'robots', content: 'noindex' }],
})

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()
const errorMessage = ref<string | null>(null)

const consumeRedirectTarget = () => {
  if (typeof window === 'undefined') {
    const fallback = route.query.redirect
    return typeof fallback === 'string' && fallback.length ? fallback : null
  }

  const stored = sessionStorage.getItem(LOGIN_REDIRECT_STORAGE_KEY)
  if (stored) {
    sessionStorage.removeItem(LOGIN_REDIRECT_STORAGE_KEY)
    return stored
  }

  const fallback = route.query.redirect
  return typeof fallback === 'string' && fallback.length ? fallback : null
}

const completeLogin = async () => {
  try {
    await authStore.completeAuthentication(
      typeof window !== 'undefined' ? window.location.href : undefined,
    )
    const target = consumeRedirectTarget() ?? LOGIN_DEFAULT_REDIRECT
    await router.replace(target)
  } catch (error) {
    console.error('OIDC callback failed', error)
    errorMessage.value =
      'Please relaunch the sign-in flow. If this keeps happening, contact Koios support.'
  }
}

const retry = () => {
  errorMessage.value = null
  authStore.beginAuthentication()
}

onMounted(() => {
  completeLogin()
})
</script>
