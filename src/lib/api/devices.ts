import { apiClient } from './client'
import type { components } from '@/types/api'

// API response types
export type ApiMatrxDevice = components['schemas']['MatrxDeviceResponseDto']
export type ApiLanternDevice = components['schemas']['LanternDeviceResponseDto']
export type ApiDevice = ApiMatrxDevice | ApiLanternDevice

/**
 * Device API service
 */
export const devicesApi = {
  /**
   * Get all devices for the authenticated user
   */
  async getDevices() {
    const { data, error } = await apiClient.GET('/v1/devices')

    if (error) {
      throw new Error(`Failed to fetch devices: ${error}`)
    }

    return data
  },

  /**
   * Get a specific device by ID
   */
  async getDevice(id: string) {
    const { data, error } = await apiClient.GET('/v1/devices/{id}', {
      params: {
        path: { id },
      },
    })

    if (error) {
      throw new Error(`Failed to fetch device: ${error}`)
    }

    return data
  },

  /**
   * Update a device
   */
  async updateDevice(id: string, updates: { displayName?: string }) {
    const { data, error} = await apiClient.PATCH('/v1/devices/{id}', {
      params: {
        path: { id },
      },
      body: updates,
    })

    if (error) {
      throw new Error(`Failed to update device: ${error}`)
    }

    return data
  },

  /**
   * Delete a device
   */
  async deleteDevice(id: string) {
    const { error } = await apiClient.DELETE('/v1/devices/{id}', {
      params: {
        path: { id },
      },
    })

    if (error) {
      throw new Error(`Failed to delete device: ${error}`)
    }
  },

  /**
   * Get installations for a device
   */
  async getInstallations(deviceId: string) {
    const { data, error } = await apiClient.GET('/v1/devices/{deviceId}/installations', {
      params: {
        path: { deviceId },
      },
    })

    if (error) {
      throw new Error(`Failed to fetch installations: ${error}`)
    }

    return data
  },
}
