import { ref } from 'vue'
import { Security1 } from '../helpers/security/security_1'
import { sendData } from './connection'

/**
 * BLE Session Module
 * Handles secure session establishment with Security1 protocol
 */

export const sessionEstablished = ref(false)
export const sec1 = ref<Security1 | undefined>(undefined)

/**
 * Establish secure session with device using Security1 protocol
 * @param pop Proof of possession token (6-digit code for Matrix, color name for Lantern)
 */
export async function establishSession(pop: string = '') {
  try {
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
  sec1.value = undefined
}
