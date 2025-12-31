<template>
  <FullPageLayout>
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
  </FullPageLayout>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'
import FullPageLayout from '@/layouts/FullPageLayout.vue'
import { decodeState, isStateExpired } from '@/utils/oauthState'

const route = useRoute()
const router = useRouter()

const processing = ref(true)
const success = ref(false)
const errorMessage = ref<string | null>(null)

onMounted(async () => {
  console.log('[OAuth Callback] Starting callback processing')
  console.log('[OAuth Callback] Platform:', Capacitor.isNativePlatform() ? 'native' : 'web')
  console.log('[OAuth Callback] Current URL:', window.location.href)
  console.log('[OAuth Callback] Hostname:', window.location.hostname)

  // In dev, OAuth redirects to 127.0.0.1 but opener runs on localhost.
  // Redirect to localhost so postMessage works (same-origin requirement).
  if (!Capacitor.isNativePlatform() && window.location.hostname === '127.0.0.1') {
    console.log('[OAuth Callback] Redirecting from 127.0.0.1 to localhost for same-origin postMessage')
    const newUrl = window.location.href.replace('://127.0.0.1', '://localhost')
    window.location.replace(newUrl)
    return
  }

  const code = route.query.code as string | undefined
  const stateStr = route.query.state as string | undefined
  const error = route.query.error as string | undefined

  console.log('[OAuth Callback] Query params - code:', !!code, 'state:', !!stateStr, 'error:', error)

  // Handle OAuth error from provider
  if (error) {
    console.error('[OAuth Callback] OAuth error from provider:', error)
    errorMessage.value = (route.query.error_description as string) || error
    processing.value = false
    return
  }

  // Validate required params
  if (!code || !stateStr) {
    console.error('[OAuth Callback] Missing required params - code:', !!code, 'state:', !!stateStr)
    errorMessage.value = 'Missing authorization code or state'
    processing.value = false
    return
  }

  // Decode and validate state
  console.log('[OAuth Callback] Decoding state parameter')
  const state = decodeState(stateStr)
  if (!state) {
    console.error('[OAuth Callback] Failed to decode state parameter')
    errorMessage.value = 'Invalid state parameter'
    processing.value = false
    return
  }

  console.log('[OAuth Callback] Decoded state:', {
    fieldId: state.fieldId,
    appId: state.appId,
    deviceId: state.deviceId,
    installationId: state.installationId,
    mode: state.mode,
    nonce: state.nonce?.substring(0, 8) + '...',
    timestamp: state.timestamp,
  })

  if (isStateExpired(state)) {
    console.error('[OAuth Callback] State expired, timestamp:', state.timestamp, 'now:', Date.now())
    errorMessage.value = 'OAuth session expired. Please try again.'
    processing.value = false
    return
  }

  if (Capacitor.isNativePlatform()) {
    console.log('[OAuth Callback] Native flow - validating nonce')
    // Native: Validate nonce against stored value (required for security)
    const { value: storedNonce } = await Preferences.get({ key: 'oauth_pending_nonce' })
    console.log('[OAuth Callback] Stored nonce:', storedNonce?.substring(0, 8) + '...', 'State nonce:', state.nonce?.substring(0, 8) + '...')
    if (storedNonce !== state.nonce) {
      console.error('[OAuth Callback] Nonce mismatch - security validation failed')
      errorMessage.value = 'Security validation failed. Please try again.'
      processing.value = false
      return
    }

    console.log('[OAuth Callback] Nonce validated, navigating to restore form')

    // Route based on mode
    if (state.mode === 'license') {
      console.log('[OAuth Callback] License mode - routing to /setup/crypto')
      router.replace({
        path: '/setup/crypto',
        query: { oauth_code: code, oauth_state: stateStr },
      })
    } else {
      // Build path based on context
      const basePath = state.installationId
        ? `/matrx/${state.deviceId}/installations/${state.installationId}`
        : `/matrx/${state.deviceId}/apps/${state.appId}`

      console.log('[OAuth Callback] App mode - routing to:', basePath)
      router.replace({
        path: basePath,
        query: { oauth_code: code, oauth_field: state.fieldId, restore: 'true' },
      })
    }
  } else {
    // Web: Post message to opener and close
    console.log('[OAuth Callback] Web flow - window.opener exists:', !!window.opener)
    if (window.opener) {
      console.log('[OAuth Callback] Posting OAUTH_CALLBACK message to origin:', window.location.origin)
      window.opener.postMessage(
        {
          type: 'OAUTH_CALLBACK',
          code,
          state: stateStr,
        },
        window.location.origin,
      )
      console.log('[OAuth Callback] Message posted successfully')

      success.value = true
      processing.value = false

      // Auto-close after delay
      console.log('[OAuth Callback] Scheduling window close in 1.5s')
      setTimeout(() => window.close(), 1500)
    } else {
      console.error('[OAuth Callback] No window.opener found - cannot post message')
      errorMessage.value = 'No parent window found. Please close this window and try again.'
      processing.value = false
    }
  }
})
</script>
