<template>
  <PageLayout :on-refresh="refresh">
    <!-- Not connected (e.g. deep-linked / reloaded): discovery state is lost,
         so send the user back to the device list to reopen the table. -->
    <div v-if="!isActive" class="flex flex-col items-center gap-3 px-5 py-16 text-center">
      <span class="k-lamp k-lamp--off" aria-hidden="true" />
      <p class="k-eyebrow">Not connected</p>
      <p class="max-w-[32ch] text-sm text-muted">
        The table is reached over your local network. Open it from the device list to reconnect.
      </p>
      <UButton color="primary" variant="soft" size="sm" @click="router.replace('/')">
        Go to devices
      </UButton>
    </div>

    <!-- pb clears the fixed bottom tab bar -->
    <div v-else class="pb-28">
      <div v-if="!store.connected" class="connecting">
        <span class="k-lamp k-lamp--ember connecting__lamp" aria-hidden="true" />
        Connecting to the table…
      </div>

      <!-- Now playing: the disc, ringed by playback progress -->
      <DeviceStage
        eyebrow="Now playing"
        :title="isStopped ? 'Nothing running' : currentPattern?.name"
        :meta="stageMeta"
        :lit="isPlaying"
        bloom="rgb(216 196 160 / 0.13)"
        width="min(74vw, 320px)"
      >
        <div class="relative">
          <svg
            v-if="!isStopped"
            class="pointer-events-none absolute inset-0 h-full w-full -rotate-90"
            viewBox="0 0 100 100"
            aria-hidden="true"
          >
            <circle
              cx="50"
              cy="50"
              :r="RING_R"
              fill="none"
              stroke="rgb(255 255 255 / 0.07)"
              stroke-width="2"
            />
            <circle
              cx="50"
              cy="50"
              :r="RING_R"
              fill="none"
              stroke="var(--k-ember)"
              stroke-width="2"
              stroke-linecap="round"
              :stroke-dasharray="RING_CIRC"
              :stroke-dashoffset="ringOffset"
              style="transition: stroke-dashoffset 0.3s ease"
            />
          </svg>
          <div class="p-[6%]">
            <div class="relative">
              <TranquilPatternThumb :src="thumbnailUrl" alt="Current pattern" />
              <TranquilLedRing />
            </div>
          </div>
        </div>
      </DeviceStage>

      <div class="flex flex-col gap-5 px-4 py-5">
        <!-- Transport: one row, thumb-height, play as the only lit control -->
        <div class="transport">
          <button
            type="button"
            class="transport__btn"
            :class="{ 'transport__btn--armed': playerState?.shuffle }"
            :disabled="!isPlaylist"
            aria-label="Shuffle"
            @click="store.setShuffle(!playerState?.shuffle)"
          >
            <UIcon name="i-fa6-solid:shuffle" class="h-4 w-4" />
          </button>

          <button
            type="button"
            class="transport__play"
            :disabled="isStopped"
            :aria-label="isPlaying ? 'Pause' : 'Play'"
            @click="togglePlayPause"
          >
            <UIcon :name="isPlaying ? 'i-fa6-solid:pause' : 'i-fa6-solid:play'" class="h-6 w-6" />
          </button>

          <button
            type="button"
            class="transport__btn"
            :disabled="!isPlaylist"
            aria-label="Skip to next pattern"
            @click="store.skip()"
          >
            <UIcon name="i-fa6-solid:forward-step" class="h-4 w-4" />
          </button>

          <button
            type="button"
            class="transport__btn"
            :class="{ 'transport__btn--armed': playerState?.loop }"
            :disabled="!isPlaylist"
            aria-label="Repeat"
            @click="store.setLoop(!playerState?.loop)"
          >
            <UIcon name="i-fa6-solid:repeat" class="h-4 w-4" />
          </button>
        </div>

        <!-- Ball speed and light level, each with its reading -->
        <div class="controls">
          <div class="control">
            <div class="control__label">
              <span class="k-eyebrow">Ball speed</span>
              <span class="k-num control__value">{{ feedRate.toFixed(2) }}×</span>
            </div>
            <div class="control__row">
              <UIcon name="i-lucide:turtle" class="control__cap" aria-hidden="true" />
              <USlider
                :model-value="feedRate"
                :min="1"
                :max="5"
                :step="0.25"
                class="flex-1"
                aria-label="Ball speed"
                @update:model-value="onSpeedChange"
              />
              <UIcon name="i-lucide:rabbit" class="control__cap" aria-hidden="true" />
            </div>
          </div>

          <template v-if="ledBrightness !== null">
            <hr class="k-hairline" />
            <div class="control">
              <div class="control__label">
                <span class="k-eyebrow">Light</span>
                <span class="k-num control__value">{{ ledBrightness }}%</span>
              </div>
              <div class="control__row">
                <UIcon name="i-lucide:sun-dim" class="control__cap" aria-hidden="true" />
                <USlider
                  :model-value="ledBrightness"
                  :min="0"
                  :max="100"
                  :step="5"
                  class="flex-1"
                  aria-label="Light level"
                  @update:model-value="onBrightnessChange"
                />
                <UIcon name="i-lucide:sun" class="control__cap" aria-hidden="true" />
              </div>
            </div>
          </template>

          <hr class="k-hairline" />
          <button
            type="button"
            class="control__link"
            @click="router.push(`/tranquil/local/${encodeURIComponent(routeId)}/lighting`)"
          >
            <span class="destination__icon"
              ><UIcon name="i-fa6-solid:lightbulb" class="h-4 w-4"
            /></span>
            <span class="min-w-0 flex-1 text-left">
              <span class="control__link-title">Lighting</span>
              <span class="control__link-hint">Colour and effects for the LED ring</span>
            </span>
            <UIcon name="i-fa6-solid:chevron-right" class="h-3 w-3 shrink-0 text-dimmed" />
          </button>
        </div>

        <p v-if="store.error" class="text-center text-sm text-error">{{ store.error }}</p>
      </div>
    </div>

    <TranquilTabBar />
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
import TranquilTabBar from '@/components/tranquil/TranquilTabBar.vue'
import DeviceStage from '@/components/devices/DeviceStage.vue'

const route = useRoute()
const router = useRouter()
const { setHeader } = usePageHeader()
const store = useTranquilLocalStore()

const routeId = computed(() => route.params.id as string)
// The connection is established by HomeView.openLocalDevice before navigation;
// this view just drives the already-active connection.
const isActive = computed(() => store.activeDevice?.id === routeId.value)

const playerState = computed(() => store.playerState)
const progressPercent = computed(() => playerState.value?.progress_percent ?? 0)

// Radial progress ring around the preview (SVG viewBox 0..100).
const RING_R = 47
const RING_CIRC = 2 * Math.PI * RING_R
const ringOffset = computed(() => RING_CIRC * (1 - progressPercent.value / 100))
const feedRate = computed(() => playerState.value?.feed_rate ?? 3)
const isPlaying = computed(() => playerState.value?.state === 'PLAYING')
const isStopped = computed(() => !playerState.value || playerState.value.state === 'STOPPED')
// The one line under the title: what is running, and how far in.
/**
 * How far through it is comes off this line: the ring around the disc already
 * draws it, and a percentage that ticks up on its own is exactly the kind of
 * thing that should be shown rather than written.
 */
const stageMeta = computed(() => {
  if (isStopped.value) return 'Pick a pattern to start the table'
  return currentPattern.value?.creator ?? undefined
})

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

// LED brightness for channel 0, shown as 0-100% (device scale 0-255).
// null until a strip is confirmed — no LEDs means no slider.
const ledBrightness = ref<number | null>(null)

async function loadBrightness() {
  if (!isActive.value) return
  try {
    const cfg = await store.api().led.getConfig()
    if (!cfg.channels.length) return
    const channel = await store.api().led.getChannel(0)
    ledBrightness.value = Math.round((channel.brightness / 255) * 100)
  } catch {
    ledBrightness.value = null
  }
}

async function onBrightnessChange(value: number | number[] | undefined) {
  const pct = Array.isArray(value) ? value[0] : (value ?? 0)
  ledBrightness.value = pct
  try {
    await store.api().led.setChannel(0, { brightness: Math.round((pct / 100) * 255) })
  } catch {
    // Leave the slider where the user put it; next refresh resyncs from the device
  }
}

async function togglePlayPause() {
  if (isPlaying.value) await store.pause()
  else if (playerState.value?.state === 'PAUSED') await store.resume()
}

function onSpeedChange(value: number | number[] | undefined) {
  const rate = Array.isArray(value) ? value[0] : value
  if (rate === undefined) return
  void store.setFeedRate(rate)
}

async function refresh() {
  if (!isActive.value) return
  await Promise.all([store.fetchPlayerState().catch(() => {}), loadBrightness()])
}

function syncHeader() {
  const d = store.activeDevice
  setHeader({
    title: d?.model || d?.name || 'Sand Table',
    backRoute: '/',
    actions: [
      {
        icon: 'i-fa6-solid:lightbulb',
        label: 'Lighting',
        onClick: () => router.push(`/tranquil/local/${encodeURIComponent(routeId.value)}/lighting`),
      },
      {
        icon: 'i-fa6-solid:gear',
        label: 'Settings',
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

<style scoped>
.connecting {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 9px 12px;
  font-family: var(--font-mono);
  font-size: 11.5px;
  letter-spacing: 0.02em;
  color: var(--k-ember-hi);
  background: rgb(231 145 20 / 0.08);
  border-bottom: 1px solid rgb(231 145 20 / 0.18);
}
.connecting__lamp {
  animation: state-pulse 1.4s ease-in-out infinite;
}
@keyframes state-pulse {
  0%,
  100% {
    transform: scale(1);
    opacity: 1;
  }
  50% {
    transform: scale(0.6);
    opacity: 0.45;
  }
}

/* Transport — one grouped row instead of three floating pills. */
.transport {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 6px;
  margin: 0 auto;
  border-radius: 999px;
  background: rgb(0 0 0 / 0.3);
  box-shadow: inset 0 0 0 1px var(--k-line);
}

.transport__btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 999px;
  color: var(--ui-text-muted);
  transition:
    color 0.16s,
    background 0.16s;
}
.transport__btn:active:not(:disabled) {
  background: rgb(255 255 255 / 0.06);
}
.transport__btn:disabled {
  opacity: 0.3;
}

/* An engaged toggle is lit, matching every other state in the app. */
.transport__btn--armed {
  color: var(--k-ember-hi);
  background: rgb(231 145 20 / 0.12);
  box-shadow: inset 0 0 0 1px rgb(231 145 20 / 0.24);
}

.transport__play {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 58px;
  height: 58px;
  border-radius: 999px;
  color: #1a0f02;
  background: linear-gradient(180deg, var(--k-ember-hi), var(--k-ember));
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 0.28),
    0 8px 22px -10px rgb(231 145 20 / 0.9);
  transition: transform 0.14s var(--k-ease);
}
.transport__play:active:not(:disabled) {
  transform: scale(0.94);
}
.transport__play:disabled {
  color: var(--ui-text-dimmed);
  background: rgb(255 255 255 / 0.05);
  box-shadow: inset 0 0 0 1px var(--k-line);
}

.controls {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 16px;
  border: 1px solid var(--k-line);
  border-radius: 14px;
  background: var(--k-panel);
  box-shadow: var(--k-bezel);
}

.control__label {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.control__value {
  font-size: 12.5px;
  color: var(--k-ember-hi);
}

.control__row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.control__cap {
  width: 1.125rem;
  height: 1.125rem;
  flex: none;
  color: var(--ui-text-dimmed);
}

.control__link {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  margin: -4px 0;
  padding: 4px 0;
}

.destination__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  flex: none;
  border-radius: 9px;
  color: var(--k-ember-hi);
  background: rgb(231 145 20 / 0.12);
  box-shadow: inset 0 0 0 1px rgb(231 145 20 / 0.2);
}

.control__link-title {
  display: block;
  font-size: 14px;
  font-weight: 500;
  color: var(--ui-text-highlighted);
}

.control__link-hint {
  display: block;
  margin-top: 1px;
  font-size: 12px;
  color: var(--ui-text-muted);
}
</style>
