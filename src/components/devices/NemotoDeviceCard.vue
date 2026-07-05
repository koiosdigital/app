<template>
  <BaseDeviceCard
    eyebrow="Split-flap"
    :title="displayName"
    :subtitle="subtitle"
    card-background-class="bg-white/5"
    @click="handleOpen"
  >
    <template #header-end>
      <UBadge :color="statusColor" variant="soft">{{ statusLabel }}</UBadge>
    </template>

    <template #content>
      <div class="preview-container">
        <!-- Live board: render the current frame the device is showing -->
        <div v-if="displayFlaps" class="preview-frame">
          <NemotoFlapGrid :flaps="displayFlaps" />
        </div>
        <!-- Empty / off state -->
        <div v-else class="preview-frame">
          <div class="empty-preview-screen">
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
import { useDeviceCard } from '@/composables/useDeviceCard'
import { getStatusColor } from '@/utils/device'
import { useNemotoFlaps } from '@/composables/useNemotoFlaps'
import { nemotoApi, type NemotoLiveState } from '@/lib/api/nemoto'
import type { NemotoDevice } from '@/lib/api/mappers/deviceMapper'
import BaseDeviceCard from './BaseDeviceCard.vue'
import NemotoFlapGrid from '../nemoto/NemotoFlapGrid.vue'

const props = defineProps<{ device: NemotoDevice }>()

const emit = defineEmits<{
  (e: 'open', id: string): void
  (e: 'send-message', id: string): void
  (e: 'open-settings', id: string): void
}>()

const device = toRef(props, 'device')
const { statusLabel } = useDeviceCard(device)
const { ensureLoaded } = useNemotoFlaps()

const displayName = computed(() => device.value.settings?.displayName || device.value.id)
const statusColor = computed(() => getStatusColor(device.value.online))

// Live frame the board is currently showing (same source as the device view's
// "Now showing"). Each card fetches its own state, mirroring how the Matrx
// card renders its own InstallationPreview.
const state = ref<NemotoLiveState | null>(null)
const loadingState = ref(true)

const displayFlaps = computed(() =>
  state.value?.display?.valid && state.value.display.flaps ? state.value.display.flaps : null,
)

const subtitle = computed(() => {
  const w = state.value?.display?.width ?? state.value?.setup?.gridWidth
  const h = state.value?.display?.height ?? state.value?.setup?.gridHeight
  return w && h ? `${w} × ${h} board` : 'Split-flap board'
})

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

.preview-frame {
  width: 100%;
  padding: 8px;
  background: #18181b;
  border-radius: 0.5rem;
}

.empty-preview-screen {
  width: 100%;
  aspect-ratio: 22 / 6;
  background: black;
  border-radius: 2px;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
