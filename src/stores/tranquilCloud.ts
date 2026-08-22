import { defineStore } from 'pinia'
import { ref } from 'vue'
import { createTranquilCloudRest, type TranquilCloudRestClient } from '@/lib/tranquil/cloud/rest'
import { TranquilError, ErrorCode } from '@/lib/tranquil/local/errors'
import type { PlayerState } from '@/lib/tranquil/local/types'
import type { DownloadState, UploadProgress } from './tranquilLocal'

/**
 * Cloud-backed control for ONE Tranquil table (off-LAN). The transport-agnostic
 * counterpart to useTranquilLocalStore: it exposes the SAME public surface, so
 * the shared views work over either. Commands go to device-api; live state
 * (player + download progress) is polled, since there is no app↔device socket.
 *
 * Upload post-processing (conversion/thumbnail) is LAN-only — you can't stream a
 * local file to a remote table — so `uploads` stays empty here.
 */

const POLL_MS = 2500
const STALL_MS = 3 * 60 * 1000

export interface CloudDeviceRef {
  id: string
  name?: string
  type?: string
  model?: string
}

export const useTranquilCloudStore = defineStore('tranquil_cloud', () => {
  const activeDevice = ref<CloudDeviceRef | null>(null)
  const connected = ref(false)
  const playerState = ref<PlayerState | null>(null)
  const error = ref<string | null>(null)
  const downloads = ref<Record<string, DownloadState>>({})
  const uploads = ref<Record<string, UploadProgress>>({})

  let rest: TranquilCloudRestClient | null = null
  let poll: ReturnType<typeof setInterval> | null = null
  // uuids seen in the previous /downloads poll, to detect completion (a download
  // that was in-progress and then vanishes from the active set is treated done).
  let prevActive = new Set<string>()

  function api(): TranquilCloudRestClient {
    if (!rest) throw new TranquilError('No active table connection', ErrorCode.WsDisconnected)
    return rest
  }

  // No per-device origin over cloud; store thumbnails are keyed by uuid in views.
  function baseUrl(): string | null {
    return null
  }

  function connect(device: CloudDeviceRef): void {
    if (activeDevice.value?.id === device.id && rest) return
    disconnect()
    activeDevice.value = device
    error.value = null
    rest = createTranquilCloudRest(device.id)

    // Prompt the device to report current state, then poll.
    void rest.refresh(['player', 'patterns', 'playlists']).catch(() => {})
    void tick()
    poll = setInterval(() => void tick(), POLL_MS)
  }

  function disconnect(): void {
    if (poll) {
      clearInterval(poll)
      poll = null
    }
    rest = null
    prevActive = new Set()
    connected.value = false
    playerState.value = null
    error.value = null
    downloads.value = {}
    uploads.value = {}
    activeDevice.value = null
  }

  async function tick(): Promise<void> {
    if (!rest) return
    try {
      const [state, active] = await Promise.all([rest.player.getState(), rest.downloads()])
      playerState.value = state
      connected.value = true
      reconcileDownloads(active)
    } catch (e) {
      connected.value = false
      error.value = e instanceof Error ? e.message : 'Lost connection to the table'
    }
  }

  function reconcileDownloads(
    active: { uuid: string; progressPct: number; failed: boolean; error?: string }[],
  ): void {
    const now = Date.now()
    const next = { ...downloads.value }
    const seen = new Set<string>()
    for (const d of active) {
      seen.add(d.uuid)
      next[d.uuid] = {
        pct: d.progressPct,
        failed: d.failed,
        error: d.failed ? d.error || 'Download failed' : undefined,
        updatedAt: now,
      }
    }
    // A uuid that was mid-download and is no longer in the active set completed
    // (the device drops finished downloads from the report). Poll cadence can
    // miss the terminal 100 frame, so infer it here.
    for (const uuid of prevActive) {
      if (!seen.has(uuid)) {
        const cur = next[uuid]
        if (cur && !cur.failed && cur.pct < 100) {
          next[uuid] = { ...cur, pct: 100, updatedAt: now }
        }
      }
    }
    // Stall watchdog: nothing moving for STALL_MS ⇒ failed (device offline etc.).
    for (const [uuid, s] of Object.entries(next)) {
      if (!s.failed && s.pct < 100 && now - s.updatedAt > STALL_MS) {
        next[uuid] = { ...s, failed: true, error: 'Download stalled — check your table' }
      }
    }
    downloads.value = next
    prevActive = seen
  }

  function requestPatternDownload(patternUuid: string): void {
    if (!rest) throw new TranquilError('No active table connection', ErrorCode.WsDisconnected)
    error.value = null
    void rest.requestDownload(patternUuid).catch((e) => {
      error.value = e instanceof Error ? e.message : 'Failed to start download'
    })
    downloads.value = {
      ...downloads.value,
      [patternUuid]: { pct: 0, failed: false, updatedAt: Date.now() },
    }
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

  async function run(op: (r: TranquilCloudRestClient) => Promise<PlayerState>, failMsg: string) {
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
    previous,
    setFeedRate,
    setShuffle,
    setLoop,
  }
})
