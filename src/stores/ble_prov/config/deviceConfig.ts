/**
 * Device configuration based on BLE device name prefix.
 * Maps device prefixes to their security and capability settings.
 */

export type DeviceSecurityConfig = {
  /** 0 = no encryption, 1 = Curve25519 + AES-CTR, 2 = SRP6a + AES-GCM */
  securityLevel: 0 | 1 | 2
  /** Type of Proof of Possession UI to show (used as password input for Security2) */
  popType: 'numeric' | 'color' | 'none'
  /** Whether the device has a crypto module for certificates */
  hasCrypto: boolean
}

/** Static username for Security2 SRP6a authentication */
export const SECURITY2_USERNAME = 'koiosdigital'

/** Default password when popType is 'none' for Security2 */
export const SECURITY2_DEFAULT_PASSWORD = 'koiosdigital'

/**
 * Device prefix to configuration mapping.
 * Security level 0: No encryption, no PoP required
 * Security level 1: Curve25519 + AES-256-CTR encryption with PoP
 * Security level 2: SRP6a + AES-256-GCM with username/password
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

/**
 * Get Security2 credentials from popCode.
 * @param popCode The proof of possession code (used as password)
 * @param popType The type of PoP input
 * @returns Credentials object for Security2 authentication
 */
export function getSecurity2Credentials(
  popCode: string,
  popType: 'numeric' | 'color' | 'none',
): { username: string; password: string } {
  return {
    username: SECURITY2_USERNAME,
    password: popType === 'none' ? SECURITY2_DEFAULT_PASSWORD : popCode,
  }
}
