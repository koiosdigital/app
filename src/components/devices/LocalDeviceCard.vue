<template>
  <BaseDeviceCard
    :eyebrow="eyebrow"
    :title="title"
    :subtitle="subtitle"
    card-background-class="bg-white/5"
    @click="emit('open', device)"
  >
    <template #header-end>
      <UBadge color="success" variant="soft" icon="i-fa6-solid:wifi">On network</UBadge>
    </template>

    <template #content>
      <div class="flex w-full flex-col gap-1 text-sm text-white/70">
        <div class="flex items-center gap-2">
          <UIcon name="i-fa6-solid:location-dot" class="h-4 w-4 text-white/40" />
          <span class="font-mono">{{ device.address ?? 'Resolving…' }}</span>
        </div>
        <div v-if="device.version" class="flex items-center gap-2">
          <UIcon name="i-fa6-solid:microchip" class="h-4 w-4 text-white/40" />
          <span>{{ device.version }}</span>
        </div>
      </div>
    </template>
  </BaseDeviceCard>
</template>

<script setup lang="ts">
import { computed, toRef } from 'vue'
import type { LocalDevice } from '@/lib/mdns/discovery'
import BaseDeviceCard from './BaseDeviceCard.vue'

const props = defineProps<{ device: LocalDevice }>()

const emit = defineEmits<{
  (e: 'open', device: LocalDevice): void
}>()

const device = toRef(props, 'device')

// Prefer the human family label; fall back to the raw TXT type.
const eyebrow = computed(() => {
  const t = device.value.type
  if (typeof t === 'string' && t.length) return t.charAt(0) + t.slice(1).toLowerCase()
  return 'Koios device'
})

const title = computed(() => device.value.model || device.value.name)
const subtitle = computed(() => device.value.name)
</script>
