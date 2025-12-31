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
        <div class="preview-container">
          <!-- Show installation preview if one is currently displaying -->
          <InstallationPreview
            v-if="device.currentlyDisplayingInstallation"
            :device-id="device.id"
            :installation-id="device.currentlyDisplayingInstallation"
            :app-id="device.currentlyDisplayingInstallation"
            :app-name="''"
            :width="deviceWidth"
            :height="deviceHeight"
            :show-frame="true"
            :show-label="false"
          />
          <!-- Show empty/off state when no installation is displaying -->
          <div v-else class="empty-preview-frame">
            <div
              class="empty-preview-screen"
              :style="{ aspectRatio: `${deviceWidth} / ${deviceHeight}` }"
            >
              <UIcon name="i-fa6-regular:image" class="h-5 w-5 text-white/30" />
            </div>
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

const handleOpen = () => {
  emit('open', device.value.id)
}
</script>

<style scoped>
.preview-container {
  width: 280px;
  max-width: 100%;
}

.empty-preview-frame {
  width: 100%;
  padding: 6px;
  background: #27272a;
  border-radius: 0.5rem;
}

.empty-preview-screen {
  width: 100%;
  background: black;
  border-radius: 2px;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
