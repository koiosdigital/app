<template>
  <FullPageLayout>
    <div class="w-full max-w-md space-y-6 text-center">
      <!-- Failure Icon -->
      <div class="flex justify-center">
        <div
          class="flex h-24 w-24 items-center justify-center rounded-full border-4 border-red-400/20 bg-red-400/10"
        >
          <UIcon name="i-fa6-solid:xmark" class="h-12 w-12 text-red-400" />
        </div>
      </div>

      <!-- Failure Message -->
      <div class="space-y-3">
        <h1 class="text-3xl font-semibold">Setup Failed</h1>
        <p class="text-white/70">
          Your device's security credentials could not be verified, so setup cannot continue.
        </p>
      </div>

      <!-- Support -->
      <div
        class="flex items-center gap-2 rounded-lg border border-primary-500/20 bg-primary-500/10 p-4 text-left"
      >
        <UIcon name="i-fa6-regular:life-ring" class="h-5 w-5 shrink-0 text-primary-400" />
        <div class="flex-1">
          <p class="text-sm font-medium text-primary-400">Need assistance?</p>
          <a
            href="mailto:support@koiosdigital.net"
            class="text-xs text-white/70 hover:text-primary-400"
          >
            Contact support@koiosdigital.net
          </a>
        </div>
      </div>

      <!-- Actions -->
      <div class="space-y-3">
        <UButton color="primary" size="lg" block @click="startOver"> Try Again </UButton>
        <UButton color="neutral" variant="ghost" block @click="goToHome"> Back to Home </UButton>
      </div>
    </div>
  </FullPageLayout>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useHead } from '@unhead/vue'
import FullPageLayout from '@/layouts/FullPageLayout.vue'

useHead({
  title: 'Setup Failed | Koios Digital',
  meta: [{ name: 'description', content: 'Device setup could not be completed' }],
})

const router = useRouter()

function startOver() {
  router.push('/setup/new')
}

function goToHome() {
  router.push('/')
}
</script>
