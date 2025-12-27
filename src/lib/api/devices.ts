import { apiClient } from './client'
import { getErrorMessage } from './errors'
import type { components } from '@/types/api'

export type CreateInstallationDto = components['schemas']['CreateInstallationDto']
export type UpdateInstallationDto = components['schemas']['UpdateInstallationDto']
export type InstallationResponse = components['schemas']['InstallationResponseDto']
export type BulkUpdateInstallationItemDto = components['schemas']['BulkUpdateInstallationItemDto']

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
      throw new Error(getErrorMessage(error, 'Failed to fetch devices'))
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
      throw new Error(getErrorMessage(error, 'Failed to fetch device'))
    }

    return data
  },

  /**
   * Update Matrix device settings
   */
  async updateMatrxSettings(
    id: string,
    settings: {
      displayName?: string
      typeSettings?: {
        screenEnabled?: boolean
        screenBrightness?: number
        autoBrightnessEnabled?: boolean
        screenOffLux?: number
      }
    }
  ) {
    const { data, error } = await apiClient.PATCH('/v1/devices/{id}/settings', {
      params: {
        path: { id },
      },
      // @ts-expect-error - API types may not be regenerated yet
      body: { type: 'MATRX', ...settings },
    })

    if (error) {
      throw new Error(getErrorMessage(error, 'Failed to update device settings'))
    }

    return data
  },

  /**
   * Update Lantern device settings
   */
  async updateLanternSettings(
    id: string,
    settings: {
      displayName?: string
      typeSettings?: {
        brightness?: number
      }
    }
  ) {
    const { data, error } = await apiClient.PATCH('/v1/devices/{id}/settings', {
      params: {
        path: { id },
      },
      // @ts-expect-error - API types may not be regenerated yet
      body: { type: 'LANTERN', ...settings },
    })

    if (error) {
      throw new Error(getErrorMessage(error, 'Failed to update device settings'))
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
      throw new Error(getErrorMessage(error, 'Failed to delete device'))
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
      throw new Error(getErrorMessage(error, 'Failed to fetch installations'))
    }

    return data
  },

  /**
   * Get a specific installation
   */
  async getInstallation(deviceId: string, installationId: string) {
    const { data, error } = await apiClient.GET('/v1/devices/{deviceId}/installations/{id}', {
      params: {
        path: { deviceId, id: installationId },
      },
    })

    if (error) {
      throw new Error(getErrorMessage(error, 'Failed to fetch installation'))
    }

    return data
  },

  /**
   * Create a new installation
   */
  async createInstallation(deviceId: string, installation: CreateInstallationDto) {
    const { data, error } = await apiClient.POST('/v1/devices/{deviceId}/installations', {
      params: { path: { deviceId } },
      body: installation,
    })

    if (error) {
      // Return error for validation handling
      return { data: null, error }
    }

    return { data, error: null }
  },

  /**
   * Update an existing installation
   */
  async updateInstallation(
    deviceId: string,
    installationId: string,
    updates: UpdateInstallationDto
  ) {
    const { data, error } = await apiClient.PATCH('/v1/devices/{deviceId}/installations/{id}', {
      params: {
        path: { deviceId, id: installationId },
      },
      body: updates,
    })

    if (error) {
      // Return error for validation handling
      return { data: null, error }
    }

    return { data, error: null }
  },

  /**
   * Delete an installation
   */
  async deleteInstallation(deviceId: string, installationId: string) {
    const { error } = await apiClient.DELETE('/v1/devices/{deviceId}/installations/{id}', {
      params: {
        path: { deviceId, id: installationId },
      },
    })

    if (error) {
      throw new Error(getErrorMessage(error, 'Failed to delete installation'))
    }
  },

  /**
   * Bulk update installations (sort order, display time, etc.)
   */
  async bulkUpdateInstallations(deviceId: string, installations: BulkUpdateInstallationItemDto[]) {
    const { data, error } = await apiClient.PATCH('/v1/devices/{deviceId}/installations/bulk', {
      params: {
        path: { deviceId },
      },
      body: { installations },
    })

    if (error) {
      throw new Error(getErrorMessage(error, 'Failed to update installations'))
    }

    return data
  },

  /**
   * Set pin state for an installation
   */
  async setPinState(deviceId: string, installationId: string, pinned: boolean) {
    const { data, error } = await apiClient.PATCH('/v1/devices/{deviceId}/installations/{id}/pin', {
      params: {
        path: { deviceId, id: installationId },
      },
      body: { pinned },
    })

    if (error) {
      throw new Error(getErrorMessage(error, 'Failed to update pin state'))
    }

    return data
  },

  /**
   * Set skip state for an installation
   */
  async setSkipState(deviceId: string, installationId: string, skipped: boolean) {
    const { data, error } = await apiClient.PATCH('/v1/devices/{deviceId}/installations/{id}/skip', {
      params: {
        path: { deviceId, id: installationId },
      },
      body: { skipped },
    })

    if (error) {
      throw new Error(getErrorMessage(error, 'Failed to update skip state'))
    }

    return data
  },
}
