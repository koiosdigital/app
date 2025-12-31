import { ref } from 'vue'
import { Security0 } from '../helpers/security/security_0'
import { Security1 } from '../helpers/security/security_1'
import { sendData } from './connection'

/**
 * BLE Session Module
 * Handles secure session establishment with Security0 or Security1 protocol
 */

export const sessionEstablished = ref(false)

/** Security handler - either Security0 (plaintext) or Security1 (encrypted) */
export const sec1 = ref<Security0 | Security1 | undefined>(undefined)

/** Current security level: 0 = no encryption, 1 = Curve25519 + AES */
export const securityLevel = ref<0 | 1>(1)

/**
 * Establish secure session with device
 * @param pop Proof of possession token (6-digit code for Matrix, color sequence for Lantern, empty for Security0)
 * @param level Security level: 0 = no encryption, 1 = Curve25519 + AES-256-CTR
 */
export async function establishSession(pop: string = '', level: 0 | 1 = 1) {
  try {
    securityLevel.value = level

    if (level === 0) {
      // Security0: No encryption, single handshake
      const security0 = new Security0(false)
      sec1.value = security0

      const request = await security0.handleSession(undefined)
      const response = await sendData(request!, 'prov-session')

      if (!response) {
        throw new Error('No response from Security0 session')
      }

      await security0.handleSession(response)
      sessionEstablished.value = true
    } else {
      // Security1: Curve25519 + AES encryption, two-step handshake
      const security1 = new Security1(pop, false)
      sec1.value = security1

      const session0 = await security1.handleSession(undefined)
      const response0 = await sendData(session0!, 'prov-session')

      if (!response0) {
        throw new Error('No response from session step 0')
      }

      const session1 = await security1.handleSession(response0)
      const response1 = await sendData(session1!, 'prov-session')

      if (!response1) {
        throw new Error('No response from session step 1')
      }

      await security1.handleSession(response1)
      sessionEstablished.value = true
    }

    return sessionEstablished.value
  } catch (error) {
    console.error(
      'Session establishment failed:',
      error instanceof Error ? error.message : String(error),
    )
    throw error
  }
}

/**
 * Reset session state
 */
export function resetSession() {
  sessionEstablished.value = false
  securityLevel.value = 1
  sec1.value = undefined
}
