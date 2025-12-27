<template>
  <div class="flex min-h-screen flex-col items-center justify-center bg-zinc-950 p-5">
    <div class="w-full max-w-md space-y-6 text-center">
      <!-- Success Icon -->
      <div class="flex justify-center">
        <div
          class="flex h-24 w-24 items-center justify-center rounded-full border-4 border-primary-400/20 bg-primary-400/10"
        >
          <UIcon name="i-lucide-check" class="h-12 w-12 text-primary-400" />
        </div>
      </div>

      <!-- Success Message -->
      <div class="space-y-3">
        <h1 class="text-3xl font-semibold">Setup Complete!</h1>
        <p class="text-white/70">
          Your device has been successfully configured and is now online.
        </p>
      </div>

      <!-- Next Steps -->
      <div class="space-y-3 rounded-lg border border-white/10 bg-white/5 p-6 text-left">
        <h2 class="text-sm font-semibold uppercase tracking-wider text-white/50">Next Steps</h2>
        <ul class="space-y-2 text-sm text-white/70">
          <li class="flex items-start gap-3">
            <UIcon name="i-lucide-check" class="h-5 w-5 flex-shrink-0 text-primary-400" />
            <span>Your device will appear in your device list within a few seconds</span>
          </li>
          <li class="flex items-start gap-3">
            <UIcon name="i-lucide-check" class="h-5 w-5 flex-shrink-0 text-primary-400" />
            <span>You can customize settings and manage your device from the home screen</span>
          </li>
          <li class="flex items-start gap-3">
            <UIcon name="i-lucide-check" class="h-5 w-5 flex-shrink-0 text-primary-400" />
            <span>Explore available apps and features in the device menu</span>
          </li>
        </ul>
      </div>

      <!-- Actions -->
      <div class="space-y-3">
        <UButton color="primary" size="lg" block @click="goToHome">
          View My Devices
        </UButton>
        <UButton color="neutral" variant="ghost" block @click="addAnother">
          Add Another Device
        </UButton>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useHead } from '@unhead/vue'
import { useBleProvStore } from '@/stores/ble_prov'

useHead({
  title: 'Setup Complete | Koios',
  meta: [{ name: 'description', content: 'Your Koios device has been successfully configured' }],
})

const router = useRouter()
const bleStore = useBleProvStore()

function goToHome() {
  router.push('/')
}

function addAnother() {
  router.push('/setup/new')
}

onMounted(() => {
  // Reset all provisioning state
  bleStore.session.resetSession()
  bleStore.wifi.resetWiFiState()
})
</script>
