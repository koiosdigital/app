<template>
  <FullPageLayout>
    <div class="w-full max-w-md space-y-6 text-center">
      <!-- Success state -->
      <div v-if="licenseKey" class="space-y-6">
        <div class="flex justify-center">
          <div
            class="flex h-24 w-24 items-center justify-center rounded-full border-4 border-primary-400/20 bg-primary-400/10"
          >
            <UIcon name="i-fa6-solid:check" class="h-12 w-12 text-primary-400" />
          </div>
        </div>
        <div class="space-y-3">
          <h1 class="text-xl font-semibold text-white">License Purchased</h1>
          <p class="text-sm text-white/70">
            {{ isPopup ? 'Returning to setup...' : 'Please return to the app to complete setup.' }}
          </p>
        </div>
      </div>

      <!-- Error state -->
      <div v-else class="space-y-6">
        <div class="flex justify-center">
          <div
            class="flex h-24 w-24 items-center justify-center rounded-full border-4 border-red-400/20 bg-red-400/10"
          >
            <UIcon name="i-fa6-solid:xmark" class="h-12 w-12 text-red-400" />
          </div>
        </div>
        <div class="space-y-3">
          <h1 class="text-xl font-semibold text-white">Checkout Cancelled</h1>
          <p class="text-sm text-white/70">
            {{ isPopup ? 'You can close this window.' : 'Please return to the app to try again.' }}
          </p>
        </div>
      </div>

      <!-- Manual close button for non-popup scenarios -->
      <div v-if="!isPopup && licenseKey" class="pt-4">
        <p class="text-xs text-white/50">
          If the app doesn't open automatically, copy your license key:
        </p>
        <div class="mt-2 rounded-lg bg-zinc-900 p-3">
          <code class="text-sm text-primary-400 break-all">{{ licenseKey }}</code>
        </div>
      </div>
    </div>
  </FullPageLayout>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useHead } from '@unhead/vue'
import { Capacitor } from '@capacitor/core'
import { Browser } from '@capacitor/browser'
import FullPageLayout from '@/layouts/FullPageLayout.vue'

useHead({
  title: 'License Callback | Koios Digital',
  meta: [{ name: 'description', content: 'Processing license purchase' }],
})

const route = useRoute()
const router = useRouter()

const licenseKey = ref<string | null>(null)
const isPopup = ref(false)

onMounted(() => {
  // Extract license key from URL
  licenseKey.value = (route.query.license_key as string) || null

  // On native platforms, redirect to /setup/crypto with the license key
  if (Capacitor.isNativePlatform()) {
    // Close in-app browser
    Browser.close().catch(() => {})

    // Redirect to crypto setup with license key
    if (licenseKey.value) {
      router.replace({
        path: '/setup/crypto',
        query: { license_key: licenseKey.value },
      })
    } else {
      // No license key - user cancelled, go back to crypto setup
      router.replace('/setup/crypto')
    }
    return
  }

  // Check if we're in a popup window (web only)
  isPopup.value = !!window.opener

  if (isPopup.value && window.opener) {
    // Send message to parent window
    try {
      window.opener.postMessage(
        {
          type: 'LICENSE_CALLBACK',
          licenseKey: licenseKey.value,
        },
        window.location.origin,
      )

      // Close popup after a short delay to show success message
      setTimeout(() => {
        window.close()
      }, 1500)
    } catch (err) {
      console.error('Failed to send message to opener:', err)
    }
  }
})
</script>
