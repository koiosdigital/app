import { defineStore } from 'pinia'
import { ref, watch, type WatchStopHandle } from 'vue'
import { create } from '@bufbuild/protobuf'
import {
  TranquilMessageSchema,
  PlayerState_PlaybackState,
  PlayerState_PlayMode,
} from '@/types/proto/kd/v1/tranquil_pb'
import type { LocalDevice } from '@/lib/mdns/discovery'
import { createTranquilRest, type TranquilRestClient } from '@/lib/tranquil/local/rest'
import { TranquilWebSocket } from '@/lib/tranquil/local/ws'
import { TranquilError, ErrorCode } from '@/lib/tranquil/local/errors'
import type { PlayerState } from '@/lib/tranquil/local/types'

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

// A download/upload that hasn't advanced in this long is assumed dead (device
// went offline, or we missed the terminal frame while disconnected). Progress
// frames arrive far more often than this, so it only trips on a true stall.
const STALL_MS = 3 * 60 * 1000

/**
 * Active LAN-direct connection to ONE Tranquil table, discovered over mDNS.
 * Tranquil has no cloud control API — the device's local HTTP/WS server is the
 * only control path — so this store owns the REST client, the WebSocket, and the
 * real-time player state for whichever table the user opened. Commands go over
 * REST; the socket only pushes player-state snapshots and progress reports.
 */
export const useTranquilLocalStore = defineStore('tranquil_local', () => {
  const activeDevice = ref<LocalDevice | null>(null)
  const connected = ref(false)
  const playerState = ref<PlayerState | null>(null)
  const error = ref<string | null>(null)
  // Live store→table download progress, keyed by pattern uuid.
  const downloads = ref<Record<string, DownloadState>>({})
  // Live upload post-processing progress, keyed by pattern uuid.
  const uploads = ref<Record<string, UploadProgress>>({})

  // Non-reactive transport handles (class instances / unsubscribers).
  let rest: TranquilRestClient | null = null
  let ws: TranquilWebSocket | null = null
  let unsubPlayer: (() => void) | null = null
  let unsubDownload: (() => void) | null = null
  let unsubConversion: (() => void) | null = null
  let unsubThumb: (() => void) | null = null
  let stopConnWatch: WatchStopHandle | null = null
  let watchdog: ReturnType<typeof setInterval> | null = null

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
   * the background. Idempotent for the same device.
   */
  function connect(device: LocalDevice): void {
    if (activeDevice.value?.id === device.id && ws) return
    disconnect()
    if (!device.baseUrl) {
      error.value = 'Table has no network address yet'
      return
    }

    activeDevice.value = device
    error.value = null
    rest = createTranquilRest(device.baseUrl)
    ws = new TranquilWebSocket(device.baseUrl)

    unsubPlayer = ws.subscribe('playerState', (msg) => {
      if (msg.message?.case === 'playerState') {
        playerState.value = mapPlayerState(msg.message.value)
      }
    })
    // Reports arrive incrementally and merge by uuid: a normal frame carries all
    // active downloads, while a terminal failure frame carries just the one that
    // failed. Never replace the whole map — merge each entry.
    unsubDownload = ws.subscribe('patternDownloadProgress', (msg) => {
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
    })
    unsubConversion = ws.subscribe('patternConversionProgress', (msg) => {
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
    })
    unsubThumb = ws.subscribe('patternThumbProgress', (msg) => {
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
    })
    stopConnWatch = watch(ws.connected, (v) => (connected.value = v), { immediate: true })
    ws.connect()
    startWatchdog()

    void fetchPlayerState().catch(() => {})
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
    unsubPlayer?.()
    unsubPlayer = null
    unsubDownload?.()
    unsubDownload = null
    unsubConversion?.()
    unsubConversion = null
    unsubThumb?.()
    unsubThumb = null
    stopConnWatch?.()
    stopConnWatch = null
    if (watchdog) {
      clearInterval(watchdog)
      watchdog = null
    }
    ws?.disconnect()
    ws = null
    rest = null
    connected.value = false
    playerState.value = null
    downloads.value = {}
    uploads.value = {}
    activeDevice.value = null
  }

  async function fetchPlayerState(): Promise<void> {
    playerState.value = await api().player.getState()
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
  const resume = () => run((r) => r.player.patch({ is_paused: false }), 'Failed to resume')
  // emergency=true is the e-stop: halt motion immediately (not a graceful stop).
  const stop = (emergency = false) =>
    run((r) => r.player.stop(emergency ? { emergency_stop: true } : undefined), 'Failed to stop')
  // Firmware has no previous-track; skip is next-only.
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
    error,
    downloads,
    uploads,
    api,
    baseUrl,
    connect,
    disconnect,
    fetchPlayerState,
    requestPatternDownload,
    clearDownload,
    clearUpload,
    play,
    pause,
    resume,
    stop,
    skip,
    setFeedRate,
    setShuffle,
    setLoop,
  }
})

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
