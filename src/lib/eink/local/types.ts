/**
 * Types for the eInk frame's LAN HTTP API (eink-fw, the Bloomin8-compatible
 * "Tier 1" surface: /deviceInfo, /setDither, /clearScreen, /upload,
 * /image/delete). The firmware serves no OpenAPI doc, so these are
 * hand-written to match eink-fw's eink_handlers.cpp.
 */

export interface EinkDeviceInfo {
  name: string
  version: string
  board_model: string
  screen_model: string
  /** Battery percent, omitted by the firmware when no fuel gauge is present. */
  battery?: number
  /** Cell voltage in volts (present only when the fuel gauge is). */
  battery_voltage?: number
  /** Charge rate in %/hour: positive charging, negative discharging. */
  battery_rate?: number
  /** Charger actively charging. */
  charging?: boolean
  /** On external (wall) power. */
  power_good?: boolean
  /** Default seconds between scheduled wakes (read-only in the Tier 1 API). */
  sleep_duration: number
  /** Wake-window length in seconds before re-sleeping (read-only). */
  max_idle: number
}

/** Legacy kernel toggle. eink-fw still reports it, but the processing preset
 * now drives the whole dither pipeline. 0 = Floyd-Steinberg, 1 = JJN. */
export type DitherMode = 0 | 1

/**
 * epdoptimize processing preset (matches eink-fw's `preset` field). Drives the
 * on-device tone mapping, dynamic-range compression, palette and diffusion for
 * every image path — app uploads and scheduled server pulls alike.
 */
export type EinkPreset = 0 | 1 | 2 | 3 | 4

export const EINK_PRESETS: { value: EinkPreset; label: string; hint: string }[] = [
  { value: 0, label: 'Balanced', hint: 'Faithful colour, lifts shadows' },
  { value: 1, label: 'Dynamic', hint: 'Punchier and more saturated' },
  { value: 2, label: 'Vivid', hint: 'Brightest, strongest colour' },
  { value: 3, label: 'Soft', hint: 'Smoothest, gentle contrast' },
  { value: 4, label: 'Grayscale', hint: 'Black and white' },
]

/** Full settings from GET /settings. The upstream token is write-only: the
 * device never echoes it, only whether one is set. */
export interface EinkSettings {
  sleep_duration: number
  max_idle: number
  dither: DitherMode
  preset: EinkPreset
  saturation: number
  gamma: number
  upstream_on: boolean
  upstream_url: string
  has_upstream_token: boolean
}

/** Any subset may be sent to POST /settings; `upstream_token` is write-only. */
export interface EinkSettingsUpdate {
  sleep_duration?: number
  max_idle?: number
  dither?: DitherMode
  preset?: EinkPreset
  saturation?: number
  gamma?: number
  upstream_on?: boolean
  upstream_url?: string
  upstream_token?: string
}

export interface OkResponse {
  ok?: boolean
  msg?: string
  filename?: string
  error?: string
}

export interface UploadOptions {
  /** Target filename on the device gallery (defaults to the File's name). */
  filename?: string
  /** Gallery folder on the device (defaults to "default"). */
  gallery?: string
  /** Push straight to the panel after upload. */
  showNow?: boolean
}

/** Native panel pixel dimensions per screen model, for client-side resizing. */
export const SCREEN_DIMENSIONS: Record<string, { width: number; height: number }> = {
  EL133UF1: { width: 1600, height: 1200 },
}

export function screenDimensions(model: string | undefined): { width: number; height: number } {
  return (model && SCREEN_DIMENSIONS[model]) || { width: 1600, height: 1200 }
}
