import {
  createScanStartRequest,
  createScanStatusRequest,
  createScanResultRequest,
  parseScanStartResponse,
  parseScanStatusResponse,
  parseScanResultResponse,
} from './helpers/wifi_scan'
import {
  createSetConfigRequest,
  createApplyConfigRequest,
  createGetStatusRequest,
  parseSetConfigResponse,
  parseApplyConfigResponse,
  parseGetStatusResponse,
  WifiStationState,
  WifiConnectFailedReason,
} from './helpers/wifi_prov'
import { sendData, type CharacteristicMap } from './transport'
import type { EspProvSecurity } from './session'
import type { WifiAP, WifiStatusSnapshot } from '../types'

const FAIL_REASON_LABELS: Record<WifiConnectFailedReason, string> = {
  [WifiConnectFailedReason.AuthError]: 'Authentication failed - check password',
  [WifiConnectFailedReason.NetworkNotFound]: 'Network not found',
}

async function sendEncrypted<T>(
  deviceId: string,
  serviceMap: CharacteristicMap,
  security: EspProvSecurity,
  characteristic: string,
  payload: Uint8Array,
  parse: (data: Uint8Array) => T,
): Promise<T> {
  const encrypted = await security.encryptData(payload)
  const response = await sendData(deviceId, serviceMap, characteristic, encrypted)
  const decrypted = await security.decryptData(response!)
  return parse(decrypted)
}

export async function scanForAPs(
  deviceId: string,
  serviceMap: CharacteristicMap,
  security: EspProvSecurity,
): Promise<WifiAP[]> {
  await sendEncrypted(
    deviceId,
    serviceMap,
    security,
    'prov-scan',
    createScanStartRequest(),
    parseScanStartResponse,
  )

  const status = await sendEncrypted(
    deviceId,
    serviceMap,
    security,
    'prov-scan',
    createScanStatusRequest(),
    parseScanStatusResponse,
  )

  const results: WifiAP[] = []
  const totalCount = status.count
  const CHUNK_SIZE = 4

  let index = 0
  while (index < totalCount) {
    const remaining = totalCount - index
    const requestCount = Math.min(CHUNK_SIZE, remaining)
    const chunk = await sendEncrypted(
      deviceId,
      serviceMap,
      security,
      'prov-scan',
      createScanResultRequest(requestCount, index),
      parseScanResultResponse,
    )
    for (const r of chunk) results.push(r)
    index += requestCount
  }

  return results
}

export async function pushWifiConfig(
  deviceId: string,
  serviceMap: CharacteristicMap,
  security: EspProvSecurity,
  ap: WifiAP,
  password: string | undefined,
): Promise<void> {
  const setResp = await sendEncrypted(
    deviceId,
    serviceMap,
    security,
    'prov-config',
    createSetConfigRequest(ap.ssid, password || ''),
    parseSetConfigResponse,
  )
  if (setResp !== 0) throw new Error(`Failed to set WiFi configuration (code ${setResp})`)

  const applyResp = await sendEncrypted(
    deviceId,
    serviceMap,
    security,
    'prov-config',
    createApplyConfigRequest(),
    parseApplyConfigResponse,
  )
  if (applyResp !== 0) throw new Error(`Failed to apply WiFi configuration (code ${applyResp})`)
}

export async function pollWifiStatus(
  deviceId: string,
  serviceMap: CharacteristicMap,
  security: EspProvSecurity,
): Promise<WifiStatusSnapshot> {
  const status = await sendEncrypted(
    deviceId,
    serviceMap,
    security,
    'prov-config',
    createGetStatusRequest(),
    parseGetStatusResponse,
  )

  switch (status.staState) {
    case WifiStationState.Connected:
      return { state: 'connected', done: true }
    case WifiStationState.Connecting:
      return { state: 'connecting', done: false }
    case WifiStationState.ConnectionFailed: {
      const error =
        status.failReason !== undefined
          ? FAIL_REASON_LABELS[status.failReason]
          : 'Connection failed'
      return { state: 'failed', done: true, error }
    }
    case WifiStationState.Disconnected:
      if (status.attemptFailed && status.attemptFailed.attemptsRemaining === 0) {
        return { state: 'failed', done: true, error: 'Connection failed after all retry attempts' }
      }
      return { state: 'disconnected', done: false }
    default:
      return { state: 'disconnected', done: false }
  }
}
