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

/**
 * Active LAN-direct connection to ONE Tranquil table, discovered over mDNS.
 * Tranquil has no cloud control API — the device's local HTTP/WS server is the
 * only control path — so this store owns the REST client, the WebSocket, and the
 * real-time player state for whichever table the user opened. Commands go over
 * REST; the socket only pushes player-state snapshots.
 */
export const useTranquilLocalStore = defineStore('tranquil_local', () => {
  const activeDevice = ref<LocalDevice | null>(null)
  const connected = ref(false)
  const playerState = ref<PlayerState | null>(null)
  const error = ref<string | null>(null)
  // Live store→table download progress, keyed by pattern uuid (0-100).
  const downloads = ref<Record<string, number>>({})

  // Non-reactive transport handles (class instances / unsubscribers).
  let rest: TranquilRestClient | null = null
  let ws: TranquilWebSocket | null = null
  let unsubPlayer: (() => void) | null = null
  let unsubDownload: (() => void) | null = null
  let stopConnWatch: WatchStopHandle | null = null

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
    unsubDownload = ws.subscribe('patternDownloadProgress', (msg) => {
      if (msg.message?.case === 'patternDownloadProgress') {
        const next = { ...downloads.value }
        for (const d of msg.message.value.downloads) next[d.uuid] = d.progressPct
        downloads.value = next
      }
    })
    stopConnWatch = watch(ws.connected, (v) => (connected.value = v), { immediate: true })
    ws.connect()

    void fetchPlayerState().catch(() => {})
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
      downloads.value = { ...downloads.value, [patternUuid]: 0 }
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to start download'
      throw e
    }
  }

  /** Tear down the active connection. Safe to call when already disconnected. */
  function disconnect(): void {
    unsubPlayer?.()
    unsubPlayer = null
    unsubDownload?.()
    unsubDownload = null
    stopConnWatch?.()
    stopConnWatch = null
    ws?.disconnect()
    ws = null
    rest = null
    connected.value = false
    playerState.value = null
    downloads.value = {}
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
  const stop = () => run((r) => r.player.stop(), 'Failed to stop')
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
    api,
    baseUrl,
    connect,
    disconnect,
    fetchPlayerState,
    requestPatternDownload,
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
