<template>
  <BaseDeviceCard
    eyebrow="Lantern"
    :title="device.name"
    :subtitle="`Last touch ${device.lastTouch}`"
    card-background-class="bg-amber-500/5"
    @click="handleOpen"
  >
    <template #header-end>
      <span
        class="h-10 w-10 rounded-full border border-white/20"
        :style="{ background: device.color }"
        aria-hidden="true"
      />
    </template>

    <template #metadata>
      <span class="inline-flex items-center gap-2">
        <UIcon name="i-lucide-users" class="h-4 w-4" />
        {{ device.linkedPeers }} linked peer{{ device.linkedPeers !== 1 ? 's' : '' }}
      </span>
      <span class="inline-flex items-center gap-2">
        <UIcon name="i-lucide-wifi" class="h-4 w-4" />
        {{ statusLabel }}
      </span>
    </template>

    <template #preview>
      <div class="mt-4 flex justify-center">
        <button
          type="button"
          class="group relative flex h-24 w-24 items-center justify-center rounded-full border-2 border-white/20 transition-all hover:border-white/40 hover:scale-105 active:scale-95"
          :style="{ background: device.color }"
          @click.stop="emit('send-touch', device.mac)"
        >
          <UIcon name="i-lucide-hand" class="h-8 w-8 text-white/90 group-hover:text-white" />
          <span class="sr-only">Send touch</span>
        </button>
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
import { toRef } from 'vue'
import { useDeviceCard } from '@/composables/useDeviceCard'
import BaseDeviceCard from './BaseDeviceCard.vue'

export type LanternDevice = {
  type: 'lantern'
  mac: string
  name: string
  status: 'online' | 'offline'
  color: string
  linkedPeers: number
  lastTouch: string
  isOn: boolean
}

const props = defineProps<{ device: LanternDevice }>()

const emit = defineEmits<{
  (e: 'open', mac: string): void
  (e: 'toggle-power', mac: string): void
  (e: 'send-touch', mac: string): void
  (e: 'open-settings', mac: string): void
}>()

const device = toRef(props, 'device')
const { statusLabel, powerLabel } = useDeviceCard(device)

const handleOpen = () => {
  emit('open', device.value.mac)
}
</script>
