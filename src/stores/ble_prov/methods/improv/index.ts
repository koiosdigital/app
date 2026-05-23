import type { BleDevice, BleService } from '@capacitor-community/bluetooth-le'
import { BleClient } from '@capacitor-community/bluetooth-le'
import {
  IMPROV_CHAR,
  IMPROV_SERVICE_UUID,
  ImprovError,
  ImprovRpcCommand,
  ImprovState,
  buildRpcPacket,
  buildSendWifiPayload,
  improvErrorLabel,
} from './protocol'
import type {
  MethodCapabilities,
  ProvisioningMethod,
  SessionArgs,
  WifiAP,
  WifiStatusSnapshot,
} from '../types'

export { IMPROV_SERVICE_UUID } from './protocol'

class ImprovMethod implements ProvisioningMethod {
  readonly id = 'improv'
  readonly serviceUuid = IMPROV_SERVICE_UUID

  private deviceId = ''
  private state: ImprovState = ImprovState.Unknown
  private lastError: ImprovError = ImprovError.None

  constructor(device: BleDevice) {
    this.deviceId = device.deviceId
  }

  async onConnect(
    deviceId: string,
    _deviceName: string,
    _services: BleService[],
  ): Promise<MethodCapabilities> {
    this.deviceId = deviceId

    // Read the capabilities byte (currently only bit 0 = Identify is defined).
    // We don't act on it yet, but the read confirms the characteristic exists.
    await this.readByte(IMPROV_CHAR.capabilities)
    this.state = (await this.readByte(IMPROV_CHAR.state)) as ImprovState
    this.lastError = (await this.readByte(IMPROV_CHAR.error)) as ImprovError

    // Subscribe to state/error notifications so subsequent reads reflect the
    // latest device-pushed values. RPC result notifications are wired up too
    // but their payload isn't consumed today — success is detected via state.
    await this.subscribe(IMPROV_CHAR.state, (value) => {
      this.state = value[0] as ImprovState
    })
    await this.subscribe(IMPROV_CHAR.error, (value) => {
      this.lastError = value[0] as ImprovError
    })
    await this.subscribe(IMPROV_CHAR.rpcResult, () => {
      // No-op: state notifications carry the outcome we care about.
    })

    return {
      needsSession: false,
      popType: null,
      hasCrypto: false,
      supportsWifiScan: false,
      protoVer: 'improv-1.2',
    }
  }

  async establishSession(_args: SessionArgs): Promise<void> {
    // Improv has no session handshake. The device may still be in
    // AwaitingAuthorization — connectToAP will surface a NotAuthorized error
    // if the user hasn't pressed the physical button yet.
  }

  async scanForAPs(): Promise<WifiAP[]> {
    // Improv 1.x has no in-band WiFi scan. The UI falls back to manual SSID
    // entry via the "Other Network" path when capabilities.supportsWifiScan
    // is false.
    return []
  }

  async connectToAP(ap: WifiAP, password: string | undefined): Promise<void> {
    this.lastError = ImprovError.None
    const payload = buildSendWifiPayload(ap.ssid, password ?? '')
    const packet = buildRpcPacket(ImprovRpcCommand.SendWifiSettings, payload)
    await BleClient.write(
      this.deviceId,
      IMPROV_SERVICE_UUID,
      IMPROV_CHAR.rpcCommand,
      new DataView(packet.buffer),
    )
  }

  async pollWifiStatus(): Promise<WifiStatusSnapshot> {
    // Re-read state in case notifications were missed (some platforms can
    // drop notifications under load).
    try {
      this.state = (await this.readByte(IMPROV_CHAR.state)) as ImprovState
      this.lastError = (await this.readByte(IMPROV_CHAR.error)) as ImprovError
    } catch {
      // Fall through to whatever the last notification told us.
    }

    if (this.lastError !== ImprovError.None) {
      return { state: 'failed', done: true, error: improvErrorLabel(this.lastError) }
    }

    switch (this.state) {
      case ImprovState.Provisioned:
        return { state: 'connected', done: true }
      case ImprovState.Provisioning:
        return { state: 'connecting', done: false }
      case ImprovState.AwaitingAuthorization:
        return {
          state: 'disconnected',
          done: false,
          error: 'Press the button on the device to authorize provisioning',
        }
      case ImprovState.Authorized:
      case ImprovState.Unknown:
      default:
        return { state: 'disconnected', done: false }
    }
  }

  teardown(): void {
    for (const uuid of Object.values(IMPROV_CHAR)) {
      BleClient.stopNotifications(this.deviceId, IMPROV_SERVICE_UUID, uuid).catch(() => {
        /* ignore — device is being torn down */
      })
    }
    this.state = ImprovState.Unknown
    this.lastError = ImprovError.None
  }

  private async readByte(charUuid: string): Promise<number> {
    const view = await BleClient.read(this.deviceId, IMPROV_SERVICE_UUID, charUuid)
    return view.byteLength > 0 ? view.getUint8(0) : 0
  }

  private async subscribe(charUuid: string, handler: (value: Uint8Array) => void): Promise<void> {
    try {
      await BleClient.startNotifications(this.deviceId, IMPROV_SERVICE_UUID, charUuid, (view) => {
        handler(new Uint8Array(view.buffer))
      })
    } catch (err) {
      // Some platforms / characteristics don't support notify. We can still
      // function via polled reads in pollWifiStatus().
      console.warn(`Improv: failed to subscribe to ${charUuid}:`, err)
    }
  }
}

export function createImprovMethod(device: BleDevice): ProvisioningMethod {
  return new ImprovMethod(device)
}
