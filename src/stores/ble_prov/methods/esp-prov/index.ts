import type { BleDevice, BleService } from '@capacitor-community/bluetooth-le'
import { getDeviceConfig } from '../../config/deviceConfig'
import { buildCharacteristicMap, ESP_PROV_SERVICE_UUID, type CharacteristicMap } from './transport'
import { fetchProtoVersion, type ProtoVersionInfo } from './proto-ver'
import { runSecurityHandshake, type EspProvSecurity } from './session'
import { scanForAPs, pushWifiConfig, pollWifiStatus } from './wifi'
import { buildKdConsoleApi } from './console'
import type {
  KdConsoleApi,
  MethodCapabilities,
  ProvisioningMethod,
  SessionArgs,
  WifiAP,
  WifiStatusSnapshot,
} from '../types'

export { ESP_PROV_SERVICE_UUID } from './transport'
export type { ProtoVersionInfo } from './proto-ver'

class EspProvMethod implements ProvisioningMethod {
  readonly id = 'esp-prov'
  readonly serviceUuid = ESP_PROV_SERVICE_UUID

  private deviceId = ''
  private deviceName = ''
  private serviceMap: CharacteristicMap = new Map()
  private protoVersion?: ProtoVersionInfo
  private security?: EspProvSecurity
  private _console?: KdConsoleApi
  private hasCryptoChar = false

  constructor(device: BleDevice) {
    this.deviceId = device.deviceId
    this.deviceName = device.name ?? ''
  }

  async onConnect(
    deviceId: string,
    deviceName: string,
    services: BleService[],
  ): Promise<MethodCapabilities> {
    this.deviceId = deviceId
    this.deviceName = deviceName
    this.serviceMap = buildCharacteristicMap(services)
    this.protoVersion = await fetchProtoVersion(deviceId, this.serviceMap)
    this.hasCryptoChar = this.serviceMap.has('kd_console')

    const ui = getDeviceConfig(deviceName)
    return {
      needsSession: true,
      popType: ui.popType,
      hasCrypto: ui.hasCrypto && this.hasCryptoChar,
      supportsWifiScan: true,
      sec_ver: this.protoVersion?.sec_ver,
      protoVer: this.protoVersion?.ver,
    }
  }

  async establishSession(args: SessionArgs): Promise<void> {
    this.security = await runSecurityHandshake(
      this.deviceId,
      this.serviceMap,
      args.popOrCreds,
      args.level,
    )
    if (this.hasCryptoChar) {
      this._console = buildKdConsoleApi(this.deviceId, this.serviceMap, this.security)
    }
  }

  async scanForAPs(): Promise<WifiAP[]> {
    if (!this.security) throw new Error('Session not established')
    return scanForAPs(this.deviceId, this.serviceMap, this.security)
  }

  async connectToAP(ap: WifiAP, password: string | undefined): Promise<void> {
    if (!this.security) throw new Error('Session not established')
    await pushWifiConfig(this.deviceId, this.serviceMap, this.security, ap, password)
  }

  async pollWifiStatus(): Promise<WifiStatusSnapshot> {
    if (!this.security) throw new Error('Session not established')
    return pollWifiStatus(this.deviceId, this.serviceMap, this.security)
  }

  get console(): KdConsoleApi | undefined {
    return this._console
  }

  teardown(): void {
    this.security = undefined
    this._console = undefined
    this.serviceMap = new Map()
    this.protoVersion = undefined
  }

  /** Exposed so the connection module can surface protoVersion for back-compat. */
  getProtoVersion(): ProtoVersionInfo | undefined {
    return this.protoVersion
  }
}

export function createEspProvMethod(device: BleDevice): ProvisioningMethod {
  return new EspProvMethod(device)
}
