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
} from '../helpers/wifi_prov'

export type WifiAP = ReturnType<typeof parseScanResultResponse>[number]

/**
 * WiFi Module
 * Handles WiFi scanning and provisioning
 */

export const discoveredAPs = ref<WifiAP[]>([])
export const scanningForAPs = ref(false)
export const connectingToAP = ref<WifiAP | undefined>(undefined)
export const connectedToAP = ref(false)

let connCheckInterval: ReturnType<typeof setInterval> | undefined = undefined

/**
 * Start WiFi AP scan
 */
async function startAPScan() {
  // Use default parameters: blocking=true, passive=false, group_channels=5, period_ms=120
  // Setting group_channels to 0 can cause firmware crashes
  const payload = createScanStartRequest()
  console.log('Starting AP scan with payload:', payload)
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
  console.log('Getting scan status with payload:', payload)
  const encrypted = await sec1.value!.encryptData(payload)
  const response = await sendData(encrypted, 'prov-scan')
  const decrypted = await sec1.value!.decryptData(response!)
  return parseScanStatusResponse(decrypted)
}

/**
 * Get scan results
 */
async function getScanResult(n: number, start: number) {
  console.log('Fetching scan results:', { n, start })
  const payload = createScanResultRequest(n, start)
  console.log('Getting scan results with payload:', payload)
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

  if (scanStatus.count > 0) {
    let index = 0
    while (scanStatus.count > index) {
      const scanResult = await getScanResult(4, index)
      for (const result of scanResult) {
        discoveredAPs.value.push(result)
      }
      index += 4
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

  const payload = createGetStatusRequest()
  const encrypted = await sec1.value.encryptData(payload)
  const response = await sendData(encrypted, 'prov-config')
  const decrypted = await sec1.value.decryptData(response!)
  const resp = parseGetStatusResponse(decrypted)

  if (resp.status) {
    clearInterval(connCheckInterval)
    connCheckInterval = undefined
    connectedToAP.value = true
    console.log('Connected to AP')
  }
}

/**
 * Connect to a WiFi access point
 */
export async function connectToAP(ap: WifiAP, password?: string) {
  if (!sec1.value) {
    throw new Error('Session not established')
  }

  connectingToAP.value = ap

  console.log('Connecting to AP:', ap.ssid)

  const payload = createSetConfigRequest(ap.ssid, password || '')
  const encrypted = await sec1.value.encryptData(payload)
  const response = await sendData(encrypted, 'prov-config')
  const decrypted = await sec1.value.decryptData(response!)
  const resp = parseSetConfigResponse(decrypted)

  console.log('Set Config Response:', resp)

  if (resp === 0) {
    console.log('WiFi Config Set Successfully')
    const applyPayload = createApplyConfigRequest()
    const applyEncrypted = await sec1.value.encryptData(applyPayload)
    const applyResponse = await sendData(applyEncrypted, 'prov-config')
    const applyDecrypted = await sec1.value.decryptData(applyResponse!)
    const applyResp = parseApplyConfigResponse(applyDecrypted)

    if (applyResp === 0) {
      console.log('WiFi Config Applied Successfully')
      connCheckInterval = setInterval(checkWiFiConnection, 5000)
      checkWiFiConnection()
      return true
    } else {
      console.error('Failed to apply WiFi config')
      return false
    }
  }

  return false
}

/**
 * Reset WiFi state
 */
export function resetWiFiState() {
  discoveredAPs.value = []
  scanningForAPs.value = false
  connectingToAP.value = undefined
  connectedToAP.value = false
  if (connCheckInterval) {
    clearInterval(connCheckInterval)
    connCheckInterval = undefined
  }
}
