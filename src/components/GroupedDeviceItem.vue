<template>
  <div class="flex flex-col gap-3 py-4 md:flex-row md:items-center md:justify-between">
    <div class="flex items-center gap-3">
      <UAvatar
        :alt="device.name"
        icon="i-fa6-solid:microchip"
        size="lg"
        :class="statusColor === 'primary' ? 'ring-2 ring-primary-500/50' : ''"
      />
      <div>
        <p class="text-xs uppercase tracking-[0.3em] text-white/60">{{ device.location }}</p>
        <p class="text-lg font-semibold">{{ device.name }}</p>
      </div>
    </div>
    <div class="flex items-center gap-3">
      <UBadge :color="statusColor" variant="soft" class="capitalize">{{ statusLabel }}</UBadge>
      <UButton
        size="sm"
        color="neutral"
        variant="soft"
        icon="i-fa6-solid:gear"
        @click="emit('settings', device.id)"
      >
        Configure
      </UButton>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, toRef } from 'vue'
import { getStatusColor, getStatusLabel } from '@/utils/device'

type GroupDevice = {
  id: string
  name: string
  online: boolean
  location: string
}

const props = defineProps<{ device: GroupDevice }>()
const emit = defineEmits<{ (e: 'settings', id: string): void }>()

const device = toRef(props, 'device')

const statusColor = computed(() => getStatusColor(device.value.online))
const statusLabel = computed(() => getStatusLabel(device.value.online))
</script>
