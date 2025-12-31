/**
 * Device configuration based on BLE device name prefix.
 * Maps device prefixes to their security and capability settings.
 */

export type DeviceSecurityConfig = {
  /** 0 = no encryption (plaintext), 1 = Curve25519 + AES-256-CTR */
  securityLevel: 0 | 1
  /** Type of Proof of Possession UI to show */
  popType: 'numeric' | 'color' | 'none'
  /** Whether the device has a crypto module for certificates */
  hasCrypto: boolean
}

/**
 * Device prefix to configuration mapping.
 * Security level 0: No encryption, no PoP required
 * Security level 1: Curve25519 + AES-256-CTR encryption with PoP
 */
export const DEVICE_PREFIX_CONFIG: Record<string, DeviceSecurityConfig> = {
  'MATRX-': { securityLevel: 1, popType: 'numeric', hasCrypto: true },
  'LANTERN-': { securityLevel: 1, popType: 'color', hasCrypto: true },
  'CLOCK-': { securityLevel: 0, popType: 'none', hasCrypto: false },
  'TRANQUIL-': { securityLevel: 0, popType: 'none', hasCrypto: false },
}

/**
 * Get device configuration based on device name prefix.
 * @param deviceName The BLE device name (e.g., "MATRX-ABC123")
 * @returns Device configuration for the matching prefix
 */
export function getDeviceConfig(deviceName: string): DeviceSecurityConfig {
  for (const [prefix, config] of Object.entries(DEVICE_PREFIX_CONFIG)) {
    if (deviceName.startsWith(prefix)) {
      return config
    }
  }
  // Default to security level 1 with color PoP (Lantern behavior)
  return { securityLevel: 1, popType: 'color', hasCrypto: true }
}
