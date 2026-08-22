/**
 * Tranquil CLOUD control client — the off-LAN counterpart to
 * lib/tranquil/local/rest.ts. Talks to device-api `/v1/devices/:id/tranquil/*`
 * with the Keycloak USER token (device-api relays commands to the table over
 * the dnet gateway and caches the state the table pushes back).
 *
 * Everyday-control scope: player, playlists, pattern library, LED, schedule.
 * Motion config + homing/calibration are LAN-only and absent here.
 *
 * Responses are mapped to the SAME domain types the LAN client returns
 * (src/lib/tranquil/local/types.ts) so the shared views work over either
 * transport. Not typed via openapi-fetch: device-api's generated OpenAPI isn't
 * regenerated in this toolchain, so — like cloudStore.ts — we hand-type it.
 */

import { ENV } from '@/config/environment'
import { useAuthStore } from '@/stores/auth/auth'
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
  Schedule,
} from '../local/types'

async function authFetch(base: string, path: string, init?: RequestInit): Promise<unknown> {
  const token = await useAuthStore().getAccessToken()
  let res: Response
  try {
    res = await fetch(`${base}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init?.headers ?? {}),
      },
    })
  } catch {
    throw new TranquilError('Cannot reach the table over cloud.', ErrorCode.WsDisconnected)
  }
  if (res.status === 404) throw new TranquilError('Table not found.', ErrorCode.NotFound)
  if (!res.ok) {
    throw new TranquilError(`Cloud request failed (${res.status}).`, ErrorCode.DeviceError)
  }
  return res.status === 204 ? null : res.json()
}

// --- cloud → domain mappers --------------------------------------------------

function mapState(s: Record<string, unknown>): PlayerState {
  const st = String(s.state ?? '')
  const state: PlayerStateEnum = st === 'PLAYING' ? 'PLAYING' : st === 'PAUSED' ? 'PAUSED' : 'STOPPED'
  const md = String(s.mode ?? '')
  const mode: PlayerModeEnum =
    md === 'PLAYLIST'
      ? 'PLAYLIST'
      : md === 'PLAYLIST_LOOP'
        ? 'PLAYLIST_LOOP'
        : md === 'PLAYLIST_SHUFFLE'
          ? 'PLAYLIST_SHUFFLE'
          : 'SINGLE_PATTERN'
  return {
    state,
    mode,
    current_pattern_uuid: (s.currentPatternUuid as string) || undefined,
    current_playlist_uuid: (s.currentPlaylistUuid as string) || undefined,
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

export type TranquilCloudRestClient = ReturnType<typeof createTranquilCloudRest>

export function createTranquilCloudRest(deviceId: string) {
  const base = `${ENV.apiBaseUrl}/v1/devices/${encodeURIComponent(deviceId)}/tranquil`
  const get = (path: string) => authFetch(base, path)
  const post = (path: string, body?: unknown) =>
    authFetch(base, path, { method: 'POST', body: body ? JSON.stringify(body) : undefined })

  const player = {
    async getState(): Promise<PlayerState> {
      return mapState((await get('/state')) as Record<string, unknown>)
    },
    // The device applies commands asynchronously; the poller reflects the new
    // state shortly after. We return the last-known state so callers keep a
    // consistent shape with the LAN client.
    async patch(data: PlayerPatchRequest): Promise<PlayerState> {
      const jobs: Promise<unknown>[] = []
      if (data.is_paused !== undefined) jobs.push(post('/commands/set-paused', { paused: data.is_paused }))
      if (data.loop !== undefined) jobs.push(post('/commands/loop', { enabled: data.loop }))
      if (data.shuffle !== undefined) jobs.push(post('/commands/shuffle', { shuffle: data.shuffle }))
      if (data.feed_rate !== undefined) jobs.push(post('/commands/feed-rate', { feedRateRpm: data.feed_rate }))
      await Promise.all(jobs)
      return this.getState()
    },
    async play(data: PlayRequest): Promise<PlayerState> {
      if (data.playlist_uuid) {
        await post('/commands/playlist-play', {
          playlistUuid: data.playlist_uuid,
          shuffle: data.shuffle ?? false,
          loop: data.loop ?? false,
          startPatternUuid: data.pattern_uuid,
        })
      } else if (data.pattern_uuid) {
        await post('/commands/play', { patternUuid: data.pattern_uuid })
      }
      return this.getState()
    },
    async stop(_data?: StopRequest): Promise<PlayerState> {
      await post('/commands/stop')
      return this.getState()
    },
    async skip(): Promise<PlayerState> {
      await post('/commands/navigate', { direction: 'NEXT' })
      return this.getState()
    },
    async previous(): Promise<PlayerState> {
      await post('/commands/navigate', { direction: 'PREVIOUS' })
      return this.getState()
    },
  }

  // Ask the device to re-report a section, then wait for the round-trip + cache
  // write. The device only pushes list changes to LAN, so a plain cache read
  // would be stale right after a cloud mutation; this keeps list reads fresh.
  // Best-effort: if the device is offline the read just returns what's cached.
  const warm = async (target: 'patterns' | 'playlists') => {
    try {
      await post('/commands/refresh', { targets: [target] })
      await new Promise((r) => setTimeout(r, 700))
    } catch {
      /* fall through to cached */
    }
  }

  const patterns = {
    async list(): Promise<PatternsListResponse> {
      await warm('patterns')
      const res = (await get('/patterns')) as { patterns?: Record<string, unknown>[] }
      const list = (res.patterns ?? []).map(mapPattern)
      return {
        patterns: list,
        pagination: { page: 0, per_page: list.length, total_pages: 1, total_items: list.length },
      }
    },
    async delete(uuid: string): Promise<{ success: boolean }> {
      const res = (await authFetch(base, `/patterns/${encodeURIComponent(uuid)}`, {
        method: 'DELETE',
      })) as { delivered?: boolean }
      return { success: !!res?.delivered }
    },
    async rename(uuid: string, name: string): Promise<{ success: boolean }> {
      const res = (await authFetch(base, `/patterns/${encodeURIComponent(uuid)}`, {
        method: 'PATCH',
        body: JSON.stringify({ name }),
      })) as { delivered?: boolean }
      return { success: !!res?.delivered }
    },
    // No single-pattern cloud endpoint — resolve from the cached list.
    async get(uuid: string): Promise<Pattern> {
      const res = (await get('/patterns')) as { patterns?: Record<string, unknown>[] }
      const found = (res.patterns ?? []).map(mapPattern).find((p) => p.uuid === uuid)
      if (!found) throw new TranquilError('Pattern not found on the table.', ErrorCode.NotFound)
      return found
    },
  }

  const playlists = {
    async list(): Promise<PlaylistsListResponse> {
      await warm('playlists')
      const res = (await get('/playlists')) as { playlists?: Record<string, unknown>[] }
      const list = (res.playlists ?? []).map(mapPlaylist)
      return {
        playlists: list,
        pagination: { page: 0, per_page: list.length, total_pages: 1, total_items: list.length },
      }
    },
    async get(uuid: string): Promise<Playlist> {
      const res = (await get('/playlists')) as { playlists?: Record<string, unknown>[] }
      const found = (res.playlists ?? []).map(mapPlaylist).find((p) => p.uuid === uuid)
      if (!found) throw new TranquilError('Playlist not found on the table.', ErrorCode.NotFound)
      return found
    },
    async create(data: CreatePlaylistRequest): Promise<{ delivered: boolean }> {
      return (await post('/playlists', {
        name: data.name,
        description: data.description ?? '',
        patternUuids: data.pattern_uuids ?? [],
      })) as { delivered: boolean }
    },
    // The device replaces the whole playlist, so merge partial edits over the
    // current record to avoid clearing name/description/featured.
    async update(uuid: string, data: UpdatePlaylistRequest): Promise<{ delivered: boolean }> {
      const cur = await this.get(uuid)
      return (await authFetch(base, `/playlists/${encodeURIComponent(uuid)}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: data.name ?? cur.name,
          description: data.description ?? cur.description ?? '',
          patternUuids: data.pattern_uuids ?? cur.pattern_uuids,
          featuredPattern: data.featured_pattern ?? cur.featured_pattern ?? '',
        }),
      })) as { delivered: boolean }
    },
    // add/remove a pattern by rewriting the ordered list.
    async modify(uuid: string, data: ModifyPlaylistRequest): Promise<{ delivered: boolean }> {
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
    async delete(uuid: string): Promise<{ delivered: boolean }> {
      return (await authFetch(base, `/playlists/${encodeURIComponent(uuid)}`, {
        method: 'DELETE',
      })) as { delivered: boolean }
    },
  }

  const led = {
    async getEffects(): Promise<LEDEffect[]> {
      const res = (await get('/led/effects')) as { effects?: LEDEffect[] }
      return res.effects ?? []
    },
    async setChannel(
      channel: number,
      data: { effect_id?: string; brightness?: number; speed?: number; on?: boolean; color?: string },
    ): Promise<{ delivered: boolean }> {
      return (await post('/led/channel', {
        channel,
        effectId: data.effect_id ?? '',
        brightness: data.brightness ?? 0,
        speed: data.speed ?? 0,
        enabled: data.on ?? true,
      })) as { delivered: boolean }
    },
  }

  const system = {
    async getInfo(): Promise<SystemInfo> {
      const s = (await get('/system')) as Record<string, unknown>
      return {
        firmware_version: String(s.firmwareVersion ?? ''),
        hardware_model: String(s.hardwareModel ?? ''),
        device_id: String(s.deviceId ?? ''),
        hostname: String(s.hostname ?? ''),
        is_homed: !!s.isHomed,
        free_heap: Number(s.freeHeap ?? 0),
      }
    },
  }

  const schedule = {
    async get(): Promise<Schedule> {
      const res = (await get('/schedule')) as { items?: Schedule['items'] }
      return { items: res.items ?? [] }
    },
    async set(data: Schedule): Promise<{ delivered: boolean }> {
      return (await authFetch(base, '/schedule', {
        method: 'PUT',
        body: JSON.stringify({ items: data.items }),
      })) as { delivered: boolean }
    },
  }

  // Ask the device to re-report the given sections so the caches warm up.
  const refresh = (targets?: ('player' | 'patterns' | 'playlists' | 'led' | 'schedule')[]) =>
    post('/commands/refresh', { targets })

  // Raw download-progress read (the store polls this).
  const downloads = async (): Promise<
    { uuid: string; progressPct: number; failed: boolean; error?: string }[]
  > => {
    const res = (await get('/downloads')) as {
      downloads?: { uuid: string; progressPct?: number; failed?: boolean; error?: string }[]
    }
    return (res.downloads ?? []).map((d) => ({
      uuid: d.uuid,
      progressPct: d.progressPct ?? 0,
      failed: !!d.failed,
      error: d.error,
    }))
  }

  const requestDownload = (patternUuid: string) =>
    post('/commands/request-download', { patternUuid })

  return {
    deviceId,
    player,
    patterns,
    playlists,
    led,
    system,
    schedule,
    refresh,
    downloads,
    requestDownload,
  }
}
