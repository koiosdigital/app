<template>
  <BaseDeviceCard
    eyebrow="Smart matrix"
    :title="displayName"
    :subtitle="`${device.installationCount} app${
      device.installationCount !== 1 ? 's' : ''
    } installed`"
    card-background-class="bg-white/5"
    @click="handleOpen"
  >
    <template #header-end>
      <UBadge :color="statusColor" variant="soft">{{ statusLabel }}</UBadge>
    </template>

    <template #preview>
      <div class="mt-4 flex justify-center">
        <!-- Show installation preview if one is currently displaying -->
        <InstallationPreview
          v-if="device.currentlyDisplayingInstallation"
          :device-id="device.id"
          :installation-id="device.currentlyDisplayingInstallation"
          :app-id="device.currentlyDisplayingInstallation"
          :app-name="''"
          :width="deviceWidth"
          :height="deviceHeight"
          :dot-size="3"
          :dot-gap="1"
          :show-frame="true"
          class="no-label"
        />
        <!-- Show empty/off state when no installation is displaying -->
        <div v-else class="inline-flex items-center justify-center p-3 bg-zinc-800 rounded-lg">
          <div class="flex items-center justify-center bg-black rounded-sm" :style="screenStyle">
            <UIcon name="i-fa6-regular:image" class="h-5 w-5 text-white" />
          </div>
        </div>
      </div>
    </template>

    <template #actions>
      <div class="flex w-full justify-between items-center">
        <UButton
          size="sm"
          :color="screenEnabled ? 'primary' : 'neutral'"
          variant="soft"
          icon="i-fa6-solid:power-off"
          @click.stop="emit('toggle-screen', device.id)"
        >
          {{ screenEnabled ? 'On' : 'Off' }}
        </UButton>
        <UButton
          size="sm"
          color="neutral"
          variant="ghost"
          icon="i-fa6-solid:gear"
          @click.stop="emit('open-settings', device.id)"
        >
          Settings
        </UButton>
      </div>
    </template>
  </BaseDeviceCard>
</template>

<script setup lang="ts">
import { computed, toRef } from 'vue'
import { useDeviceCard } from '@/composables/useDeviceCard'
import { getStatusColor } from '@/utils/device'
import type { MatrxDevice } from '@/lib/api/mappers/deviceMapper'
import BaseDeviceCard from './BaseDeviceCard.vue'
import InstallationPreview from '../installations/InstallationPreview.vue'

const props = defineProps<{ device: MatrxDevice }>()

const emit = defineEmits<{
  (e: 'open', id: string): void
  (e: 'toggle-screen', id: string): void
  (e: 'open-settings', id: string): void
}>()

const device = toRef(props, 'device')
const { statusLabel } = useDeviceCard(device)

const screenEnabled = computed(() => device.value.settings?.typeSettings?.screenEnabled ?? true)

const displayName = computed(() => device.value.settings?.displayName || device.value.id)

const deviceWidth = computed(() => device.value.settings?.width ?? 64)
const deviceHeight = computed(() => device.value.settings?.height ?? 32)

const resolutionLabel = computed(() => `${deviceWidth.value}x${deviceHeight.value} pixels`)
const statusColor = computed(() => getStatusColor(device.value.online))

const brightnessPercent = computed(() => {
  const brightness = device.value.settings?.typeSettings?.screenBrightness ?? 200
  return Math.round((brightness / 255) * 100)
})

const screenStyle = computed(() => {
  const dotSize = 3
  const dotGap = 1
  const cellSize = dotSize + dotGap
  const displayWidth = deviceWidth.value * cellSize - dotGap
  const displayHeight = deviceHeight.value * cellSize - dotGap
  return {
    width: `${displayWidth}px`,
    height: `${displayHeight}px`,
  }
})

const handleOpen = () => {
  emit('open', device.value.id)
}
</script>

<style scoped>
.no-label :deep(span) {
  display: none;
}
</style>
