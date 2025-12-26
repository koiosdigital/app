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
    console.log('=== establishSession START ===')
    console.log('PoP token:', pop)

    console.log('Creating Security1 instance...')
    const security1 = new Security1(pop, false)
    sec1.value = security1
    console.log('Security1 instance created')

    console.log('Session step 0: Sending initial session request...')
    const session0 = await security1.handleSession(undefined)
    console.log('Session0 data:', session0)

    console.log('Sending session0 data to prov-session...')
    const response0 = await sendData(session0!, 'prov-session')
    console.log('Response0 received:', response0)

    if (!response0) {
      throw new Error('No response from session step 0')
    }

    console.log('Session step 1: Handling response0...')
    const session1 = await security1.handleSession(response0)
    console.log('Session1 data:', session1)

    console.log('Sending session1 data to prov-session...')
    const response1 = await sendData(session1!, 'prov-session')
    console.log('Response1 received:', response1)

    if (!response1) {
      throw new Error('No response from session step 1')
    }

    console.log('Session step 2: Final handshake...')
    await security1.handleSession(response1)
    console.log('Session handshake complete')

    sessionEstablished.value = true
    console.log('=== establishSession END - SUCCESS ===')

    return sessionEstablished.value
  } catch (error) {
    console.error('=== establishSession FAILED ===')
    console.error('Error:', error)
    console.error('Error name:', error instanceof Error ? error.name : 'unknown')
    console.error('Error message:', error instanceof Error ? error.message : String(error))
    console.error('Stack trace:', error instanceof Error ? error.stack : 'No stack available')
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
