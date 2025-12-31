<template>
  <FullPageLayout>
    <div class="w-full max-w-md space-y-6 text-center">
      <!-- Loading -->
      <div v-if="processing" class="space-y-4">
        <UIcon name="i-fa6-solid:spinner" class="mx-auto h-12 w-12 animate-spin text-primary-400" />
        <p class="text-white/70">Accepting share invitation...</p>
      </div>

      <!-- Success -->
      <div v-else-if="result" class="space-y-4">
        <UIcon name="i-fa6-solid:circle-check" class="mx-auto h-12 w-12 text-green-400" />
        <p class="font-medium text-green-400">{{ result.message }}</p>
        <p class="text-white/70">
          You now have access to <span class="font-medium">{{ result.deviceName }}</span>
        </p>
        <UButton color="primary" size="lg" @click="goToDevice"> View Device </UButton>
      </div>

      <!-- Error -->
      <div v-else-if="errorMessage" class="space-y-4">
        <UIcon name="i-fa6-solid:circle-exclamation" class="mx-auto h-12 w-12 text-red-400" />
        <p class="font-medium text-red-400">Failed to accept invitation</p>
        <p class="text-sm text-white/50">{{ errorMessage }}</p>
        <UButton color="neutral" variant="soft" @click="goHome"> Go to Home </UButton>
      </div>
    </div>
  </FullPageLayout>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { devicesApi, type AcceptShareResult } from '@/lib/api/devices'
import { getErrorMessage } from '@/lib/api/errors'
import FullPageLayout from '@/layouts/FullPageLayout.vue'

const route = useRoute()
const router = useRouter()

const processing = ref(true)
const result = ref<AcceptShareResult | null>(null)
const errorMessage = ref<string | null>(null)

async function acceptInvite(token: string) {
  try {
    result.value = await devicesApi.acceptShareInvite(token)
  } catch (err) {
    errorMessage.value = getErrorMessage(err, 'Invalid or expired invitation')
  } finally {
    processing.value = false
  }
}

function goToDevice() {
  if (result.value) {
    router.push(`/matrx/${result.value.deviceId}`)
  }
}

function goHome() {
  router.push('/')
}

onMounted(() => {
  const token = route.query.token as string | undefined

  if (!token) {
    errorMessage.value = 'Missing invitation token'
    processing.value = false
    return
  }

  acceptInvite(token)
})
</script>
