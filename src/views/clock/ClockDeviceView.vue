<template>
  <PageLayout :on-refresh="refresh">
    <!-- Not connected (e.g. deep-linked / reloaded): discovery state is lost,
         so send the user back to the device list to reopen the clock. -->
    <div v-if="!isActive" class="flex flex-col items-center gap-4 px-5 py-16 text-center">
      <UIcon name="i-fa6-solid:wifi" class="h-8 w-8 text-white/30" />
      <p class="text-white/70">This clock isn't connected. Open it from your device list.</p>
      <UButton color="primary" variant="soft" @click="router.replace('/')">Go to devices</UButton>
    </div>

    <div v-else class="flex flex-col gap-4 px-5 py-6">
      <div
        v-if="!store.connected"
        class="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-sm text-amber-300"
      >
        <UIcon name="i-fa6-solid:spinner" class="h-4 w-4 animate-spin" />
        Connecting to the clock…
      </div>

      <UAlert
        v-if="store.error"
        color="error"
        icon="i-fa6-solid:circle-exclamation"
        :title="store.error"
      />

      <!-- Nixie tubes -->
      <template v-if="store.isNixie && store.nixie">
        <UCard class="bg-white/5">
          <div class="flex items-center justify-between">
            <span class="font-medium">Tubes</span>
            <USwitch
              :model-value="store.nixie.on"
              @update:model-value="(on) => store.setNixie({ on })"
            />
          </div>
        </UCard>

        <UCard class="bg-white/5">
          <div class="flex flex-col gap-2">
            <div class="flex items-center justify-between text-sm">
              <span class="font-medium">Tube brightness</span>
              <span class="text-white/60">{{ store.nixie.brightness }}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              step="1"
              :value="store.nixie.brightness"
              class="w-full accent-primary-500"
              @change="onNixieBrightness"
            />
          </div>
        </UCard>

        <UCard class="bg-white/5">
          <div class="flex flex-col gap-4">
            <div class="flex items-center justify-between">
              <span class="font-medium">24-hour time</span>
              <USwitch
                :model-value="store.nixie.military_time"
                @update:model-value="(military_time) => store.setNixie({ military_time })"
              />
            </div>
            <div class="flex items-center justify-between">
              <span class="font-medium">Blinking dots</span>
              <USwitch
                :model-value="store.nixie.blinking_dots"
                @update:model-value="(blinking_dots) => store.setNixie({ blinking_dots })"
              />
            </div>
          </div>
        </UCard>
      </template>

      <!-- Fibonacci -->
      <template v-if="store.isFibonacci && store.fibonacci">
        <UCard class="bg-white/5">
          <div class="flex items-center justify-between">
            <span class="font-medium">Power</span>
            <USwitch
              :model-value="store.fibonacci.on"
              @update:model-value="(on) => store.setFibonacci({ on })"
            />
          </div>
        </UCard>

        <UCard class="bg-white/5">
          <div class="flex flex-col gap-2">
            <div class="flex items-center justify-between text-sm">
              <span class="font-medium">Brightness</span>
              <span class="text-white/60">{{ fibBrightnessPct }}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              step="1"
              :value="fibBrightnessPct"
              class="w-full accent-primary-500"
              @change="onFibBrightness"
            />
          </div>
        </UCard>

        <UCard v-if="store.fibonacci.themes.length" class="bg-white/5">
          <div class="flex flex-col gap-3">
            <span class="font-medium">Theme</span>
            <div class="grid grid-cols-2 gap-2">
              <UButton
                v-for="theme in store.fibonacci.themes"
                :key="theme.id"
                :color="theme.id === store.fibonacci.theme_id ? 'primary' : 'neutral'"
                :variant="theme.id === store.fibonacci.theme_id ? 'solid' : 'soft'"
                size="sm"
                block
                @click="store.setFibonacci({ theme_id: theme.id })"
              >
                <span class="flex items-center gap-2">
                  <span class="flex">
                    <span
                      v-for="(c, i) in [theme.hour_color, theme.both_color, theme.minute_color]"
                      :key="i"
                      class="h-3 w-3 rounded-full ring-1 ring-black/30 first:ml-0 -ml-1"
                      :style="{ backgroundColor: c }"
                    />
                  </span>
                  {{ theme.name }}
                </span>
              </UButton>
            </div>
          </div>
        </UCard>
      </template>

      <!-- Backlight (nixie + wordclock; fibonacci has no LED API) -->
      <template v-if="store.hasLeds && store.ledChannel">
        <h2 v-if="store.isNixie" class="k-eyebrow mt-2">Backlight</h2>

        <UCard class="bg-white/5">
          <div class="flex items-center justify-between">
            <span class="font-medium">{{ store.isNixie ? 'Backlight' : 'Power' }}</span>
            <USwitch
              :model-value="store.ledChannel.on"
              @update:model-value="(on) => store.setLedChannel({ on })"
            />
          </div>
        </UCard>

        <UCard class="bg-white/5">
          <div class="flex items-center justify-between">
            <span class="font-medium">Color</span>
            <TranquilColorPicker :model-value="ledColorHex" @update:model-value="onLedColor" />
          </div>
        </UCard>

        <UCard class="bg-white/5">
          <div class="flex flex-col gap-2">
            <div class="flex items-center justify-between text-sm">
              <span class="font-medium">Brightness</span>
              <span class="text-white/60">{{ ledBrightnessPct }}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              step="1"
              :value="ledBrightnessPct"
              class="w-full accent-primary-500"
              @change="onLedBrightness"
            />
          </div>
        </UCard>

        <UCard v-if="store.ledEffects.length" class="bg-white/5">
          <div class="flex flex-col gap-3">
            <span class="font-medium">Effect</span>
            <div class="grid grid-cols-3 gap-2">
              <UButton
                v-for="effect in store.ledEffects"
                :key="effect.id"
                :color="effect.id === store.ledChannel.effect_id ? 'primary' : 'neutral'"
                :variant="effect.id === store.ledChannel.effect_id ? 'solid' : 'soft'"
                size="sm"
                block
                @click="store.setLedChannel({ effect_id: effect.id })"
              >
                {{ effect.name }}
              </UButton>
            </div>
          </div>
        </UCard>

        <UCard v-if="isAnimatedEffect" class="bg-white/5">
          <div class="flex flex-col gap-2">
            <div class="flex items-center justify-between text-sm">
              <span class="font-medium">Animation speed</span>
              <span class="text-white/60">{{ store.ledChannel.speed }}</span>
            </div>
            <input
              type="range"
              min="1"
              max="100"
              step="1"
              :value="store.ledChannel.speed"
              class="w-full accent-primary-500"
              @change="onLedSpeed"
            />
            <div class="flex justify-between text-xs text-white/40">
              <span>Slow</span><span>Fast</span>
            </div>
          </div>
        </UCard>
      </template>

      <p v-if="store.about" class="text-center text-xs text-white/40">
        {{ store.about.model }} • v{{ store.about.version }}
      </p>
    </div>
  </PageLayout>
</template>

<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PageLayout from '@/layouts/PageLayout.vue'
import { usePageHeader } from '@/composables/usePageHeader'
import { useClockLocalStore } from '@/stores/clockLocal'
import TranquilColorPicker from '@/components/tranquil/TranquilColorPicker.vue'
import type { LedColor } from '@/lib/clock/local/types'

const route = useRoute()
const router = useRouter()
const { setHeader } = usePageHeader()
const store = useClockLocalStore()

const routeId = computed(() => route.params.id as string)
// The connection is established by HomeView.openLocalDevice before navigation;
// this view just drives the already-active connection.
const isActive = computed(() => store.activeDevice?.id === routeId.value)

// Solid is static — the speed slider only applies to animated effects.
const isAnimatedEffect = computed(
  () => (store.ledChannel?.effect_id ?? 'SOLID').toUpperCase() !== 'SOLID',
)

const fibBrightnessPct = computed(() =>
  Math.round(((store.fibonacci?.brightness ?? 0) / 255) * 100),
)
const ledBrightnessPct = computed(() =>
  Math.round(((store.ledChannel?.brightness ?? 0) / 255) * 100),
)

// The picker works in hex; the clock API in {r,g,b}.
const ledColorHex = computed(() => {
  const c = store.ledChannel?.color
  if (!c) return '#ffffff'
  const hex = (v: number) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')
  return `#${hex(c.r)}${hex(c.g)}${hex(c.b)}`
})

function onLedColor(hexColor: string) {
  const color: LedColor = {
    r: parseInt(hexColor.slice(1, 3), 16),
    g: parseInt(hexColor.slice(3, 5), 16),
    b: parseInt(hexColor.slice(5, 7), 16),
  }
  void store.setLedChannel({ color })
}

const sliderValue = (e: Event) => Number((e.target as HTMLInputElement).value)

const onNixieBrightness = (e: Event) => void store.setNixie({ brightness: sliderValue(e) })
const onFibBrightness = (e: Event) =>
  void store.setFibonacci({ brightness: Math.round((sliderValue(e) / 100) * 255) })
const onLedBrightness = (e: Event) =>
  void store.setLedChannel({ brightness: Math.round((sliderValue(e) / 100) * 255) })
const onLedSpeed = (e: Event) => void store.setLedChannel({ speed: sliderValue(e) })

async function refresh() {
  if (!isActive.value) return
  await store.refresh().catch(() => {})
}

function syncHeader() {
  const d = store.activeDevice
  setHeader({
    title: d?.model || d?.name || 'Clock',
    backRoute: '/',
  })
}

onMounted(() => {
  syncHeader()
  // Returning to this page: resync in case commands elsewhere changed state.
  void refresh()
})
watch(() => store.activeDevice?.id, syncHeader)

// The connection is torn down by the router guard when leaving the
// /clock/local/ section — NOT on this view's unmount.
</script>
