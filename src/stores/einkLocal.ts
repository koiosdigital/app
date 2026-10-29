import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { LocalDevice } from '@/lib/mdns/discovery'
import { createEinkRest, type EinkRestClient } from '@/lib/eink/local/rest'
import {
  screenDimensions,
  type EinkDeviceInfo,
  type EinkDitherSettings,
  type EinkSettings,
  type EinkSettingsUpdate,
} from '@/lib/eink/local/types'

/**
 * Active LAN-direct connection to ONE eInk frame, discovered over mDNS. Frames
 * have no cloud control API — the device's local HTTP server is the only
 * control path, and it is only reachable while the frame is awake (it deep
 * sleeps between scheduled wakes). REST only.
 *
 * The frame's dither/saturation/gamma are write-only in the Tier 1 API
 * (/deviceInfo does not report them back), so `dither` here is the app's own
 * working copy, seeded with neutral defaults.
 */
export const useEinkLocalStore = defineStore('eink_local', () => {
  const activeDevice = ref<LocalDevice | null>(null)
  const connected = ref(false)
  const busy = ref(false)
  const error = ref<string | null>(null)
  const info = ref<EinkDeviceInfo | null>(null)
  const settings = ref<EinkSettings | null>(null)

  const dither = ref<EinkDitherSettings>({ dither: 0, saturation: 1, gamma: 1 })

  let rest: EinkRestClient | null = null

  const panel = computed(() => screenDimensions(info.value?.screen_model))
  const battery = computed(() => info.value?.battery ?? null)

  function api(): EinkRestClient {
    if (!rest) throw new Error('No active eInk connection')
    return rest
  }

  function connect(device: LocalDevice): void {
    if (activeDevice.value?.id === device.id && rest) return
    disconnect()
    if (!device.baseUrl) {
      error.value = 'Frame has no network address yet'
      return
    }
    activeDevice.value = device
    error.value = null
    rest = createEinkRest(device.baseUrl)
    void refresh().catch(() => {})
  }

  function disconnect(): void {
    rest = null
    activeDevice.value = null
    connected.value = false
    error.value = null
    info.value = null
    settings.value = null
  }

  async function refresh(): Promise<void> {
    try {
      const [di, cfg] = await Promise.all([api().deviceInfo(), api().getSettings()])
      info.value = di
      settings.value = cfg
      // /settings now reports the live dither/sat/gamma, so seed the working copy.
      dither.value = { dither: cfg.dither, saturation: cfg.saturation, gamma: cfg.gamma }
      connected.value = true
      error.value = null
    } catch (e) {
      connected.value = false
      error.value = e instanceof Error ? e.message : 'Could not reach the frame'
      throw e
    }
  }

  /** Patch wake cadence / upstream server (and anything else) via POST /settings. */
  async function updateSettings(patch: EinkSettingsUpdate): Promise<void> {
    busy.value = true
    try {
      settings.value = await api().updateSettings(patch)
      error.value = null
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Could not save settings'
      throw e
    } finally {
      busy.value = false
    }
  }

  async function applyDither(next: EinkDitherSettings): Promise<void> {
    busy.value = true
    try {
      await api().setDither(next)
      dither.value = { ...next }
      error.value = null
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Could not update display settings'
      throw e
    } finally {
      busy.value = false
    }
  }

  async function clearScreen(): Promise<void> {
    busy.value = true
    try {
      await api().clearScreen()
      error.value = null
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Could not clear the screen'
      throw e
    } finally {
      busy.value = false
    }
  }

  /** Push a panel-sized JPEG to the frame and show it immediately. Uses
   * /display (decode-and-show, no flash write) so the frame's tiny gallery
   * never fills up — the phone is the gallery. */
  async function showOnFrame(jpeg: Blob, filename: string): Promise<void> {
    busy.value = true
    try {
      await api().display(jpeg, filename)
      error.value = null
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Could not send the photo to the frame'
      throw e
    } finally {
      busy.value = false
    }
  }

  return {
    activeDevice,
    connected,
    busy,
    error,
    info,
    settings,
    dither,
    panel,
    battery,
    connect,
    disconnect,
    refresh,
    updateSettings,
    applyDither,
    clearScreen,
    showOnFrame,
  }
})
