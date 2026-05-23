import { BleClient } from '@capacitor-community/bluetooth-le'
import { ESP_PROV_SERVICE_UUID, type CharacteristicMap } from './transport'

export interface ProtoVersionInfo {
  ver: string
  sec_ver: 0 | 1 | 2
  sec_patch_ver?: number
  cap?: string[]
}

/**
 * Query the device's proto-ver endpoint to learn which security version it
 * supports. Sends a single 0xEE byte; device replies with a JSON envelope:
 *
 *   { "prov": { "ver": "netprov-v1.2", "sec_ver": 2, ... } }
 *
 * Returns undefined if the characteristic is missing or the response is
 * malformed — caller falls back to a sensible default.
 */
export async function fetchProtoVersion(
  deviceId: string,
  serviceMap: CharacteristicMap,
): Promise<ProtoVersionInfo | undefined> {
  const characteristic = serviceMap.get('proto-ver')
  if (!characteristic) {
    console.warn('proto-ver characteristic not present on device')
    return undefined
  }

  try {
    const request = new Uint8Array([0xee])
    await BleClient.write(
      deviceId,
      ESP_PROV_SERVICE_UUID,
      characteristic.uuid,
      new DataView(request.buffer),
    )

    const response = await BleClient.read(deviceId, ESP_PROV_SERVICE_UUID, characteristic.uuid)
    const text = new TextDecoder().decode(new Uint8Array(response.buffer))
    const parsed = JSON.parse(text) as { prov?: ProtoVersionInfo }

    if (!parsed.prov || typeof parsed.prov.sec_ver !== 'number') {
      console.warn('proto-ver response missing prov.sec_ver:', text)
      return undefined
    }

    return parsed.prov
  } catch (error) {
    console.error('Failed to read proto-ver:', error)
    return undefined
  }
}
