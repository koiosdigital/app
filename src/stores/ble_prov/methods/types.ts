import type { BleService, BleDevice } from '@capacitor-community/bluetooth-le'
import type { parseScanResultResponse } from './esp-prov/helpers/wifi_scan'
import type { KDCryptoStatus, KD_DSParams } from './esp-prov/helpers/kd_console'

export interface Security2Credentials {
  username: string
  password: string
}

/** A scanned WiFi access point. Today the shape comes from esp-prov's scan result. */
export type WifiAP = ReturnType<typeof parseScanResultResponse>[number]

/**
 * Capabilities reported by a method after it connects to a device. The UI
 * reads these flags instead of branching on method id, so adding a new method
 * (e.g. Improv BLE) requires no UI changes.
 */
export interface MethodCapabilities {
  /** Whether the method needs an explicit session-establishment step (esp-prov yes, Improv no). */
  needsSession: boolean
  /** PoP UI to render. null means the method has no concept of PoP. */
  popType: 'numeric' | 'color' | 'none' | null
  /** Whether the device has a crypto module (Koios kd_console extension). */
  hasCrypto: boolean
  /** Whether the method supports scanning for nearby APs over BLE. */
  supportsWifiScan: boolean
  /** Security version the device asked for (esp-prov only; undefined elsewhere). */
  sec_ver?: 0 | 1 | 2
  /** Raw protocol version string the device returned, for diagnostics. */
  protoVer?: string
}

export interface SessionArgs {
  popOrCreds: string | Security2Credentials
  level: 0 | 1 | 2
}

/** Snapshot of WiFi connection progress. */
export interface WifiStatusSnapshot {
  state: 'connecting' | 'connected' | 'failed' | 'disconnected'
  error?: string
  done: boolean
}

/**
 * Optional kd_console (Koios crypto) API. Only esp-prov on devices with the
 * `kd_console` characteristic exposes it.
 */
export interface KdConsoleApi {
  getCryptoStatus(): Promise<KDCryptoStatus>
  getCSR(): Promise<string>
  getDSParams(): Promise<KD_DSParams>
  setDSParams(params: KD_DSParams): Promise<void>
  setClaimToken(token: string): Promise<void>
  setDeviceCert(certPem: string): Promise<void>
}

/**
 * A provisioning method implements the wire protocol for one BLE provisioning
 * scheme (esp-prov, Improv BLE, …). One instance is created per connected
 * device and torn down on disconnect — the instance holds per-connection state
 * (security handler, characteristic map, etc.) so the dispatch layer doesn't
 * need to.
 */
export interface ProvisioningMethod {
  readonly id: string
  readonly serviceUuid: string

  onConnect(
    deviceId: string,
    deviceName: string,
    services: BleService[],
  ): Promise<MethodCapabilities>
  establishSession(args: SessionArgs): Promise<void>
  scanForAPs(): Promise<WifiAP[]>
  connectToAP(ap: WifiAP, password: string | undefined): Promise<void>
  pollWifiStatus(): Promise<WifiStatusSnapshot>

  /** Optional Koios extension. */
  readonly console?: KdConsoleApi

  teardown(): void
}

export type ProvisioningMethodFactory = (device: BleDevice) => ProvisioningMethod
