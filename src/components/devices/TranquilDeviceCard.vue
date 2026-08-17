<template>
  <BaseDeviceCard
    eyebrow="Sand table"
    :title="title"
    :subtitle="subtitle"
    lit
    bloom="rgb(216 196 160 / 0.10)"
    @click="emit('open', device)"
  >
    <template #header-end>
      <DeviceStatus :online="true" link="lan" />
    </template>

    <template #content>
      <div class="relative w-44">
        <TranquilPatternThumb :src="thumbnailUrl" alt="Current pattern" />
        <div
          v-if="playerState && playerState.state !== 'STOPPED'"
          class="player-badge"
          :class="{ 'player-badge--live': playerState.state === 'PLAYING' }"
        >
          <UIcon
            :name="playerState.state === 'PLAYING' ? 'i-fa6-solid:play' : 'i-fa6-solid:pause'"
            class="h-3 w-3"
          />
        </div>
      </div>
    </template>

    <template #actions>
      <div class="flex w-full items-center justify-between">
        <span class="k-num text-xs text-muted">{{ stateLabel }}</span>
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
import DeviceStatus from './DeviceStatus.vue'
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

<style scoped>
.player-badge {
  position: absolute;
  right: 4px;
  bottom: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 999px;
  color: rgb(255 255 255 / 0.75);
  background: rgb(8 6 5 / 0.72);
  box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.1);
  backdrop-filter: blur(4px);
}

/* Playing is a device doing work — give it the ember, dimly. */
.player-badge--live {
  color: var(--k-ember-hi);
  box-shadow:
    inset 0 0 0 1px rgb(231 145 20 / 0.35),
    0 0 12px -2px rgb(231 145 20 / 0.55);
}
</style>
