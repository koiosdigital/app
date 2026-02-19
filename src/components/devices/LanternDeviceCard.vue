<template>
  <BaseDeviceCard
    eyebrow="Lantern"
    :title="displayName"
    :subtitle="`Last updated ${lastUpdatedLabel}`"
    card-background-class="bg-amber-500/5"
    @click="handleOpen"
  >
    <template #header-end>
      <span class="h-10 w-10 rounded-full border border-white/20 bg-amber-500" aria-hidden="true" />
    </template>

    <template #content>
      <button
        type="button"
        class="group relative flex h-24 w-24 items-center justify-center rounded-full border-2 border-white/20 bg-amber-500 transition-all hover:border-white/40 hover:scale-105 active:scale-95"
        @click.stop="emit('send-touch', device.id)"
      >
        <UIcon name="i-fa6-solid:hand" class="h-8 w-8 text-white/90 group-hover:text-white" />
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

const handleOpen = () => {
  emit('open', device.value.id)
}
</script>
