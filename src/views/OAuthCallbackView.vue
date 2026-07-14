<template>
  <FullPageLayout>
    <div class="w-full max-w-md space-y-6 text-center">
      <!-- Error from provider -->
      <div v-if="errorMessage" class="space-y-4">
        <UIcon name="i-fa6-solid:circle-exclamation" class="mx-auto h-12 w-12 text-red-400" />
        <p class="font-medium text-red-400">Authentication failed</p>
        <p class="text-sm text-white/50">{{ errorMessage }}</p>
        <p class="text-sm text-white/50">You can close this window.</p>
      </div>

      <!-- Completing -->
      <div v-else class="space-y-4">
        <UIcon name="i-fa6-solid:spinner" class="mx-auto h-12 w-12 animate-spin text-primary-400" />
        <p class="text-white/70">Completing sign-in…</p>
        <p class="text-sm text-white/50">This window will close automatically.</p>
      </div>
    </div>
  </FullPageLayout>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import FullPageLayout from '@/layouts/FullPageLayout.vue'

// Web-only popup landing page for third-party OAuth flows. The opener window
// (Oauth.authorize's web implementation) polls this popup's location, reads
// the code/state from the URL, and closes the popup — this page only has to
// exist and be same-origin. On native the ASWebAuthenticationSession
// intercepts the redirect before any page loads, so this view never renders.

const route = useRoute()
const errorMessage = ref<string | null>(null)

onMounted(() => {
  // In dev, OAuth providers redirect to 127.0.0.1 while the opener runs on
  // localhost. Hop to localhost so the opener's location polling becomes
  // same-origin and can observe this page.
  if (window.location.hostname === '127.0.0.1') {
    window.location.replace(window.location.href.replace('://127.0.0.1', '://localhost'))
    return
  }

  const error = route.query.error as string | undefined
  if (error) {
    errorMessage.value = (route.query.error_description as string) || error
  }
})
</script>
