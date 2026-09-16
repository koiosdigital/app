/**
 * Transport-agnostic contract for controlling ONE Tranquil table.
 *
 * Two transports implement it: `transport/lan.ts` (mDNS-discovered table,
 * REST + protobuf WebSocket) and `transport/cloud.ts` (device-api relay,
 * polled). The views only ever see this interface through the single Pinia
 * store (`stores/tranquil.ts`), so nothing above the store branches on which
 * transport is active — it asks `capabilities` instead.
 *
 * Domain types stay the LAN snake_case shapes in `local/types.ts`; each
 * transport owns exactly one mapper onto them.
 */

import type {
  AboutResponse,
  CommandResult,
  CreatePlaylistRequest,
  DeviceConfig,
  DeviceConfigPatch,
  HomeResponse,
  LEDChannelState,
  LEDChannelUpdate,
  LEDConfigResponse,
  LEDEffect,
  ModifyPlaylistRequest,
  OkResponse,
  Pattern,
  PatternUploadResponse,
  PatternsListResponse,
  PlayRequest,
  PlayerPatchRequest,
  PlayerState,
  Playlist,
  PlaylistsListResponse,
  PresetsListResponse,
  Schedule,
  ScheduleAction,
  ScheduleRunResult,
  StopRequest,
  SystemConfig,
  SystemConfigUpdate,
  SystemInfo,
  TimezoneEntry,
  UpdatePlaylistRequest,
} from './local/types'

export type TranquilTransportKind = 'lan' | 'cloud'

/** What a transport can do; views gate affordances on these, never on the kind. */
export interface TranquilCapabilities {
  /** Stream a local file to the table (`patterns.upload`). */
  upload: boolean
  /** Motion / LED hardware config, calibration, presets, factory reset. */
  config: boolean
  /** `thumbUrl()` yields something renderable. */
  thumbs: boolean
  /** `player.previous()` is available. */
  previous: boolean
  /** `player.stop({ emergency_stop: true })` halts motion immediately. */
  emergencyStop: boolean
  /** State arrives as real-time pushes (vs. polled snapshots). */
  livePush: boolean
  /** Command outcomes are surfaced on `lastCommandResult`. */
  commandResults: boolean
}

/** A device-side list whose change should make open views refetch. */
export type LibrarySection = 'patterns' | 'playlists' | 'schedule' | 'led' | 'system'

// --- live state carried by events -------------------------------------------

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

/** Live LED snapshot (LEDConfig with per-channel state). */
export interface LedSnapshot {
  hasLeds: boolean
  ledCount: number
  /** 'RGB' | 'RGBW' | 'RGBCCT' */
  format: string
  channels: LEDChannelState[]
}

/** Outcome of one command, correlated by the request id the sender chose. */
export interface CommandOutcome {
  requestId: string
  success: boolean
  detail: string
  errorCode: number
  /** ms epoch the outcome was recorded. */
  at: number
}

/** The table the store is bound to (enough for headers and route checks). */
export interface TranquilDeviceRef {
  id: string
  name?: string
  model?: string
  transport: TranquilTransportKind
}

/** Progress entries are merged by uuid; `updatedAt` defaults to "now". */
export interface DownloadEntry {
  uuid: string
  pct: number
  failed: boolean
  error?: string
  updatedAt?: number
}
export interface UploadEntry extends Omit<UploadProgress, 'updatedAt'> {
  uuid: string
  updatedAt?: number
}

/**
 * Everything a transport tells the store. Both transports emit the same union
 * so the store has one reducer.
 */
export type LiveEvent =
  /** The transport is now bound to this table (or to none). */
  | { type: 'device'; device: TranquilDeviceRef | null }
  /** Transport reachable: LAN socket open / cloud API answering. */
  | { type: 'connected'; connected: boolean }
  /** Cloud only: the gateway's view of the TABLE. null = unknown. */
  | { type: 'online'; online: boolean | null }
  /** LAN only: session restore progress (reload / deep link). */
  | { type: 'session'; resuming: boolean; resumeFailed: boolean }
  /** `at` is when the device reported it; null = the device never has. */
  | { type: 'playerState'; state: PlayerState; at: number | null }
  | { type: 'led'; led: LedSnapshot | null }
  | { type: 'downloads'; entries: DownloadEntry[] }
  | { type: 'uploads'; entries: UploadEntry[] }
  /** A device list changed; open views refetch that section. */
  | { type: 'library'; section: LibrarySection; at?: number }
  | { type: 'commandResult'; result: CommandOutcome }
  | { type: 'error'; message: string | null }

export type LiveListener = (event: LiveEvent) => void

// --- domain operations (the surface views call via store.api()) -------------

export interface PlayerApi {
  getState(): Promise<PlayerState>
  patch(data: PlayerPatchRequest): Promise<PlayerState>
  play(data: PlayRequest): Promise<PlayerState>
  stop(data?: StopRequest): Promise<PlayerState>
  skip(): Promise<PlayerState>
  previous(): Promise<PlayerState>
}

export interface PatternsApi {
  list(page?: number, perPage?: number): Promise<PatternsListResponse>
  get(uuid: string): Promise<Pattern>
  delete(uuid: string): Promise<CommandResult>
  /** Requires `capabilities.upload`. */
  upload(file: File): Promise<PatternUploadResponse>
}

export interface PlaylistsApi {
  list(page?: number, perPage?: number): Promise<PlaylistsListResponse>
  get(uuid: string): Promise<Playlist>
  create(data: CreatePlaylistRequest): Promise<Playlist>
  modify(uuid: string, data: ModifyPlaylistRequest): Promise<Playlist>
  update(uuid: string, data: UpdatePlaylistRequest): Promise<Playlist>
  reorder(uuid: string, patternUuids: string[]): Promise<Playlist>
  delete(uuid: string): Promise<CommandResult>
}

export interface LedApi {
  getEffects(): Promise<LEDEffect[]>
  getConfig(): Promise<LEDConfigResponse>
  getChannel(index: number): Promise<LEDChannelState>
  setChannel(index: number, data: LEDChannelUpdate): Promise<LEDChannelState>
}

export interface ScheduleApi {
  get(): Promise<Schedule>
  set(data: Schedule): Promise<Schedule>
  run(action: ScheduleAction, force?: boolean): Promise<ScheduleRunResult>
}

export interface SystemApi {
  getInfo(): Promise<SystemInfo>
  getAbout(): Promise<AboutResponse>
  home(forceFullCalibration?: boolean): Promise<HomeResponse>
  reboot(): Promise<OkResponse>
  /** Requires `capabilities.config`. */
  getConfig(): Promise<SystemConfig>
  /** Requires `capabilities.config`. */
  setConfig(data: SystemConfigUpdate): Promise<SystemConfig>
  /** Requires `capabilities.config`. */
  getTimezones(): Promise<TimezoneEntry[]>
  /** Requires `capabilities.config`. */
  factoryReset(): Promise<OkResponse>
}

/** Motion / LED hardware config. Requires `capabilities.config`. */
export interface DeviceConfigApi {
  get(): Promise<DeviceConfig>
  patch(data: DeviceConfigPatch): Promise<DeviceConfig>
  clearCalibration(): Promise<OkResponse>
}

/** Hardware presets. Requires `capabilities.config`. */
export interface PresetsApi {
  list(): Promise<PresetsListResponse>
  load(presetId: string): Promise<DeviceConfig>
}

export interface TranquilClient {
  readonly transport: TranquilTransportKind
  readonly capabilities: TranquilCapabilities
  readonly player: PlayerApi
  readonly patterns: PatternsApi
  readonly playlists: PlaylistsApi
  readonly led: LedApi
  readonly schedule: ScheduleApi
  readonly system: SystemApi
  readonly deviceConfig: DeviceConfigApi
  readonly presets: PresetsApi
  /**
   * Ask the table to fetch a store pattern. Progress arrives on the store's
   * `downloads` map through `downloads` events.
   */
  requestDownload(patternUuid: string): Promise<void>
  /**
   * Renderable thumbnail URL for a pattern on the table, or '' for the
   * placeholder disc. LAN: the device's own PNG. Cloud: the store thumb when
   * the pattern came from the store (there is no per-device origin off-LAN).
   */
  thumbUrl(patternUuid: string): string
}

/** The store-facing surface both transports add on top of the client. */
export interface TranquilTransport extends TranquilClient {
  readonly deviceId: string | null
  disconnect(): void
  /** Retry right now (foreground, network back, "Retry" button). */
  reconnectNow(): void
  /** Ask for a fresh LED snapshot; arrives as a `led` event. */
  requestLedSnapshot(): Promise<void>
}
