/**
 * Tranquil CLOUD transport: one table reached off-LAN through device-api
 * (`/v1/devices/:id/tranquil/*`, user bearer). device-api relays commands to
 * the table over the dnet gateway and mirrors the state the table pushes back.
 *
 *  - Commands are POSTs that answer `{ delivered, requestId }`; the device's
 *    outcome for a request lands later on `GET .../commands/{requestId}` (404
 *    while pending) and in `/live.commandResults`. After each command the
 *    transport follows its request id for a few seconds and emits a
 *    `commandResult` so the UI can toast a failure.
 *  - Live state is polled from ONE endpoint (`/live`): online flag, player,
 *    downloads, recent command results. Adaptive, foreground-only cadence:
 *    3 s while playing/downloading, 10 s idle, 20 s while the table is
 *    offline, stopped while hidden (immediate tick on resume). Every ~45 s it
 *    also asks the device to keep progress updates flowing ("watch" window)
 *    and sweeps the list sections so another client's change is noticed.
 *  - Every list the Worker serves carries `at` (ms epoch of the device's last
 *    report). The transport remembers the last `at` per section and emits a
 *    `library` event whenever it moves — that is what makes the views'
 *    libraryVersion watchers live over the cloud (B6/B7). After one of our own
 *    mutations it polls that section until `at` changes.
 *
 * Responses are mapped to the SAME domain types the LAN transport returns
 * (src/lib/tranquil/local/types.ts). Upload post-processing is LAN-only, so
 * `uploads` never fires here. Motion config / calibration / presets are
 * LAN-only and throw (`capabilities.config` is false).
 */

import { App as CapacitorApp } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { apiFetch } from '@/lib/api/client'
import { useNetworkStatus } from '@/composables/useNetworkStatus'
import { tranquilStore } from '../cloudStore'
import { TranquilError, ErrorCode } from '../local/errors'
import type {
  CreatePlaylistRequest,
  LEDChannelState,
  LEDChannelUpdate,
  LEDConfigResponse,
  LEDEffect,
  ModifyPlaylistRequest,
  Pattern,
  PatternsListResponse,
  PlayRequest,
  PlayerModeEnum,
  PlayerPatchRequest,
  PlayerState,
  PlayerStateEnum,
  Playlist,
  PlaylistsListResponse,
  QuietHours,
  Schedule,
  ScheduleAction,
  ScheduleItem,
  ScheduleLedState,
  ScheduleRunResult,
  StopRequest,
  SystemInfo,
  UpdatePlaylistRequest,
} from '../local/types'
import type { components } from '@/types/api'
import type {
  CommandOutcome,
  DeviceConfigApi,
  LedApi,
  LedSnapshot,
  LibrarySection,
  LiveListener,
  PatternsApi,
  PlayerApi,
  PlaylistsApi,
  PresetsApi,
  ScheduleApi,
  SystemApi,
  TranquilCapabilities,
  TranquilTransport,
} from '../client'

export const CLOUD_CAPABILITIES: TranquilCapabilities = Object.freeze({
  upload: false,
  config: false,
  thumbs: true,
  previous: true,
  emergencyStop: true,
  livePush: false,
  commandResults: true,
})

export interface CloudDeviceRef {
  id: string
  name?: string
  type?: string
  model?: string
  online?: boolean
}

type LiveDto = components['schemas']['TranquilLiveDto']
type PlayerStateDto = components['schemas']['TranquilPlayerStateDto']
type DownloadEntryDto = components['schemas']['TranquilDownloadEntryDto']
type LedConfigDto = components['schemas']['TranquilLedConfigDto']
type ScheduleDto = components['schemas']['TranquilScheduleDto']
type ScheduleItemDto = components['schemas']['TranquilScheduleItemDto']
type ScheduleActionDto = components['schemas']['TranquilScheduleActionDto']
type QuietHoursDto = components['schemas']['TranquilQuietHoursDto']
type LedColorDto = components['schemas']['TranquilLedColorDto']
type SystemDto = components['schemas']['TranquilSystemDto']
type DispatchDto = components['schemas']['TranquilDispatchDto']
type CommandResultDto = components['schemas']['TranquilCommandResultDto']

const POLL_ACTIVE_MS = 3000
const POLL_IDLE_MS = 10000
const POLL_OFFLINE_MS = 20000
const WATCH_REFRESH_MS = 45000
// How often the list sections are re-read for another client's changes. The
// lists are full bodies (no HEAD), so this is deliberately slow; our own
// mutations and finished downloads are followed up immediately instead.
const SWEEP_MS = 120000
// A download we asked for counts as active (fast polling) until the device
// reports it, or this long has passed without any report.
const PENDING_DOWNLOAD_MS = 60000
// How long to follow a command's request id for its outcome.
const RESULT_TIMEOUT_MS = 8000
const RESULT_POLL_MS = 700
// How long to wait for the device's echo after one of our own list mutations.
const ECHO_TIMEOUT_MS = 6000
const ECHO_POLL_MS = 750
// Round trip allowed when a section has never been reported (`at` null).
const FIRST_REPORT_WAIT_MS = 900

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export class DeliveryError extends TranquilError {
  constructor() {
    super('The table is offline; the command was not delivered.', ErrorCode.WsDisconnected)
    this.name = 'DeliveryError'
  }
}

const unsupported = () =>
  new TranquilError('Not available while controlling the table over the cloud.', ErrorCode.InvalidRequest)

const noConnection = () =>
  new TranquilError('No active table connection', ErrorCode.WsDisconnected)

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
          : s.mode === 'RANDOM_LOOP'
            ? 'RANDOM_LOOP'
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
    // The device's thumb_url is relative to its LAN origin, unreachable from
    // here; `thumbUrl()` resolves store thumbs by uuid instead.
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

function mapLedChannel(ch: NonNullable<LedConfigDto['channels']>[number]): LEDChannelState {
  return {
    effect_id: ch.effectId,
    brightness: ch.brightness,
    speed: ch.speed,
    on: ch.enabled,
    color: ch.color ? `#${hex(ch.color.r)}${hex(ch.color.g)}${hex(ch.color.b)}` : '#ffffff',
    w: ch.color?.w,
    cw: ch.color?.cw,
  }
}

function ledFormat(cfg: LedConfigDto): string {
  return cfg.format === 3 ? 'RGBCCT' : cfg.format === 2 ? 'RGBW' : 'RGB'
}

function mapLedConfig(cfg: LedConfigDto): LEDConfigResponse {
  const type = ledFormat(cfg)
  const channels = (cfg.channels ?? []).map((ch, i) => ({
    index: ch.channel ?? i,
    num_leds: cfg.ledCount ?? 0,
    type,
    state: mapLedChannel(ch),
  }))
  return { version: cfg.pixdriverVersion ?? '', has_leds: !!cfg.hasLeds, channels }
}

function mapLedSnapshot(cfg: LedConfigDto): LedSnapshot {
  return {
    hasLeds: !!cfg.hasLeds,
    ledCount: cfg.ledCount ?? 0,
    format: ledFormat(cfg),
    channels: (cfg.channels ?? []).map(mapLedChannel),
  }
}

function mapSystem(s: SystemDto): SystemInfo {
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
    quiet_hours_active: s.quietHoursActive,
    timezone: s.timezone,
  }
}

// --- schedule (camelCase DTO <-> LAN snake_case domain) ---------------------

const hex2 = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')
function colorFromDto(c: LedColorDto | undefined): Pick<ScheduleLedState, 'color' | 'w' | 'cw'> {
  if (!c) return {}
  return { color: `#${hex2(c.r)}${hex2(c.g)}${hex2(c.b)}`, w: c.w, cw: c.cw }
}
function colorToDto(led: ScheduleLedState): LedColorDto | undefined {
  if (!led.color && led.w == null && led.cw == null) return undefined
  const h = (led.color ?? '#000000').replace('#', '')
  const r = parseInt(h.slice(0, 2), 16) || 0
  const g = parseInt(h.slice(2, 4), 16) || 0
  const b = parseInt(h.slice(4, 6), 16) || 0
  return { r, g, b, w: led.w, cw: led.cw }
}
function mapAction(a: ScheduleActionDto): ScheduleAction {
  const out: ScheduleAction = {
    type: a.type,
    uuid: a.uuid || undefined,
    shuffle: a.shuffle,
    loop: a.loop,
    feed_rate: a.feedRate,
  }
  if (a.led) {
    out.led = {
      on: a.led.enabled,
      effect_id: a.led.effectId,
      brightness: a.led.brightness,
      speed: a.led.speed,
      ...colorFromDto(a.led.color),
    }
  }
  return out
}
function actionToDto(a: ScheduleAction): ScheduleActionDto {
  return {
    type: a.type,
    uuid: a.uuid,
    shuffle: a.shuffle,
    loop: a.loop,
    feedRate: a.feed_rate,
    led: a.led
      ? {
          enabled: a.led.on,
          effectId: a.led.effect_id,
          brightness: a.led.brightness,
          speed: a.led.speed,
          color: colorToDto(a.led),
        }
      : undefined,
  }
}
function mapItem(it: ScheduleItemDto): ScheduleItem {
  return {
    id: it.id ?? 0,
    name: it.name ?? '',
    days_of_week: it.daysOfWeek,
    time_of_day: it.timeOfDay,
    enabled: it.enabled ?? true,
    obey_quiet_hours: it.obeyQuietHours ?? true,
    action: mapAction(it.action),
  }
}
function itemToDto(it: ScheduleItem): ScheduleItemDto {
  return {
    id: it.id,
    name: it.name,
    daysOfWeek: it.days_of_week,
    timeOfDay: it.time_of_day,
    enabled: it.enabled,
    obeyQuietHours: it.obey_quiet_hours,
    action: actionToDto(it.action),
  }
}
function mapQuiet(q: QuietHoursDto | undefined): QuietHours {
  return {
    windows: (q?.windows ?? []).map((w) => ({
      day_mask: w.dayMask,
      start_min: w.startMin,
      end_min: w.endMin,
      enabled: w.enabled ?? true,
    })),
    stop_playback: !!q?.stopPlayback,
    lights_off: !!q?.lightsOff,
  }
}
function quietToDto(q: QuietHours): QuietHoursDto {
  return {
    windows: q.windows.map((w) => ({
      dayMask: w.day_mask,
      startMin: w.start_min,
      endMin: w.end_min,
      enabled: w.enabled,
    })),
    stopPlayback: q.stop_playback,
    lightsOff: q.lights_off,
  }
}

/** A pattern that came from the store (as opposed to a LAN upload). */
function isStorePattern(p: Pattern): boolean {
  return p.encrypted || !!p.is_owned
}

function newUuid(): string {
  const c = globalThis.crypto
  if (typeof c.randomUUID === 'function') return c.randomUUID()
  // RFC 4122 v4 fallback for WebViews without randomUUID.
  const b = new Uint8Array(16)
  c.getRandomValues(b)
  b[6] = (b[6]! & 0x0f) | 0x40
  b[8] = (b[8]! & 0x3f) | 0x80
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

// Each section's read endpoint; all of them answer with `at`.
const SECTION_PATH: Record<LibrarySection, string> = {
  patterns: '/patterns',
  playlists: '/playlists',
  schedule: '/schedule',
  led: '/led/config',
  system: '/system',
}

// App-lifecycle listeners are process-wide and can't be removed per instance,
// so they are bound once and forwarded to whichever transport is current.
let current: CloudTransport | null = null
let lifecycleBound = false
let visible = true
function bindLifecycle(): void {
  if (lifecycleBound) return
  lifecycleBound = true
  const onVisibility = (isVisible: boolean) => {
    visible = isVisible
    if (isVisible) current?.reconnectNow()
    else current?.stopPolling()
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () =>
      onVisibility(document.visibilityState === 'visible'),
    )
  }
  if (Capacitor.isNativePlatform()) {
    void CapacitorApp.addListener('appStateChange', ({ isActive }) => onVisibility(isActive))
  }
  useNetworkStatus().onReconnect(() => current?.reconnectNow())
}

export class CloudTransport implements TranquilTransport {
  readonly transport = 'cloud' as const
  readonly capabilities = CLOUD_CAPABILITIES

  private device: CloudDeviceRef | null = null
  private base = ''
  private pollTimer: ReturnType<typeof setTimeout> | null = null
  private inFlight = false
  private lastWatchAt = 0
  private lastSweepAt = 0
  private online: boolean | null = null
  private playing = false
  private downloading = false
  // Downloads we requested that the device hasn't reported on yet (uuid → when).
  private pendingDownloads = new Map<string, number>()
  // Downloads already seen finished, so a completion is followed up once.
  private seenDone = new Set<string>()
  // Last `at` seen per section; a change means the device re-reported it.
  private sectionAt: Partial<Record<LibrarySection, number | null>> = {}
  // Patterns seen in the last list read, for thumbUrl()'s store-vs-upload call.
  private patternCache = new Map<string, Pattern>()
  // Request ids we are still waiting on, and the ones already surfaced.
  private awaiting = new Map<string, { section?: LibrarySection }>()
  private settled = new Set<string>()
  private readonly emit: LiveListener

  constructor(listener: LiveListener) {
    this.emit = listener
  }

  get deviceId(): string | null {
    return this.device?.id ?? null
  }

  // --- session --------------------------------------------------------------

  connect(device: CloudDeviceRef): void {
    if (this.device?.id === device.id) {
      if (device.name && !this.device.name) {
        this.device = { ...this.device, ...device }
        this.emitDevice()
      }
      return
    }
    this.disconnect()
    current = this
    this.device = device
    this.base = `/v1/devices/${encodeURIComponent(device.id)}/tranquil`
    this.online = device.online ?? null
    this.emitDevice()
    this.emit({ type: 'online', online: this.online })
    this.emit({ type: 'error', message: null })
    bindLifecycle()
    // First tick asks the device for a fresh state (watch window opens too).
    this.lastWatchAt = 0
    void this.tick()
  }

  disconnect(): void {
    this.stopPolling()
    if (current === this) current = null
    this.inFlight = false
    this.device = null
    this.base = ''
    this.online = null
    this.sectionAt = {}
    this.patternCache.clear()
    this.pendingDownloads.clear()
    this.seenDone.clear()
    this.awaiting.clear()
    this.settled.clear()
    this.emit({ type: 'connected', connected: false })
    this.emit({ type: 'online', online: null })
    this.emit({ type: 'device', device: null })
  }

  /** Poll right now (user action, resume, network back). */
  reconnectNow(): void {
    this.lastWatchAt = 0
    void this.tick()
  }

  private emitDevice(): void {
    const d = this.device
    this.emit({
      type: 'device',
      device: d ? { id: d.id, name: d.name, model: d.model, transport: 'cloud' } : null,
    })
  }

  // --- polling ----------------------------------------------------------------

  stopPolling(): void {
    if (this.pollTimer) {
      clearTimeout(this.pollTimer)
      this.pollTimer = null
    }
  }

  private scheduleNext(delayOverride?: number): void {
    this.stopPolling()
    if (!this.device || !visible) return
    const busy = this.playing || this.downloading
    const delay =
      delayOverride ??
      (this.online === false ? POLL_OFFLINE_MS : busy ? POLL_ACTIVE_MS : POLL_IDLE_MS)
    this.pollTimer = setTimeout(() => void this.tick(), delay)
  }

  private async tick(): Promise<void> {
    if (!this.device || this.inFlight) return
    this.inFlight = true
    const base = this.base
    try {
      // Keep the device's fast progress cadence alive while we're watching.
      // Skipped while offline (it would only produce a 409 round trip).
      const now = Date.now()
      if (this.online !== false && now - this.lastWatchAt > WATCH_REFRESH_MS) {
        this.lastWatchAt = now
        void this.refresh(['player'], 60).catch(() => {})
      }
      // Sweep the list sections so another client's change bumps the views.
      const sweep = this.online !== false && now - this.lastSweepAt > SWEEP_MS
      if (sweep) this.lastSweepAt = now
      const live = await this.get<LiveDto>('/live')
      if (this.base !== base) return
      this.online = live.online
      this.emit({ type: 'connected', connected: true })
      this.emit({ type: 'online', online: live.online })
      this.emit({ type: 'error', message: null })
      const state = mapState(live.player)
      this.playing = state.state === 'PLAYING'
      this.emit({ type: 'playerState', state, at: live.playerAt })
      this.reconcileDownloads(live.downloads)
      for (const r of live.commandResults) this.settle(r)
      if (sweep) void this.sweepSections()
    } catch (e) {
      if (this.base !== base) return
      this.emit({ type: 'connected', connected: false })
      this.emit({
        type: 'error',
        message: e instanceof Error ? e.message : 'Lost connection to the cloud',
      })
    } finally {
      if (this.base === base) {
        this.inFlight = false
        this.scheduleNext()
      }
    }
  }

  private reconcileDownloads(active: DownloadEntryDto[]): void {
    const now = Date.now()
    let inProgress = false
    let finished = false
    const entries = active.map((d) => {
      if (d.done || d.failed) {
        this.pendingDownloads.delete(d.uuid)
        if (d.done && !this.seenDone.has(d.uuid)) {
          this.seenDone.add(d.uuid)
          finished = true
        }
      } else {
        inProgress = true
      }
      return {
        uuid: d.uuid,
        pct: d.done ? 100 : d.progressPct,
        failed: d.failed,
        error: d.failed ? d.error || 'Download failed' : undefined,
        // The Worker's timestamp of the device's last report, so the store's
        // stall watchdog measures real progress rather than our poll cadence.
        updatedAt: d.updatedAt,
      }
    })
    for (const [uuid, at] of this.pendingDownloads) {
      if (now - at > PENDING_DOWNLOAD_MS) this.pendingDownloads.delete(uuid)
    }
    this.downloading = inProgress || this.pendingDownloads.size > 0
    // A download just finished: the pattern list changed.
    if (finished) void this.checkSection('patterns')
    if (entries.length) this.emit({ type: 'downloads', entries })
  }

  // --- section `at` tracking (B6/B7) -------------------------------------------

  /** Remember a section's `at`; emit `library` when it moved. */
  private noteAt(section: LibrarySection, at: number | null | undefined): void {
    if (at == null) return
    const prev = this.sectionAt[section]
    this.sectionAt[section] = at
    // First sighting seeds only: whoever read it already has the fresh copy.
    if (prev !== undefined && prev !== null && prev !== at) {
      this.emit({ type: 'library', section, at })
    }
  }

  /** Read a section head and note its `at` (LED also refreshes the snapshot). */
  private async checkSection(section: LibrarySection): Promise<void> {
    try {
      const res = await this.get<{ at?: number | null }>(SECTION_PATH[section])
      if (section === 'led') this.emit({ type: 'led', led: mapLedSnapshot(res as LedConfigDto) })
      this.noteAt(section, res.at)
    } catch {
      /* best effort */
    }
  }

  private async sweepSections(): Promise<void> {
    for (const section of ['patterns', 'playlists', 'schedule', 'led'] as const) {
      if (!this.device) return
      await this.checkSection(section)
    }
  }

  /**
   * After one of our own mutations: poll the section until the device's echo
   * lands in the cloud cache (`at` moves), which emits the `library` bump.
   * Resolves with the fresh body, or null if it never came.
   */
  private async awaitEcho<T extends { at?: number | null }>(
    section: LibrarySection,
    since: number | null | undefined,
  ): Promise<T | null> {
    const deadline = Date.now() + ECHO_TIMEOUT_MS
    while (Date.now() < deadline && this.device) {
      await sleep(ECHO_POLL_MS)
      try {
        const res = await this.get<T>(SECTION_PATH[section])
        if (res.at != null && res.at !== (since ?? null)) {
          this.noteAt(section, res.at)
          return res
        }
      } catch {
        /* keep waiting */
      }
    }
    return null
  }

  // --- HTTP -------------------------------------------------------------------

  private get<T>(path: string): Promise<T> {
    if (!this.device) return Promise.reject(noConnection())
    return call<T>(`${this.base}${path}`)
  }

  private post<T>(path: string, body?: unknown): Promise<T> {
    if (!this.device) return Promise.reject(noConnection())
    return call<T>(`${this.base}${path}`, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    })
  }

  /**
   * Send a command and require delivery. The device applies it asynchronously;
   * the outcome is followed by request id and surfaced as a `commandResult`.
   * `section` names the list this command changes, so the echo is noticed.
   */
  private async dispatch(
    method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    path: string,
    body?: unknown,
    section?: LibrarySection,
  ): Promise<DispatchDto> {
    if (!this.device) throw noConnection()
    const res = await call<DispatchDto | null>(`${this.base}${path}`, {
      method,
      body: body ? JSON.stringify(body) : undefined,
    })
    if (!res?.delivered) {
      // Not delivered = the gateway has no session for the table.
      this.online = false
      this.emit({ type: 'online', online: false })
      throw new DeliveryError()
    }
    this.online = true
    this.emit({ type: 'online', online: true })
    if (res.requestId) {
      this.awaiting.set(res.requestId, { section })
      void this.followResult(res.requestId)
    }
    return res
  }

  // Poll GET .../commands/{requestId} (404 while pending) for a few seconds;
  // /live may resolve it first, in which case this loop just stops.
  private async followResult(requestId: string): Promise<void> {
    const deadline = Date.now() + RESULT_TIMEOUT_MS
    const base = this.base
    while (Date.now() < deadline && this.base === base && this.awaiting.has(requestId)) {
      await sleep(RESULT_POLL_MS)
      if (!this.awaiting.has(requestId)) return
      let res: Response
      try {
        res = await apiFetch(`${base}/commands/${encodeURIComponent(requestId)}`)
      } catch {
        return
      }
      if (res.status === 404) continue
      if (!res.ok) return
      this.settle((await res.json()) as CommandResultDto)
      return
    }
    this.awaiting.delete(requestId)
  }

  private settle(r: CommandResultDto): void {
    if (!r?.requestId || this.settled.has(r.requestId)) return
    const pending = this.awaiting.get(r.requestId)
    if (!pending) return
    this.awaiting.delete(r.requestId)
    this.settled.add(r.requestId)
    if (this.settled.size > 64) this.settled.delete(this.settled.values().next().value!)
    const result: CommandOutcome = {
      requestId: r.requestId,
      success: !!r.success,
      detail: r.detail ?? '',
      errorCode: r.errorCode ?? 0,
      at: r.at ?? Date.now(),
    }
    this.emit({ type: 'commandResult', result })
    // The device has acted: pull the new state now rather than next tick.
    if (!this.inFlight) this.scheduleNext(150)
    if (pending.section) void this.checkSection(pending.section)
  }

  // Ask the device to re-report sections / keep fast progress updates coming.
  private refresh(targets?: LibrarySection[] | ('player' | LibrarySection)[], watchSeconds = 60) {
    return this.post<DispatchDto>('/commands/refresh', { targets, watchSeconds })
  }

  // The device pushes its lists on every change and on (re)connect, so the
  // cloud copy is normally current. Only when there is no snapshot at all
  // (`at` null) do we ask the device and wait briefly for the round trip.
  private async readSection<T extends { at?: number | null }>(section: LibrarySection): Promise<T> {
    let res = await this.get<T>(SECTION_PATH[section])
    if (res.at == null) {
      try {
        await this.refresh([section], 0)
        await sleep(FIRST_REPORT_WAIT_MS)
        res = await this.get<T>(SECTION_PATH[section])
      } catch {
        /* fall through to whatever is cached */
      }
    }
    this.noteAt(section, res.at)
    return res
  }

  private async readPatterns(): Promise<Pattern[]> {
    const res = await this.readSection<{ patterns?: Record<string, unknown>[]; at?: number | null }>('patterns')
    const list = (res.patterns ?? []).map(mapPattern)
    this.patternCache = new Map(list.map((p) => [p.uuid, p]))
    return list
  }

  private async readPlaylists(): Promise<Playlist[]> {
    const res = await this.readSection<{ playlists?: Record<string, unknown>[]; at?: number | null }>('playlists')
    return (res.playlists ?? []).map(mapPlaylist)
  }

  private async readLedConfig(): Promise<LedConfigDto> {
    const cfg = await this.readSection<LedConfigDto>('led')
    this.emit({ type: 'led', led: mapLedSnapshot(cfg) })
    return cfg
  }

  // --- TranquilClient -------------------------------------------------------

  async requestLedSnapshot(): Promise<void> {
    try {
      await this.readLedConfig()
    } catch {
      /* no LED info over cloud yet */
    }
  }

  async requestDownload(patternUuid: string): Promise<void> {
    await this.dispatch('POST', '/commands/request-download', { patternUuid })
    this.pendingDownloads.set(patternUuid, Date.now())
    this.seenDone.delete(patternUuid)
    this.downloading = true
    // Progress is only reported at the fast cadence while someone watches.
    if (!this.inFlight) this.scheduleNext(POLL_ACTIVE_MS)
  }

  thumbUrl(patternUuid: string): string {
    // Unknown patterns default to the store thumb: off-LAN tables are filled
    // from the store, and a miss just leaves the placeholder disc.
    const p = this.patternCache.get(patternUuid)
    if (p && !isStorePattern(p)) return ''
    return tranquilStore.thumbUrl(patternUuid)
  }

  readonly player: PlayerApi = {
    getState: async () => {
      const dto = await this.get<PlayerStateDto>('/state')
      const state = mapState(dto)
      this.emit({ type: 'playerState', state, at: dto.at ?? null })
      return state
    },
    // Callers get the last-known state to keep a consistent shape with the LAN
    // client; the device's actual result follows as a `commandResult`, and the
    // poller reflects the new state shortly after.
    patch: async (data: PlayerPatchRequest) => {
      const jobs: Promise<unknown>[] = []
      if (data.is_paused !== undefined)
        jobs.push(this.dispatch('POST', '/commands/set-paused', { paused: data.is_paused }))
      if (data.loop !== undefined)
        jobs.push(this.dispatch('POST', '/commands/loop', { enabled: data.loop }))
      if (data.shuffle !== undefined)
        jobs.push(this.dispatch('POST', '/commands/shuffle', { shuffle: data.shuffle }))
      // FeedRate is the 1-5 ball-speed multiplier, same scale as the slider.
      if (data.feed_rate !== undefined)
        jobs.push(this.dispatch('POST', '/commands/feed-rate', { feedRateRpm: data.feed_rate }))
      if (data.random_loop !== undefined)
        jobs.push(this.dispatch('POST', '/commands/random-loop', { enabled: data.random_loop }))
      await Promise.all(jobs)
      return this.player.getState()
    },
    play: async (data: PlayRequest) => {
      if (data.random) {
        await this.dispatch('POST', '/commands/play-random', { loop: data.loop ?? true })
      } else if (data.playlist_uuid) {
        await this.dispatch('POST', '/commands/playlist-play', {
          playlistUuid: data.playlist_uuid,
          shuffle: data.shuffle ?? false,
          loop: data.loop ?? false,
          startPatternUuid: data.pattern_uuid,
        })
      } else if (data.pattern_uuid) {
        await this.dispatch('POST', '/commands/play', { patternUuid: data.pattern_uuid })
      }
      return this.player.getState()
    },
    stop: async (data?: StopRequest) => {
      await this.dispatch('POST', '/commands/stop', { emergency: !!data?.emergency_stop })
      return this.player.getState()
    },
    skip: async () => {
      await this.dispatch('POST', '/commands/navigate', { direction: 'NEXT' })
      return this.player.getState()
    },
    previous: async () => {
      await this.dispatch('POST', '/commands/navigate', { direction: 'PREVIOUS' })
      return this.player.getState()
    },
  }

  readonly patterns: PatternsApi = {
    list: async (): Promise<PatternsListResponse> => {
      const list = await this.readPatterns()
      return {
        patterns: list,
        pagination: { page: 0, per_page: list.length, total_pages: 1, total_items: list.length },
      }
    },
    // No single-pattern cloud endpoint — resolve from the cached list.
    get: async (uuid: string): Promise<Pattern> => {
      const found = (await this.readPatterns()).find((p) => p.uuid === uuid)
      if (!found) throw new TranquilError('Pattern not found on the table.', ErrorCode.NotFound)
      return found
    },
    delete: async (uuid: string) => {
      const since = this.sectionAt.patterns
      await this.dispatch('DELETE', `/patterns/${encodeURIComponent(uuid)}`, undefined, 'patterns')
      void this.awaitEcho('patterns', since)
      return { success: true }
    },
    upload: () => Promise.reject(unsupported()),
  }

  // Playlist mutations return the resulting Playlist (like the LAN client) by
  // reading the device's echo once it lands in the cloud cache.
  private async playlistAfterMutation(uuid: string, since: number | null | undefined): Promise<Playlist> {
    const res = await this.awaitEcho<{ playlists?: Record<string, unknown>[]; at?: number | null }>('playlists', since)
    const found = res?.playlists?.map(mapPlaylist).find((p) => p.uuid === uuid)
    if (!found) {
      throw new TranquilError('The table did not confirm the playlist change.', ErrorCode.DeviceError)
    }
    return found
  }

  readonly playlists: PlaylistsApi = {
    list: async (): Promise<PlaylistsListResponse> => {
      const list = await this.readPlaylists()
      return {
        playlists: list,
        pagination: { page: 0, per_page: list.length, total_pages: 1, total_items: list.length },
      }
    },
    get: async (uuid: string): Promise<Playlist> => {
      const found = (await this.readPlaylists()).find((p) => p.uuid === uuid)
      if (!found) throw new TranquilError('Playlist not found on the table.', ErrorCode.NotFound)
      return found
    },
    create: async (data: CreatePlaylistRequest): Promise<Playlist> => {
      // We pick the uuid so the echo can be matched by id, not by name.
      const uuid = newUuid()
      const since = this.sectionAt.playlists
      await this.dispatch(
        'POST',
        '/playlists',
        {
          uuid,
          name: data.name,
          description: data.description ?? '',
          patternUuids: data.pattern_uuids ?? [],
        },
        'playlists',
      )
      return this.playlistAfterMutation(uuid, since)
    },
    // Absent fields are left unchanged by the Worker; `patternUuids: []` clears.
    update: async (uuid: string, data: UpdatePlaylistRequest): Promise<Playlist> => {
      const since = this.sectionAt.playlists
      await this.dispatch(
        'PUT',
        `/playlists/${encodeURIComponent(uuid)}`,
        {
          name: data.name,
          description: data.description,
          patternUuids: data.pattern_uuids,
          featuredPattern: data.featured_pattern,
        },
        'playlists',
      )
      return this.playlistAfterMutation(uuid, since)
    },
    // add/remove a pattern by rewriting the ordered list.
    modify: async (uuid: string, data: ModifyPlaylistRequest): Promise<Playlist> => {
      const cur = await this.playlists.get(uuid)
      const list = cur.pattern_uuids
      const next =
        data.action === 'add'
          ? list.includes(data.pattern_uuid)
            ? list
            : [...list, data.pattern_uuid]
          : list.filter((u) => u !== data.pattern_uuid)
      return this.playlists.update(uuid, { pattern_uuids: next })
    },
    reorder: (uuid: string, patternUuids: string[]) =>
      this.playlists.update(uuid, { pattern_uuids: patternUuids }),
    delete: async (uuid: string) => {
      const since = this.sectionAt.playlists
      await this.dispatch('DELETE', `/playlists/${encodeURIComponent(uuid)}`, undefined, 'playlists')
      void this.awaitEcho('playlists', since)
      return { success: true }
    },
  }

  readonly led: LedApi = {
    getEffects: async (): Promise<LEDEffect[]> => {
      const res = await this.get<{ effects?: LEDEffect[]; at?: number | null }>('/led/effects')
      if (res.at == null) {
        try {
          await this.refresh(['led'], 0)
          await sleep(FIRST_REPORT_WAIT_MS)
          return (await this.get<{ effects?: LEDEffect[] }>('/led/effects')).effects ?? []
        } catch {
          /* cached */
        }
      }
      return res.effects ?? []
    },
    getConfig: async (): Promise<LEDConfigResponse> => mapLedConfig(await this.readLedConfig()),
    getChannel: async (index: number): Promise<LEDChannelState> => {
      const cfg = await this.led.getConfig()
      const ch = cfg.channels.find((c) => c.index === index) ?? cfg.channels[index]
      if (!ch?.state) throw new TranquilError('LED channel not found.', ErrorCode.NotFound)
      return ch.state
    },
    // Partial update: only the given fields change on the device. Returns the
    // merged state optimistically (the device's push confirms it).
    setChannel: async (index: number, data: LEDChannelUpdate): Promise<LEDChannelState> => {
      const current = await this.led.getChannel(index).catch(() => null)
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
      await this.dispatch(
        'POST',
        '/led/channel',
        {
          channel: index,
          effectId: data.effect_id,
          brightness: data.brightness,
          speed: data.speed,
          enabled: data.on,
          color,
        },
        'led',
      )
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

  readonly system: SystemApi = {
    getInfo: async (): Promise<SystemInfo> => mapSystem(await this.readSection<SystemDto>('system')),
    getAbout: async () => {
      const s = await this.system.getInfo()
      return { model: s.hardware_model, type: 'TRANQUIL', version: s.firmware_version }
    },
    reboot: async () => {
      await this.dispatch('POST', '/commands/reboot', { reason: 'app' })
      return { ok: true }
    },
    home: async (forceFullCalibration = false) => {
      await this.dispatch('POST', '/commands/home', { forceFullCalibration }, 'system')
      return { success: true, started: true }
    },
    getConfig: () => Promise.reject(unsupported()),
    setConfig: () => Promise.reject(unsupported()),
    getTimezones: () => Promise.reject(unsupported()),
    factoryReset: () => Promise.reject(unsupported()),
  }

  readonly schedule: ScheduleApi = {
    get: async (): Promise<Schedule> => {
      const res = await this.readSection<ScheduleDto>('schedule')
      return { items: (res.items ?? []).map(mapItem), quiet_hours: mapQuiet(res.quietHours) }
    },
    /** Replace the schedule. Only delivery is confirmed here; the device's echo
     *  bumps `libraryVersion.schedule` when it lands, and callers refetch. */
    set: async (data: Schedule): Promise<Schedule> => {
      const since = this.sectionAt.schedule
      await this.dispatch(
        'PUT',
        '/schedule',
        {
          items: data.items.map(itemToDto),
          quietHours: data.quiet_hours ? quietToDto(data.quiet_hours) : undefined,
        },
        'schedule',
      )
      void this.awaitEcho('schedule', since)
      return data
    },
    /** Over the cloud only delivery is confirmed; the table answers the gateway. */
    run: async (action: ScheduleAction, force = false): Promise<ScheduleRunResult> => {
      await this.dispatch('POST', '/commands/run-schedule', { action: actionToDto(action), force })
      return { success: true }
    },
  }

  readonly deviceConfig: DeviceConfigApi = {
    get: () => Promise.reject(unsupported()),
    patch: () => Promise.reject(unsupported()),
    clearCalibration: () => Promise.reject(unsupported()),
  }

  readonly presets: PresetsApi = {
    list: () => Promise.reject(unsupported()),
    load: () => Promise.reject(unsupported()),
  }
}
