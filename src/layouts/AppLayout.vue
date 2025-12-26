<template>
  <UApp>
    <div
      v-if="authStore.isLoggedIn"
      class="safe-area flex min-h-screen flex-col bg-zinc-950 text-white"
    >
      <main class="flex-1 overflow-y-auto">
        <slot />
      </main>
    </div>
    <div v-else class="min-h-screen">
      <slot />
    </div>
  </UApp>
</template>

<script setup lang="ts">
import { useAuthStore } from '@/stores/auth/auth'

const authStore = useAuthStore()
</script>

<style scoped>
.safe-area {
  padding-top: env(safe-area-inset-top);
  padding-right: env(safe-area-inset-right);
  padding-bottom: env(safe-area-inset-bottom);
  padding-left: env(safe-area-inset-left);
}
</style>
