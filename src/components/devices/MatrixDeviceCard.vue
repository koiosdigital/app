<template>
  <BaseDeviceCard
    eyebrow="Smart matrix"
    :title="displayName"
    :subtitle="subtitle"
    :lit="isLit"
    @click="handleOpen"
  >
    <template #header-end>
      <DeviceStatus :online="device.online" link="cloud" />
    </template>

    <template #content>
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
        <div v-else class="k-bezel">
          <div
            class="k-screen empty-preview-screen"
            :style="{ aspectRatio: `${deviceWidth} / ${deviceHeight}` }"
          >
            <UIcon
              :name="screenEnabled ? 'i-fa6-regular:image' : 'i-fa6-solid:power-off'"
              class="h-5 w-5 text-white/25"
            />
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
import type { MatrxDevice } from '@/lib/api/mappers/deviceMapper'
import BaseDeviceCard from './BaseDeviceCard.vue'
import DeviceStatus from './DeviceStatus.vue'
import InstallationPreview from '../installations/InstallationPreview.vue'

const props = defineProps<{ device: MatrxDevice }>()

const emit = defineEmits<{
  (e: 'open', id: string): void
  (e: 'toggle-screen', id: string): void
  (e: 'open-settings', id: string): void
}>()

const device = toRef(props, 'device')

const screenEnabled = computed(() => device.value.settings?.typeSettings?.screenEnabled ?? true)

const displayName = computed(() => device.value.settings?.displayName || device.value.id)

const deviceWidth = computed(() => device.value.settings?.width ?? 64)
const deviceHeight = computed(() => device.value.settings?.height ?? 32)

/** The panel is actually emitting light — the card glows with it. */
const isLit = computed(() => device.value.online && screenEnabled.value)

// One line that answers "what is it doing?" before "what is installed on it?".
const subtitle = computed(() => {
  if (!device.value.online) return 'Unreachable'
  if (!screenEnabled.value) return 'Screen off'
  const n = device.value.installationCount
  return `${n} app${n !== 1 ? 's' : ''} in rotation`
})

const handleOpen = () => {
  emit('open', device.value.id)
}
</script>

<style scoped>
.preview-container {
  width: 380px;
  max-width: 100%;
}

/* Frame and screen come from the shared .k-bezel / .k-screen primitives so
   every matrix preview in the app is moulded the same way. */
.empty-preview-screen {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
