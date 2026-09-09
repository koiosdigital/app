<template>
  <PageLayout :on-refresh="refresh">
    <TranquilSessionGate :state="session.state.value" @retry="session.retry">
      <!-- pb clears the fixed bottom tab bar -->
      <div class="pb-28">
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
                <TranquilLedRing v-if="!isCloud" />
              </div>
            </div>
          </div>
        </DeviceStage>

        <div class="flex flex-col gap-5 px-4 py-5">
          <!-- Transport: play stays dead centre; the playlist toggles sit on
               its left, next / random loop on its right. -->
          <div class="transport">
            <div class="transport__side transport__side--left">
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
                class="transport__btn"
                :class="{ 'transport__btn--armed': playerState?.loop }"
                :disabled="!isPlaylist"
                aria-label="Repeat"
                @click="store.setLoop(!playerState?.loop)"
              >
                <UIcon name="i-fa6-solid:repeat" class="h-4 w-4" />
              </button>
            </div>

            <button
              type="button"
              class="transport__play"
              :disabled="isStopped"
              :aria-label="isPlaying ? 'Pause' : 'Play'"
              @click="togglePlayPause"
            >
              <UIcon :name="isPlaying ? 'i-fa6-solid:pause' : 'i-fa6-solid:play'" class="h-6 w-6" />
            </button>

            <div class="transport__side transport__side--right">
              <button
                type="button"
                class="transport__btn"
                :disabled="!canSkip"
                aria-label="Skip to next pattern"
                @click="store.skip()"
              >
                <UIcon name="i-fa6-solid:forward-step" class="h-4 w-4" />
              </button>

              <!-- Random loop: a random pattern after every pattern until
                   stopped. Starting a pattern or playlist by hand ends it. -->
              <button
                type="button"
                class="transport__btn"
                :class="{ 'transport__btn--armed': isRandomLoop }"
                :disabled="randomBusy"
                :aria-label="isRandomLoop ? 'Stop random loop after this pattern' : 'Random loop'"
                :aria-pressed="isRandomLoop"
                @click="toggleRandomLoop"
              >
                <UIcon name="i-fa6-solid:dice" class="h-4 w-4" />
              </button>
            </div>
          </div>

          <!-- Ball speed and light level, each with its reading -->
          <div class="controls">
            <div class="control">
              <div class="control__label">
                <span class="k-eyebrow">Ball speed</span>
                <span class="k-num control__value">{{ feedRateDraft.toFixed(2) }}×</span>
              </div>
              <div class="control__row">
                <UIcon name="i-lucide:turtle" class="control__cap" aria-hidden="true" />
                <USlider
                  :model-value="feedRateDraft"
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
                  <span class="k-num control__value">{{ ledOn ? `${ledBrightness}%` : 'Off' }}</span>
                </div>
                <div class="control__row">
                  <button
                    type="button"
                    class="control__cap"
                    :aria-label="ledOn ? 'Turn lights off' : 'Turn lights on'"
                    @click="toggleLed"
                  >
                    <UIcon :name="ledOn ? 'i-lucide:sun-dim' : 'i-fa6-solid:power-off'" class="h-full w-full" />
                  </button>
                  <USlider
                    :model-value="ledBrightness"
                    :min="0"
                    :max="100"
                    :step="5"
                    :disabled="!ledOn"
                    class="flex-1"
                    aria-label="Light level"
                    @update:model-value="onBrightnessChange"
                  />
                  <UIcon name="i-lucide:sun" class="control__cap" aria-hidden="true" />
                </div>
              </div>
            </template>

            <hr v-if="hasLeds" class="k-hairline" />
            <button
              v-if="hasLeds"
              type="button"
              class="control__link"
              @click="router.push(`${base}/lighting`)"
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
    </TranquilSessionGate>

    <TranquilTabBar />
  </PageLayout>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import PageLayout from '@/layouts/PageLayout.vue'
import { usePageHeader } from '@/composables/usePageHeader'
import { useTranquilSession } from '@/composables/useTranquilSession'
import { debounce } from '@/utils/debounce'
import type { Pattern } from '@/lib/tranquil/local/types'
import TranquilPatternThumb from '@/components/tranquil/TranquilPatternThumb.vue'
import TranquilLedRing from '@/components/tranquil/TranquilLedRing.vue'
import TranquilTabBar from '@/components/tranquil/TranquilTabBar.vue'
import TranquilSessionGate from '@/components/tranquil/TranquilSessionGate.vue'
import DeviceStage from '@/components/devices/DeviceStage.vue'

const router = useRouter()
const { setHeader } = usePageHeader()
const session = useTranquilSession()
const { store, isCloud, base, isActive } = session

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
  () =>
    playerState.value?.mode !== 'SINGLE_PATTERN' &&
    playerState.value?.mode !== 'RANDOM_LOOP' &&
    !!playerState.value?.current_playlist_uuid,
)
const isRandomLoop = computed(() => playerState.value?.mode === 'RANDOM_LOOP')
// Next makes sense inside a playlist and while random-looping (another pick).
const canSkip = computed(() => isPlaylist.value || isRandomLoop.value)

// Resolve the currently-playing pattern's metadata/thumbnail on demand.
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
    if (currentPattern.value?.uuid === uuid) return
    try {
      currentPattern.value = await store.api().patterns.get(uuid)
    } catch {
      currentPattern.value = null
    }
  },
  { immediate: true },
)

// --- Ball speed: the slider tracks the finger; the command is debounced so a
// drag sends one request, not one per step (each of which re-read state). The
// device's push resyncs the draft when it isn't being dragged.
const feedRateDraft = ref(feedRate.value)
let draggingSpeed = false
watch(feedRate, (v) => {
  if (!draggingSpeed) feedRateDraft.value = v
})
const sendFeedRate = debounce((rate: number) => {
  draggingSpeed = false
  void store.setFeedRate(rate).catch(() => {})
}, 250)
function onSpeedChange(value: number | number[] | undefined) {
  const rate = Array.isArray(value) ? value[0] : value
  if (rate === undefined) return
  draggingSpeed = true
  feedRateDraft.value = rate
  sendFeedRate(rate)
}

// --- LED: brightness/power for channel 0, shown as 0-100% (device 0-255).
// Fed by the device's LEDConfig push (both LAN and cloud), so another client
// or the schedule changing the lights is reflected here too.
const ledChannel = computed(() => store.led?.channels[0] ?? null)
const hasLeds = computed(() => !!store.led?.hasLeds && (store.led?.channels.length ?? 0) > 0)
const ledOn = computed(() => ledChannel.value?.on ?? false)
const ledBrightness = ref<number | null>(null)
let draggingBrightness = false
watch(
  () => ledChannel.value?.brightness,
  (b) => {
    if (b === undefined) {
      ledBrightness.value = null
      return
    }
    if (!draggingBrightness) ledBrightness.value = Math.round((b / 255) * 100)
  },
  { immediate: true },
)

const sendBrightness = debounce((pct: number) => {
  draggingBrightness = false
  void store
    .api()
    .led.setChannel(0, { brightness: Math.round((pct / 100) * 255) })
    .catch(() => {})
}, 250)
function onBrightnessChange(value: number | number[] | undefined) {
  const pct = Array.isArray(value) ? value[0] : (value ?? 0)
  draggingBrightness = true
  ledBrightness.value = pct
  sendBrightness(pct)
}
async function toggleLed() {
  try {
    await store.api().led.setChannel(0, { on: !ledOn.value })
  } catch {
    /* the device push resyncs */
  }
}

async function togglePlayPause() {
  if (isPlaying.value) await store.pause()
  else if (playerState.value?.state === 'PAUSED') await store.resume()
}

// Random loop toggle. On: keep whatever is drawing and chain random patterns
// after it, or start one now if the table is idle. Off: finish the current
// pattern, then stop. Play/pause keep working while it is on.
const randomBusy = ref(false)
async function toggleRandomLoop() {
  randomBusy.value = true
  try {
    await store.setRandomLoop(!isRandomLoop.value)
  } catch {
    /* the store surfaces the error; the device push resyncs the state */
  } finally {
    randomBusy.value = false
  }
}

async function refresh() {
  if (!isActive.value) {
    session.retry()
    return
  }
  await Promise.all([store.fetchPlayerState().catch(() => {}), store.requestLedSnapshot()])
  if (isCloud) {
    // Cloud mode has no push for LED state; pull it.
    void loadCloudLed()
  }
}

// Cloud mode: the device mirrors its LED snapshot to the cloud; read it once
// per mount (and on refresh) into the same `led` shape the LAN push fills.
async function loadCloudLed() {
  if (!isCloud || !isActive.value) return
  try {
    const cfg = await store.api().led.getConfig()
    const cloud = store as unknown as { led: unknown }
    cloud.led = {
      hasLeds: !!cfg.has_leds && cfg.channels.length > 0,
      ledCount: cfg.channels[0]?.num_leds ?? 0,
      format: cfg.channels[0]?.type ?? 'RGB',
      channels: cfg.channels.map((c) => c.state).filter((s) => !!s),
    }
  } catch {
    /* no LED info over cloud yet */
  }
}

function syncHeader() {
  const d = store.activeDevice
  setHeader({
    title: d?.model || d?.name || 'Sand Table',
    backRoute: '/',
    // Settings (motion config / calibration) is LAN-only; lighting works over
    // both transports now that the device mirrors its LED state.
    actions: [
      { icon: 'i-fa6-solid:calendar', label: 'Schedules', onClick: () => router.push(`${base}/schedules`) },
      { icon: 'i-fa6-solid:lightbulb', label: 'Lighting', onClick: () => router.push(`${base}/lighting`) },
      ...(isCloud
        ? []
        : [{ icon: 'i-fa6-solid:gear', label: 'Settings', onClick: () => router.push(`${base}/settings`) }]),
    ],
  })
}

onMounted(() => {
  syncHeader()
  // Returning from a sub-page: refresh state (WS pushes keep it live, but a
  // reconnecting socket may have missed a snapshot).
  if (isActive.value) void refresh()
})
onUnmounted(() => {
  sendFeedRate.cancel()
  sendBrightness.cancel()
})
watch(() => store.activeDevice?.id, syncHeader)
// Session restored after mount (reload / deep link): load what mount skipped.
watch(isActive, (active) => {
  if (active) void refresh()
})

// The connection is torn down by the router guard when leaving the
// /tranquil/local/ section — NOT on this view's unmount, so it survives
// navigation to the patterns/store/settings sub-pages.
</script>

<style scoped>
/* Transport — one grouped row instead of three floating pills. */
.transport {
  /* Equal side tracks keep the play button on the row's centre line no
     matter how many controls sit on either side of it. */
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 6px;
  padding: 6px;
  margin: 0 auto;
  width: 100%;
  max-width: 340px;
  border-radius: 999px;
  background: rgb(0 0 0 / 0.3);
  box-shadow: inset 0 0 0 1px var(--k-line);
}
.transport__side {
  display: flex;
  align-items: center;
  gap: 6px;
}
.transport__side--left {
  justify-self: end;
}
.transport__side--right {
  justify-self: start;
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
