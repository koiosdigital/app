/**
 * OAuth state encoding/decoding utilities
 * Used for CSRF protection and context preservation during OAuth flows
 */

export interface OAuthState {
  fieldId: string
  nonce: string
  appId: string
  deviceId?: string
  installationId?: string
  mode: 'install' | 'edit' | 'license'
  timestamp: number
}

/**
 * Generate a cryptographically random nonce
 */
function generateNonce(): string {
  const array = new Uint8Array(16)
  crypto.getRandomValues(array)
  return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

/**
 * Encode OAuth state as a base64 string for use in the state parameter
 */
export function encodeState(state: Omit<OAuthState, 'nonce' | 'timestamp'>): string {
  const fullState: OAuthState = {
    ...state,
    nonce: generateNonce(),
    timestamp: Date.now(),
  }
  return btoa(JSON.stringify(fullState))
}

/**
 * Decode a base64-encoded OAuth state string
 */
export function decodeState(encoded: string): OAuthState | null {
  try {
    return JSON.parse(atob(encoded))
  } catch {
    return null
  }
}

/**
 * Check if an OAuth state has expired (default: 10 minutes)
 */
export function isStateExpired(state: OAuthState, maxAgeMs = 10 * 60 * 1000): boolean {
  return Date.now() - state.timestamp > maxAgeMs
}
