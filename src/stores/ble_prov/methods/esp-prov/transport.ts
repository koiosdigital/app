import {
  BleClient,
  type BleCharacteristic,
  type BleService,
} from '@capacitor-community/bluetooth-le'

export const ESP_PROV_SERVICE_UUID = '1775244D-6B43-439B-877C-060F2D9BED07'.toLowerCase()

/** Characteristic UUID → friendly name mapping used by esp-prov endpoints. */
const CHAR_UUID_MAP: Record<string, string> = {
  '1775ff4f-6b43-439b-877c-060f2d9bed07': 'prov-ctrl',
  '1775ff50-6b43-439b-877c-060f2d9bed07': 'prov-scan',
  '1775ff51-6b43-439b-877c-060f2d9bed07': 'prov-session',
  '1775ff52-6b43-439b-877c-060f2d9bed07': 'prov-config',
  '1775ff53-6b43-439b-877c-060f2d9bed07': 'proto-ver',
  '1775ff54-6b43-439b-877c-060f2d9bed07': 'kd_console',
}

export type CharacteristicMap = Map<string, BleCharacteristic>

export function buildCharacteristicMap(services: BleService[]): CharacteristicMap {
  const map: CharacteristicMap = new Map()
  for (const service of services) {
    for (const characteristic of service.characteristics) {
      const name = CHAR_UUID_MAP[characteristic.uuid.toLowerCase()]
      if (name) map.set(name, characteristic)
    }
  }
  return map
}

/**
 * Maximum chunk size for BLE writes. 509 bytes + 3-byte header = 512 (BLE MTU).
 */
const MAX_CHUNK_SIZE = 509

/**
 * Send data to a named characteristic with esp-prov chunked framing, and read
 * back the response.
 *
 * Frame format per chunk: `0xA5 | LenHi | LenLo | Data` (total ≤512 bytes).
 * Each chunk is followed by a read to fetch the ack/response.
 */
export async function sendData(
  deviceId: string,
  serviceMap: CharacteristicMap,
  characteristicName: string,
  data: Uint8Array,
): Promise<Uint8Array | undefined> {
  const characteristic = serviceMap.get(characteristicName)
  if (!characteristic) {
    throw new Error(`characteristic not found: ${characteristicName}`)
  }

  if (data.length <= MAX_CHUNK_SIZE) {
    await BleClient.write(
      deviceId,
      ESP_PROV_SERVICE_UUID,
      characteristic.uuid,
      new DataView(data.buffer),
    )
    const response = await BleClient.read(deviceId, ESP_PROV_SERVICE_UUID, characteristic.uuid)
    return new Uint8Array(response.buffer)
  }

  let offset = 0
  let lastResponse: Uint8Array | undefined = undefined

  while (offset < data.length) {
    const remaining = data.length - offset
    const chunkSize = Math.min(MAX_CHUNK_SIZE, remaining)
    const chunkData = data.slice(offset, offset + chunkSize)

    const packet = new Uint8Array(3 + chunkSize)
    packet[0] = 0xa5
    packet[1] = (chunkSize >> 8) & 0xff
    packet[2] = chunkSize & 0xff
    packet.set(chunkData, 3)

    await BleClient.write(
      deviceId,
      ESP_PROV_SERVICE_UUID,
      characteristic.uuid,
      new DataView(packet.buffer),
    )

    const ack = await BleClient.read(deviceId, ESP_PROV_SERVICE_UUID, characteristic.uuid)
    lastResponse = new Uint8Array(ack.buffer)
    offset += chunkSize
  }

  return lastResponse
}

/**
 * Raw write to the esp-prov service (no chunked framing). Used by kd_console
 * which has its own multi-chunk framing layered on top.
 */
export async function rawWrite(
  deviceId: string,
  serviceMap: CharacteristicMap,
  characteristicName: string,
  data: Uint8Array,
): Promise<void> {
  const characteristic = serviceMap.get(characteristicName)
  if (!characteristic) throw new Error(`characteristic not found: ${characteristicName}`)
  await BleClient.write(
    deviceId,
    ESP_PROV_SERVICE_UUID,
    characteristic.uuid,
    new DataView(data.buffer),
  )
}

export async function rawRead(
  deviceId: string,
  serviceMap: CharacteristicMap,
  characteristicName: string,
): Promise<Uint8Array> {
  const characteristic = serviceMap.get(characteristicName)
  if (!characteristic) throw new Error(`characteristic not found: ${characteristicName}`)
  const response = await BleClient.read(deviceId, ESP_PROV_SERVICE_UUID, characteristic.uuid)
  return new Uint8Array(response.buffer)
}
