import { defineStore } from 'pinia'
import { ref, watch, type WatchStopHandle } from 'vue'
import { create } from '@bufbuild/protobuf'
import { App as CapacitorApp } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'
import {
  TranquilMessageSchema,
  PlayerState_PlaybackState,
  PlayerState_PlayMode,
} from '@/types/proto/kd/v1/tranquil_pb'
import { isDiscoverySupported, watchKoiosDevices, type LocalDevice } from '@/lib/mdns/discovery'
import { createTranquilRest, type TranquilRestClient } from '@/lib/tranquil/local/rest'
import { TranquilWebSocket } from '@/lib/tranquil/local/ws'
import { TranquilError, ErrorCode } from '@/lib/tranquil/local/errors'
import type { LEDChannelState, PlayerState } from '@/lib/tranquil/local/types'
import { useNetworkStatus } from '@/composables/useNetworkStatus'
import { useLocalDevicesStore } from '@/stores/localDevices'

/** Live store→table download progress for one pattern. */
export interface DownloadState {
  /** 0-100. Reaches 100 when the pattern is fully on the table. */
  pct: number
  /** Terminal failure: the pipeline gave up. `error` describes why. */
  failed: boolean
  error?: string
  /** ms epoch of the last update, used by the stall watchdog. */
  updatedAt: number
}

/** Live upload post-processing progress (device-side convert → thumbnail). */
export interface UploadProgress {
  /** Which stage the device is in. */
  phase: 'converting' | 'rendering'
  /** 0-100 within the current phase. */
  pct: number
  /** True once both stages finished successfully. */
  done: boolean
  /** Terminal failure of convert or thumbnail. */
  failed: boolean
  error?: string
  updatedAt: number
}

/** Live LED snapshot pushed by the device (LEDConfig with channel state). */
export interface LedSnapshot {
  hasLeds: boolean
  ledCount: number
  /** 'RGB' | 'RGBW' | 'RGBCCT' */
  format: string
  channels: LEDChannelState[]
}

// A download/upload that hasn't advanced in this long is assumed dead (device
// went offline, or we missed the terminal frame while disconnected). Progress
// frames arrive far more often than this, so it only trips on a true stall.
const STALL_MS = 3 * 60 * 1000

// Where the last-opened table is remembered, so a page reload (iOS reloads
// the WebView after a background content-process kill) or a deep link can
// reconnect without going through the device list.
const LAST_DEVICE_KEY = 'tranquil.last_local_device'

// How long resume() waits for mDNS to re-resolve a table whose cached address
// no longer answers.
const RESOLVE_TIMEOUT_MS = 8000

// A library / playlist change pushed by the device (the tables push the full
// list on every change so every client stays in sync). Views subscribe to
// re-fetch; the payload itself is not kept here - the REST list is paginated
// and richer than the socket copy.
export type LibraryChange = 'patterns' | 'playlists' | 'schedule'

/**
 * Active LAN-direct connection to ONE Tranquil table, discovered over mDNS.
 * This store owns the REST client, the WebSocket, and the real-time state for
 * whichever table the user opened. Commands go over REST; the socket pushes
 * player state, LED state, library changes and progress reports.
 *
 * Connection recovery: the socket reconnects on its own (backoff + liveness
 * checks); an app resume or the network coming back triggers an immediate
 * retry; after a few failures in a row the table is re-resolved over mDNS in
 * case its address changed; and `resume(id)` restores a session from the
 * persisted device record after a reload.
 */
export const useTranquilLocalStore = defineStore('tranquil_local', () => {
  const activeDevice = ref<LocalDevice | null>(null)
  const connected = ref(false)
  const playerState = ref<PlayerState | null>(null)
  const led = ref<LedSnapshot | null>(null)
  const error = ref<string | null>(null)
  // Live store→table download progress, keyed by pattern uuid.
  const downloads = ref<Record<string, DownloadState>>({})
  // Live upload post-processing progress, keyed by pattern uuid.
  const uploads = ref<Record<string, UploadProgress>>({})
  // Monotonic counters views watch to refetch their lists.
  const libraryVersion = ref<Record<LibraryChange, number>>({ patterns: 0, playlists: 0, schedule: 0 })
  // resume() in progress (reload / deep link / address lost).
  const resuming = ref(false)
  // resume() gave up: the table is not reachable on this network.
  const resumeFailed = ref(false)

  // Non-reactive transport handles (class instances / unsubscribers).
  let rest: TranquilRestClient | null = null
  let ws: TranquilWebSocket | null = null
  let unsubs: Array<() => void> = []
  let stopConnWatch: WatchStopHandle | null = null
  let stopAddressWatch: WatchStopHandle | null = null
  let watchdog: ReturnType<typeof setInterval> | null = null
  let lifecycleBound = false
  let resolveInFlight: Promise<LocalDevice | null> | null = null

  function api(): TranquilRestClient {
    if (!rest) throw new TranquilError('No active table connection', ErrorCode.WsDisconnected)
    return rest
  }

  /** REST base URL of the active table (for thumbnails etc.), or null. */
  function baseUrl(): string | null {
    return rest?.baseUrl ?? null
  }

  /**
   * Connect to a discovered table. Sets up state synchronously (so a caller can
   * navigate immediately), then opens the socket and fetches initial state in
   * the background. Idempotent for the same device AND address; a changed
   * address (DHCP) re-points the socket instead of keeping the stale one.
   */
  function connect(device: LocalDevice): void {
    if (activeDevice.value?.id === device.id && ws) {
      if (device.baseUrl && device.baseUrl !== rest?.baseUrl) {
        rest = createTranquilRest(device.baseUrl)
        activeDevice.value = device
        ws.rebase(device.baseUrl)
        void persistDevice(device)
      }
      return
    }
    disconnect()
    if (!device.baseUrl) {
      error.value = 'Table has no network address yet'
      return
    }

    activeDevice.value = device
    error.value = null
    resumeFailed.value = false
    rest = createTranquilRest(device.baseUrl)
    ws = new TranquilWebSocket(device.baseUrl)

    unsubs.push(
      ws.subscribe('playerState', (msg) => {
        if (msg.message?.case === 'playerState') {
          playerState.value = mapPlayerState(msg.message.value)
        }
      }),
    )
    unsubs.push(
      ws.subscribe('ledConfig', (msg) => {
        if (msg.message?.case !== 'ledConfig') return
        const cfg = msg.message.value
        led.value = {
          hasLeds: cfg.hasLeds,
          ledCount: cfg.ledCount,
          format: cfg.format === 3 ? 'RGBCCT' : cfg.format === 2 ? 'RGBW' : 'RGB',
          channels: cfg.channels.map((ch) => ({
            effect_id: ch.effectId,
            brightness: ch.brightness,
            speed: ch.speed,
            on: ch.enabled,
            color: ch.color ? rgbToHex(ch.color.r, ch.color.g, ch.color.b) : '#ffffff',
            w: ch.color?.w,
            cw: ch.color?.cw,
          })),
        }
      }),
    )
    // Library pushes: the device sends the full list on any change (delete,
    // rename, upload, download, playlist CRUD) - bump a version so open
    // views refetch via REST.
    unsubs.push(
      ws.subscribe('downloadedPatterns', () => {
        libraryVersion.value = { ...libraryVersion.value, patterns: libraryVersion.value.patterns + 1 }
      }),
    )
    unsubs.push(
      ws.subscribe('playlists', () => {
        libraryVersion.value = { ...libraryVersion.value, playlists: libraryVersion.value.playlists + 1 }
      }),
    )
    // Schedule pushes (after any client's set, LAN or cloud): the schedules
    // view refetches over REST.
    unsubs.push(
      ws.subscribe('schedule', () => {
        libraryVersion.value = { ...libraryVersion.value, schedule: libraryVersion.value.schedule + 1 }
      }),
    )
    // Reports arrive incrementally and merge by uuid: a normal frame carries all
    // active downloads, while a terminal failure frame carries just the one that
    // failed. Never replace the whole map — merge each entry.
    unsubs.push(
      ws.subscribe('patternDownloadProgress', (msg) => {
        if (msg.message?.case !== 'patternDownloadProgress') return
        const now = Date.now()
        const next = { ...downloads.value }
        for (const d of msg.message.value.downloads) {
          next[d.uuid] = {
            pct: d.progressPct,
            failed: d.failed,
            error: d.failed ? d.error || 'Download failed' : undefined,
            updatedAt: now,
          }
        }
        downloads.value = next
      }),
    )
    unsubs.push(
      ws.subscribe('patternConversionProgress', (msg) => {
        if (msg.message?.case !== 'patternConversionProgress') return
        const now = Date.now()
        const next = { ...uploads.value }
        for (const c of msg.message.value.conversions) {
          next[c.uuid] = {
            phase: 'converting',
            pct: c.progressPct,
            // "converting" -> "complete" here just means convert finished; the
            // thumbnail stage still follows, so it's not `done` yet.
            done: false,
            failed: c.stage === 'failed',
            error: c.stage === 'failed' ? c.error || 'Conversion failed' : undefined,
            updatedAt: now,
          }
        }
        uploads.value = next
      }),
    )
    unsubs.push(
      ws.subscribe('patternThumbProgress', (msg) => {
        if (msg.message?.case !== 'patternThumbProgress') return
        const now = Date.now()
        const next = { ...uploads.value }
        for (const t of msg.message.value.thumbnails) {
          next[t.uuid] = {
            phase: 'rendering',
            pct: t.progressPct,
            done: t.stage === 'complete',
            failed: t.stage === 'failed',
            error: t.stage === 'failed' ? t.error || 'Thumbnail failed' : undefined,
            updatedAt: now,
          }
        }
        uploads.value = next
      }),
    )
    stopConnWatch = watch(
      ws.connected,
      (v) => {
        connected.value = v
        if (v) {
          // (Re)connected: the socket may have missed pushes - resync.
          void fetchPlayerState().catch(() => {})
          void requestLedSnapshot()
        }
      },
      { immediate: true },
    )
    ws.connect()
    startWatchdog()
    bindLifecycle()
    followAddress()
    void persistDevice(device)

    void fetchPlayerState().catch(() => {})
  }

  /**
   * Restore the session for a table by its mDNS service name, e.g. after the
   * WebView was reloaded on `/tranquil/local/:id` or the page was deep-linked.
   * Tries the last-known address first (fast), then re-resolves over mDNS.
   * Resolves true when a connection was set up.
   */
  async function resume(id: string): Promise<boolean> {
    if (activeDevice.value?.id === id && ws) return true
    if (resuming.value) return false
    resuming.value = true
    resumeFailed.value = false
    try {
      // 1. Fresh discovery result already in memory?
      const live = useLocalDevicesStore().devices.find((d) => d.id === id)
      if (live?.baseUrl) {
        connect(live)
        return true
      }
      // 2. Last-known record: probe it, then fall back to a scan.
      const cached = await loadPersistedDevice()
      if (cached && cached.id === id && cached.baseUrl) {
        if (await probe(cached.baseUrl)) {
          connect(cached)
          return true
        }
      }
      // 3. mDNS: wait for the service to (re)appear.
      const found = await resolveById(id)
      if (found) {
        connect(found)
        return true
      }
      resumeFailed.value = true
      return false
    } finally {
      resuming.value = false
    }
  }

  /** Quick reachability check of a table's REST API. */
  async function probe(url: string): Promise<boolean> {
    try {
      await createTranquilRest(url).system.getAbout()
      return true
    } catch {
      return false
    }
  }

  /**
   * Re-resolve a table by service name over mDNS (native only). Shares one
   * in-flight scan between callers.
   */
  function resolveById(id: string): Promise<LocalDevice | null> {
    if (!isDiscoverySupported()) return Promise.resolve(null)
    if (resolveInFlight) return resolveInFlight
    resolveInFlight = new Promise<LocalDevice | null>((resolve) => {
      let settled = false
      let handle: { stop: () => Promise<void> } | null = null
      const finish = (device: LocalDevice | null) => {
        if (settled) return
        settled = true
        resolve(device)
        void handle?.stop()
      }
      const timer = setTimeout(() => finish(null), RESOLVE_TIMEOUT_MS)
      watchKoiosDevices((event) => {
        if (event.action === 'resolved' && event.device.id === id && event.device.baseUrl) {
          clearTimeout(timer)
          finish(event.device)
        }
      })
        .then((h) => {
          handle = h
          if (settled) void h.stop()
        })
        .catch(() => {
          clearTimeout(timer)
          finish(null)
        })
    }).finally(() => {
      resolveInFlight = null
    })
    return resolveInFlight
  }

  /**
   * Try again right now: after the app comes to the foreground, when the
   * network returns, or from a "Retry" button. Skips the socket backoff, and
   * after repeated failures also re-resolves the address over mDNS.
   */
  function reconnectNow(): void {
    if (!ws || !activeDevice.value) return
    if (ws.failures >= 3) {
      const id = activeDevice.value.id
      void resolveById(id).then((found) => {
        if (found?.baseUrl && activeDevice.value?.id === id) connect(found)
      })
    }
    ws.forceReconnect()
    void fetchPlayerState().catch(() => {})
  }

  // App foreground + network-online both mean "the world changed": retry
  // immediately instead of waiting out a backoff that was computed while we
  // were asleep.
  function bindLifecycle(): void {
    if (lifecycleBound) return
    lifecycleBound = true
    useNetworkStatus().onReconnect(() => reconnectNow())
    if (Capacitor.isNativePlatform()) {
      void CapacitorApp.addListener('appStateChange', ({ isActive }) => {
        if (isActive) reconnectNow()
      })
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') reconnectNow()
      })
    }
  }

  // While a table is open, follow its address in the discovery results so a
  // DHCP change re-points the socket without going back to the device list.
  function followAddress(): void {
    stopAddressWatch?.()
    const local = useLocalDevicesStore()
    void local.start()
    stopAddressWatch = watch(
      () => local.devices.find((d) => d.id === activeDevice.value?.id)?.baseUrl ?? null,
      (url) => {
        if (url && activeDevice.value && url !== rest?.baseUrl) {
          connect({ ...activeDevice.value, baseUrl: url })
        }
      },
    )
  }

  async function persistDevice(device: LocalDevice): Promise<void> {
    try {
      await Preferences.set({ key: LAST_DEVICE_KEY, value: JSON.stringify(device) })
    } catch {
      /* best effort */
    }
  }

  async function loadPersistedDevice(): Promise<LocalDevice | null> {
    try {
      const { value } = await Preferences.get({ key: LAST_DEVICE_KEY })
      return value ? (JSON.parse(value) as LocalDevice) : null
    } catch {
      return null
    }
  }

  // Fail out downloads/uploads that stop advancing entirely — the device went
  // offline, or we missed the terminal frame while the socket was down — so the
  // UI stops spinning forever.
  function startWatchdog(): void {
    if (watchdog) return
    watchdog = setInterval(() => {
      const now = Date.now()
      let dChanged = false
      const d = { ...downloads.value }
      for (const [uuid, s] of Object.entries(d)) {
        if (!s.failed && s.pct < 100 && now - s.updatedAt > STALL_MS) {
          d[uuid] = { ...s, failed: true, error: 'Download stalled — check your table' }
          dChanged = true
        }
      }
      if (dChanged) downloads.value = d

      let uChanged = false
      const u = { ...uploads.value }
      for (const [uuid, s] of Object.entries(u)) {
        if (!s.failed && !s.done && now - s.updatedAt > STALL_MS) {
          u[uuid] = { ...s, failed: true, error: 'Processing stalled — check your table' }
          uChanged = true
        }
      }
      if (uChanged) uploads.value = u
    }, 5000)
  }

  /**
   * Ask the table to fetch a store pattern from the cloud. The device forwards
   * the request over its own device-plane cloud link and downloads with its
   * certificate — the app just names the pattern. Progress arrives on the
   * `downloads` map via the WS `patternDownloadProgress` report.
   */
  function requestPatternDownload(patternUuid: string): void {
    if (!ws) throw new TranquilError('No active table connection', ErrorCode.WsDisconnected)
    error.value = null
    try {
      void ws.request(
        create(TranquilMessageSchema, {
          message: { case: 'requestPatternDownload', value: { patternUuid } },
        }),
      )
      // Optimistic 0%. The request is fire-and-forget over the socket, so if the
      // device never picks it up the watchdog will fail it out after STALL_MS.
      downloads.value = {
        ...downloads.value,
        [patternUuid]: { pct: 0, failed: false, updatedAt: Date.now() },
      }
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to start download'
      throw e
    }
  }

  /** Drop a terminal (done/failed) download entry so its UI resets. */
  function clearDownload(patternUuid: string): void {
    if (!(patternUuid in downloads.value)) return
    const next = { ...downloads.value }
    delete next[patternUuid]
    downloads.value = next
  }

  /** Drop a terminal (done/failed) upload entry so its UI resets. */
  function clearUpload(patternUuid: string): void {
    if (!(patternUuid in uploads.value)) return
    const next = { ...uploads.value }
    delete next[patternUuid]
    uploads.value = next
  }

  /** Tear down the active connection. Safe to call when already disconnected. */
  function disconnect(): void {
    for (const unsub of unsubs) unsub()
    unsubs = []
    stopConnWatch?.()
    stopConnWatch = null
    stopAddressWatch?.()
    stopAddressWatch = null
    if (watchdog) {
      clearInterval(watchdog)
      watchdog = null
    }
    ws?.disconnect()
    ws = null
    rest = null
    connected.value = false
    playerState.value = null
    led.value = null
    downloads.value = {}
    uploads.value = {}
    activeDevice.value = null
    resumeFailed.value = false
  }

  async function fetchPlayerState(): Promise<void> {
    playerState.value = await api().player.getState()
  }

  /** Ask the device for its LED snapshot over the socket (fills `led`). */
  async function requestLedSnapshot(): Promise<void> {
    if (!ws) return
    try {
      await ws.request(
        create(TranquilMessageSchema, { message: { case: 'ledConfigRequest', value: {} } }),
      )
    } catch {
      /* the LEDConfig broadcast handler fills `led` when it arrives */
    }
  }

  async function run(op: (r: TranquilRestClient) => Promise<PlayerState>, failMsg: string) {
    error.value = null
    try {
      playerState.value = await op(api())
    } catch (e) {
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
  const resumePlayback = () =>
    run((r) => r.player.patch({ is_paused: false }), 'Failed to resume')
  // emergency=true is the e-stop: halt motion immediately (not a graceful stop).
  const stop = (emergency = false) =>
    run((r) => r.player.stop(emergency ? { emergency_stop: true } : undefined), 'Failed to stop')
  // Firmware has no previous-track on REST; skip is next-only.
  const skip = () => run((r) => r.player.skip(), 'Failed to skip')
  const setFeedRate = (rate: number) =>
    run((r) => r.player.patch({ feed_rate: rate }), 'Failed to set speed')
  const setShuffle = (enabled: boolean) =>
    run((r) => r.player.patch({ shuffle: enabled }), 'Failed to set shuffle')
  const setLoop = (enabled: boolean) =>
    run((r) => r.player.patch({ loop: enabled }), 'Failed to set repeat')

  return {
    activeDevice,
    connected,
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
    resume: resumePlayback,
    stop,
    skip,
    setFeedRate,
    setShuffle,
    setLoop,
    // Session restore lives under a distinct name so `resume` keeps meaning
    // "resume playback" for the shared control surface.
    restoreSession: resume,
  }
})

function rgbToHex(r: number, g: number, b: number): string {
  const h = (v: number) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')
  return `#${h(r)}${h(g)}${h(b)}`
}

/** Proto PlayerState (camelCase, numeric enums) → REST PlayerState shape. */
function mapPlayerState(ps: {
  state: number
  mode: number
  currentPatternUuid?: string
  currentPlaylistUuid?: string
  progressPercent: number
  patternIndex?: number
  playlistSize?: number
  feedRate: number
  shuffle: boolean
  loop: boolean
}): PlayerState {
  // Map by proto enum, not raw numbers: 0 is UNSPECIFIED, so a numeric
  // mapping starting at 0 is shifted by one (PLAYING rendered as PAUSED,
  // STOPPED as PLAYING).
  return {
    state:
      ps.state === PlayerState_PlaybackState.PLAYING
        ? 'PLAYING'
        : ps.state === PlayerState_PlaybackState.PAUSED
          ? 'PAUSED'
          : 'STOPPED',
    mode:
      ps.mode === PlayerState_PlayMode.PLAYLIST
        ? 'PLAYLIST'
        : ps.mode === PlayerState_PlayMode.PLAYLIST_LOOP
          ? 'PLAYLIST_LOOP'
          : ps.mode === PlayerState_PlayMode.PLAYLIST_SHUFFLE
            ? 'PLAYLIST_SHUFFLE'
            : 'SINGLE_PATTERN',
    current_pattern_uuid: ps.currentPatternUuid,
    current_playlist_uuid: ps.currentPlaylistUuid,
    progress_percent: ps.progressPercent,
    pattern_index: ps.patternIndex,
    playlist_size: ps.playlistSize,
    feed_rate: ps.feedRate,
    shuffle: ps.shuffle,
    loop: ps.loop,
  }
}
