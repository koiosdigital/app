<template>
  <nav class="tab-bar fixed bottom-0 left-0 right-0 z-50 border-t border-white/10 bg-zinc-950/95 backdrop-blur">
    <div class="flex items-center justify-around">
      <button
        v-for="tab in tabs"
        :key="tab.path"
        class="flex flex-1 flex-col items-center gap-1 py-3 transition-colors"
        :class="isActive(tab.path) ? 'text-primary-400' : 'text-white/60'"
        @click="navigate(tab.path)"
      >
        <UIcon :name="tab.icon" class="h-6 w-6" />
        <span class="text-xs">{{ tab.label }}</span>
      </button>
    </div>
    <div class="safe-area-bottom" />
  </nav>
</template>

<script setup lang="ts">
import { useRouter, useRoute } from 'vue-router'

const router = useRouter()
const route = useRoute()

const tabs = [
  { path: '/', icon: 'i-fa6-solid:house', label: 'Home' },
  { path: '/settings', icon: 'i-fa6-solid:gear', label: 'Settings' },
]

function isActive(path: string) {
  if (path === '/') {
    return route.path === '/'
  }
  return route.path.startsWith(path)
}

function navigate(path: string) {
  router.push(path)
}
</script>

<style scoped>
.safe-area-bottom {
  height: env(safe-area-inset-bottom);
}
</style>
