<template>
  <BaseDeviceCard
    :eyebrow="eyebrow"
    :title="title"
    :subtitle="subtitle"
    @click="emit('open', device)"
  >
    <template #header-end>
      <DeviceStatus :online="true" link="lan" />
    </template>

    <template #content>
      <!-- Nothing to preview yet for this family, so show the two facts that
           make a freshly-discovered device identifiable on the network. -->
      <dl class="w-full space-y-2 py-1">
        <div class="flex items-baseline justify-between gap-3">
          <dt class="k-eyebrow">Address</dt>
          <dd class="k-num text-xs text-default">{{ device.address ?? 'Resolving…' }}</dd>
        </div>
        <div v-if="device.version" class="flex items-baseline justify-between gap-3">
          <dt class="k-eyebrow">Firmware</dt>
          <dd class="k-num text-xs text-default">{{ device.version }}</dd>
        </div>
      </dl>
    </template>
  </BaseDeviceCard>
</template>

<script setup lang="ts">
import { computed, toRef } from 'vue'
import type { LocalDevice } from '@/lib/mdns/discovery'
import BaseDeviceCard from './BaseDeviceCard.vue'
import DeviceStatus from './DeviceStatus.vue'

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
