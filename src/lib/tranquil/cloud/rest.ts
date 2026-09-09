/**
 * Tranquil CLOUD control client — the off-LAN counterpart to
 * lib/tranquil/local/rest.ts. Talks to device-api `/v1/devices/:id/tranquil/*`
 * with the Keycloak USER token (device-api relays commands to the table over
 * the dnet gateway and mirrors the state the table pushes back).
 *
 * Scope: player, playlists, pattern library, LED, schedule, system, reboot,
 * homing. Motion config + calibration are LAN-only and absent here.
 *
 * Responses are mapped to the SAME domain types the LAN client returns
 * (src/lib/tranquil/local/types.ts) so the shared views work over either
 * transport. Requests go through the shared authenticated API client, so a
 * stale access token is refreshed and retried instead of surfacing as
 * "offline".
 */

import { apiFetch } from '@/lib/api/client'
import { TranquilError, ErrorCode } from '../local/errors'
import type {
  PlayerState,
  PlayerStateEnum,
  PlayerModeEnum,
  PlayerPatchRequest,
  PlayRequest,
  StopRequest,
  Pattern,
  PatternsListResponse,
  Playlist,
  PlaylistsListResponse,
  CreatePlaylistRequest,
  UpdatePlaylistRequest,
  ModifyPlaylistRequest,
  SystemInfo,
  LEDEffect,
  LEDConfigResponse,
  LEDChannelState,
  LEDChannelUpdate,
  Schedule,
} from '../local/types'
import type { components } from '@/types/api'

type LiveDto = components['schemas']['TranquilLiveDto']
type PlayerStateDto = components['schemas']['TranquilPlayerStateDto']
type DownloadEntryDto = components['schemas']['TranquilDownloadEntryDto']
type LedConfigDto = components['schemas']['TranquilLedConfigDto']

// Hand-mapped calls through the shared authenticated fetch (bearer token,
// single-flight refresh + retry on 401). The generated `paths` type covers
// these routes, but the views consume the LAN domain types, so responses are
// mapped by hand and the generated DTO types are used only for the shapes read.
async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await apiFetch(path, init)
  } catch {
    throw new TranquilError('Cannot reach the cloud right now.', ErrorCode.NetworkError)
  }
  if (res.status === 404) throw new TranquilError('Table not found.', ErrorCode.NotFound)
  if (res.status === 403) throw new TranquilError('Only the owner can do that.', ErrorCode.Forbidden)
  if (!res.ok) {
    throw new TranquilError(`Cloud request failed (${res.status}).`, ErrorCode.DeviceError)
  }
  return (res.status === 204 ? null : await res.json()) as T
}

export class DeliveryError extends TranquilError {
  constructor() {
    super('The table is offline; the command was not delivered.', ErrorCode.WsDisconnected)
    this.name = 'DeliveryError'
  }
}

const requireDelivered = (res: { delivered?: boolean } | null) => {
  if (!res?.delivered) throw new DeliveryError()
  return res
}

// --- cloud → domain mappers --------------------------------------------------

function mapState(s: PlayerStateDto): PlayerState {
  const state: PlayerStateEnum =
    s.state === 'PLAYING' ? 'PLAYING' : s.state === 'PAUSED' ? 'PAUSED' : 'STOPPED'
  const mode: PlayerModeEnum =
    s.mode === 'PLAYLIST'
      ? 'PLAYLIST'
      : s.mode === 'PLAYLIST_LOOP'
        ? 'PLAYLIST_LOOP'
        : s.mode === 'PLAYLIST_SHUFFLE'
          ? 'PLAYLIST_SHUFFLE'
          : 'SINGLE_PATTERN'
  return {
    state,
    mode,
    current_pattern_uuid: s.currentPatternUuid || undefined,
    current_playlist_uuid: s.currentPlaylistUuid || undefined,
    progress_percent: Number(s.progressPercent ?? 0),
    pattern_index: Number(s.patternIndex ?? 0),
    playlist_size: Number(s.playlistSize ?? 0),
    feed_rate: Number(s.feedRate ?? 0),
    shuffle: !!s.shuffle,
    loop: !!s.loop,
  }
}

function mapPattern(p: Record<string, unknown>): Pattern {
  return {
    uuid: String(p.uuid ?? ''),
    name: String(p.name ?? ''),
    creator: (p.creator as string) || undefined,
    encrypted: !!p.encrypted,
    size_bytes: Number(p.sizeBytes ?? 0),
    reversible: !!p.reversible,
    start_point: Number(p.startPoint ?? 0),
    created_at: (p.createdAt as string) || undefined,
    last_played_at: (p.lastPlayedAt as string) || undefined,
    is_owned: !!p.isOwned,
    // No per-device thumbnail endpoint over cloud; the store thumb (by uuid) is
    // used in cloud views instead.
    thumb_url: '',
  }
}

function mapPlaylist(p: Record<string, unknown>): Playlist {
  return {
    uuid: String(p.uuid ?? ''),
    name: String(p.name ?? ''),
    description: (p.description as string) || undefined,
    pattern_uuids: (p.patternUuids as string[]) ?? [],
    featured_pattern: (p.featuredPattern as string) || undefined,
    created_at: (p.createdAt as string) || undefined,
    updated_at: (p.updatedAt as string) || undefined,
  }
}

const hex = (v: number) => Math.max(0, Math.min(255, v | 0)).toString(16).padStart(2, '0')

function mapLedConfig(cfg: LedConfigDto): LEDConfigResponse {
  const type = cfg.format === 3 ? 'RGBCCT' : cfg.format === 2 ? 'RGBW' : 'RGB'
  const channels = (cfg.channels ?? []).map((ch, i) => ({
    index: ch.channel ?? i,
    num_leds: cfg.ledCount ?? 0,
    type,
    state: {
      effect_id: ch.effectId,
      brightness: ch.brightness,
      speed: ch.speed,
      on: ch.enabled,
      color: ch.color ? `#${hex(ch.color.r)}${hex(ch.color.g)}${hex(ch.color.b)}` : '#ffffff',
      w: ch.color?.w,
      cw: ch.color?.cw,
    } satisfies LEDChannelState,
  }))
  return { version: cfg.pixdriverVersion ?? '', has_leds: !!cfg.hasLeds, channels }
}

export interface CloudDownloadEntry {
  uuid: string
  progressPct: number
  failed: boolean
  done: boolean
  error?: string
  updatedAt: number
}

export interface CloudLive {
  online: boolean
  player: PlayerState
  /** ms epoch of the device's last player report; null if never */
  playerAt: number | null
  downloads: CloudDownloadEntry[]
}

export type TranquilCloudRestClient = ReturnType<typeof createTranquilCloudRest>

export function createTranquilCloudRest(deviceId: string) {
  const base = `/v1/devices/${encodeURIComponent(deviceId)}/tranquil`
  const get = <T>(path: string) => call<T>(`${base}${path}`)
  const post = <T>(path: string, body?: unknown) =>
    call<T>(`${base}${path}`, { method: 'POST', body: body ? JSON.stringify(body) : undefined })
  const dispatch = (path: string, body?: unknown) =>
    post<{ delivered: boolean }>(path, body).then(requireDelivered)

  /** One-request poll: online flag + player + downloads. */
  async function live(): Promise<CloudLive> {
    const res = await get<LiveDto>('/live')
    return {
      online: res.online,
      player: mapState(res.player),
      playerAt: res.player.at ?? null,
      downloads: (res.downloads as DownloadEntryDto[]).map((d) => ({
        uuid: d.uuid,
        progressPct: d.progressPct,
        failed: d.failed,
        done: d.done,
        error: d.error,
        updatedAt: d.updatedAt,
      })),
    }
  }

  const player = {
    async getState(): Promise<PlayerState> {
      return mapState(await get<PlayerStateDto>('/state'))
    },
    // The device applies commands asynchronously; the poller reflects the new
    // state shortly after. Callers get the last-known state to keep a
    // consistent shape with the LAN client; an undelivered command throws.
    async patch(data: PlayerPatchRequest): Promise<PlayerState> {
      const jobs: Promise<unknown>[] = []
      if (data.is_paused !== undefined) jobs.push(dispatch('/commands/set-paused', { paused: data.is_paused }))
      if (data.loop !== undefined) jobs.push(dispatch('/commands/loop', { enabled: data.loop }))
      if (data.shuffle !== undefined) jobs.push(dispatch('/commands/shuffle', { shuffle: data.shuffle }))
      if (data.feed_rate !== undefined) jobs.push(dispatch('/commands/feed-rate', { feedRateRpm: data.feed_rate }))
      await Promise.all(jobs)
      return this.getState()
    },
    async play(data: PlayRequest): Promise<PlayerState> {
      if (data.playlist_uuid) {
        await dispatch('/commands/playlist-play', {
          playlistUuid: data.playlist_uuid,
          shuffle: data.shuffle ?? false,
          loop: data.loop ?? false,
          startPatternUuid: data.pattern_uuid,
        })
      } else if (data.pattern_uuid) {
        await dispatch('/commands/play', { patternUuid: data.pattern_uuid })
      }
      return this.getState()
    },
    async stop(_data?: StopRequest): Promise<PlayerState> {
      await dispatch('/commands/stop')
      return this.getState()
    },
    async skip(): Promise<PlayerState> {
      await dispatch('/commands/navigate', { direction: 'NEXT' })
      return this.getState()
    },
    async previous(): Promise<PlayerState> {
      await dispatch('/commands/navigate', { direction: 'PREVIOUS' })
      return this.getState()
    },
  }

  // The device pushes its lists on every change and on (re)connect, so the
  // cloud copy is normally current. Only when there is no snapshot at all
  // (`at` null) do we ask the device and wait briefly for the round trip.
  async function readList<T>(path: string, key: string, target: 'patterns' | 'playlists'): Promise<T[]> {
    let res = await get<Record<string, unknown>>(path)
    if (res.at == null) {
      try {
        await post('/commands/refresh', { targets: [target], watchSeconds: 0 })
        await new Promise((r) => setTimeout(r, 900))
        res = await get<Record<string, unknown>>(path)
      } catch {
        /* fall through to whatever is cached */
      }
    }
    return ((res[key] as T[] | undefined) ?? [])
  }

  const patterns = {
    async list(): Promise<PatternsListResponse> {
      const list = (await readList<Record<string, unknown>>('/patterns', 'patterns', 'patterns')).map(mapPattern)
      return {
        patterns: list,
        pagination: { page: 0, per_page: list.length, total_pages: 1, total_items: list.length },
      }
    },
    async delete(uuid: string): Promise<{ success: boolean }> {
      const res = await call<{ delivered?: boolean }>(`${base}/patterns/${encodeURIComponent(uuid)}`, {
        method: 'DELETE',
      })
      requireDelivered(res)
      return { success: true }
    },
    async rename(uuid: string, name: string): Promise<{ success: boolean }> {
      const res = await call<{ delivered?: boolean }>(`${base}/patterns/${encodeURIComponent(uuid)}`, {
        method: 'PATCH',
        body: JSON.stringify({ name }),
      })
      requireDelivered(res)
      return { success: true }
    },
    // No single-pattern cloud endpoint — resolve from the cached list.
    async get(uuid: string): Promise<Pattern> {
      const found = (await this.list()).patterns.find((p) => p.uuid === uuid)
      if (!found) throw new TranquilError('Pattern not found on the table.', ErrorCode.NotFound)
      return found
    },
  }

  // Playlist mutations return the resulting Playlist (like the LAN client)
  // by re-reading the device's push after the command lands. The device
  // pushes its playlist list right after applying a change; give it a moment.
  async function playlistAfterMutation(uuid?: string, name?: string): Promise<Playlist> {
    for (let attempt = 0; attempt < 4; attempt++) {
      await new Promise((r) => setTimeout(r, 500 + attempt * 400))
      const list = (await readList<Record<string, unknown>>('/playlists', 'playlists', 'playlists')).map(mapPlaylist)
      const found = uuid ? list.find((p) => p.uuid === uuid) : list.find((p) => p.name === name)
      if (found) return found
    }
    throw new TranquilError('The table did not confirm the playlist change.', ErrorCode.DeviceError)
  }

  const playlists = {
    async list(): Promise<PlaylistsListResponse> {
      const list = (await readList<Record<string, unknown>>('/playlists', 'playlists', 'playlists')).map(mapPlaylist)
      return {
        playlists: list,
        pagination: { page: 0, per_page: list.length, total_pages: 1, total_items: list.length },
      }
    },
    async get(uuid: string): Promise<Playlist> {
      const found = (await this.list()).playlists.find((p) => p.uuid === uuid)
      if (!found) throw new TranquilError('Playlist not found on the table.', ErrorCode.NotFound)
      return found
    },
    async create(data: CreatePlaylistRequest): Promise<Playlist> {
      await dispatch('/playlists', {
        name: data.name,
        description: data.description ?? '',
        patternUuids: data.pattern_uuids ?? [],
      })
      // CreatePlaylist carries no uuid; resolve the new record by name.
      return playlistAfterMutation(undefined, data.name)
    },
    // The device replaces the whole playlist, so merge partial edits over the
    // current record to avoid clearing name/description/featured.
    async update(uuid: string, data: UpdatePlaylistRequest): Promise<Playlist> {
      const cur = await this.get(uuid)
      await call<{ delivered?: boolean }>(`${base}/playlists/${encodeURIComponent(uuid)}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: data.name ?? cur.name,
          description: data.description ?? cur.description ?? '',
          patternUuids: data.pattern_uuids ?? cur.pattern_uuids,
          featuredPattern: data.featured_pattern ?? cur.featured_pattern ?? '',
        }),
      }).then(requireDelivered)
      return playlistAfterMutation(uuid)
    },
    // add/remove a pattern by rewriting the ordered list.
    async modify(uuid: string, data: ModifyPlaylistRequest): Promise<Playlist> {
      const cur = await this.get(uuid)
      const list = cur.pattern_uuids
      const next =
        data.action === 'add'
          ? list.includes(data.pattern_uuid)
            ? list
            : [...list, data.pattern_uuid]
          : list.filter((u) => u !== data.pattern_uuid)
      return this.update(uuid, { pattern_uuids: next })
    },
    async reorder(uuid: string, patternUuids: string[]): Promise<Playlist> {
      return this.update(uuid, { pattern_uuids: patternUuids })
    },
    async delete(uuid: string): Promise<{ success: boolean }> {
      await call<{ delivered?: boolean }>(`${base}/playlists/${encodeURIComponent(uuid)}`, {
        method: 'DELETE',
      }).then(requireDelivered)
      return { success: true }
    },
  }

  const led = {
    async getEffects(): Promise<LEDEffect[]> {
      const res = await get<{ effects?: LEDEffect[]; at?: number | null }>('/led/effects')
      if (res.at == null) {
        try {
          await post('/commands/refresh', { targets: ['led'], watchSeconds: 0 })
          await new Promise((r) => setTimeout(r, 900))
          return (await get<{ effects?: LEDEffect[] }>('/led/effects')).effects ?? []
        } catch {
          /* cached */
        }
      }
      return res.effects ?? []
    },
    async getConfig(): Promise<LEDConfigResponse> {
      let res = await get<LedConfigDto>('/led/config')
      if (res.at == null) {
        try {
          await post('/commands/refresh', { targets: ['led'], watchSeconds: 0 })
          await new Promise((r) => setTimeout(r, 900))
          res = await get<LedConfigDto>('/led/config')
        } catch {
          /* cached */
        }
      }
      return mapLedConfig(res)
    },
    async getChannel(index: number): Promise<LEDChannelState> {
      const cfg = await this.getConfig()
      const ch = cfg.channels.find((c) => c.index === index) ?? cfg.channels[index]
      if (!ch?.state) throw new TranquilError('LED channel not found.', ErrorCode.NotFound)
      return ch.state
    },
    // Partial update: only the given fields change on the device. Returns the
    // merged state optimistically (the device's push confirms it).
    async setChannel(index: number, data: LEDChannelUpdate): Promise<LEDChannelState> {
      const current = await this.getChannel(index).catch(() => null)
      let color: { r: number; g: number; b: number; w?: number; cw?: number } | undefined
      const needsColor = data.color !== undefined || data.w !== undefined || data.cw !== undefined
      if (needsColor) {
        const src = data.color ?? current?.color ?? '#ffffff'
        const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(src)
        color = {
          r: m ? parseInt(m[1]!, 16) : 255,
          g: m ? parseInt(m[2]!, 16) : 255,
          b: m ? parseInt(m[3]!, 16) : 255,
          w: data.w ?? current?.w ?? 0,
          cw: data.cw ?? current?.cw ?? 0,
        }
      }
      await dispatch('/led/channel', {
        channel: index,
        effectId: data.effect_id,
        brightness: data.brightness,
        speed: data.speed,
        enabled: data.on,
        color,
      })
      return {
        effect_id: data.effect_id ?? current?.effect_id ?? 'SOLID',
        brightness: data.brightness ?? current?.brightness ?? 255,
        speed: data.speed ?? current?.speed ?? 5,
        on: data.on ?? current?.on ?? true,
        color: data.color ?? current?.color ?? '#ffffff',
        w: data.w ?? current?.w,
        cw: data.cw ?? current?.cw,
      }
    },
  }

  const system = {
    async getInfo(): Promise<SystemInfo> {
      const s = await get<components['schemas']['TranquilSystemDto']>('/system')
      return {
        firmware_version: s.firmwareVersion ?? '',
        hardware_model: s.hardwareModel ?? '',
        device_id: s.deviceId ?? '',
        hostname: s.hostname ?? '',
        is_homed: !!s.isHomed,
        is_homing: !!s.isHoming,
        free_heap: s.freeHeap ?? 0,
        free_psram: s.freePsram,
        uptime_s: s.uptimeS,
        wifi_rssi: s.wifiRssi,
        ip_address: s.ipAddress,
      }
    },
    async reboot(): Promise<void> {
      await dispatch('/commands/reboot', { reason: 'app' })
    },
    async home(forceFullCalibration = false): Promise<void> {
      await dispatch('/commands/home', { forceFullCalibration })
    },
  }

  const schedule = {
    async get(): Promise<Schedule> {
      const res = await get<{ items?: Schedule['items'] }>('/schedule')
      return { items: res.items ?? [] }
    },
    async set(data: Schedule): Promise<{ delivered: boolean }> {
      const res = await call<{ delivered?: boolean }>(`${base}/schedule`, {
        method: 'PUT',
        body: JSON.stringify({ items: data.items }),
      })
      requireDelivered(res)
      return { delivered: true }
    },
  }

  // Ask the device to re-report sections / keep fast progress updates coming.
  const refresh = (
    targets?: ('player' | 'patterns' | 'playlists' | 'led' | 'schedule' | 'system')[],
    watchSeconds = 60,
  ) => post<{ delivered: boolean }>('/commands/refresh', { targets, watchSeconds })

  const requestDownload = (patternUuid: string) =>
    dispatch('/commands/request-download', { patternUuid })

  return {
    deviceId,
    live,
    player,
    patterns,
    playlists,
    led,
    system,
    schedule,
    refresh,
    requestDownload,
  }
}
