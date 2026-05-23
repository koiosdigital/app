import { ref, shallowRef } from 'vue'
import {
  BleClient,
  BleDevice,
  BleCharacteristic,
  BleService,
} from '@capacitor-community/bluetooth-le'
import { Capacitor } from '@capacitor/core'
import { allServiceUuids, pickMethodForServices } from '../methods/registry'
import type { MethodCapabilities, ProvisioningMethod } from '../methods/types'

/**
 * BLE Connection Module
 *
 * Owns the BLE init/scan/connect lifecycle and the active provisioning method.
 * The actual provisioning protocol (esp-prov, Improv, …) lives in the method
 * instance — this module just routes calls through.
 */

export const connectedDevice = ref<BleDevice | undefined>(undefined)
export const connectedDeviceServiceMap = ref<Map<string, BleCharacteristic>>(new Map())
export const discoveredDevices = ref<BleDevice[]>([])
export const isScanning = ref(false)

/** Capabilities reported by the active method. Undefined until connected. */
export const capabilities = ref<MethodCapabilities | undefined>(undefined)

/**
 * Back-compat ref kept so existing UI/code that reads `protoVersion.sec_ver`
 * continues to work. Sourced from `capabilities.sec_ver` for esp-prov;
 * undefined for methods that don't speak proto-ver (e.g. Improv).
 */
export const protoVersion = ref<
  { ver: string; sec_ver: 0 | 1 | 2; sec_patch_ver?: number; cap?: string[] } | undefined
>(undefined)

/**
 * Active method instance. shallowRef so Vue doesn't recursively proxy the
 * class internals (security handler, char map, etc.).
 */
export const activeMethod = shallowRef<ProvisioningMethod | undefined>(undefined)

function isWebPlatform(): boolean {
  return Capacitor.getPlatform() === 'web'
}

export async function initializeBluetooth() {
  await BleClient.initialize()
}

/**
 * Start scanning for devices advertising any registered method's service UUID.
 * On native: continuous scan. On web: shows the browser device picker.
 */
export async function startScan() {
  if (isScanning.value) {
    await stopScan()
  }

  isScanning.value = true
  discoveredDevices.value = []

  const services = allServiceUuids()

  if (isWebPlatform()) {
    try {
      const device = await BleClient.requestDevice({
        services,
        optionalServices: services,
      })
      discoveredDevices.value = [device]
      isScanning.value = false
    } catch (err) {
      console.error('Failed to request device:', err)
      isScanning.value = false
      throw err
    }
  } else {
    await BleClient.requestLEScan({ services, optionalServices: services }, (result) => {
      if (!discoveredDevices.value.find((d) => d.deviceId === result.device.deviceId)) {
        discoveredDevices.value = [...discoveredDevices.value, result.device]
      }
    })
  }
}

export async function stopScan() {
  if (!isWebPlatform() && isScanning.value) {
    try {
      await BleClient.stopLEScan()
    } catch {
      // ignore
    }
  }
  isScanning.value = false
}

/**
 * Connect to a device, pick the appropriate provisioning method based on the
 * services it advertises, and let the method initialize itself.
 */
export async function connectToDevice(device: BleDevice) {
  try {
    await BleClient.connect(device.deviceId, () => {
      handleDisconnect()
    })

    connectedDevice.value = device

    const services = await BleClient.getServices(device.deviceId)

    const picked = pickMethodForServices(
      services.map((s) => s.uuid),
      device,
    )
    if (!picked) {
      throw new Error('Device does not advertise a supported provisioning service')
    }

    activeMethod.value = picked.method
    connectedDeviceServiceMap.value = mergeCharacteristics(services, picked.serviceUuid)

    capabilities.value = await picked.method.onConnect(device.deviceId, device.name ?? '', services)

    // Surface esp-prov's proto-ver back-compat ref.
    if (capabilities.value?.sec_ver !== undefined) {
      protoVersion.value = {
        ver: capabilities.value.protoVer ?? '',
        sec_ver: capabilities.value.sec_ver,
      }
    } else {
      protoVersion.value = undefined
    }
  } catch (error) {
    console.error('Error connecting to device:', error)
    handleDisconnect()
    throw error
  }
}

export async function disconnectDevice() {
  if (connectedDevice.value) {
    await BleClient.disconnect(connectedDevice.value.deviceId)
    handleDisconnect()
  }
}

function handleDisconnect() {
  activeMethod.value?.teardown()
  activeMethod.value = undefined
  connectedDevice.value = undefined
  connectedDeviceServiceMap.value.clear()
  capabilities.value = undefined
  protoVersion.value = undefined
}

/**
 * For back-compat, also expose a flat characteristic UUID → BleCharacteristic
 * map keyed by friendly name. The esp-prov method owns the canonical map
 * internally; this is purely for any legacy reader.
 */
function mergeCharacteristics(
  services: BleService[],
  targetUuid: string,
): Map<string, BleCharacteristic> {
  const map = new Map<string, BleCharacteristic>()
  const target = services.find((s) => s.uuid.toLowerCase() === targetUuid.toLowerCase())
  if (!target) return map
  for (const c of target.characteristics) {
    map.set(c.uuid.toLowerCase(), c)
  }
  return map
}
