<template>
  <BaseDeviceCard
    eyebrow="Lantern"
    :title="displayName"
    :subtitle="subtitle"
    :lit="device.online"
    @click="handleOpen"
  >
    <template #header-end>
      <DeviceStatus :online="device.online" link="cloud" />
    </template>

    <template #content>
      <!-- The lantern itself is the control: tap the glass to send a touch.
           It only glows while the device is actually reachable. -->
      <button
        type="button"
        class="lantern"
        :class="{ 'lantern--lit': device.online }"
        :disabled="!device.online"
        @click.stop="emit('send-touch', device.id)"
      >
        <span class="lantern__halo" aria-hidden="true" />
        <span class="lantern__glass" aria-hidden="true" />
        <UIcon name="i-fa6-solid:hand" class="lantern__icon h-7 w-7" />
        <span class="sr-only">Send touch</span>
      </button>
    </template>

    <template #actions>
      <UButton
        size="sm"
        :color="device.online ? 'primary' : 'neutral'"
        variant="soft"
        icon="i-fa6-solid:power-off"
        @click.stop="emit('toggle-power', device.id)"
      >
        {{ powerLabel }}
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
    </template>
  </BaseDeviceCard>
</template>

<script setup lang="ts">
import { computed, toRef } from 'vue'
import { useDeviceCard } from '@/composables/useDeviceCard'
import { formatRelativeTime } from '@/utils/device'
import type { LanternDevice } from '@/lib/api/mappers/deviceMapper'
import BaseDeviceCard from './BaseDeviceCard.vue'
import DeviceStatus from './DeviceStatus.vue'

const props = defineProps<{ device: LanternDevice }>()

const emit = defineEmits<{
  (e: 'open', id: string): void
  (e: 'toggle-power', id: string): void
  (e: 'send-touch', id: string): void
  (e: 'open-settings', id: string): void
}>()

const device = toRef(props, 'device')
const { powerLabel } = useDeviceCard(device)

const displayName = computed(() => device.value.settings?.displayName || device.value.id)

const lastUpdatedLabel = computed(() => formatRelativeTime(device.value.updatedAt))

const subtitle = computed(() =>
  device.value.online ? `Updated ${lastUpdatedLabel.value}` : `Last seen ${lastUpdatedLabel.value}`,
)

const handleOpen = () => {
  emit('open', device.value.id)
}
</script>

<style scoped>
.lantern {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 96px;
  height: 96px;
  border-radius: 999px;
  transition: transform 0.16s var(--k-ease);
}
.lantern:active:not(:disabled) {
  transform: scale(0.95);
}
.lantern:disabled {
  cursor: default;
}

/* Unlit: cold glass with a faint rim. */
.lantern__glass {
  position: absolute;
  inset: 0;
  border-radius: 999px;
  background: radial-gradient(circle at 50% 34%, #2a2420, #16130f 70%);
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 0.07),
    inset 0 0 22px rgb(0 0 0 / 0.6);
  transition:
    background 0.45s var(--k-ease),
    box-shadow 0.45s var(--k-ease);
}

.lantern__halo {
  position: absolute;
  width: 168px;
  height: 168px;
  border-radius: 999px;
  opacity: 0;
  background: radial-gradient(circle, rgb(231 145 20 / 0.5), transparent 62%);
  filter: blur(6px);
  transition: opacity 0.5s var(--k-ease);
  pointer-events: none;
}

.lantern__icon {
  position: relative;
  color: rgb(255 255 255 / 0.28);
  transition: color 0.45s var(--k-ease);
}

.lantern--lit .lantern__glass {
  background: radial-gradient(circle at 50% 34%, #ffd591, var(--k-ember) 58%, #a8500f 100%);
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 0.4),
    0 0 26px -6px rgb(231 145 20 / 0.85);
}
.lantern--lit .lantern__halo {
  opacity: 1;
}
.lantern--lit .lantern__icon {
  color: #3a1e02;
}

@media (hover: hover) {
  .lantern--lit:hover .lantern__halo {
    opacity: 1;
    transform: scale(1.06);
  }
}
</style>
