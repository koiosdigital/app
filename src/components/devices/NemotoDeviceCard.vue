<template>
  <BaseDeviceCard
    eyebrow="Split-flap"
    :title="displayName"
    :subtitle="`Last updated ${lastUpdatedLabel}`"
    card-background-class="bg-sky-500/5"
    @click="handleOpen"
  >
    <template #header-end>
      <UBadge :color="statusColor" variant="soft">{{ statusLabel }}</UBadge>
    </template>

    <template #content>
      <div class="flex h-24 w-full items-center justify-center rounded-lg bg-black/40">
        <UIcon name="i-fa6-solid:table-cells" class="h-8 w-8 text-white/30" />
      </div>
    </template>

    <template #actions>
      <div class="flex w-full items-center justify-between">
        <UButton
          size="sm"
          color="neutral"
          variant="soft"
          icon="i-fa6-solid:up-right-from-square"
          @click.stop="handleOpen"
        >
          Open
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
import { formatRelativeTime, getStatusColor } from '@/utils/device'
import type { NemotoDevice } from '@/lib/api/mappers/deviceMapper'
import BaseDeviceCard from './BaseDeviceCard.vue'

const props = defineProps<{ device: NemotoDevice }>()

const emit = defineEmits<{
  (e: 'open', id: string): void
  (e: 'open-settings', id: string): void
}>()

const device = toRef(props, 'device')
const { statusLabel } = useDeviceCard(device)

const displayName = computed(() => device.value.settings?.displayName || device.value.id)
const statusColor = computed(() => getStatusColor(device.value.online))
const lastUpdatedLabel = computed(() => formatRelativeTime(device.value.updatedAt))

const handleOpen = () => emit('open', device.value.id)
</script>
