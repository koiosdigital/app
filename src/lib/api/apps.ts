import { apiClient } from './client'
import { getErrorMessage } from './errors'
import type { components } from '@/types/api'

export type AppManifest = components['schemas']['AppManifestDto']
export type PaginatedAppsResponse = components['schemas']['PaginatedAppsResponseDto']
export type PaginationMeta = components['schemas']['PaginationMetaDto']
export type AppSchema = components['schemas']['AppSchemaDto']
export type AppSchemaField = AppSchema['schema'][number]
export type RenderResponse = components['schemas']['RenderResponseDto']
export type ValidateSchemaResponse = components['schemas']['ValidateSchemaResponseDto']
export type CallSchemaHandlerResponse = components['schemas']['CallSchemaHandlerResponseDto']

export type AppsListParams = {
  search?: string
  page?: number
  limit?: number
  sortBy?: 'name' | 'author'
  order?: 'asc' | 'desc'
}

/**
 * Apps API service
 */
export const appsApi = {
  /**
   * List all available apps with pagination and filtering
   */
  async listApps(params: AppsListParams = {}) {
    const { data, error } = await apiClient.GET('/v1/apps', {
      params: {
        query: {
          search: params.search,
          page: params.page,
          limit: params.limit,
          sortBy: params.sortBy,
          order: params.order,
        },
      },
    })

    if (error) {
      throw new Error(getErrorMessage(error, 'Failed to fetch apps'))
    }

    return data
  },

  /**
   * Get a specific app by ID
   */
  async getApp(id: string) {
    const { data, error } = await apiClient.GET('/v1/apps/{id}', {
      params: {
        path: { id },
      },
    })

    if (error) {
      throw new Error(getErrorMessage(error, 'Failed to fetch app'))
    }

    return data
  },

  /**
   * Get app schema
   */
  async getAppSchema(id: string) {
    const { data, error } = await apiClient.GET('/v1/apps/{id}/schema', {
      params: {
        path: { id },
      },
    })

    if (error) {
      throw new Error(getErrorMessage(error, 'Failed to fetch app schema'))
    }

    return data
  },

  /**
   * Get static app preview (no config required)
   */
  async getPreview(
    id: string,
    options?: { width?: number; height?: number },
  ): Promise<string | null> {
    const dimensions = `${options?.width ?? 64}x${options?.height ?? 32}`
    const { data, error } = await apiClient.GET('/v1/apps/{id}/preview/{dimensions}.webp', {
      params: {
        path: { id, dimensions },
      },
      parseAs: 'arrayBuffer',
    })

    if (error || !data) {
      return null
    }

    // Convert ArrayBuffer to base64
    const bytes = new Uint8Array(data as ArrayBuffer)
    let binary = ''
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i])
    }
    return btoa(binary)
  },

  /**
   * Render an app with provided configuration
   */
  async renderApp(
    id: string,
    config: Record<string, unknown>,
    options?: { width?: number; height?: number; deviceId?: string },
  ) {
    const { data, error } = await apiClient.POST('/v1/apps/{id}/render', {
      params: {
        path: { id },
        query: {
          width: options?.width?.toString(),
          height: options?.height?.toString(),
          device_id: options?.deviceId,
        },
      },
      body: config,
    })

    if (error) {
      // Don't throw for validation errors, return them
      return { data: null, error }
    }

    return { data, error: null }
  },

  /**
   * Validate configuration against app schema
   */
  async validateConfig(id: string, config: Record<string, unknown>) {
    const { data, error } = await apiClient.POST('/v1/apps/{id}/validate', {
      params: { path: { id } },
      body: config,
    })

    if (error) {
      throw new Error(getErrorMessage(error, 'Failed to validate configuration'))
    }

    return data
  },

  /**
   * Geocode a lat/lng to a full location object
   */
  async geocode(id: string, lat: number, lng: number) {
    const { data, error } = await apiClient.POST('/v1/apps/{id}/geocoder', {
      params: { path: { id } },
      body: { lat, lng },
    })

    if (error) {
      throw new Error(getErrorMessage(error, 'Failed to geocode location'))
    }

    return data!
  },

  /**
   * Call a schema handler (for typeahead/generated fields)
   */
  async callHandler(
    id: string,
    handlerName: string,
    config: Record<string, string>,
    inputData?: string,
  ) {
    const { data, error } = await apiClient.POST('/v1/apps/{id}/call_handler', {
      params: { path: { id } },
      body: {
        handler_name: handlerName,
        data: inputData,
        config,
      },
    })

    if (error) {
      throw new Error(getErrorMessage(error, 'Failed to call handler'))
    }

    return data
  },
}
