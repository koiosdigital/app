/**
 * eInk frame LAN-direct REST client. `createEinkRest(baseUrl)` binds to one
 * device's `http://<ip>:<port>` base (from mDNS discovery), mirroring the clock
 * and tranquil LAN clients.
 *
 * JSON calls go through `lanFetch` (CapacitorHttp on native, to reach the
 * device's cleartext http origin from the https WebView). The multipart image
 * upload deliberately uses plain `fetch` + `FormData` — same as the tranquil
 * pattern upload — because CapacitorHttp can't stream multipart bodies.
 */

import { lanFetch } from '@/lib/http/lanFetch'
import type {
  EinkDeviceInfo,
  EinkSettings,
  EinkSettingsUpdate,
  OkResponse,
  UploadOptions,
} from './types'

export interface EinkRestClient {
  deviceInfo(): Promise<EinkDeviceInfo>
  keepAlive(): Promise<OkResponse>
  getSettings(): Promise<EinkSettings>
  updateSettings(patch: EinkSettingsUpdate): Promise<EinkSettings>
  clearScreen(): Promise<OkResponse>
  /** Pull the current image from the configured upstream server now. */
  reload(): Promise<OkResponse>
  /** Show a JPEG straight from memory, without writing it to the device's
   * (tiny) flash gallery — the phone keeps the gallery. */
  display(file: Blob, filename?: string): Promise<OkResponse>
  /** Upload a JPEG into the device's own flash gallery (Bloomin8 compat). */
  upload(file: Blob, opts?: UploadOptions): Promise<OkResponse>
  /** Delete an image on the device gallery by its path under the gallery root. */
  deleteImage(path: string): Promise<OkResponse>
  readonly baseUrl: string
}

export function createEinkRest(baseUrl: string): EinkRestClient {
  const base = baseUrl.replace(/\/+$/, '')

  async function getJson<T>(path: string): Promise<T> {
    const res = await lanFetch(`${base}${path}`, { method: 'GET' })
    if (!res.ok) throw new Error(`${path} failed: ${res.status} ${res.statusText}`)
    return (await res.json()) as T
  }

  async function postJson<T>(path: string, body?: unknown): Promise<T> {
    const res = await lanFetch(`${base}${path}`, {
      method: 'POST',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
    if (!res.ok) throw new Error(`${path} failed: ${res.status} ${res.statusText}`)
    return (await res.json()) as T
  }

  return {
    baseUrl: base,
    deviceInfo: () => getJson<EinkDeviceInfo>('/deviceInfo'),
    keepAlive: () => getJson<OkResponse>('/keepAlive'),
    getSettings: () => getJson<EinkSettings>('/settings'),
    updateSettings: (patch) => postJson<EinkSettings>('/settings', patch),
    clearScreen: () => postJson<OkResponse>('/clearScreen'),
    reload: () => postJson<OkResponse>('/reload'),

    // Plain fetch (not lanFetch): multipart can't go through CapacitorHttp.
    async display(file, filename = 'image.jpg') {
      const form = new FormData()
      form.append('image', file, filename)
      const res = await fetch(`${base}/display`, { method: 'POST', body: form })
      if (!res.ok) throw new Error(`display failed: ${res.status} ${res.statusText}`)
      return (await res.json()) as OkResponse
    },

    async upload(file, opts = {}) {
      const params = new URLSearchParams()
      if (opts.filename) params.set('filename', opts.filename)
      params.set('gallery', opts.gallery ?? 'default')
      params.set('show_now', opts.showNow ? '1' : '0')

      const form = new FormData()
      form.append('image', file, opts.filename ?? 'image.jpg')

      const res = await fetch(`${base}/upload?${params.toString()}`, {
        method: 'POST',
        body: form,
      })
      if (!res.ok) throw new Error(`upload failed: ${res.status} ${res.statusText}`)
      return (await res.json()) as OkResponse
    },

    deleteImage(path) {
      const params = new URLSearchParams({ image: path })
      return postJson<OkResponse>(`/image/delete?${params.toString()}`)
    },
  }
}
