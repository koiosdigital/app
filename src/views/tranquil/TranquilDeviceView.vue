<template>
  <PageLayout :on-refresh="refresh">
    <!-- Not connected (e.g. deep-linked / reloaded): discovery state is lost,
         so send the user back to the device list to reopen the table. -->
    <div v-if="!isActive" class="flex flex-col items-center gap-4 px-5 py-16 text-center">
      <UIcon name="i-fa6-solid:wifi" class="h-8 w-8 text-white/30" />
      <p class="text-white/70">This table isn't connected. Open it from your device list.</p>
      <UButton color="primary" variant="soft" @click="router.replace('/')">Go to devices</UButton>
    </div>

    <div v-else class="flex flex-col gap-4 px-5 py-6">
      <div
        v-if="!store.connected"
        class="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-sm text-amber-300"
      >
        <UIcon name="i-fa6-solid:spinner" class="h-4 w-4 animate-spin" />
        Connecting to the table…
      </div>

      <!-- Now playing — preview ringed by radial playback progress -->
      <div class="flex flex-col items-center gap-4">
        <div class="relative mx-auto w-full max-w-xs">
          <svg
            class="pointer-events-none absolute inset-0 h-full w-full -rotate-90"
            viewBox="0 0 100 100"
            aria-hidden="true"
          >
            <circle
              cx="50"
              cy="50"
              :r="RING_R"
              fill="none"
              stroke="rgba(255,255,255,0.1)"
              stroke-width="2.5"
            />
            <circle
              cx="50"
              cy="50"
              :r="RING_R"
              fill="none"
              class="text-primary-500"
              stroke="currentColor"
              stroke-width="2.5"
              stroke-linecap="round"
              :stroke-dasharray="RING_CIRC"
              :stroke-dashoffset="ringOffset"
              style="transition: stroke-dashoffset 0.3s ease"
            />
          </svg>
          <div class="p-[5%]">
            <div class="relative">
              <TranquilPatternThumb :src="thumbnailUrl" alt="Current pattern" />
              <!-- Live LED strip projected inside the disc -->
              <TranquilLedRing />
            </div>
          </div>
        </div>
        <div class="text-center">
          <h2 class="text-lg font-semibold">{{ currentPattern?.name ?? 'Not playing' }}</h2>
          <p v-if="currentPattern?.creator" class="text-sm text-white/60">
            by {{ currentPattern.creator }}
          </p>
          <p v-if="isPlaylist" class="mt-1 text-xs text-white/50">
            {{ (playerState?.pattern_index ?? 0) + 1 }} / {{ playerState?.playlist_size ?? 0 }}
          </p>
        </div>
      </div>

      <!-- Playback controls — play/pause centered, flanked by skip in playlists -->
      <div class="flex items-center justify-center gap-8">
        <UButton
          v-if="isPlaylist"
          color="neutral"
          variant="ghost"
          size="xl"
          icon="i-fa6-solid:backward-step"
          square
          disabled
        />
        <UButton
          color="primary"
          size="xl"
          class="h-16 w-16 justify-center rounded-full"
          :icon="isPlaying ? 'i-fa6-solid:pause' : 'i-fa6-solid:play'"
          :disabled="isStopped"
          @click="togglePlayPause"
        />
        <UButton
          v-if="isPlaylist"
          color="neutral"
          variant="ghost"
          size="xl"
          icon="i-fa6-solid:forward-step"
          square
          @click="store.skip()"
        />
      </div>

      <!-- Speed (device scale 1..5; shown as turtle→rabbit, no numbers) -->
      <UCard class="bg-white/5">
        <div class="flex flex-col gap-2">
          <span class="text-sm font-medium">Speed</span>
          <div class="flex items-center gap-3">
            <UIcon
              name="i-lucide:turtle"
              class="h-5 w-5 shrink-0 text-white/60"
              aria-label="Slower"
            />
            <input
              type="range"
              min="1"
              max="5"
              step="0.25"
              :value="feedRate"
              class="w-full accent-primary-500"
              @change="onSpeedChange"
            />
            <UIcon
              name="i-lucide:rabbit"
              class="h-5 w-5 shrink-0 text-white/60"
              aria-label="Faster"
            />
          </div>
        </div>
      </UCard>

      <!-- Shuffle / repeat (playlist mode only) -->
      <div v-if="isPlaylist" class="flex gap-3">
        <UButton
          block
          class="flex-1"
          :color="playerState?.shuffle ? 'primary' : 'neutral'"
          :variant="playerState?.shuffle ? 'solid' : 'soft'"
          icon="i-fa6-solid:shuffle"
          @click="store.setShuffle(!playerState?.shuffle)"
        >
          Shuffle
        </UButton>
        <UButton
          block
          class="flex-1"
          :color="playerState?.loop ? 'primary' : 'neutral'"
          :variant="playerState?.loop ? 'solid' : 'soft'"
          icon="i-fa6-solid:repeat"
          @click="store.setLoop(!playerState?.loop)"
        >
          Repeat
        </UButton>
      </div>

      <p v-if="store.error" class="text-center text-sm text-red-400">{{ store.error }}</p>

      <!-- Section navigation -->
      <div class="grid grid-cols-2 gap-3 pt-2">
        <UButton
          v-for="nav in sections"
          :key="nav.to"
          color="neutral"
          variant="soft"
          size="lg"
          :icon="nav.icon"
          block
          @click="router.push(`/tranquil/local/${encodeURIComponent(routeId)}/${nav.to}`)"
        >
          {{ nav.label }}
        </UButton>
      </div>
    </div>
  </PageLayout>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PageLayout from '@/layouts/PageLayout.vue'
import { usePageHeader } from '@/composables/usePageHeader'
import { useTranquilLocalStore } from '@/stores/tranquilLocal'
import type { Pattern } from '@/lib/tranquil/local/types'
import TranquilPatternThumb from '@/components/tranquil/TranquilPatternThumb.vue'
import TranquilLedRing from '@/components/tranquil/TranquilLedRing.vue'

const route = useRoute()
const router = useRouter()
const { setHeader } = usePageHeader()
const store = useTranquilLocalStore()

const routeId = computed(() => route.params.id as string)
// The connection is established by HomeView.openLocalDevice before navigation;
// this view just drives the already-active connection.
const isActive = computed(() => store.activeDevice?.id === routeId.value)

const sections = [
  { to: 'patterns', label: 'Patterns', icon: 'i-fa6-solid:table-cells-large' },
  { to: 'playlists', label: 'Playlists', icon: 'i-fa6-solid:list' },
  { to: 'lighting', label: 'Lighting', icon: 'i-fa6-solid:lightbulb' },
  { to: 'store', label: 'Store', icon: 'i-fa6-solid:store' },
]

const playerState = computed(() => store.playerState)
const progressPercent = computed(() => playerState.value?.progress_percent ?? 0)

// Radial progress ring around the preview (SVG viewBox 0..100).
const RING_R = 47
const RING_CIRC = 2 * Math.PI * RING_R
const ringOffset = computed(() => RING_CIRC * (1 - progressPercent.value / 100))
const feedRate = computed(() => playerState.value?.feed_rate ?? 3)
const isPlaying = computed(() => playerState.value?.state === 'PLAYING')
const isStopped = computed(() => !playerState.value || playerState.value.state === 'STOPPED')
const isPlaylist = computed(
  () => playerState.value?.mode !== 'SINGLE_PATTERN' && !!playerState.value?.current_playlist_uuid,
)

// Resolve the currently-playing pattern's metadata/thumbnail on demand (single
// fetch — the full patterns grid lands in a later slice).
const currentPattern = ref<Pattern | null>(null)
const thumbnailUrl = computed(() => {
  const uuid = playerState.value?.current_pattern_uuid
  const base = store.baseUrl()
  return uuid && base ? `${base}/api/pattern_thumbs/${uuid}.png` : ''
})

watch(
  () => playerState.value?.current_pattern_uuid,
  async (uuid) => {
    if (!uuid) {
      currentPattern.value = null
      return
    }
    try {
      currentPattern.value = await store.api().patterns.get(uuid)
    } catch {
      currentPattern.value = null
    }
  },
  { immediate: true },
)

async function togglePlayPause() {
  if (isPlaying.value) await store.pause()
  else if (playerState.value?.state === 'PAUSED') await store.resume()
}

function onSpeedChange(e: Event) {
  const value = Number((e.target as HTMLInputElement).value)
  void store.setFeedRate(value)
}

async function refresh() {
  if (isActive.value) await store.fetchPlayerState().catch(() => {})
}

function syncHeader() {
  const d = store.activeDevice
  setHeader({
    title: d?.model || d?.name || 'Sand Table',
    backRoute: '/',
    actions: [
      {
        icon: 'i-fa6-solid:gear',
        onClick: () => router.push(`/tranquil/local/${encodeURIComponent(routeId.value)}/settings`),
      },
    ],
  })
}

onMounted(() => {
  syncHeader()
  // Returning from a sub-page: refresh state (WS pushes keep it live, but a
  // reconnecting socket may have missed a snapshot).
  void refresh()
})
watch(() => store.activeDevice?.id, syncHeader)

// The connection is torn down by the router guard when leaving the
// /tranquil/local/ section — NOT on this view's unmount, so it survives
// navigation to the patterns/store/settings sub-pages.
</script>
