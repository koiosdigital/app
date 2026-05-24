import type { BleDevice, BleService } from '@capacitor-community/bluetooth-le'
import { BleClient } from '@capacitor-community/bluetooth-le'
import {
  IMPROV_CHAR,
  IMPROV_SERVICE_UUID,
  ImprovCapability,
  ImprovError,
  ImprovRpcCommand,
  ImprovState,
  buildRpcPacket,
  buildSendWifiPayload,
  decodeRpcStrings,
  improvAuthToCode,
  improvErrorLabel,
  tryParseRpcResult,
} from './protocol'
import type {
  MethodCapabilities,
  ProvisioningMethod,
  SessionArgs,
  WifiAP,
  WifiStatusSnapshot,
} from '../types'

export { IMPROV_SERVICE_UUID } from './protocol'

interface PendingRpc {
  expectedCmd: number
  timer: ReturnType<typeof setTimeout>
  resolve: (data: Uint8Array) => void
  reject: (err: Error) => void
}

const RPC_RESULT_TIMEOUT_MS = 15_000

class ImprovMethod implements ProvisioningMethod {
  readonly id = 'improv'
  readonly serviceUuid = IMPROV_SERVICE_UUID

  private deviceId = ''
  private state: ImprovState = ImprovState.Unknown
  private lastError: ImprovError = ImprovError.None
  private capabilityBits = 0

  // Accumulates RPC Result notifications until one full frame is available.
  private rpcBuffer: Uint8Array = new Uint8Array(0)
  private pendingRpc?: PendingRpc

  constructor(device: BleDevice) {
    this.deviceId = device.deviceId
  }

  async onConnect(
    deviceId: string,
    _deviceName: string,
    _services: BleService[],
  ): Promise<MethodCapabilities> {
    this.deviceId = deviceId

    this.capabilityBits = await this.readByte(IMPROV_CHAR.capabilities)
    this.state = (await this.readByte(IMPROV_CHAR.state)) as ImprovState
    this.lastError = (await this.readByte(IMPROV_CHAR.error)) as ImprovError

    await this.subscribe(IMPROV_CHAR.state, (value) => {
      this.state = value[0] as ImprovState
    })
    await this.subscribe(IMPROV_CHAR.error, (value) => {
      this.lastError = value[0] as ImprovError
      // An error on the wire fails any in-flight RPC wait.
      if (this.lastError !== ImprovError.None && this.pendingRpc) {
        this.failPendingRpc(new Error(improvErrorLabel(this.lastError)))
      }
    })
    await this.subscribe(IMPROV_CHAR.rpcResult, (value) => {
      this.handleRpcResultChunk(value)
    })

    return {
      needsSession: false,
      popType: null,
      hasCrypto: false,
      supportsWifiScan: (this.capabilityBits & ImprovCapability.ScanWifi) !== 0,
      protoVer: 'improv-1.2',
    }
  }

  async establishSession(_args: SessionArgs): Promise<void> {
    // Improv has no session handshake. If the device is in AwaitingAuthorization
    // (button-press required), connectToAP / scanForAPs will surface a
    // NotAuthorized error which the UI displays.
  }

  async scanForAPs(): Promise<WifiAP[]> {
    if ((this.capabilityBits & ImprovCapability.ScanWifi) === 0) {
      // Device doesn't support in-band scan — fall back to manual entry.
      return []
    }

    const data = await this.callRpc(ImprovRpcCommand.ScanWifi, new Uint8Array(0))
    const strings = decodeRpcStrings(data)

    // Strings arrive in (ssid, rssi, auth) triples.
    const aps: WifiAP[] = []
    for (let i = 0; i + 2 < strings.length; i += 3) {
      const ssid = strings[i]
      const rssi = parseInt(strings[i + 1], 10)
      const auth = improvAuthToCode(strings[i + 2])
      if (!ssid) continue
      aps.push({
        ssid,
        bssid: '',
        rssi: Number.isFinite(rssi) ? rssi : -100,
        channel: 0,
        auth,
      })
    }
    return aps
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
    try {
      this.state = (await this.readByte(IMPROV_CHAR.state)) as ImprovState
      this.lastError = (await this.readByte(IMPROV_CHAR.error)) as ImprovError
    } catch {
      // Fall back to whatever the last notification told us.
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
    this.failPendingRpc(new Error('Improv method torn down'))
    for (const uuid of Object.values(IMPROV_CHAR)) {
      BleClient.stopNotifications(this.deviceId, IMPROV_SERVICE_UUID, uuid).catch(() => {
        /* ignore — device is being torn down */
      })
    }
    this.state = ImprovState.Unknown
    this.lastError = ImprovError.None
    this.capabilityBits = 0
    this.rpcBuffer = new Uint8Array(0)
  }

  /**
   * Send an RPC command and await its single result frame. Result chunks may
   * arrive across multiple notifications, so we accumulate and parse in
   * `handleRpcResultChunk`.
   */
  private async callRpc(cmd: ImprovRpcCommand, data: Uint8Array): Promise<Uint8Array> {
    if (this.pendingRpc) {
      throw new Error('Another Improv RPC is already in flight')
    }

    this.rpcBuffer = new Uint8Array(0)

    const result = new Promise<Uint8Array>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRpc = undefined
        reject(new Error(`Improv RPC 0x${cmd.toString(16)} timed out`))
      }, RPC_RESULT_TIMEOUT_MS)
      this.pendingRpc = { expectedCmd: cmd, timer, resolve, reject }
    })

    const packet = buildRpcPacket(cmd, data)
    try {
      await BleClient.write(
        this.deviceId,
        IMPROV_SERVICE_UUID,
        IMPROV_CHAR.rpcCommand,
        new DataView(packet.buffer),
      )
    } catch (err) {
      this.failPendingRpc(err instanceof Error ? err : new Error(String(err)))
      throw err
    }

    return result
  }

  private handleRpcResultChunk(chunk: Uint8Array): void {
    // Append to the rolling buffer, then try to consume one or more frames.
    const merged = new Uint8Array(this.rpcBuffer.length + chunk.length)
    merged.set(this.rpcBuffer, 0)
    merged.set(chunk, this.rpcBuffer.length)
    this.rpcBuffer = merged

    while (this.rpcBuffer.length >= 3) {
      let parsed
      try {
        parsed = tryParseRpcResult(this.rpcBuffer)
      } catch (err) {
        // Framing error — drop the buffer and fail any waiter.
        this.rpcBuffer = new Uint8Array(0)
        if (this.pendingRpc) {
          this.failPendingRpc(err instanceof Error ? err : new Error(String(err)))
        }
        return
      }
      if (!parsed) return // need more bytes

      this.rpcBuffer = this.rpcBuffer.slice(parsed.consumed)

      const waiter = this.pendingRpc
      if (waiter && waiter.expectedCmd === parsed.cmd) {
        clearTimeout(waiter.timer)
        this.pendingRpc = undefined
        waiter.resolve(parsed.data)
      }
      // Unexpected/unsolicited results are dropped silently.
    }
  }

  private failPendingRpc(err: Error): void {
    const waiter = this.pendingRpc
    if (!waiter) return
    clearTimeout(waiter.timer)
    this.pendingRpc = undefined
    waiter.reject(err)
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
