<template>
  <BaseDeviceCard
    eyebrow="Smart matrix"
    :title="device.name"
    :subtitle="`${device.installations} installation${device.installations !== 1 ? 's' : ''}`"
    card-background-class="bg-white/5"
    @click="handleOpen"
  >
    <template #header-end>
      <UBadge :color="statusColor" variant="soft">{{ statusLabel }}</UBadge>
    </template>

    <template #metadata>
      <span class="inline-flex items-center gap-2">
        <UIcon name="i-lucide-monitor" class="h-4 w-4" />
        {{ resolutionLabel }}
      </span>
      <span class="inline-flex items-center gap-2">
        <UIcon name="i-lucide-sparkles" class="h-4 w-4" />
        Brightness {{ device.brightness }}%
      </span>
    </template>

    <template #preview>
      <div v-if="device.preview" class="mt-4 flex justify-center">
        <MatrixDevicePreview
          :src="device.preview"
          :width="matrixWidth"
          :height="matrixHeight"
          :show-frame="true"
        />
      </div>
    </template>

    <template #actions>
      <UButton
        size="sm"
        :color="device.isOn ? 'primary' : 'neutral'"
        variant="soft"
        icon="i-lucide-power"
        @click.stop="emit('toggle-power', device.mac)"
      >
        {{ powerLabel }}
      </UButton>
      <UButton
        size="sm"
        color="neutral"
        variant="soft"
        icon="i-lucide-skip-forward"
        @click.stop="emit('skip', device.mac)"
      >
        Skip
      </UButton>
      <UButton
        size="sm"
        color="neutral"
        variant="ghost"
        icon="i-lucide-settings-2"
        @click.stop="emit('open-settings', device.mac)"
      >
        Settings
      </UButton>
    </template>
  </BaseDeviceCard>
</template>

<script setup lang="ts">
import { computed, toRef } from 'vue'
import { useDeviceCard } from '@/composables/useDeviceCard'
import { getStatusColor } from '@/utils/device'
import BaseDeviceCard from './BaseDeviceCard.vue'
import MatrixDevicePreview from '../MatrixDevicePreview.vue'

export type MatrixDevice = {
  type: 'matrix'
  mac: string
  name: string
  status: 'online' | 'offline'
  resolution: '32x64' | '64x64'
  brightness: number
  installations: number
  preview?: string
  isOn: boolean
}

const props = defineProps<{ device: MatrixDevice }>()

const emit = defineEmits<{
  (e: 'open', mac: string): void
  (e: 'toggle-power', mac: string): void
  (e: 'skip', mac: string): void
  (e: 'open-settings', mac: string): void
}>()

const device = toRef(props, 'device')
const { statusLabel, powerLabel } = useDeviceCard(device)

const resolutionLabel = computed(() => `${device.value.resolution} pixels`)
const statusColor = computed(() => getStatusColor(device.value.status))

const matrixWidth = computed(() => {
  const [width] = device.value.resolution.split('x').map(Number)
  return width
})

const matrixHeight = computed(() => {
  const [, height] = device.value.resolution.split('x').map(Number)
  return height
})

const handleOpen = () => {
  emit('open', device.value.mac)
}
</script>
