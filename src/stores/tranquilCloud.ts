import { defineStore } from 'pinia'
import { ref } from 'vue'
import { App as CapacitorApp } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import {
  createTranquilCloudRest,
  DeliveryError,
  type TranquilCloudRestClient,
} from '@/lib/tranquil/cloud/rest'
import { TranquilError, ErrorCode } from '@/lib/tranquil/local/errors'
import type { PlayerState } from '@/lib/tranquil/local/types'
import { useNetworkStatus } from '@/composables/useNetworkStatus'
import type { DownloadState, UploadProgress } from './tranquilLocal'

/**
 * Cloud-backed control for ONE Tranquil table (off-LAN). The transport-agnostic
 * counterpart to useTranquilLocalStore: it exposes the SAME public surface, so
 * the shared views work over either. Commands go to device-api; live state
 * (online flag + player + download progress) is polled from ONE endpoint.
 *
 * Polling is adaptive and foreground-only:
 *   - 3 s while the table is online and something is playing/downloading,
 *   - 10 s while online but idle,
 *   - 20 s while the gateway reports it offline,
 *   - stopped entirely while the app is hidden / backgrounded (an immediate
 *     tick runs on resume).
 * Every ~45 s it also asks the device to keep progress updates flowing at the
 * fast cadence ("watch" window), so the ring moves smoothly without the table
 * spamming the cloud when nobody is looking.
 *
 * Upload post-processing (conversion/thumbnail) is LAN-only — you can't stream a
 * local file to a remote table — so `uploads` stays empty here.
 */

const POLL_ACTIVE_MS = 3000
const POLL_IDLE_MS = 10000
const POLL_OFFLINE_MS = 20000
const WATCH_REFRESH_MS = 45000
const STALL_MS = 3 * 60 * 1000

export interface CloudDeviceRef {
  id: string
  name?: string
  type?: string
  model?: string
  online?: boolean
}

export const useTranquilCloudStore = defineStore('tranquil_cloud', () => {
  const activeDevice = ref<CloudDeviceRef | null>(null)
  // "connected" = we can reach the cloud API for this table (parity with the
  // LAN store's socket flag). Whether the TABLE is reachable is `online`.
  const connected = ref(false)
  const online = ref<boolean | null>(null)
  const playerState = ref<PlayerState | null>(null)
  const led = ref(null)
  const error = ref<string | null>(null)
  const downloads = ref<Record<string, DownloadState>>({})
  const uploads = ref<Record<string, UploadProgress>>({})
  const libraryVersion = ref({ patterns: 0, playlists: 0 })
  const resuming = ref(false)
  const resumeFailed = ref(false)

  let rest: TranquilCloudRestClient | null = null
  let pollTimer: ReturnType<typeof setTimeout> | null = null
  let inFlight = false
  let lastWatchAt = 0
  let visible = true
  let lifecycleBound = false

  function api(): TranquilCloudRestClient {
    if (!rest) throw new TranquilError('No active table connection', ErrorCode.WsDisconnected)
    return rest
  }

  // No per-device origin over cloud; store thumbnails are keyed by uuid in views.
  function baseUrl(): string | null {
    return null
  }

  function connect(device: CloudDeviceRef): void {
    if (activeDevice.value?.id === device.id && rest) {
      if (device.name && !activeDevice.value.name) activeDevice.value = { ...activeDevice.value, ...device }
      return
    }
    disconnect()
    activeDevice.value = device
    online.value = device.online ?? null
    error.value = null
    rest = createTranquilCloudRest(device.id)
    bindLifecycle()
    // First tick asks the device for a fresh state (watch window opens too).
    lastWatchAt = 0
    void tick()
  }

  function disconnect(): void {
    stopPolling()
    rest = null
    inFlight = false
    connected.value = false
    online.value = null
    playerState.value = null
    error.value = null
    downloads.value = {}
    uploads.value = {}
    activeDevice.value = null
  }

  function stopPolling(): void {
    if (pollTimer) {
      clearTimeout(pollTimer)
      pollTimer = null
    }
  }

  function scheduleNext(): void {
    stopPolling()
    if (!rest || !visible) return
    const state = playerState.value?.state
    const busy =
      state === 'PLAYING' || Object.values(downloads.value).some((d) => !d.failed && d.pct < 100)
    const delay =
      online.value === false ? POLL_OFFLINE_MS : busy ? POLL_ACTIVE_MS : POLL_IDLE_MS
    pollTimer = setTimeout(() => void tick(), delay)
  }

  async function tick(): Promise<void> {
    if (!rest || inFlight) return
    inFlight = true
    const client = rest
    try {
      // Keep the device's fast progress cadence alive while we're watching.
      // Skipped while offline (it would only produce a 409 round trip).
      if (online.value !== false && Date.now() - lastWatchAt > WATCH_REFRESH_MS) {
        lastWatchAt = Date.now()
        void client.refresh(['player'], 60).catch(() => {})
      }
      const live = await client.live()
      if (rest !== client) return
      online.value = live.online
      playerState.value = live.player
      connected.value = true
      error.value = null
      reconcileDownloads(live.downloads)
    } catch (e) {
      if (rest !== client) return
      connected.value = false
      error.value = e instanceof Error ? e.message : 'Lost connection to the cloud'
    } finally {
      inFlight = false
      scheduleNext()
    }
  }

  function reconcileDownloads(
    active: { uuid: string; progressPct: number; failed: boolean; done: boolean; error?: string }[],
  ): void {
    const now = Date.now()
    const next = { ...downloads.value }
    for (const d of active) {
      next[d.uuid] = {
        pct: d.done ? 100 : d.progressPct,
        failed: d.failed,
        error: d.failed ? d.error || 'Download failed' : undefined,
        updatedAt: now,
      }
    }
    // Stall watchdog: nothing moving for STALL_MS ⇒ failed (device offline etc.).
    for (const [uuid, s] of Object.entries(next)) {
      if (!s.failed && s.pct < 100 && now - s.updatedAt > STALL_MS) {
        next[uuid] = { ...s, failed: true, error: 'Download stalled — check your table' }
      }
    }
    downloads.value = next
  }

  /** Poll right now (user action, resume, network back). */
  function reconnectNow(): void {
    lastWatchAt = 0
    void tick()
  }

  function bindLifecycle(): void {
    if (lifecycleBound) return
    lifecycleBound = true
    const onVisibility = () => {
      visible = document.visibilityState === 'visible'
      if (visible) reconnectNow()
      else stopPolling()
    }
    document.addEventListener('visibilitychange', onVisibility)
    if (Capacitor.isNativePlatform()) {
      void CapacitorApp.addListener('appStateChange', ({ isActive }) => {
        visible = isActive
        if (isActive) reconnectNow()
        else stopPolling()
      })
    }
    useNetworkStatus().onReconnect(() => reconnectNow())
  }

  function requestPatternDownload(patternUuid: string): void {
    if (!rest) throw new TranquilError('No active table connection', ErrorCode.WsDisconnected)
    error.value = null
    downloads.value = {
      ...downloads.value,
      [patternUuid]: { pct: 0, failed: false, updatedAt: Date.now() },
    }
    void rest.requestDownload(patternUuid).catch((e) => {
      // Not delivered (table offline): fail the entry now instead of letting
      // the UI spin for three minutes.
      const message = e instanceof Error ? e.message : 'Failed to start download'
      error.value = message
      downloads.value = {
        ...downloads.value,
        [patternUuid]: { pct: 0, failed: true, error: message, updatedAt: Date.now() },
      }
    })
  }

  function clearDownload(patternUuid: string): void {
    if (!(patternUuid in downloads.value)) return
    const next = { ...downloads.value }
    delete next[patternUuid]
    downloads.value = next
  }

  // Cloud uploads aren't supported; keep the method for interface parity.
  function clearUpload(): void {}

  async function fetchPlayerState(): Promise<void> {
    if (rest) playerState.value = await rest.player.getState()
  }

  async function requestLedSnapshot(): Promise<void> {}

  async function run(op: (r: TranquilCloudRestClient) => Promise<PlayerState>, failMsg: string) {
    error.value = null
    try {
      playerState.value = await op(api())
      online.value = true
    } catch (e) {
      if (e instanceof DeliveryError) online.value = false
      error.value = e instanceof Error ? e.message : failMsg
      throw e
    }
  }

  const play = (patternUuid?: string, playlistUuid?: string) =>
    run(
      (r) => r.player.play({ pattern_uuid: patternUuid, playlist_uuid: playlistUuid }),
      'Failed to play',
    )
  const pause = () => run((r) => r.player.patch({ is_paused: true }), 'Failed to pause')
  const resume = () => run((r) => r.player.patch({ is_paused: false }), 'Failed to resume')
  const stop = () => run((r) => r.player.stop(), 'Failed to stop')
  const skip = () => run((r) => r.player.skip(), 'Failed to skip')
  const previous = () => run((r) => r.player.previous(), 'Failed to go back')
  const setFeedRate = (rate: number) =>
    run((r) => r.player.patch({ feed_rate: rate }), 'Failed to set speed')
  const setShuffle = (enabled: boolean) =>
    run((r) => r.player.patch({ shuffle: enabled }), 'Failed to set shuffle')
  const setLoop = (enabled: boolean) =>
    run((r) => r.player.patch({ loop: enabled }), 'Failed to set repeat')

  return {
    activeDevice,
    connected,
    online,
    playerState,
    led,
    error,
    downloads,
    uploads,
    libraryVersion,
    resuming,
    resumeFailed,
    api,
    baseUrl,
    connect,
    reconnectNow,
    disconnect,
    fetchPlayerState,
    requestLedSnapshot,
    requestPatternDownload,
    clearDownload,
    clearUpload,
    play,
    pause,
    resume,
    stop,
    skip,
    previous,
    setFeedRate,
    setShuffle,
    setLoop,
  }
})
