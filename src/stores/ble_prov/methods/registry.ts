import type { BleDevice } from '@capacitor-community/bluetooth-le'
import type { ProvisioningMethod, ProvisioningMethodFactory } from './types'
import { createEspProvMethod, ESP_PROV_SERVICE_UUID } from './esp-prov'
import { createImprovMethod, IMPROV_SERVICE_UUID } from './improv'

/**
 * Registry of supported BLE provisioning methods, ordered by preference.
 *
 * When a device advertises more than one supported service (e.g. esp-prov +
 * Improv on the same device), the first entry whose service UUID is present
 * wins. esp-prov is preferred over Improv because it carries the Koios
 * kd_console extensions and a secure session — Improv is a fallback.
 *
 * Adding a new method is a one-line registration: implement `ProvisioningMethod`,
 * then add an entry here in the desired priority position.
 */
interface RegistryEntry {
  serviceUuid: string
  factory: ProvisioningMethodFactory
}

const REGISTRY: RegistryEntry[] = [
  { serviceUuid: ESP_PROV_SERVICE_UUID.toLowerCase(), factory: createEspProvMethod },
  { serviceUuid: IMPROV_SERVICE_UUID.toLowerCase(), factory: createImprovMethod },
]

export function allServiceUuids(): string[] {
  return REGISTRY.map((e) => e.serviceUuid)
}

/**
 * Pick the highest-priority registered method whose service UUID appears in
 * the device's advertised services. Returns the matched service UUID alongside
 * the instantiated method so callers can correlate against the BLE service list.
 */
export function pickMethodForServices(
  serviceUuids: string[],
  device: BleDevice,
): { method: ProvisioningMethod; serviceUuid: string } | undefined {
  const available = new Set(serviceUuids.map((u) => u.toLowerCase()))
  for (const entry of REGISTRY) {
    if (available.has(entry.serviceUuid)) {
      return { method: entry.factory(device), serviceUuid: entry.serviceUuid }
    }
  }
  return undefined
}
