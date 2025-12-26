import type { ApiDevice, ApiMatrxDevice, ApiLanternDevice } from '../devices'
import type { MatrixDevice } from '@/components/devices/MatrixDeviceCard.vue'
import type { LanternDevice } from '@/components/devices/LanternDeviceCard.vue'
import { ENV } from '@/config/environment'

export type Device = MatrixDevice | LanternDevice

/**
 * Check if API device is a Matrix device
 */
function isMatrxDevice(device: ApiDevice): device is ApiMatrxDevice {
  return 'type' in device && device.type === 'MATRX'
}

/**
 * Format relative time (e.g., "5m ago", "2h ago")
 */
function formatRelativeTime(date: string): string {
  const now = new Date()
  const past = new Date(date)
  const diff = now.getTime() - past.getTime()

  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  return `${days}d ago`
}

/**
 * Get preview URL for a matrix device installation
 */
function getMatrixPreviewUrl(appId: string, resolution: string): string {
  const dimensions = resolution.replace('x', 'x')
  return `${ENV.apiBaseUrl}/v1/apps/${appId}/preview/${dimensions}.webp`
}

/**
 * Map API Matrix device to UI Matrix device
 */
function mapMatrxDevice(apiDevice: ApiMatrxDevice): MatrixDevice {
  // Default to tetris-clock app for preview
  const appId = 'tetris-clock'
  const resolution = '64x64' // TODO: Get from device settings

  return {
    type: 'matrix',
    mac: apiDevice.id,
    name: apiDevice.id, // TODO: Get actual name from device
    status: apiDevice.online ? 'online' : 'offline',
    resolution: '64x64', // TODO: Get from device info
    brightness: 80, // TODO: Get from device state
    installations: 0, // TODO: Fetch installations count
    preview: getMatrixPreviewUrl(appId, resolution),
    isOn: apiDevice.online,
  }
}

/**
 * Map API Lantern device to UI Lantern device
 */
function mapLanternDevice(apiDevice: ApiLanternDevice): LanternDevice {
  return {
    type: 'lantern',
    mac: apiDevice.id,
    name: apiDevice.id, // TODO: Get actual name from device
    status: apiDevice.online ? 'online' : 'offline',
    color: '#fbbf24', // TODO: Get current color from device state
    linkedPeers: 0, // TODO: Get from device info
    lastTouch: formatRelativeTime(apiDevice.updatedAt),
    isOn: apiDevice.online,
  }
}

/**
 * Map API device to UI device
 */
export function mapApiDevice(apiDevice: ApiDevice): Device {
  if (isMatrxDevice(apiDevice)) {
    return mapMatrxDevice(apiDevice)
  }
  return mapLanternDevice(apiDevice as ApiLanternDevice)
}

/**
 * Map array of API devices to UI devices
 */
export function mapApiDevices(apiDevices: ApiDevice[]): Device[] {
  return apiDevices.map(mapApiDevice)
}
