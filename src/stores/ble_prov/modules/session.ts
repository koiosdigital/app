import { ref } from 'vue'
import { Security0 } from '../helpers/security/security_0'
import { Security1 } from '../helpers/security/security_1'
import { Security2 } from '../helpers/security/security_2'
import { sendData } from './connection'

/**
 * BLE Session Module
 * Handles secure session establishment with Security0, Security1, or Security2 protocol
 */

export const sessionEstablished = ref(false)

/** Security handler - Security0 (plaintext), Security1 (Curve25519), or Security2 (SRP6a) */
export const sec1 = ref<Security0 | Security1 | Security2 | undefined>(undefined)

/** Current security level: 0 = no encryption, 1 = Curve25519 + AES-CTR, 2 = SRP6a + AES-GCM */
export const securityLevel = ref<0 | 1 | 2>(1)

/**
 * Security2 credentials interface
 */
export interface Security2Credentials {
  username: string
  password: string
}

/**
 * Establish secure session with device
 * @param popOrCreds For Security0/1: PoP string. For Security2: { username, password }
 * @param level Security level: 0 = no encryption, 1 = Curve25519 + AES-CTR, 2 = SRP6a + AES-GCM
 */
export async function establishSession(
  popOrCreds: string | Security2Credentials = '',
  level: 0 | 1 | 2 = 1,
) {
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
    } else if (level === 1) {
      // Security1: Curve25519 + AES-CTR encryption, two-step handshake
      const pop = typeof popOrCreds === 'string' ? popOrCreds : ''
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
    } else if (level === 2) {
      // Security2: SRP6a + AES-GCM encryption
      if (typeof popOrCreds === 'string') {
        throw new Error('Security2 requires username and password credentials')
      }

      const { username, password } = popOrCreds
      const security2 = new Security2(username, password, false)
      sec1.value = security2

      // Step 0: Send username + client public key A
      const session0 = await security2.handleSession(undefined)
      const response0 = await sendData(session0!, 'prov-session')

      if (!response0) {
        throw new Error('No response from Security2 session step 0')
      }

      // Step 1: Process device response, send client proof M1
      const session1 = await security2.handleSession(response0)
      const response1 = await sendData(session1!, 'prov-session')

      if (!response1) {
        throw new Error('No response from Security2 session step 1')
      }

      // Step 2: Verify device proof M2
      await security2.handleSession(response1)
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
