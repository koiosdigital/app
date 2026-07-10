/**
 * Tranquil LAN-direct REST client, ported from tranquil-app (src/api/rest/
 * local.ts). Unlike the source (a module singleton bound to the same-origin
 * device), this is a FACTORY: `createTranquilRest(baseUrl)` returns a client
 * bound to one device's `http://<ip>:<port>` base (from mDNS discovery).
 */

import createClient from 'openapi-fetch'
import { TranquilError, ErrorCode } from './errors'
import type {
  PlayerState,
  PlayerPatchRequest,
  PlayRequest,
  StopRequest,
  Pattern,
  PatternsListResponse,
  PatternUploadResponse,
  Playlist,
  PlaylistsListResponse,
  CreatePlaylistRequest,
  ModifyPlaylistRequest,
  ReorderPlaylistRequest,
  UpdatePlaylistRequest,
  CommandResult,
  StoreTokenResponse,
  AboutResponse,
  SystemConfig,
  SystemConfigUpdate,
  SystemInfo,
  HomeResponse,
  OkResponse,
  DeviceConfig,
  DeviceConfigPatch,
  PresetsListResponse,
  Schedule,
  TimezoneEntry,
  LEDEffect,
  LEDConfigResponse,
  LEDChannelState,
  LEDChannelUpdate,
} from './types'

// Minimal hand-written path typing for openapi-fetch (no codegen; the firmware
// has no served OpenAPI doc). Mirrors the device's local `/api/*` server.
interface paths {
  '/api/player': {
    get: { responses: { 200: { content: { 'application/json': PlayerState } } } }
    patch: {
      requestBody: { content: { 'application/json': PlayerPatchRequest } }
      responses: { 200: { content: { 'application/json': PlayerState } } }
    }
  }
  '/api/player/play': {
    post: {
      requestBody: { content: { 'application/json': PlayRequest } }
      responses: { 200: { content: { 'application/json': PlayerState } } }
    }
  }
  '/api/player/stop': {
    post: {
      requestBody?: { content: { 'application/json': StopRequest } }
      responses: { 200: { content: { 'application/json': PlayerState } } }
    }
  }
  '/api/player/skip': {
    post: { responses: { 200: { content: { 'application/json': PlayerState } } } }
  }
  '/api/patterns': {
    get: {
      parameters: { query?: { page?: number; per_page?: number } }
      responses: { 200: { content: { 'application/json': PatternsListResponse } } }
    }
    post: {
      requestBody: { content: { 'multipart/form-data': { file: Blob } } }
      responses: { 200: { content: { 'application/json': PatternUploadResponse } } }
    }
  }
  '/api/patterns/{uuid}': {
    get: {
      parameters: { path: { uuid: string } }
      responses: { 200: { content: { 'application/json': Pattern } } }
    }
    delete: {
      parameters: { path: { uuid: string } }
      responses: { 200: { content: { 'application/json': CommandResult } } }
    }
  }
  '/api/playlists': {
    get: {
      parameters: { query?: { page?: number; per_page?: number } }
      responses: { 200: { content: { 'application/json': PlaylistsListResponse } } }
    }
    post: {
      requestBody: { content: { 'application/json': CreatePlaylistRequest } }
      responses: { 200: { content: { 'application/json': Playlist } } }
    }
  }
  '/api/playlists/{uuid}': {
    get: {
      parameters: { path: { uuid: string } }
      responses: { 200: { content: { 'application/json': Playlist } } }
    }
    post: {
      parameters: { path: { uuid: string } }
      requestBody: { content: { 'application/json': ModifyPlaylistRequest } }
      responses: { 200: { content: { 'application/json': Playlist } } }
    }
    patch: {
      parameters: { path: { uuid: string } }
      requestBody: { content: { 'application/json': UpdatePlaylistRequest } }
      responses: { 200: { content: { 'application/json': Playlist } } }
    }
    delete: {
      parameters: { path: { uuid: string } }
      responses: { 200: { content: { 'application/json': CommandResult } } }
    }
  }
  '/api/playlists/{uuid}/order': {
    post: {
      parameters: { path: { uuid: string } }
      requestBody: { content: { 'application/json': ReorderPlaylistRequest } }
      responses: { 200: { content: { 'application/json': Playlist } } }
    }
  }
  '/api/license/store-token': {
    get: { responses: { 200: { content: { 'application/json': StoreTokenResponse } } } }
  }
  '/api/about': {
    get: { responses: { 200: { content: { 'application/json': AboutResponse } } } }
  }
  '/api/system/config': {
    get: { responses: { 200: { content: { 'application/json': SystemConfig } } } }
    post: {
      requestBody: { content: { 'application/json': SystemConfigUpdate } }
      responses: { 200: { content: { 'application/json': SystemConfig } } }
    }
  }
  '/api/time/zonedb': {
    get: { responses: { 200: { content: { 'application/json': TimezoneEntry[] } } } }
  }
  '/api/system/info': {
    get: { responses: { 200: { content: { 'application/json': SystemInfo } } } }
  }
  '/api/system/home': {
    post: {
      requestBody?: { content: { 'application/json': { force_full_calibration?: boolean } } }
      responses: { 200: { content: { 'application/json': HomeResponse } } }
    }
  }
  '/api/system/factory-reset': {
    post: { responses: { 200: { content: { 'application/json': OkResponse } } } }
  }
  '/api/config': {
    get: { responses: { 200: { content: { 'application/json': DeviceConfig } } } }
    patch: {
      requestBody: { content: { 'application/json': DeviceConfigPatch } }
      responses: { 200: { content: { 'application/json': DeviceConfig } } }
    }
  }
  '/api/config/calibration': {
    delete: { responses: { 200: { content: { 'application/json': OkResponse } } } }
  }
  '/api/presets': {
    get: { responses: { 200: { content: { 'application/json': PresetsListResponse } } } }
  }
  '/api/presets/load': {
    post: {
      requestBody: { content: { 'application/json': { preset_id: string } } }
      responses: { 200: { content: { 'application/json': DeviceConfig } } }
    }
  }
  '/api/schedule': {
    get: { responses: { 200: { content: { 'application/json': Schedule } } } }
    put: {
      requestBody: { content: { 'application/json': Schedule } }
      responses: { 200: { content: { 'application/json': Schedule } } }
    }
  }
  '/api/led/effects': {
    get: { responses: { 200: { content: { 'application/json': LEDEffect[] } } } }
  }
  '/api/led/config': {
    get: { responses: { 200: { content: { 'application/json': LEDConfigResponse } } } }
  }
  '/api/led/channel/{index}': {
    get: {
      parameters: { path: { index: number } }
      responses: { 200: { content: { 'application/json': LEDChannelState } } }
    }
    post: {
      parameters: { path: { index: number } }
      requestBody: { content: { 'application/json': LEDChannelUpdate } }
      responses: { 200: { content: { 'application/json': LEDChannelState } } }
    }
  }
}

async function handleResponse<T>(response: {
  data?: T
  error?: unknown
  response: Response
}): Promise<T> {
  if (response.error || !response.data) {
    const status = response.response.status
    let code = ErrorCode.Unknown
    if (status === 404) code = ErrorCode.NotFound
    else if (status === 400) code = ErrorCode.InvalidRequest
    else if (status >= 500) code = ErrorCode.DeviceError
    throw new TranquilError(`Request failed: ${response.response.statusText}`, code)
  }
  return response.data
}

export type TranquilRestClient = ReturnType<typeof createTranquilRest>

export function createTranquilRest(baseUrl: string) {
  const client = createClient<paths>({ baseUrl })

  const player = {
    async getState(): Promise<PlayerState> {
      return handleResponse(await client.GET('/api/player'))
    },
    async patch(data: PlayerPatchRequest): Promise<PlayerState> {
      return handleResponse(await client.PATCH('/api/player', { body: data }))
    },
    async play(data: PlayRequest): Promise<PlayerState> {
      return handleResponse(await client.POST('/api/player/play', { body: data }))
    },
    async stop(data?: StopRequest): Promise<PlayerState> {
      return handleResponse(await client.POST('/api/player/stop', { body: data }))
    },
    async skip(): Promise<PlayerState> {
      return handleResponse(await client.POST('/api/player/skip'))
    },
  }

  const patterns = {
    async list(page = 0, perPage = 20): Promise<PatternsListResponse> {
      return handleResponse(
        await client.GET('/api/patterns', { params: { query: { page, per_page: perPage } } }),
      )
    },
    async get(uuid: string): Promise<Pattern> {
      return handleResponse(
        await client.GET('/api/patterns/{uuid}', { params: { path: { uuid } } }),
      )
    },
    async delete(uuid: string): Promise<CommandResult> {
      return handleResponse(
        await client.DELETE('/api/patterns/{uuid}', { params: { path: { uuid } } }),
      )
    },
    async upload(file: File): Promise<PatternUploadResponse> {
      const formData = new FormData()
      formData.append('file', file)
      const response = await fetch(`${baseUrl}/api/patterns`, { method: 'POST', body: formData })
      if (!response.ok) {
        throw new TranquilError(`Upload failed: ${response.statusText}`, ErrorCode.InvalidRequest)
      }
      return response.json()
    },
    thumbnailUrl(uuid: string): string {
      return `${baseUrl}/api/pattern_thumbs/${uuid}.png`
    },
  }

  const playlists = {
    async list(page = 0, perPage = 20): Promise<PlaylistsListResponse> {
      return handleResponse(
        await client.GET('/api/playlists', { params: { query: { page, per_page: perPage } } }),
      )
    },
    async get(uuid: string): Promise<Playlist> {
      return handleResponse(
        await client.GET('/api/playlists/{uuid}', { params: { path: { uuid } } }),
      )
    },
    async create(data: CreatePlaylistRequest): Promise<Playlist> {
      return handleResponse(await client.POST('/api/playlists', { body: data }))
    },
    async modify(uuid: string, data: ModifyPlaylistRequest): Promise<Playlist> {
      return handleResponse(
        await client.POST('/api/playlists/{uuid}', { params: { path: { uuid } }, body: data }),
      )
    },
    async update(uuid: string, data: UpdatePlaylistRequest): Promise<Playlist> {
      return handleResponse(
        await client.PATCH('/api/playlists/{uuid}', { params: { path: { uuid } }, body: data }),
      )
    },
    async reorder(uuid: string, patternUuids: string[]): Promise<Playlist> {
      return handleResponse(
        await client.POST('/api/playlists/{uuid}/order', {
          params: { path: { uuid } },
          body: { pattern_uuids: patternUuids },
        }),
      )
    },
    async delete(uuid: string): Promise<CommandResult> {
      return handleResponse(
        await client.DELETE('/api/playlists/{uuid}', { params: { path: { uuid } } }),
      )
    },
  }

  const license = {
    async getStoreToken(): Promise<StoreTokenResponse> {
      return handleResponse(await client.GET('/api/license/store-token'))
    },
  }

  const system = {
    async getAbout(): Promise<AboutResponse> {
      return handleResponse(await client.GET('/api/about'))
    },
    async getConfig(): Promise<SystemConfig> {
      return handleResponse(await client.GET('/api/system/config'))
    },
    async setConfig(data: SystemConfigUpdate): Promise<SystemConfig> {
      return handleResponse(await client.POST('/api/system/config', { body: data }))
    },
    async getTimezones(): Promise<TimezoneEntry[]> {
      return handleResponse(await client.GET('/api/time/zonedb'))
    },
    async getInfo(): Promise<SystemInfo> {
      return handleResponse(await client.GET('/api/system/info'))
    },
    async home(forceFullCalibration = false): Promise<HomeResponse> {
      return handleResponse(
        await client.POST('/api/system/home', {
          body: { force_full_calibration: forceFullCalibration },
        }),
      )
    },
    async factoryReset(): Promise<OkResponse> {
      return handleResponse(await client.POST('/api/system/factory-reset'))
    },
  }

  const deviceConfig = {
    async get(): Promise<DeviceConfig> {
      return handleResponse(await client.GET('/api/config'))
    },
    async patch(data: DeviceConfigPatch): Promise<DeviceConfig> {
      return handleResponse(await client.PATCH('/api/config', { body: data }))
    },
    async clearCalibration(): Promise<OkResponse> {
      return handleResponse(await client.DELETE('/api/config/calibration'))
    },
  }

  const presets = {
    async list(): Promise<PresetsListResponse> {
      return handleResponse(await client.GET('/api/presets'))
    },
    async load(presetId: string): Promise<DeviceConfig> {
      return handleResponse(
        await client.POST('/api/presets/load', { body: { preset_id: presetId } }),
      )
    },
  }

  const schedule = {
    async get(): Promise<Schedule> {
      return handleResponse(await client.GET('/api/schedule'))
    },
    async set(data: Schedule): Promise<Schedule> {
      return handleResponse(await client.PUT('/api/schedule', { body: data }))
    },
  }

  const led = {
    async getEffects(): Promise<LEDEffect[]> {
      return handleResponse(await client.GET('/api/led/effects'))
    },
    async getConfig(): Promise<LEDConfigResponse> {
      return handleResponse(await client.GET('/api/led/config'))
    },
    async getChannel(index: number): Promise<LEDChannelState> {
      return handleResponse(
        await client.GET('/api/led/channel/{index}', { params: { path: { index } } }),
      )
    },
    async setChannel(index: number, data: LEDChannelUpdate): Promise<LEDChannelState> {
      return handleResponse(
        await client.POST('/api/led/channel/{index}', { params: { path: { index } }, body: data }),
      )
    },
  }

  return {
    baseUrl,
    player,
    patterns,
    playlists,
    license,
    system,
    deviceConfig,
    presets,
    schedule,
    led,
  }
}
