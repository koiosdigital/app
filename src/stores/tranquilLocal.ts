import { defineStore } from 'pinia'
import { ref, watch, type WatchStopHandle } from 'vue'
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

  // Non-reactive transport handles (class instances / unsubscribers).
  let rest: TranquilRestClient | null = null
  let ws: TranquilWebSocket | null = null
  let unsubPlayer: (() => void) | null = null
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
    stopConnWatch = watch(ws.connected, (v) => (connected.value = v), { immediate: true })
    ws.connect()

    void fetchPlayerState().catch(() => {})
  }

  /** Tear down the active connection. Safe to call when already disconnected. */
  function disconnect(): void {
    unsubPlayer?.()
    unsubPlayer = null
    stopConnWatch?.()
    stopConnWatch = null
    ws?.disconnect()
    ws = null
    rest = null
    connected.value = false
    playerState.value = null
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
    api,
    baseUrl,
    connect,
    disconnect,
    fetchPlayerState,
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
  return {
    state: ps.state === 0 ? 'STOPPED' : ps.state === 1 ? 'PLAYING' : 'PAUSED',
    mode:
      ps.mode === 0
        ? 'SINGLE_PATTERN'
        : ps.mode === 1
          ? 'PLAYLIST'
          : ps.mode === 2
            ? 'PLAYLIST_LOOP'
            : 'PLAYLIST_SHUFFLE',
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
