import { ref } from 'vue'
import { activeMethod } from './connection'
import type { WifiAP, WifiStatusSnapshot } from '../methods/types'

/**
 * WiFi Module
 *
 * Thin dispatcher: routes scan / connect / status calls into the active
 * provisioning method and tracks reactive state for the UI.
 */

export type { WifiAP } from '../methods/types'

export const discoveredAPs = ref<WifiAP[]>([])
export const scanningForAPs = ref(false)
export const connectingToAP = ref<WifiAP | undefined>(undefined)
export const connectedToAP = ref(false)
export const connectionError = ref<string | undefined>(undefined)
export const lastWifiStatus = ref<WifiStatusSnapshot | undefined>(undefined)

let connCheckInterval: ReturnType<typeof setInterval> | undefined = undefined

export async function scanForAPs() {
  if (!activeMethod.value) throw new Error('No active provisioning method (device not connected)')

  scanningForAPs.value = true
  discoveredAPs.value = []

  try {
    const aps = await activeMethod.value.scanForAPs()
    discoveredAPs.value = aps
    return aps
  } finally {
    scanningForAPs.value = false
  }
}

async function pollOnce() {
  if (!activeMethod.value) return

  try {
    const snapshot = await activeMethod.value.pollWifiStatus()
    lastWifiStatus.value = snapshot

    if (snapshot.state === 'connected') {
      clearPoll()
      connectedToAP.value = true
      connectingToAP.value = undefined
      connectionError.value = undefined
    } else if (snapshot.state === 'failed') {
      clearPoll()
      connectingToAP.value = undefined
      connectionError.value = snapshot.error ?? 'Connection failed'
      console.error('[WiFi] Connection failed:', connectionError.value)
    }
    // 'connecting' / 'disconnected' (non-terminal) → keep polling
  } catch (err) {
    console.error('[WiFi] Error checking connection status:', err)
  }
}

function clearPoll() {
  if (connCheckInterval) {
    clearInterval(connCheckInterval)
    connCheckInterval = undefined
  }
}

export async function connectToAP(ap: WifiAP, password?: string) {
  if (!activeMethod.value) throw new Error('No active provisioning method (device not connected)')

  connectionError.value = undefined
  connectedToAP.value = false
  connectingToAP.value = ap

  try {
    await activeMethod.value.connectToAP(ap, password)
    connCheckInterval = setInterval(pollOnce, 3000)
    await pollOnce()
    return true
  } catch (err) {
    console.error('[WiFi] Failed to push WiFi config:', err)
    connectionError.value = err instanceof Error ? err.message : 'Failed to send WiFi configuration'
    connectingToAP.value = undefined
    return false
  }
}

export function clearConnectionError() {
  connectionError.value = undefined
}

export function resetWiFiState() {
  discoveredAPs.value = []
  scanningForAPs.value = false
  connectingToAP.value = undefined
  connectedToAP.value = false
  connectionError.value = undefined
  lastWifiStatus.value = undefined
  clearPoll()
}
