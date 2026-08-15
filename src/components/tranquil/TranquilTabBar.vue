<template>
  <Teleport v-if="isActive" to="#app-footer">
    <nav class="flex border-t border-default bg-[rgb(15_13_12/0.92)] backdrop-blur-xl">
      <button
        v-for="tab in tabs"
        :key="tab.label"
        type="button"
        class="relative flex flex-1 flex-col items-center gap-1 py-2 transition-colors"
        :class="tab.active ? 'text-(--k-ember-hi)' : 'text-muted active:text-default'"
        @click="go(tab)"
      >
        <!-- Active tab is marked by a lit rule, matching how the rest of the
             app signals "this one is live". -->
        <span v-if="tab.active" class="tab-lit" aria-hidden="true" />
        <UIcon :name="tab.icon" class="h-5 w-5" />
        <span class="text-[11px] font-medium tracking-tight">{{ tab.label }}</span>
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

<style scoped>
.tab-lit {
  position: absolute;
  top: 0;
  width: 20px;
  height: 2px;
  border-radius: 2px;
  background: var(--k-ember);
  box-shadow: 0 0 10px 1px rgb(231 145 20 / 0.8);
}
</style>
