<template>
  <Teleport v-if="isActive" to="#app-footer">
    <nav class="flex border-t border-white/10 bg-black/80 backdrop-blur">
      <button
        v-for="tab in tabs"
        :key="tab.label"
        type="button"
        class="flex flex-1 flex-col items-center gap-1 py-2 transition-colors"
        :class="tab.active ? 'text-primary-400' : 'text-white/60 hover:text-white'"
        @click="go(tab)"
      >
        <UIcon :name="tab.icon" class="h-5 w-5" />
        <span class="text-xs font-medium">{{ tab.label }}</span>
      </button>
    </nav>
  </Teleport>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useTranquilLocalStore } from '@/stores/tranquilLocal'

const route = useRoute()
const router = useRouter()
const store = useTranquilLocalStore()

const routeId = computed(() => route.params.id as string)
const isActive = computed(() => store.activeDevice?.id === routeId.value)
const basePath = computed(() => `/tranquil/local/${encodeURIComponent(routeId.value)}`)

const tabs = computed(() => [
  {
    label: 'Player',
    icon: 'i-fa6-solid:circle-play',
    to: basePath.value,
    active: route.path === basePath.value,
  },
  {
    label: 'Patterns',
    icon: 'i-fa6-solid:table-cells-large',
    to: `${basePath.value}/patterns`,
    active: route.path.startsWith(`${basePath.value}/patterns`),
  },
  {
    label: 'Playlists',
    icon: 'i-fa6-solid:list',
    to: `${basePath.value}/playlists`,
    active: route.path.startsWith(`${basePath.value}/playlists`),
  },
  {
    label: 'Store',
    icon: 'i-fa6-solid:store',
    to: `${basePath.value}/store`,
    active: route.path.startsWith(`${basePath.value}/store`),
  },
])

function go(tab: { to: string; active: boolean }) {
  // Tab switches replace rather than push so toggling tabs doesn't stack history
  if (!tab.active) router.replace(tab.to)
}
</script>
