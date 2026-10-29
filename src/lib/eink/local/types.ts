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
  /** Default seconds between scheduled wakes (read-only in the Tier 1 API). */
  sleep_duration: number
  /** Wake-window length in seconds before re-sleeping (read-only). */
  max_idle: number
}

/** 0 = Floyd-Steinberg, 1 = JJN (matches eink-fw's dither field). */
export type DitherMode = 0 | 1

export interface EinkDitherSettings {
  dither: DitherMode
  /** 0..2, 1.0 = neutral. */
  saturation: number
  /** 0..2, 1.0 = neutral. */
  gamma: number
}

/** Full settings from GET /settings. The upstream token is write-only: the
 * device never echoes it, only whether one is set. */
export interface EinkSettings {
  sleep_duration: number
  max_idle: number
  dither: DitherMode
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
