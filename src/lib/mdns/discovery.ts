import { Capacitor } from '@capacitor/core'
import { ZeroConf, type ZeroConfWatchResult, type ZeroConfService } from 'capacitor-zeroconf'

/**
 * Local device discovery over mDNS / Bonjour.
 *
 * Every Koios device (firmware `kd_common`) advertises `_koiosdigital._tcp` on
 * port 80 with TXT records `model`, `type`, `version`. This module browses that
 * service so the app can reach devices LAN-direct by IP.
 *
 * Native-only: mDNS browsing requires the OS Bonjour/NSD APIs and isn't available
 * in a browser. On web this module is inert (discovery is unsupported and the
 * watch is a no-op) — web builds rely on cloud/account features instead.
 */

/** Bonjour service type the firmware advertises. Trailing dot per RFC / plugin. */
export const KOIOS_MDNS_TYPE = '_koiosdigital._tcp.'
export const KOIOS_MDNS_DOMAIN = 'local.'

/** Device families, matching device-api's `devices.type` (uppercased). */
export type KoiosDeviceType = 'MATRX' | 'NEMOTO' | 'LANTERN' | 'TRANQUIL'

const KNOWN_TYPES: KoiosDeviceType[] = ['MATRX', 'NEMOTO', 'LANTERN', 'TRANQUIL']

/** A Koios device seen on the local network. */
export interface LocalDevice {
  /** Stable key for this service instance (the Bonjour service name). */
  id: string
  /** Advertised instance / host name (e.g. `tranquil-abc123`). */
  name: string
  /** Resolved mDNS hostname (e.g. `tranquil-abc123.local.`). */
  hostname: string
  /** First IPv4 address, or null if the service resolved without one. */
  address: string | null
  /** Advertised port (80 for the firmware HTTP API). */
  port: number
  /** Normalized family (uppercased); falls back to raw for unknown types. */
  type: KoiosDeviceType | string
  /** Raw TXT `type` value as advertised (lowercase, e.g. `tranquil`). */
  typeRaw: string
  /** TXT `model` — the build variant. */
  model: string
  /** TXT `version` — firmware app version. */
  version: string
  /** Base URL for the device's local HTTP API, or null without an address. */
  baseUrl: string | null
}

export interface DiscoveryEvent {
  action: 'resolved' | 'removed'
  device: LocalDevice
}

export interface DiscoveryHandle {
  /** Stop watching and release the underlying browser. Idempotent. */
  stop: () => Promise<void>
}

/** Whether mDNS discovery is available on this platform (native only). */
export function isDiscoverySupported(): boolean {
  return Capacitor.isNativePlatform()
}

/** Normalize the TXT `type` (lowercase) to a known family, or pass it through. */
export function normalizeKoiosType(raw: string | undefined): KoiosDeviceType | string {
  const upper = (raw ?? '').trim().toUpperCase()
  return (KNOWN_TYPES as string[]).includes(upper) ? (upper as KoiosDeviceType) : upper
}

/** Build a `LocalDevice` from a resolved Bonjour service, or null if unusable. */
function toLocalDevice(service: ZeroConfService): LocalDevice | null {
  if (!service?.name) return null

  const txt = service.txtRecord ?? {}
  const address = service.ipv4Addresses?.[0] ?? null
  const port = service.port || 80

  return {
    id: service.name,
    name: service.name,
    hostname: service.hostname ?? '',
    address,
    port,
    type: normalizeKoiosType(txt.type),
    typeRaw: (txt.type ?? '').trim(),
    model: (txt.model ?? '').trim(),
    version: (txt.version ?? '').trim(),
    baseUrl: address ? `http://${address}:${port}` : null,
  }
}

/**
 * Start browsing for Koios devices. `onEvent` fires on every resolve/removal.
 * Returns a handle to stop. On unsupported (web) platforms discovery is a no-op
 * and the returned handle's `stop()` resolves immediately.
 */
export async function watchKoiosDevices(
  onEvent: (event: DiscoveryEvent) => void,
): Promise<DiscoveryHandle> {
  if (!isDiscoverySupported()) {
    return { stop: async () => {} }
  }

  let stopped = false

  await ZeroConf.watch(
    { type: KOIOS_MDNS_TYPE, domain: KOIOS_MDNS_DOMAIN },
    (result: ZeroConfWatchResult) => {
      // 'added' is an unresolved hint; wait for 'resolved' to get IP + TXT.
      if (result.action === 'resolved') {
        const device = toLocalDevice(result.service)
        if (device) onEvent({ action: 'resolved', device })
      } else if (result.action === 'removed') {
        const device = toLocalDevice(result.service)
        if (device) onEvent({ action: 'removed', device })
      }
    },
  )

  return {
    stop: async () => {
      if (stopped) return
      stopped = true
      try {
        await ZeroConf.unwatch({ type: KOIOS_MDNS_TYPE, domain: KOIOS_MDNS_DOMAIN })
      } catch (err) {
        console.warn('mDNS unwatch failed', err)
      }
      try {
        await ZeroConf.close()
      } catch (err) {
        console.warn('mDNS close failed', err)
      }
    },
  }
}
