import { ref } from 'vue'
import { sendData } from './connection'
import { sec1 } from './session'
import {
  createScanStartRequest,
  createScanStatusRequest,
  createScanResultRequest,
  parseScanStartResponse,
  parseScanStatusResponse,
  parseScanResultResponse,
} from '../helpers/wifi_scan'
import {
  createSetConfigRequest,
  createApplyConfigRequest,
  createGetStatusRequest,
  parseSetConfigResponse,
  parseApplyConfigResponse,
  parseGetStatusResponse,
  WifiStationState,
  WifiConnectFailedReason,
  type WifiStatusResult,
} from '../helpers/wifi_prov'

export type WifiAP = ReturnType<typeof parseScanResultResponse>[number]

/** Human-readable labels for connection failure reasons */
const FAIL_REASON_LABELS: Record<WifiConnectFailedReason, string> = {
  [WifiConnectFailedReason.AuthError]: 'Authentication failed - check password',
  [WifiConnectFailedReason.NetworkNotFound]: 'Network not found',
}

/**
 * WiFi Module
 * Handles WiFi scanning and provisioning
 */

export const discoveredAPs = ref<WifiAP[]>([])
export const scanningForAPs = ref(false)
export const connectingToAP = ref<WifiAP | undefined>(undefined)
export const connectedToAP = ref(false)
export const connectionError = ref<string | undefined>(undefined)
export const lastWifiStatus = ref<WifiStatusResult | undefined>(undefined)

let connCheckInterval: ReturnType<typeof setInterval> | undefined = undefined

/**
 * Start WiFi AP scan
 */
async function startAPScan() {
  // Use default parameters: blocking=true, passive=false, group_channels=5, period_ms=120
  // Setting group_channels to 0 can cause firmware crashes
  const payload = createScanStartRequest()
  const encrypted = await sec1.value!.encryptData(payload)
  const response = await sendData(encrypted, 'prov-scan')
  const decrypted = await sec1.value!.decryptData(response!)
  return parseScanStartResponse(decrypted)
}

/**
 * Get scan status
 */
async function getScanStatus() {
  const payload = createScanStatusRequest()
  const encrypted = await sec1.value!.encryptData(payload)
  const response = await sendData(encrypted, 'prov-scan')
  const decrypted = await sec1.value!.decryptData(response!)
  return parseScanStatusResponse(decrypted)
}

/**
 * Get scan results
 */
async function getScanResult(n: number, start: number) {
  const payload = createScanResultRequest(n, start)
  const encrypted = await sec1.value!.encryptData(payload)
  const response = await sendData(encrypted, 'prov-scan')
  const decrypted = await sec1.value!.decryptData(response!)
  return parseScanResultResponse(decrypted)
}

/**
 * Scan for WiFi access points
 */
export async function scanForAPs() {
  if (!sec1.value) {
    throw new Error('Session not established')
  }

  scanningForAPs.value = true
  discoveredAPs.value = []

  await startAPScan()

  const scanStatus = await getScanStatus()
  const totalCount = scanStatus.count
  const CHUNK_SIZE = 4

  if (totalCount > 0) {
    let index = 0
    while (index < totalCount) {
      // Request only the remaining items if fewer than CHUNK_SIZE left
      const remaining = totalCount - index
      const requestCount = Math.min(CHUNK_SIZE, remaining)
      const scanResult = await getScanResult(requestCount, index)
      for (const result of scanResult) {
        discoveredAPs.value.push(result)
      }
      index += requestCount
    }
  }

  scanningForAPs.value = false
  return discoveredAPs.value
}

/**
 * Check WiFi connection status
 */
async function checkWiFiConnection() {
  if (!sec1.value) return

  try {
    const payload = createGetStatusRequest()
    const encrypted = await sec1.value.encryptData(payload)
    const response = await sendData(encrypted, 'prov-config')
    const decrypted = await sec1.value.decryptData(response!)
    const status = parseGetStatusResponse(decrypted)

    // Store last status for debugging
    lastWifiStatus.value = status

    switch (status.staState) {
      case WifiStationState.Connected:
        // Successfully connected
        clearInterval(connCheckInterval)
        connCheckInterval = undefined
        connectedToAP.value = true
        connectingToAP.value = undefined
        connectionError.value = undefined
        break

      case WifiStationState.Connecting:
        // Still connecting, keep polling
        break

      case WifiStationState.ConnectionFailed:
        // Connection failed permanently
        clearInterval(connCheckInterval)
        connCheckInterval = undefined
        connectingToAP.value = undefined

        if (status.failReason !== undefined) {
          connectionError.value = FAIL_REASON_LABELS[status.failReason]
        } else {
          connectionError.value = 'Connection failed'
        }
        console.error('[WiFi] Connection failed:', connectionError.value)
        break

      case WifiStationState.Disconnected:
        // Check if this is an attempt failure with retries remaining
        if (status.attemptFailed) {
          if (status.attemptFailed.attemptsRemaining === 0) {
            // No more retries
            clearInterval(connCheckInterval)
            connCheckInterval = undefined
            connectingToAP.value = undefined
            connectionError.value = 'Connection failed after all retry attempts'
            console.error('[WiFi] All retry attempts exhausted')
          }
        }
        break
    }
  } catch (err) {
    console.error('[WiFi] Error checking connection status:', err)
  }
}

/**
 * Connect to a WiFi access point
 */
export async function connectToAP(ap: WifiAP, password?: string) {
  if (!sec1.value) {
    throw new Error('Session not established')
  }

  // Clear previous state
  connectionError.value = undefined
  connectedToAP.value = false
  connectingToAP.value = ap

  const payload = createSetConfigRequest(ap.ssid, password || '')
  const encrypted = await sec1.value.encryptData(payload)
  const response = await sendData(encrypted, 'prov-config')
  const decrypted = await sec1.value.decryptData(response!)
  const resp = parseSetConfigResponse(decrypted)

  if (resp === 0) {
    const applyPayload = createApplyConfigRequest()
    const applyEncrypted = await sec1.value.encryptData(applyPayload)
    const applyResponse = await sendData(applyEncrypted, 'prov-config')
    const applyDecrypted = await sec1.value.decryptData(applyResponse!)
    const applyResp = parseApplyConfigResponse(applyDecrypted)

    if (applyResp === 0) {
      // Start polling for connection status
      connCheckInterval = setInterval(checkWiFiConnection, 3000)
      // Check immediately
      await checkWiFiConnection()
      return true
    } else {
      console.error('[WiFi] Failed to apply config, response:', applyResp)
      connectionError.value = 'Failed to apply WiFi configuration'
      connectingToAP.value = undefined
      return false
    }
  }

  console.error('[WiFi] Failed to set config, response:', resp)
  connectionError.value = 'Failed to set WiFi configuration'
  connectingToAP.value = undefined
  return false
}

/**
 * Clear connection error
 */
export function clearConnectionError() {
  connectionError.value = undefined
}

/**
 * Reset WiFi state
 */
export function resetWiFiState() {
  discoveredAPs.value = []
  scanningForAPs.value = false
  connectingToAP.value = undefined
  connectedToAP.value = false
  connectionError.value = undefined
  lastWifiStatus.value = undefined
  if (connCheckInterval) {
    clearInterval(connCheckInterval)
    connCheckInterval = undefined
  }
}
