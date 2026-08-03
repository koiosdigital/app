import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { LocalDevice } from '@/lib/mdns/discovery'
import { createClockRest, type ClockRestClient } from '@/lib/clock/local/rest'
import type {
  ClockAbout,
  FibonacciConfig,
  FibonacciConfigUpdate,
  LedChannelInfo,
  LedChannelState,
  LedChannelUpdate,
  LedEffect,
  NixieConfig,
  NixieConfigUpdate,
} from '@/lib/clock/local/types'

/**
 * Active LAN-direct connection to ONE clock (nixie/wordclock/fibonacci),
 * discovered over mDNS. Clocks have no cloud control API — the device's local
 * HTTP server is the only control path. REST only: the current firmware exposes
 * no WebSocket, so state is fetched on connect/refresh and updated from command
 * responses.
 *
 * Variant capabilities: `/api/nixie` exists only on nixie, `/api/fibonacci` only
 * on fibonacci, and `/api/led/*` is absent on fibonacci (themes drive its LEDs).
 */
export const useClockLocalStore = defineStore('clock_local', () => {
  const activeDevice = ref<LocalDevice | null>(null)
  const connected = ref(false)
  const error = ref<string | null>(null)

  const about = ref<ClockAbout | null>(null)
  const nixie = ref<NixieConfig | null>(null)
  const fibonacci = ref<FibonacciConfig | null>(null)
  const ledChannels = ref<LedChannelInfo[]>([])
  const ledEffects = ref<LedEffect[]>([])
  // Channel 0 — clocks drive a single backlight strip.
  const ledChannel = ref<LedChannelState | null>(null)

  // Non-reactive transport handle.
  let rest: ClockRestClient | null = null

  /** Uppercased mDNS family of the active clock (NIXIE/WORDCLOCK/FIBONACCI). */
  const variant = computed(() => activeDevice.value?.type ?? null)
  const isNixie = computed(() => variant.value === 'NIXIE')
  const isFibonacci = computed(() => variant.value === 'FIBONACCI')
  const hasLeds = computed(() => ledChannels.value.length > 0)

  function api(): ClockRestClient {
    if (!rest) throw new Error('No active clock connection')
    return rest
  }

  /**
   * Connect to a discovered clock. Sets state synchronously (so a caller can
   * navigate immediately), then fetches initial state in the background.
   * Idempotent for the same device.
   */
  function connect(device: LocalDevice): void {
    if (activeDevice.value?.id === device.id && rest) return
    disconnect()
    if (!device.baseUrl) {
      error.value = 'Clock has no network address yet'
      return
    }

    activeDevice.value = device
    error.value = null
    rest = createClockRest(device.baseUrl)

    void refresh().catch(() => {})
  }

  /** Tear down the active connection. Safe to call when already disconnected. */
  function disconnect(): void {
    rest = null
    activeDevice.value = null
    connected.value = false
    error.value = null
    about.value = null
    nixie.value = null
    fibonacci.value = null
    ledChannels.value = []
    ledEffects.value = []
    ledChannel.value = null
  }

  /** Fetch the full state for the active variant. */
  async function refresh(): Promise<void> {
    const r = api()
    error.value = null
    try {
      about.value = await r.system.getAbout()
      connected.value = true
    } catch (e) {
      connected.value = false
      error.value = e instanceof Error ? e.message : 'Clock is not responding'
      throw e
    }

    if (isFibonacci.value) {
      fibonacci.value = await r.fibonacci.get().catch(() => null)
      return
    }

    // nixie + wordclock: LED backlight; nixie additionally has tube config.
    if (isNixie.value) {
      nixie.value = await r.nixie.get().catch(() => null)
    }
    try {
      const [cfg, fx] = await Promise.all([r.led.getConfig(), r.led.getEffects()])
      ledChannels.value = cfg.channels
      ledEffects.value = fx
      ledChannel.value = cfg.channels.length ? await r.led.getChannel(0) : null
    } catch {
      ledChannels.value = []
      ledEffects.value = []
      ledChannel.value = null
    }
  }

  async function run<T>(op: () => Promise<T>, assign: (result: T) => void, failMsg: string) {
    error.value = null
    try {
      assign(await op())
    } catch (e) {
      error.value = e instanceof Error ? e.message : failMsg
      throw e
    }
  }

  const setNixie = (update: NixieConfigUpdate) =>
    run(
      () => api().nixie.update(update),
      (cfg) => (nixie.value = cfg),
      'Failed to update clock',
    )

  const setFibonacci = (update: FibonacciConfigUpdate) =>
    run(
      () => api().fibonacci.update(update),
      (cfg) => (fibonacci.value = cfg),
      'Failed to update clock',
    )

  const setLedChannel = (update: LedChannelUpdate) =>
    run(
      () => api().led.setChannel(0, update),
      (state) => (ledChannel.value = state),
      'Failed to update lighting',
    )

  return {
    activeDevice,
    connected,
    error,
    about,
    nixie,
    fibonacci,
    ledChannels,
    ledEffects,
    ledChannel,
    variant,
    isNixie,
    isFibonacci,
    hasLeds,
    api,
    connect,
    disconnect,
    refresh,
    setNixie,
    setFibonacci,
    setLedChannel,
  }
})
