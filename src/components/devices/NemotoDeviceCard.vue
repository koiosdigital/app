<template>
  <BaseDeviceCard
    eyebrow="Split-flap"
    :title="displayName"
    :subtitle="subtitle"
    :lit="device.online"
    bloom="rgb(234 223 208 / 0.07)"
    @click="handleOpen"
  >
    <template #header-end>
      <DeviceStatus :online="device.online" link="cloud" />
    </template>

    <template #content>
      <div class="preview-container">
        <!-- Live board: render the current frame the device is showing -->
        <div v-if="displayFlaps" class="k-bezel w-full">
          <NemotoFlapGrid :flaps="displayFlaps" />
        </div>
        <!-- Empty / off state -->
        <div v-else class="k-bezel w-full">
          <div class="k-screen empty-preview-screen">
            <UIcon
              :name="loadingState ? 'i-fa6-solid:spinner' : 'i-fa6-solid:table-cells'"
              class="h-5 w-5 text-white/30"
              :class="{ 'animate-spin': loadingState }"
            />
          </div>
        </div>
      </div>
    </template>

    <template #actions>
      <div class="flex w-full items-center justify-between">
        <UButton
          size="sm"
          color="primary"
          variant="soft"
          icon="i-fa6-solid:message"
          @click.stop="emit('send-message', device.id)"
        >
          Message
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
import { computed, onMounted, ref, toRef } from 'vue'
import { useNemotoFlaps } from '@/composables/useNemotoFlaps'
import { nemotoApi, type NemotoLiveState } from '@/lib/api/nemoto'
import type { NemotoDevice } from '@/lib/api/mappers/deviceMapper'
import { formatLastSeen } from '@/utils/device'
import BaseDeviceCard from './BaseDeviceCard.vue'
import DeviceStatus from './DeviceStatus.vue'
import NemotoFlapGrid from '../nemoto/NemotoFlapGrid.vue'

const props = defineProps<{ device: NemotoDevice }>()

const emit = defineEmits<{
  (e: 'open', id: string): void
  (e: 'send-message', id: string): void
  (e: 'open-settings', id: string): void
}>()

const device = toRef(props, 'device')
const { ensureLoaded } = useNemotoFlaps()

const displayName = computed(() => device.value.settings?.displayName || device.value.id)

// Live frame the board is currently showing (same source as the device view's
// "Now showing"). Each card fetches its own state, mirroring how the Matrx
// card renders its own InstallationPreview.
const state = ref<NemotoLiveState | null>(null)
const loadingState = ref(true)

const displayFlaps = computed(() =>
  state.value?.display?.valid && state.value.display.flaps ? state.value.display.flaps : null,
)

/**
 * "22 × 6 board" was a fact that never changes, printed forever under a board
 * that is visibly 22 × 6. The only line worth keeping is the one you need.
 */
const subtitle = computed(() =>
  device.value.online ? undefined : `Unreachable ${formatLastSeen(device.value.updatedAt)}`,
)

const handleOpen = () => emit('open', device.value.id)

onMounted(async () => {
  await ensureLoaded()
  try {
    state.value = await nemotoApi.getState(device.value.id)
  } catch {
    // Preview is best-effort; the card still opens and shows the empty state.
  } finally {
    loadingState.value = false
  }
})
</script>

<style scoped>
.preview-container {
  width: 380px;
  max-width: 100%;
}

.empty-preview-screen {
  width: 100%;
  aspect-ratio: 22 / 6;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
