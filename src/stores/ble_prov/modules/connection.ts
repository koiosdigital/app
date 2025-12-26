import { ref } from 'vue'
import { BleClient, BleDevice, BleCharacteristic } from '@capacitor-community/bluetooth-le'
import { Capacitor } from '@capacitor/core'

/**
 * BLE Connection Module
 * Handles Bluetooth initialization, device scanning, and connection
 */

export const connectedDevice = ref<BleDevice | undefined>(undefined)
export const connectedDeviceServiceMap = ref<Map<string, BleCharacteristic>>(new Map())
export const discoveredDevices = ref<BleDevice[]>([])
export const isScanning = ref(false)

const KOIOS_SERVICE_UUID = '1775244D-6B43-439B-877C-060F2D9BED07'.toLowerCase()

/**
 * Initialize Bluetooth
 */
export async function initializeBluetooth() {
  await BleClient.initialize()
}

/**
 * Check if we're on web platform and need to use requestDevice instead of requestLEScan
 */
function isWebPlatform(): boolean {
  return Capacitor.getPlatform() === 'web'
}

/**
 * Start scanning for Koios devices
 */
export async function startScan() {
  isScanning.value = true
  discoveredDevices.value = []

  // On web, always use requestDevice (shows browser's device picker)
  if (isWebPlatform()) {
    try {
      const device = await BleClient.requestDevice({
        services: [KOIOS_SERVICE_UUID],
        optionalServices: [KOIOS_SERVICE_UUID], // Required for getServices() access on Web
      })
      discoveredDevices.value = [device]
      isScanning.value = false
    } catch (err) {
      console.error('Failed to request device:', err)
      console.error('Stack trace:', err instanceof Error ? err.stack : 'No stack available')
      isScanning.value = false
      throw err
    }
  } else {
    await BleClient.requestLEScan(
      {
        services: [KOIOS_SERVICE_UUID],
        optionalServices: [KOIOS_SERVICE_UUID],
      },
      (result) => {
        if (!discoveredDevices.value.find((d) => d.deviceId === result.device.deviceId)) {
          discoveredDevices.value.push(result.device)
        }
      }
    )
  }
}

/**
 * Stop scanning for devices
 */
export async function stopScan() {
  // Only call stopLEScan on native platforms (web uses requestDevice which doesn't need stopping)
  if (!isWebPlatform() && isScanning.value) {
    try {
      await BleClient.stopLEScan()
    } catch (error) {
      console.debug('Failed to stop scan:', error)
    }
  }
  isScanning.value = false
}

/**
 * Connect to a device and build service map
 */
export async function connectToDevice(device: BleDevice) {
  try {
    console.log('Connecting to device:', device.deviceId, device.name)

    await BleClient.connect(device.deviceId, () => {
      console.log('Device disconnected')
      connectedDevice.value = undefined
      connectedDeviceServiceMap.value.clear()
    })

    console.log('Connected successfully')
    connectedDevice.value = device

    console.log('Getting services...')
    // Build service characteristic map
    const services = await BleClient.getServices(device.deviceId)
    console.log('Services retrieved:', services.length)

    // Map characteristic UUIDs to names
    const CHAR_UUID_MAP: Record<string, string> = {
      '1775ff4f-6b43-439b-877c-060f2d9bed07': 'prov-ctrl',
      '1775ff50-6b43-439b-877c-060f2d9bed07': 'prov-scan',
      '1775ff51-6b43-439b-877c-060f2d9bed07': 'prov-session',
      '1775ff52-6b43-439b-877c-060f2d9bed07': 'prov-config',
      '1775ff53-6b43-439b-877c-060f2d9bed07': 'proto-ver',
      '1775ff54-6b43-439b-877c-060f2d9bed07': 'kd_console',
    }

    const serviceMap = new Map<string, BleCharacteristic>()

    for (const service of services) {
      for (const characteristic of service.characteristics) {
        const charName = CHAR_UUID_MAP[characteristic.uuid.toLowerCase()]
        if (charName) {
          serviceMap.set(charName, characteristic)
        }
      }
    }

    connectedDeviceServiceMap.value = serviceMap
  } catch (error) {
    console.error('Error in connectToDevice:', error)
    console.error('Stack trace:', error instanceof Error ? error.stack : 'No stack available')
    throw error
  }
}

/**
 * Disconnect from current device
 */
export async function disconnectDevice() {
  if (connectedDevice.value) {
    await BleClient.disconnect(connectedDevice.value.deviceId)
    connectedDevice.value = undefined
    connectedDeviceServiceMap.value.clear()
  }
}

/**
 * Maximum chunk size for BLE writes
 * Set to 509 bytes to account for 3-byte header (0xA5 | LenHi | LenLo)
 * Total packet size = 509 + 3 = 512 bytes (within BLE MTU)
 */
const MAX_CHUNK_SIZE = 509

/**
 * Send data to a characteristic with chunking support and receive response
 * Chunks data into packets with format: 0xA5 | LenHi | LenLo | Data (max 512 bytes total)
 * Waits for acknowledgment (read) between chunks
 */
export async function sendData(
  data: Uint8Array,
  characteristicName: string
): Promise<Uint8Array | undefined> {
  try {
    console.log(`sendData: Writing to ${characteristicName}, total size: ${data.length} bytes`)

    if (!connectedDevice.value || !connectedDeviceServiceMap.value.has(characteristicName)) {
      throw new Error('Device not connected or characteristic not found')
    }

    const characteristic = connectedDeviceServiceMap.value.get(characteristicName)!
    console.log(
      `  Device: ${connectedDevice.value.deviceId}, Service: ${KOIOS_SERVICE_UUID}, Char: ${characteristic.uuid}`
    )
    console.log('  Characteristic properties:', characteristic.properties)

    // Check if we need to chunk the data
    if (data.length <= MAX_CHUNK_SIZE) {
      // Single write - no chunking needed
      console.log('  Single write (no chunking)')
      await BleClient.write(
        connectedDevice.value.deviceId,
        KOIOS_SERVICE_UUID,
        characteristic.uuid,
        new DataView(data.buffer)
      )

      console.log('  Write successful, reading response...')

      const response = await BleClient.read(
        connectedDevice.value.deviceId,
        KOIOS_SERVICE_UUID,
        characteristic.uuid
      )

      console.log('  Read successful')
      return new Uint8Array(response.buffer)
    }

    // Chunked write - split into multiple packets
    console.log(`  Chunked write: splitting into ${Math.ceil(data.length / MAX_CHUNK_SIZE)} chunks`)

    let offset = 0
    let chunkNum = 1
    let lastResponse: Uint8Array | undefined = undefined

    while (offset < data.length) {
      const remainingBytes = data.length - offset
      const chunkSize = Math.min(MAX_CHUNK_SIZE, remainingBytes)
      const chunkData = data.slice(offset, offset + chunkSize)

      console.log(
        `  Writing chunk ${chunkNum} (${chunkSize} bytes, offset ${offset}/${data.length})`
      )

      // Build packet: 0xA5 | LenHi | LenLo | Data
      const packet = new Uint8Array(3 + chunkSize)
      packet[0] = 0xa5
      packet[1] = (chunkSize >> 8) & 0xff
      packet[2] = chunkSize & 0xff
      packet.set(chunkData, 3)

      // Write chunk
      await BleClient.write(
        connectedDevice.value.deviceId,
        KOIOS_SERVICE_UUID,
        characteristic.uuid,
        new DataView(packet.buffer)
      )

      console.log(`  Chunk ${chunkNum} written, reading acknowledgment...`)

      // Read acknowledgment before sending next chunk
      const ack = await BleClient.read(
        connectedDevice.value.deviceId,
        KOIOS_SERVICE_UUID,
        characteristic.uuid
      )

      lastResponse = new Uint8Array(ack.buffer)
      console.log(`  Chunk ${chunkNum} acknowledged (${lastResponse.length} bytes)`)

      offset += chunkSize
      chunkNum++
    }

    console.log('  All chunks sent successfully')
    return lastResponse
  } catch (error) {
    console.error(`Error in sendData (${characteristicName}):`, error)
    console.error('Stack trace:', error instanceof Error ? error.stack : 'No stack available')
    throw error
  }
}
