import type { components } from '@/types/api'

// OpenAPI device types
export type MatrxDevice = components['schemas']['MatrxDeviceResponseDto']
export type LanternDevice = components['schemas']['LanternDeviceResponseDto']
export type NemotoDevice = components['schemas']['NemotoDeviceResponseDto']
export type ApiDevice = MatrxDevice | LanternDevice | NemotoDevice

/**
 * Type guard for Matrix device
 */
export function isMatrxDevice(device: ApiDevice): device is MatrxDevice {
  return device.type === 'MATRX'
}

/**
 * Type guard for Lantern device
 */
export function isLanternDevice(device: ApiDevice): device is LanternDevice {
  return device.type === 'LANTERN'
}

/**
 * Type guard for Nemoto device
 */
export function isNemotoDevice(device: ApiDevice): device is NemotoDevice {
  return device.type === 'NEMOTO'
}
