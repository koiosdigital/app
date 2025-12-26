/**
 * WiFi utility functions
 */

/**
 * WiFi security type labels mapping
 */
export const WIFI_SECURITY_LABELS: Record<number, string> = {
  0: 'Open',
  1: 'WEP',
  2: 'WPA-PSK',
  3: 'WPA2-PSK',
  4: 'WPA/WPA2',
  5: 'WPA2-Enterprise',
}

/**
 * Get security label from auth code
 */
export function getSecurityLabel(authCode: number): string {
  return WIFI_SECURITY_LABELS[authCode] ?? 'Unknown'
}

/**
 * Check if WiFi requires password
 */
export function requiresPassword(authCode: number): boolean {
  return authCode !== 0
}

/**
 * Calculate signal strength percentage from RSSI
 */
export function getSignalStrength(rssi: number): number {
  return Math.min(100, Math.max(0, (rssi + 100) * 1.25))
}
