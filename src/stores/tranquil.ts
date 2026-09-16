import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { LocalDevice } from '@/lib/mdns/discovery'
import { LanTransport } from '@/lib/tranquil/transport/lan'
import { CloudTransport, type CloudDeviceRef } from '@/lib/tranquil/transport/cloud'
import { TranquilError, ErrorCode } from '@/lib/tranquil/local/errors'
import type { PlayerState } from '@/lib/tranquil/local/types'
import type {
  CommandOutcome,
  DownloadState,
  LedSnapshot,
  LibrarySection,
  LiveEvent,
  LiveListener,
  TranquilClient,
  TranquilDeviceRef,
  UploadProgress,
} from '@/lib/tranquil/client'

export type { CloudDeviceRef } from '@/lib/tranquil/transport/cloud'
export type { DownloadState, LedSnapshot, UploadProgress } from '@/lib/tranquil/client'

/** Which table to bind, and over which transport. */
export type TranquilTarget =
  | { transport: 'lan'; device: LocalDevice }
  | { transport: 'cloud'; device: CloudDeviceRef }

// A download/upload that hasn't advanced in this long is assumed dead (device
// went offline, or we missed the terminal frame while disconnected). Progress
// frames arrive far more often than this, so it only trips on a true stall.
const STALL_MS = 3 * 60 * 1000

/**
 * The ONE Tranquil session: whichever table the user opened, over LAN or
 * cloud. The transport (`lib/tranquil/transport/*`) owns the wire and its
 * recovery; this store owns the reactive state the views render, reduces the
 * transport's `LiveEvent`s into it, and exposes thin command methods plus
 * `api()` for everything else.
 *
 * Transport is chosen by the route (`/tranquil/local/:id` vs
 * `/tranquil/cloud/:id`) in useTranquilControl(); the store never guesses.
 */
export const useTranquilStore = defineStore('tranquil', () => {
  // --- session ---------------------------------------------------------------
  const activeDevice = ref<TranquilDeviceRef | null>(null)
  // Transport reachable: LAN socket open / cloud API answering.
  const connected = ref(false)
  // Cloud: the gateway's view of the TABLE (null = unknown / LAN).
  const online = ref<boolean | null>(null)
  // LAN restoreSession() in progress (reload / deep link / address lost).
  const resuming = ref(false)
  // restoreSession() gave up: the table is not reachable on this network.
  const resumeFailed = ref(false)

  // --- live state ------------------------------------------------------------
  const playerState = ref<PlayerState | null>(null)
  // When the device last reported player state; null until it ever has.
  const playerAt = ref<number | null>(null)
  const led = ref<LedSnapshot | null>(null)
  // Live store→table download progress, keyed by pattern uuid.
  const downloads = ref<Record<string, DownloadState>>({})
  // Live upload post-processing progress, keyed by pattern uuid (LAN only).
  const uploads = ref<Record<string, UploadProgress>>({})
  // Monotonic counters views watch to refetch their lists.
  const libraryVersion = ref<Record<LibrarySection, number>>({
    patterns: 0,
    playlists: 0,
    schedule: 0,
    led: 0,
    system: 0,
  })
  // Outcome of the most recent command the device reported on.
  const lastCommandResult = ref<CommandOutcome | null>(null)
  const error = ref<string | null>(null)

  // Non-reactive transport handle.
  let client: LanTransport | CloudTransport | null = null
  let watchdog: ReturnType<typeof setInterval> | null = null

  // --- event reducer ----------------------------------------------------------

  const onEvent: LiveListener = (e: LiveEvent) => {
    switch (e.type) {
      case 'device':
        // A different table (or the same one over the other transport): drop
        // the live state so nothing stale bleeds through.
        if (
          e.device?.id !== activeDevice.value?.id ||
          e.device?.transport !== activeDevice.value?.transport
        ) {
          resetLive()
        }
        activeDevice.value = e.device
        break
      case 'connected':
        connected.value = e.connected
        break
      case 'online':
        online.value = e.online
        break
      case 'session':
        resuming.value = e.resuming
        resumeFailed.value = e.resumeFailed
        break
      case 'playerState':
        playerState.value = e.state
        playerAt.value = e.at
        break
      case 'led':
        led.value = e.led
        break
      case 'downloads': {
        // Merge by uuid, never replace the map: a frame may carry only the
        // entry that changed. Never regress an entry by time either — the
        // cloud can hand back a stale record for a uuid we just re-requested.
        const now = Date.now()
        const next = { ...downloads.value }
        for (const d of e.entries) {
          const cur = next[d.uuid]
          if (d.updatedAt !== undefined && cur && d.updatedAt < cur.updatedAt) continue
          next[d.uuid] = {
            pct: d.pct,
            failed: d.failed,
            error: d.error,
            updatedAt: d.updatedAt ?? now,
          }
        }
        downloads.value = next
        break
      }
      case 'uploads': {
        const now = Date.now()
        const next = { ...uploads.value }
        for (const u of e.entries) {
          next[u.uuid] = {
            phase: u.phase,
            pct: u.pct,
            done: u.done,
            failed: u.failed,
            error: u.error,
            updatedAt: u.updatedAt ?? now,
          }
        }
        uploads.value = next
        break
      }
      case 'library':
        libraryVersion.value = {
          ...libraryVersion.value,
          [e.section]: libraryVersion.value[e.section] + 1,
        }
        break
      case 'commandResult':
        lastCommandResult.value = e.result
        break
      case 'error':
        error.value = e.message
        break
    }
  }

  function resetLive(): void {
    connected.value = false
    online.value = null
    playerState.value = null
    playerAt.value = null
    led.value = null
    downloads.value = {}
    uploads.value = {}
    lastCommandResult.value = null
    error.value = null
  }

  // --- session control ---------------------------------------------------------

  function api(): TranquilClient {
    if (!client) throw new TranquilError('No active table connection', ErrorCode.WsDisconnected)
    return client
  }

  // Reuse the current transport when it is of the requested kind (its own
  // connect() is idempotent per device); otherwise tear down and start fresh.
  function ensure<T extends LanTransport | CloudTransport>(ctor: new (l: LiveListener) => T): T {
    if (client instanceof ctor) return client
    teardown()
    const next = new ctor(onEvent)
    client = next
    startWatchdog()
    return next
  }

  /**
   * Bind the store to a table. Sets state synchronously so a caller can
   * navigate immediately; the transport connects in the background.
   */
  function connect(target: TranquilTarget): void {
    if (target.transport === 'lan') ensure(LanTransport).connect(target.device)
    else ensure(CloudTransport).connect(target.device)
  }

  /** Tear down the active session. Safe to call when already disconnected. */
  function disconnect(): void {
    teardown()
  }

  function teardown(): void {
    client?.disconnect()
    client = null
    stopWatchdog()
    resetLive()
    activeDevice.value = null
    resuming.value = false
    resumeFailed.value = false
  }

  /**
   * LAN only: restore the session for a table by its mDNS service name after
   * a WebView reload or deep link (last-known address first, then mDNS).
   * Resolves true when a connection was set up.
   */
  function restoreSession(id: string): Promise<boolean> {
    return ensure(LanTransport).restoreSession(id)
  }

  /** Retry right now: foreground, network back, or a "Retry" button. */
  function reconnectNow(): void {
    client?.reconnectNow()
  }

  // Fail out downloads/uploads that stop advancing entirely — the device went
  // offline, or we missed the terminal frame while the transport was down — so
  // the UI stops spinning forever. One watchdog covers both transports.
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

  function stopWatchdog(): void {
    if (watchdog) {
      clearInterval(watchdog)
      watchdog = null
    }
  }

  // --- live state helpers -------------------------------------------------------

  /** Refetch player state now (the transport emits it into `playerState`). */
  async function fetchPlayerState(): Promise<void> {
    await api().player.getState()
  }

  /** Ask the transport for a fresh LED snapshot (fills `led`). */
  async function requestLedSnapshot(): Promise<void> {
    await client?.requestLedSnapshot()
  }

  /** Thumbnail URL for a pattern on the table, or '' for the placeholder. */
  function thumbUrl(patternUuid: string): string {
    return client?.thumbUrl(patternUuid) ?? ''
  }

  /**
   * Ask the table to fetch a store pattern. Progress lands on `downloads`;
   * a request that cannot be sent fails the entry right away instead of
   * letting the UI spin until the watchdog trips.
   */
  function requestPatternDownload(patternUuid: string): void {
    const c = api()
    error.value = null
    downloads.value = {
      ...downloads.value,
      [patternUuid]: { pct: 0, failed: false, updatedAt: Date.now() },
    }
    c.requestDownload(patternUuid).catch((e) => {
      const message = e instanceof Error ? e.message : 'Failed to start download'
      error.value = message
      downloads.value = {
        ...downloads.value,
        [patternUuid]: { pct: 0, failed: true, error: message, updatedAt: Date.now() },
      }
    })
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

  // --- commands ------------------------------------------------------------------

  // The transports emit the resulting player state themselves; here we only
  // own the error line.
  async function run(op: (c: TranquilClient) => Promise<PlayerState>, failMsg: string) {
    error.value = null
    try {
      await op(api())
    } catch (e) {
      error.value = e instanceof Error ? e.message : failMsg
      throw e
    }
  }

  const play = (patternUuid?: string, playlistUuid?: string) =>
    run(
      (c) => c.player.play({ pattern_uuid: patternUuid, playlist_uuid: playlistUuid }),
      'Failed to play',
    )
  const pause = () => run((c) => c.player.patch({ is_paused: true }), 'Failed to pause')
  const resume = () => run((c) => c.player.patch({ is_paused: false }), 'Failed to resume')
  // emergency=true is the e-stop: halt motion immediately (not a graceful stop).
  const stop = (emergency = false) =>
    run((c) => c.player.stop(emergency ? { emergency_stop: true } : undefined), 'Failed to stop')
  const skip = () => run((c) => c.player.skip(), 'Failed to skip')
  const previous = () => run((c) => c.player.previous(), 'Failed to go back')
  const setFeedRate = (rate: number) =>
    run((c) => c.player.patch({ feed_rate: rate }), 'Failed to set speed')
  const setShuffle = (enabled: boolean) =>
    run((c) => c.player.patch({ shuffle: enabled }), 'Failed to set shuffle')
  const setLoop = (enabled: boolean) =>
    run((c) => c.player.patch({ loop: enabled }), 'Failed to set repeat')
  // Random loop: on chains random patterns after the current one (or starts
  // one if idle); off lets the current pattern finish, then stops.
  const setRandomLoop = (enabled: boolean) =>
    run((c) => c.player.patch({ random_loop: enabled }), 'Failed to set random loop')

  return {
    activeDevice,
    connected,
    online,
    resuming,
    resumeFailed,
    playerState,
    playerAt,
    led,
    downloads,
    uploads,
    libraryVersion,
    lastCommandResult,
    error,
    api,
    thumbUrl,
    connect,
    disconnect,
    restoreSession,
    reconnectNow,
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
    setRandomLoop,
  }
})
