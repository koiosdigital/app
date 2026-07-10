/**
 * Tranquil LAN-direct REST DTOs, ported verbatim from tranquil-app
 * (src/api/rest/types.ts). These describe the device's local `/api/*` server,
 * not the cloud device-api.
 */

export interface Pagination {
  page: number
  per_page: number
  total_pages: number
  total_items: number
}

export interface CommandResult {
  success: boolean
  error_code?: number
  detail?: string
}

// Player
export type PlayerStateEnum = 'STOPPED' | 'PLAYING' | 'PAUSED'
export type PlayerModeEnum = 'SINGLE_PATTERN' | 'PLAYLIST' | 'PLAYLIST_LOOP' | 'PLAYLIST_SHUFFLE'

export interface PlayerState {
  state: PlayerStateEnum
  mode: PlayerModeEnum
  current_pattern_uuid?: string
  current_playlist_uuid?: string
  progress_percent: number
  pattern_index?: number
  playlist_size?: number
  feed_rate: number
  shuffle: boolean
  loop: boolean
}

export interface PlayerPatchRequest {
  is_paused?: boolean
  loop?: boolean
  shuffle?: boolean
  feed_rate?: number
  pattern_uuid?: string
  playlist_uuid?: string
}

export interface PlayRequest {
  pattern_uuid?: string
  playlist_uuid?: string
  shuffle?: boolean
  loop?: boolean
}

export interface StopRequest {
  emergency_stop?: boolean
}

// Patterns
export interface Pattern {
  uuid: string
  name: string
  creator?: string
  encrypted: boolean
  size_bytes: number
  reversible: boolean
  start_point: number
  created_at?: string
  last_played_at?: string
  download_url?: string
  thumb_url: string
}

export interface PatternsListResponse {
  pagination: Pagination
  patterns: Pattern[]
}

export interface PatternUploadResponse {
  uuid: string
  name: string
  status: 'processing'
}

// Playlists
export interface Playlist {
  uuid: string
  name: string
  description?: string
  pattern_uuids: string[]
  featured_pattern?: string
  created_at?: string
  updated_at?: string
}

export interface PlaylistsListResponse {
  pagination: Pagination
  playlists: Playlist[]
}

export interface CreatePlaylistRequest {
  name: string
  description?: string
  pattern_uuids?: string[]
}

export interface ModifyPlaylistRequest {
  action: 'add' | 'remove'
  pattern_uuid: string
}

export interface ReorderPlaylistRequest {
  pattern_uuids: string[]
}

export interface UpdatePlaylistRequest {
  name?: string
  description?: string
  featured_pattern?: string
  /** Replaces the entire ordered pattern list when present */
  pattern_uuids?: string[]
}

// License
export interface StoreTokenResponse {
  success: boolean
  store_token?: string
  error?: string
}

// System
export interface AboutResponse {
  model: string
  type: string
  version: string
}

export interface SystemConfig {
  auto_timezone: boolean
  timezone: string
  ntp_server: string
  wifi_hostname: string
}

export interface SystemConfigUpdate {
  auto_timezone?: boolean
  timezone?: string
  ntp_server?: string
  wifi_hostname?: string
}

export interface TimezoneEntry {
  name: string
  rule: string
}

// System (device-level)
export interface SystemInfo {
  firmware_version: string
  hardware_model: string
  device_id: string
  hostname: string
  is_homed: boolean
  free_heap: number
}

export interface HomeResponse {
  success: boolean
  error?: string
}

export interface OkResponse {
  ok: boolean
}

// Motion/LED device configuration (NVS-backed)
export interface MotionConfig {
  steps_per_rev: number
  microsteps: number
  theta_gear_ratio_x100: number
  pinion_diameter_mm: number
  theta_max_rpm: number
  rho_max_rpm: number
  theta_current_ma: number
  rho_current_ma: number
  stallguard_threshold: number
  default_accel_mm_s2: number
  max_accel_mm_s2: number
}

export interface LEDHardwareConfig {
  has_leds: boolean
  led_count: number
  is_rgbw: boolean
}

export interface CalibrationData {
  theta_steps_per_rotation: number
  rho_max_steps: number
  is_valid: boolean
  timestamp: number
}

export interface DeviceConfig {
  motion: MotionConfig
  led: LEDHardwareConfig
  calibration: CalibrationData
  active_preset_id: string
}

export interface DeviceConfigPatch {
  motion?: Partial<MotionConfig>
  led?: Partial<LEDHardwareConfig>
}

// Presets
export interface PresetInfo {
  id: string
  name: string
  description: string
}

export interface PresetsListResponse {
  presets: PresetInfo[]
  active_preset_id: string
}

// Schedule
export interface ScheduleItem {
  /** Bitmask, bit 0 = Sunday .. bit 6 = Saturday (0x7F = all days) */
  days_of_week: number
  /** Seconds since local midnight (0-86399) */
  time_of_day: number
  /** 0=unspecified, 1=led_off, 2=led_on, 3=play_random_pattern, 4=play_playlist, 5=play_pattern */
  action_type: number
  uuid?: string
}

export interface Schedule {
  items: ScheduleItem[]
}

// LED
export interface LEDEffect {
  name: string
  id: number
}

export interface LEDChannelInfo {
  index: number
  num_leds: number
  type: string
}

export interface LEDConfigResponse {
  version: string
  channels: LEDChannelInfo[]
}

export interface LEDChannelState {
  effect_id: number
  brightness: number
  speed: number
  on: boolean
  color: string
}

export interface LEDChannelUpdate {
  effect_id?: number
  brightness?: number
  speed?: number
  on?: boolean
  color?: string
}
