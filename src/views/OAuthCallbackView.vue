<template>
  <div class="flex min-h-screen flex-col items-center justify-center bg-zinc-950 p-5">
    <div class="w-full max-w-md space-y-6 text-center">
      <!-- Loading -->
      <div v-if="processing" class="space-y-4">
        <UIcon name="i-fa6-solid:spinner" class="mx-auto h-12 w-12 animate-spin text-primary-400" />
        <p class="text-white/70">Processing authentication...</p>
      </div>

      <!-- Success -->
      <div v-else-if="success" class="space-y-4">
        <UIcon name="i-fa6-solid:circle-check" class="mx-auto h-12 w-12 text-green-400" />
        <p class="font-medium text-green-400">Connected successfully!</p>
        <p class="text-sm text-white/50">You can close this window.</p>
      </div>

      <!-- Error -->
      <div v-else-if="errorMessage" class="space-y-4">
        <UIcon name="i-fa6-solid:circle-exclamation" class="mx-auto h-12 w-12 text-red-400" />
        <p class="font-medium text-red-400">Authentication failed</p>
        <p class="text-sm text-white/50">{{ errorMessage }}</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Capacitor } from '@capacitor/core'
import { Browser } from '@capacitor/browser'
import { Preferences } from '@capacitor/preferences'
import { decodeState, isStateExpired } from '@/utils/oauthState'

const route = useRoute()
const router = useRouter()

const processing = ref(true)
const success = ref(false)
const errorMessage = ref<string | null>(null)

onMounted(async () => {
  // In dev mode, OAuth redirects to 127.0.0.1 but the app runs on localhost
  // Redirect to localhost to ensure proper session/storage access
  if (import.meta.env.DEV && window.location.hostname === '127.0.0.1') {
    const newUrl = window.location.href.replace('://127.0.0.1', '://localhost')
    window.location.replace(newUrl)
    return
  }

  const code = route.query.code as string | undefined
  const stateStr = route.query.state as string | undefined
  const error = route.query.error as string | undefined

  // Handle OAuth error from provider
  if (error) {
    errorMessage.value = (route.query.error_description as string) || error
    processing.value = false
    return
  }

  // Validate required params
  if (!code || !stateStr) {
    errorMessage.value = 'Missing authorization code or state'
    processing.value = false
    return
  }

  // Decode and validate state
  const state = decodeState(stateStr)
  if (!state) {
    errorMessage.value = 'Invalid state parameter'
    processing.value = false
    return
  }

  if (isStateExpired(state)) {
    errorMessage.value = 'OAuth session expired. Please try again.'
    processing.value = false
    return
  }

  // Validate nonce against stored value
  const { value: storedNonce } = await Preferences.get({ key: 'oauth_pending_nonce' })
  if (storedNonce !== state.nonce) {
    errorMessage.value = 'Security validation failed. Please try again.'
    processing.value = false
    return
  }

  if (Capacitor.isNativePlatform()) {
    // Native: Close browser and navigate to restore form
    await Browser.close()

    // Route based on mode
    if (state.mode === 'license') {
      router.replace({
        path: '/setup/crypto',
        query: { oauth_code: code, oauth_state: stateStr },
      })
    } else {
      // Build path based on context
      const basePath = state.installationId
        ? `/matrx/${state.deviceId}/installations/${state.installationId}`
        : `/matrx/${state.deviceId}/apps/${state.appId}`

      router.replace({
        path: basePath,
        query: { oauth_code: code, oauth_field: state.fieldId, restore: 'true' },
      })
    }
  } else {
    // Web: Post message to opener and close
    console.log('[OAuth Callback] Web flow, window.opener:', !!window.opener)
    if (window.opener) {
      console.log('[OAuth Callback] Posting message to origin:', window.location.origin)
      window.opener.postMessage(
        {
          type: 'OAUTH_CALLBACK',
          code,
          state: stateStr,
        },
        window.location.origin,
      )

      success.value = true
      processing.value = false

      // Auto-close after delay
      setTimeout(() => window.close(), 1500)
    } else {
      errorMessage.value = 'No parent window found. Please close this window and try again.'
      processing.value = false
    }
  }
})
</script>
