<template>
  <PageLayout :on-refresh="load">
    <div v-if="!isActive" class="flex flex-col items-center gap-4 px-5 py-16 text-center">
      <UIcon name="i-fa6-solid:wifi" class="h-8 w-8 text-white/30" />
      <p class="text-white/70">This table isn't connected. Open it from your device list.</p>
      <UButton color="primary" variant="soft" @click="router.replace('/')">Go to devices</UButton>
    </div>

    <div v-else-if="loading" class="flex flex-1 items-center justify-center py-20">
      <UIcon name="i-fa6-solid:spinner" class="h-8 w-8 animate-spin text-white/50" />
    </div>

    <div
      v-else-if="!hasLEDs"
      class="rounded-lg border border-dashed border-white/20 p-8 text-center text-white/60"
    >
      No LED strip detected on this table.
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
            @change="onBrightness"
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

      <!-- Animation speed (animated effects only) -->
      <UCard v-if="isAnimatedEffect" class="bg-white/5">
        <div class="flex flex-col gap-2">
          <div class="flex items-center justify-between text-sm">
            <span class="font-medium">Animation speed</span>
            <span class="text-white/60">{{ channel.speed }}</span>
          </div>
          <input
            type="range"
            min="1"
            max="255"
            step="1"
            :value="channel.speed"
            class="w-full accent-primary-500"
            @change="onSpeed"
          />
          <div class="flex justify-between text-xs text-white/40">
            <span>Slow</span><span>Fast</span>
          </div>
        </div>
      </UCard>

      <p class="text-center text-xs text-white/40">
        {{ ledCount }} LEDs • {{ isRGBW ? 'RGBW' : 'RGB' }}
        <span v-if="pixdriverVersion"> • v{{ pixdriverVersion }}</span>
      </p>
    </div>
  </PageLayout>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PageLayout from '@/layouts/PageLayout.vue'
import TranquilColorPicker from '@/components/tranquil/TranquilColorPicker.vue'
import { usePageHeader } from '@/composables/usePageHeader'
import { useTranquilLocalStore } from '@/stores/tranquilLocal'
import { formatTranquilError } from '@/lib/tranquil/local/errors'
import type { LEDConfigResponse, LEDChannelState, LEDEffect } from '@/lib/tranquil/local/types'

const route = useRoute()
const router = useRouter()
const { setHeader } = usePageHeader()
const store = useTranquilLocalStore()

const routeId = computed(() => route.params.id as string)
const isActive = computed(() => store.activeDevice?.id === routeId.value)

const loading = ref(true)
const error = ref<string | null>(null)
const config = ref<LEDConfigResponse | null>(null)
const effects = ref<LEDEffect[]>([])

const channel = reactive<LEDChannelState>({
  effect_id: 'SOLID',
  brightness: 255,
  speed: 128,
  on: true,
  color: '#ffffff',
})

// Solid is static — the speed slider only applies to animated effects
const isAnimatedEffect = computed(() => channel.effect_id.toUpperCase() !== 'SOLID')

const hasLEDs = computed(() => (config.value?.channels.length ?? 0) > 0)
const ledCount = computed(() => config.value?.channels[0]?.num_leds ?? 0)
const isRGBW = computed(() =>
  (config.value?.channels[0]?.type ?? '').toUpperCase().includes('RGBW'),
)
const pixdriverVersion = computed(() => config.value?.version ?? '')
const brightnessPct = computed(() => Math.round((channel.brightness / 255) * 100))

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
    if ((cfg.channels.length ?? 0) > 0) {
      Object.assign(channel, await api.led.getChannel(0))
      if (!channel.color) channel.color = '#ffffff'
    }
  } catch (e) {
    error.value = formatTranquilError(e)
  } finally {
    loading.value = false
  }
}

async function apply(update: Partial<LEDChannelState>) {
  error.value = null
  try {
    Object.assign(channel, await store.api().led.setChannel(0, update))
  } catch (e) {
    error.value = formatTranquilError(e)
  }
}

const setOn = (on: boolean) => apply({ on })
const setEffect = (effect_id: string) => apply({ effect_id })
const onBrightness = (e: Event) =>
  apply({ brightness: Math.round((Number((e.target as HTMLInputElement).value) / 100) * 255) })
const onSpeed = (e: Event) => apply({ speed: Number((e.target as HTMLInputElement).value) })
const onColor = (color: string) => apply({ color })

onMounted(() => {
  setHeader({
    title: 'Lighting',
    backRoute: `/tranquil/local/${encodeURIComponent(routeId.value)}`,
  })
  void load()
})
</script>
