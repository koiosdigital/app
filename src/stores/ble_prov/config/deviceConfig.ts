/**
 * Device configuration based on BLE device name prefix.
 *
 * Note: the security level (Security0 / Security1 / Security2) is no longer
 * inferred from the prefix — it's queried at connect time from the device's
 * `proto-ver` endpoint and exposed via `connection.protoVersion.sec_ver`.
 * This file only describes UI-specific bits (PoP input style, crypto module
 * presence) that still vary by device family.
 */

export type PopType = 'numeric' | 'color' | 'none'

export type DeviceUiConfig = {
  /** Type of Proof of Possession UI to show (used as password input for Security2) */
  popType: PopType
  /** Whether the device has a crypto module for certificates */
  hasCrypto: boolean
}

/** Static username for Security2 SRP6a authentication */
export const SECURITY2_USERNAME = 'koiosdigital'

/** Default password when popType is 'none' for Security2 */
export const SECURITY2_DEFAULT_PASSWORD = 'koiosdigital'

export const DEVICE_PREFIX_CONFIG: Record<string, DeviceUiConfig> = {
  'MATRX-': { popType: 'numeric', hasCrypto: true },
  'LANTERN-': { popType: 'color', hasCrypto: true },
  'CLOCK-': { popType: 'none', hasCrypto: false },
  'TRANQUIL-': { popType: 'none', hasCrypto: false },
}

/**
 * Get UI configuration based on device name prefix.
 * @param deviceName The BLE device name (e.g., "MATRX-ABC123")
 */
export function getDeviceConfig(deviceName: string): DeviceUiConfig {
  for (const [prefix, config] of Object.entries(DEVICE_PREFIX_CONFIG)) {
    if (deviceName.startsWith(prefix)) {
      return config
    }
  }
  // Default to color PoP (Lantern behavior)
  return { popType: 'color', hasCrypto: true }
}

/**
 * Get Security2 credentials from popCode.
 * @param popCode The proof of possession code (used as password)
 * @param popType The type of PoP input
 */
export function getSecurity2Credentials(
  popCode: string,
  popType: PopType,
): { username: string; password: string } {
  return {
    username: SECURITY2_USERNAME,
    password: popType === 'none' ? SECURITY2_DEFAULT_PASSWORD : popCode,
  }
}
