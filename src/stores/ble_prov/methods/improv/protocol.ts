/**
 * Improv BLE wire protocol primitives.
 * Spec: https://www.improv-wifi.com/ble/
 */

export const IMPROV_SERVICE_UUID = '00467768-6228-2272-4663-277478268000'.toLowerCase()

export const IMPROV_CHAR = {
  state: '00467768-6228-2272-4663-277478268001'.toLowerCase(),
  error: '00467768-6228-2272-4663-277478268002'.toLowerCase(),
  rpcCommand: '00467768-6228-2272-4663-277478268003'.toLowerCase(),
  rpcResult: '00467768-6228-2272-4663-277478268004'.toLowerCase(),
  capabilities: '00467768-6228-2272-4663-277478268005'.toLowerCase(),
} as const

export enum ImprovState {
  Unknown = 0x00,
  AwaitingAuthorization = 0x01,
  Authorized = 0x02,
  Provisioning = 0x03,
  Provisioned = 0x04,
}

export enum ImprovError {
  None = 0x00,
  InvalidRpcPacket = 0x01,
  UnknownRpcCommand = 0x02,
  UnableToConnect = 0x03,
  NotAuthorized = 0x04,
  Unknown = 0xff,
}

export enum ImprovCapability {
  Identify = 0x01,
}

export enum ImprovRpcCommand {
  SendWifiSettings = 0x01,
  Identify = 0x02,
  // Some Improv 2.x firmware extends with RPC scan; not relied on here.
}

export function improvErrorLabel(err: ImprovError): string {
  switch (err) {
    case ImprovError.None:
      return ''
    case ImprovError.InvalidRpcPacket:
      return 'Improv: invalid RPC packet'
    case ImprovError.UnknownRpcCommand:
      return 'Improv: unknown RPC command'
    case ImprovError.UnableToConnect:
      return 'Unable to connect to WiFi network'
    case ImprovError.NotAuthorized:
      return 'Device not authorized — press the button on the device and retry'
    case ImprovError.Unknown:
    default:
      return 'Improv: unknown error'
  }
}

/**
 * Build an Improv RPC packet:
 *   [cmd, data_len, ...data, checksum]
 * checksum = (sum of all preceding bytes) mod 256
 */
export function buildRpcPacket(cmd: ImprovRpcCommand, data: Uint8Array): Uint8Array {
  const packet = new Uint8Array(2 + data.length + 1)
  packet[0] = cmd
  packet[1] = data.length
  packet.set(data, 2)

  let checksum = 0
  for (let i = 0; i < packet.length - 1; i++) {
    checksum = (checksum + packet[i]) & 0xff
  }
  packet[packet.length - 1] = checksum
  return packet
}

/**
 * Build the data payload for SendWifiSettings:
 *   [ssid_len, ...ssid_bytes, pwd_len, ...pwd_bytes]
 */
export function buildSendWifiPayload(ssid: string, password: string): Uint8Array {
  const encoder = new TextEncoder()
  const ssidBytes = encoder.encode(ssid)
  const pwdBytes = encoder.encode(password)

  const out = new Uint8Array(1 + ssidBytes.length + 1 + pwdBytes.length)
  let i = 0
  out[i++] = ssidBytes.length
  out.set(ssidBytes, i)
  i += ssidBytes.length
  out[i++] = pwdBytes.length
  out.set(pwdBytes, i)
  return out
}
