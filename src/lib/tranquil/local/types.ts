/**
 * Tranquil LAN-direct REST DTOs. These describe the device's local `/api/*`
 * server (docs/swagger.json in tranquil-fw), not the cloud device-api.
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
  is_owned?: boolean
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
  /** A homing/calibration run is in progress */
  is_homing?: boolean
  free_heap: number
  free_psram?: number
  uptime_s?: number
  /** dBm; 0 when unknown */
  wifi_rssi?: number
  ip_address?: string
}

export interface HomeResponse {
  success: boolean
  /** True when the run was started (it completes asynchronously) */
  started?: boolean
  error?: string
}

export interface OkResponse {
  ok: boolean
}

// Motion/LED device configuration (NVS-backed)
export interface MotionConfig {
  steps_per_rev: number
  microsteps: number
  /** Default path speed (units/min) */
  rho_max_rpm: number
  theta_current_ma: number
  rho_current_ma: number
  stallguard_threshold: number
  /** Per-motor step acceleration (steps/s²) — applied live */
  accel_steps_s2: number
  /** Max per-axis step-rate jump at a segment junction (steps/s) — applied live */
  junction_dv_steps_s: number
  /** Theta spin-rate safety cap (rotations/min) — applied live */
  theta_max_rot_per_min: number
  /** De-energize motors after this long idle; 0 = never */
  motor_idle_timeout_s: number
}

export type LedFormat = 'rgb' | 'rgbw' | 'rgbcct'
export type LedIcType = 'ws2812' | 'sk6812' | 'fw1906'
export type LedColorOrder = 'rgb' | 'rbg' | 'grb' | 'gbr' | 'brg' | 'bgr'

export interface LEDHardwareConfig {
  has_leds: boolean
  led_count: number
  /** @deprecated superseded by format; still sent by firmware for old clients */
  is_rgbw: boolean
  /** Strip pixel format */
  format?: LedFormat | string
  /** Driver IC */
  ic_type?: LedIcType | string
  /** R/G/B wire order, e.g. 'grb' */
  color_order?: LedColorOrder | string
  /** Swap warm/cool white wire order (RGBCCT) */
  white_swap?: boolean
}

export interface CalibrationData {
  theta_steps_per_rotation: number
  rho_max_steps: number
  is_valid: boolean
  /** Epoch seconds of the last full calibration; 0 if none */
  timestamp: number
}

export interface DeviceConfig {
  motion: MotionConfig
  led: LEDHardwareConfig
  calibration: CalibrationData
  active_preset_id: string
  is_homed?: boolean
  /** PATCH/preset response: the LED strip was rebuilt live */
  led_applied?: boolean
  /** PATCH/preset response: microsteps/steps_per_rev changed; reboot + re-home needed */
  reboot_required?: boolean
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
// Effect IDs are string slugs ('SOLID', 'RAINBOW', ...) — the firmware's
// effect engine registers effects by name; there are no numeric IDs.
export interface LEDEffect {
  name: string
  id: string
}

export interface LEDChannelState {
  effect_id: string
  /** 0-255 */
  brightness: number
  /** 1-10 (firmware effect engine scale) */
  speed: number
  on: boolean
  color: string
  /** Warm white level 0-255 (RGBCCT channels only) */
  w?: number
  /** Cool white level 0-255 (RGBCCT channels only) */
  cw?: number
}

export interface LEDChannelInfo {
  index: number
  num_leds: number
  /** Pixel format: 'RGB' | 'RGBW' | 'RGBCCT' (RGB + warm/cool white, e.g. FW1906) */
  type: string
  /** Live effect state of the channel */
  state?: LEDChannelState
}

export interface LEDConfigResponse {
  version: string
  has_leds?: boolean
  channels: LEDChannelInfo[]
  /** Configured (NVS) strip hardware, even when currently disabled */
  hardware?: {
    has_leds: boolean
    led_count: number
    ic_type: number
    format: number
    color_order: number
    white_swap: boolean
  }
}

export interface LEDChannelUpdate {
  effect_id?: string
  brightness?: number
  /** 1-10 */
  speed?: number
  on?: boolean
  color?: string
  /** Warm white level 0-255 (RGBCCT channels only) */
  w?: number
  /** Cool white level 0-255 (RGBCCT channels only) */
  cw?: number
}
