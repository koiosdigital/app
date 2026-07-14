<template>
  <BaseDeviceCard
    eyebrow="Sand table"
    :title="title"
    :subtitle="subtitle"
    card-background-class="bg-white/5"
    @click="emit('open', device)"
  >
    <template #header-end>
      <UBadge color="success" variant="soft" icon="i-fa6-solid:wifi">On network</UBadge>
    </template>

    <template #content>
      <div class="relative w-36">
        <TranquilPatternThumb :src="thumbnailUrl" alt="Current pattern" />
        <div
          v-if="playerState && playerState.state !== 'STOPPED'"
          class="absolute bottom-1 right-1 flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm"
        >
          <UIcon
            :name="playerState.state === 'PLAYING' ? 'i-fa6-solid:play' : 'i-fa6-solid:pause'"
            class="h-3.5 w-3.5"
          />
        </div>
      </div>
    </template>

    <template #actions>
      <div class="flex w-full items-center justify-between">
        <span class="text-sm text-white/60">{{ stateLabel }}</span>
        <UButton
          size="sm"
          color="neutral"
          variant="ghost"
          icon="i-fa6-solid:gear"
          @click.stop="emit('open-settings', device)"
        >
          Settings
        </UButton>
      </div>
    </template>
  </BaseDeviceCard>
</template>

<script setup lang="ts">
import { computed, ref, toRef, watch } from 'vue'
import type { LocalDevice } from '@/lib/mdns/discovery'
import { createTranquilRest } from '@/lib/tranquil/local/rest'
import type { PlayerState } from '@/lib/tranquil/local/types'
import BaseDeviceCard from './BaseDeviceCard.vue'
import TranquilPatternThumb from '@/components/tranquil/TranquilPatternThumb.vue'

const props = defineProps<{ device: LocalDevice }>()

const emit = defineEmits<{
  (e: 'open', device: LocalDevice): void
  (e: 'open-settings', device: LocalDevice): void
}>()

const device = toRef(props, 'device')

const title = computed(() => device.value.model || device.value.name)
const subtitle = computed(() => device.value.name)

// One-shot player snapshot over the device's LAN REST API — no WS connection
// is held from the card; the device view owns the live connection.
const playerState = ref<PlayerState | null>(null)

watch(
  () => device.value.baseUrl,
  async (baseUrl) => {
    if (!baseUrl) {
      playerState.value = null
      return
    }
    try {
      playerState.value = await createTranquilRest(baseUrl).player.getState()
    } catch {
      playerState.value = null
    }
  },
  { immediate: true },
)

const thumbnailUrl = computed(() => {
  const uuid = playerState.value?.current_pattern_uuid
  const base = device.value.baseUrl
  return uuid && base && playerState.value?.state !== 'STOPPED'
    ? `${base}/api/pattern_thumbs/${uuid}.png`
    : null
})

const stateLabel = computed(() => {
  switch (playerState.value?.state) {
    case 'PLAYING':
      return 'Playing'
    case 'PAUSED':
      return 'Paused'
    case 'STOPPED':
      return 'Idle'
    default:
      return device.value.address ?? 'Resolving…'
  }
})
</script>
