import { ref } from 'vue'
import { activeMethod } from './connection'
import type { Security2Credentials } from '../methods/types'

/**
 * Session Module
 *
 * Thin dispatcher that drives the active method's session handshake and
 * exposes reactive status flags for the UI. The actual handshake logic lives
 * in the method (esp-prov runs Security0/1/2; Improv resolves immediately).
 */

export type { Security2Credentials } from '../methods/types'

export const sessionEstablished = ref(false)
export const securityLevel = ref<0 | 1 | 2>(1)

/**
 * Back-compat ref preserved for any legacy reader. The security handler now
 * lives inside the active method; this ref is always undefined and will be
 * removed once nothing references it.
 */
export const sec1 = ref<undefined>(undefined)

export async function establishSession(
  popOrCreds: string | Security2Credentials = '',
  level: 0 | 1 | 2 = 1,
) {
  if (!activeMethod.value) {
    throw new Error('No active provisioning method (device not connected)')
  }

  try {
    securityLevel.value = level
    await activeMethod.value.establishSession({ popOrCreds, level })
    sessionEstablished.value = true
    return true
  } catch (error) {
    console.error(
      'Session establishment failed:',
      error instanceof Error ? error.message : String(error),
    )
    throw error
  }
}

export function resetSession() {
  sessionEstablished.value = false
  securityLevel.value = 1
}
