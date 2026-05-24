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

/** Capability bitmask values exposed in the Capabilities characteristic. */
export enum ImprovCapability {
  Identify = 1 << 0, // 0x01
  DeviceInfo = 1 << 1, // 0x02
  ScanWifi = 1 << 2, // 0x04
  Hostname = 1 << 3, // 0x08
}

export enum ImprovRpcCommand {
  SendWifiSettings = 0x01,
  Identify = 0x02,
  DeviceInfo = 0x03,
  ScanWifi = 0x04,
  Hostname = 0x05,
  DeviceName = 0x06,
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

/**
 * Try to parse an RPC result packet out of a buffer. Returns the parsed
 * envelope and the number of bytes consumed, or null if the buffer doesn't
 * yet contain a complete frame.
 *
 * Frame: `[cmd, data_len, ...data, checksum]` — total `data_len + 3` bytes.
 * Returns null on under-run; throws on framing error so the caller can reset.
 */
export function tryParseRpcResult(
  buffer: Uint8Array,
): { cmd: number; data: Uint8Array; consumed: number } | null {
  if (buffer.length < 3) return null
  const cmd = buffer[0]
  const dataLen = buffer[1]
  const total = dataLen + 3
  if (buffer.length < total) return null

  let checksum = 0
  for (let i = 0; i < total - 1; i++) checksum = (checksum + buffer[i]) & 0xff
  if (checksum !== buffer[total - 1]) {
    throw new Error(`Improv RPC result checksum mismatch (cmd=0x${cmd.toString(16)})`)
  }

  return { cmd, data: buffer.slice(2, 2 + dataLen), consumed: total }
}

/**
 * Decode the RPC result data payload as a list of length-prefixed UTF-8
 * strings: `[len, ...bytes, len, ...bytes, ...]`.
 */
export function decodeRpcStrings(data: Uint8Array): string[] {
  const decoder = new TextDecoder()
  const out: string[] = []
  let i = 0
  while (i < data.length) {
    const len = data[i++]
    if (i + len > data.length) {
      throw new Error('Improv RPC result truncated string')
    }
    out.push(decoder.decode(data.slice(i, i + len)))
    i += len
  }
  return out
}

/**
 * Map an Improv auth-type string ("WPA2", "WPA/WPA2", "NO", …) to the
 * ESP-IDF WifiAuthMode enum value the rest of the app uses for icons/labels.
 *
 * Improv allows multiple types separated by `/` — we pick the strongest one
 * the UI can render, with a couple of common combinations folded into the
 * dedicated `WPA_WPA2` value.
 */
export function improvAuthToCode(authString: string): number {
  const tokens = authString
    .split('/')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean)
  if (tokens.length === 0 || tokens.includes('NO')) return 0 // Open
  const set = new Set(tokens)
  if (set.has('WPA') && set.has('WPA2')) return 4 // WPA_WPA2_PSK
  if (set.has('WPA3')) return 6 // WPA3_PSK (closest match the app knows)
  if (set.has('WPA2 EAP')) return 5 // WPA2_ENTERPRISE
  if (set.has('WPA2')) return 3
  if (set.has('WPA')) return 2
  if (set.has('WEP')) return 1
  return 0
}
