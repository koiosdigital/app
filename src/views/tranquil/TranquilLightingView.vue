<template>
  <PageLayout :on-refresh="load">
    <TranquilSessionGate :state="session.state.value" blocking @retry="session.retry">
      <div v-if="loading" class="flex flex-1 items-center justify-center py-20">
        <UIcon name="i-fa6-solid:spinner" class="h-8 w-8 animate-spin text-white/50" />
      </div>

      <div
        v-else-if="!hasLEDs"
        class="m-5 rounded-lg border border-dashed border-white/20 p-8 text-center text-white/60"
      >
        No LED strip is enabled on this table.
        <UButton
          v-if="!isCloud"
          color="neutral"
          variant="soft"
          size="sm"
          class="mt-4"
          @click="router.push(`${base}/settings`)"
        >
          LED hardware settings
        </UButton>
      </div>

      <div v-else class="flex flex-col gap-4 px-5 py-6">
        <UAlert v-if="error" color="error" icon="i-fa6-solid:circle-exclamation" :title="error" />

        <!-- Power -->
        <UCard class="bg-white/5">
          <div class="flex items-center justify-between">
            <span class="font-medium">Power</span>
            <USwitch :model-value="channel.on" @update:model-value="setOn" />
          </div>
        </UCard>

        <!-- Color (matrx-schema style: presets + custom picker) -->
        <UCard class="bg-white/5">
          <div class="flex items-center justify-between">
            <span class="font-medium">Color</span>
            <TranquilColorPicker
              :model-value="channel.color || '#ffffff'"
              @update:model-value="onColor"
            />
          </div>
        </UCard>

        <!-- White channels (RGBCCT strips only) -->
        <UCard v-if="isRGBCCT" class="bg-white/5">
          <div class="flex flex-col gap-3">
            <div class="flex flex-col gap-2">
              <div class="flex items-center justify-between text-sm">
                <span class="font-medium">Warm white</span>
                <span class="text-white/60">{{ warmPct }}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="255"
                step="5"
                :value="channel.w ?? 0"
                class="w-full accent-amber-400"
                @input="onWarmWhite"
              />
            </div>
            <div class="flex flex-col gap-2">
              <div class="flex items-center justify-between text-sm">
                <span class="font-medium">Cool white</span>
                <span class="text-white/60">{{ coolPct }}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="255"
                step="5"
                :value="channel.cw ?? 0"
                class="w-full accent-sky-300"
                @input="onCoolWhite"
              />
            </div>
          </div>
        </UCard>

        <!-- Brightness -->
        <UCard class="bg-white/5">
          <div class="flex flex-col gap-2">
            <div class="flex items-center justify-between text-sm">
              <span class="font-medium">Brightness</span>
              <span class="text-white/60">{{ brightnessPct }}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              step="5"
              :value="brightnessPct"
              class="w-full accent-primary-500"
              @input="onBrightness"
            />
          </div>
        </UCard>

        <!-- Effect -->
        <UCard class="bg-white/5">
          <div class="flex flex-col gap-3">
            <span class="font-medium">Effect</span>
            <div class="grid grid-cols-3 gap-2">
              <UButton
                v-for="effect in effects"
                :key="effect.id"
                :color="effect.id === channel.effect_id ? 'primary' : 'neutral'"
                :variant="effect.id === channel.effect_id ? 'solid' : 'soft'"
                size="sm"
                block
                @click="setEffect(effect.id)"
              >
                {{ effect.name }}
              </UButton>
            </div>
          </div>
        </UCard>

        <!-- Animation speed (animated effects only). The firmware's effect
             engine runs on a 1-10 scale. -->
        <UCard v-if="isAnimatedEffect" class="bg-white/5">
          <div class="flex flex-col gap-2">
            <div class="flex items-center justify-between text-sm">
              <span class="font-medium">Animation speed</span>
              <span class="text-white/60">{{ channel.speed }} / 10</span>
            </div>
            <input
              type="range"
              min="1"
              max="10"
              step="1"
              :value="channel.speed"
              class="w-full accent-primary-500"
              @input="onSpeed"
            />
            <div class="flex justify-between text-xs text-white/40">
              <span>Slow</span><span>Fast</span>
            </div>
          </div>
        </UCard>

        <p class="text-center text-xs text-white/40">
          {{ ledCount }} LEDs • {{ channelType }}
          <span v-if="pixdriverVersion"> • v{{ pixdriverVersion }}</span>
        </p>
      </div>
    </TranquilSessionGate>
  </PageLayout>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import PageLayout from '@/layouts/PageLayout.vue'
import TranquilColorPicker from '@/components/tranquil/TranquilColorPicker.vue'
import TranquilSessionGate from '@/components/tranquil/TranquilSessionGate.vue'
import { usePageHeader } from '@/composables/usePageHeader'
import { useTranquilSession } from '@/composables/useTranquilSession'
import { formatTranquilError } from '@/lib/tranquil/local/errors'
import { debounce } from '@/utils/debounce'
import type { LEDConfigResponse, LEDChannelState, LEDChannelUpdate, LEDEffect } from '@/lib/tranquil/local/types'

const router = useRouter()
const { setHeader } = usePageHeader()
const session = useTranquilSession()
const { store, isCloud, base, isActive } = session

const loading = ref(true)
const error = ref<string | null>(null)
const config = ref<LEDConfigResponse | null>(null)
const effects = ref<LEDEffect[]>([])

const channel = reactive<LEDChannelState>({
  effect_id: 'SOLID',
  brightness: 255,
  speed: 5,
  on: true,
  color: '#ffffff',
})

// Solid is static — the speed slider only applies to animated effects
const isAnimatedEffect = computed(() => channel.effect_id.toUpperCase() !== 'SOLID')

const hasLEDs = computed(() => (config.value?.channels[0]?.num_leds ?? 0) > 0)
const ledCount = computed(() => config.value?.channels[0]?.num_leds ?? 0)
const channelType = computed(() => (config.value?.channels[0]?.type ?? 'RGB').toUpperCase())
const isRGBCCT = computed(() => channelType.value === 'RGBCCT')
const pixdriverVersion = computed(() => config.value?.version ?? '')
const brightnessPct = computed(() => Math.round((channel.brightness / 255) * 100))
const warmPct = computed(() => Math.round(((channel.w ?? 0) / 255) * 100))
const coolPct = computed(() => Math.round(((channel.cw ?? 0) / 255) * 100))

async function load() {
  if (!isActive.value) {
    loading.value = false
    return
  }
  loading.value = true
  error.value = null
  try {
    const api = store.api()
    const [cfg, fx] = await Promise.all([api.led.getConfig(), api.led.getEffects()])
    config.value = cfg
    effects.value = fx
    const state = cfg.channels[0]?.state ?? (cfg.channels.length ? await api.led.getChannel(0) : null)
    if (state) Object.assign(channel, state)
    if (!channel.color) channel.color = '#ffffff'
  } catch (e) {
    error.value = formatTranquilError(e)
  } finally {
    loading.value = false
  }
}

// Another client (or the schedule) changed the lights: mirror the device's
// push unless the user is mid-drag here.
let localEditUntil = 0
watch(
  () => store.led?.channels[0],
  (state) => {
    if (!state || Date.now() < localEditUntil) return
    Object.assign(channel, state)
  },
)

// Writes are coalesced and serialised: a slider drag becomes one request
// every ~150 ms, and responses can't arrive out of order and clobber a newer
// value with an older one.
let pending: Partial<LEDChannelUpdate> = {}
let chain: Promise<void> = Promise.resolve()
const flush = debounce(() => {
  const update = pending
  pending = {}
  chain = chain.then(async () => {
    error.value = null
    try {
      const next = await store.api().led.setChannel(0, update)
      // Only adopt fields we didn't touch again meanwhile.
      for (const key of Object.keys(next) as (keyof LEDChannelState)[]) {
        if (!(key in pending)) (channel as unknown as Record<string, unknown>)[key] = next[key]
      }
    } catch (e) {
      error.value = formatTranquilError(e)
    }
  })
}, 150)

function apply(update: Partial<LEDChannelUpdate>) {
  localEditUntil = Date.now() + 1500
  Object.assign(channel, update)
  pending = { ...pending, ...update }
  flush()
}

const setOn = (on: boolean) => apply({ on })
const setEffect = (effect_id: string) => apply({ effect_id })
const onBrightness = (e: Event) =>
  apply({ brightness: Math.round((Number((e.target as HTMLInputElement).value) / 100) * 255) })
const onSpeed = (e: Event) => apply({ speed: Number((e.target as HTMLInputElement).value) })
const onColor = (color: string) => apply({ color })
const onWarmWhite = (e: Event) => apply({ w: Number((e.target as HTMLInputElement).value) })
const onCoolWhite = (e: Event) => apply({ cw: Number((e.target as HTMLInputElement).value) })

onMounted(() => {
  setHeader({
    title: 'Lighting',
    backRoute: base,
  })
  void load()
})
onUnmounted(() => flush.cancel())
watch(isActive, (active) => {
  if (active) void load()
})
</script>
