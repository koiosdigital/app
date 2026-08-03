/**
 * KD Clock firmware local API types, ported from clock-app (src/stores/api.d.ts,
 * generated from the firmware's OpenAPI doc). One API serves all clock variants;
 * `/api/nixie` and `/api/fibonacci` only exist on their respective variants, and
 * the `/api/led/*` endpoints are absent on fibonacci (themes drive its LEDs).
 */

export type ClockSubtype = 'nixie' | 'fibonacci' | 'wordclock'

export interface ClockAbout {
  /** Firmware variant/model, e.g. `CLOCK-V1`. */
  model: string
  /** Always `clock`. */
  type: string
  subtype: ClockSubtype
  version: string
}

export interface ClockSystemConfig {
  auto_timezone: boolean
  timezone: string
  ntp_server: string
  wifi_hostname: string
}

export type ClockSystemConfigUpdate = Partial<ClockSystemConfig>

export interface TimezoneEntry {
  name: string
  rule: string
}

export interface StatusResponse {
  status?: string
}

// --- LEDs (nixie + wordclock) ------------------------------------------------

export interface LedColor {
  r: number
  g: number
  b: number
  /** RGBW channels only. */
  w?: number
}

export interface LedEffect {
  /** Effect identifier for API calls, e.g. `BREATHE`. */
  id: string
  /** Human-readable name, e.g. `Breathe`. */
  name: string
}

export interface LedChannelInfo {
  index: number
  num_leds: number
  type: 'RGB' | 'RGBW'
  name: string
}

export interface LedConfigResponse {
  channels: LedChannelInfo[]
}

export interface LedChannelState {
  effect_id: string
  /** 0-255. */
  brightness: number
  /** 1-100. */
  speed: number
  on: boolean
  color: LedColor
}

export type LedChannelUpdate = Partial<LedChannelState>

// --- Nixie -------------------------------------------------------------------

export interface NixieConfig {
  /** Percentage, 0-100. */
  brightness: number
  military_time: boolean
  blinking_dots: boolean
  on: boolean
}

export type NixieConfigUpdate = Partial<NixieConfig>

// --- Fibonacci ---------------------------------------------------------------

export interface FibonacciTheme {
  id: number
  name: string
  /** Hex colors, e.g. `#FF0000`. */
  hour_color: string
  minute_color: string
  both_color: string
}

export interface FibonacciConfig {
  /** 0-255. */
  brightness: number
  theme_id: number
  on: boolean
  /** Read-only: available color themes. */
  themes: FibonacciTheme[]
}

export interface FibonacciConfigUpdate {
  brightness?: number
  theme_id?: number
  on?: boolean
}
