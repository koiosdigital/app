/**
 * KD Clock LAN-direct REST client, ported from clock-app (src/stores/apiClient.ts).
 * Like the Tranquil client, this is a FACTORY: `createClockRest(baseUrl)` returns
 * a client bound to one device's `http://<ip>:<port>` base (from mDNS discovery).
 */

import createClient from 'openapi-fetch'
import { lanFetch } from '@/lib/http/lanFetch'
import type {
  ClockAbout,
  ClockSystemConfig,
  ClockSystemConfigUpdate,
  TimezoneEntry,
  StatusResponse,
  LedEffect,
  LedConfigResponse,
  LedChannelState,
  LedChannelUpdate,
  NixieConfig,
  NixieConfigUpdate,
  FibonacciConfig,
  FibonacciConfigUpdate,
} from './types'

// Minimal hand-written path typing for openapi-fetch, mirroring clock-app's
// generated api.d.ts (the firmware serves no OpenAPI doc at runtime).
interface paths {
  '/api/about': {
    get: { responses: { 200: { content: { 'application/json': ClockAbout } } } }
  }
  '/api/system/config': {
    get: { responses: { 200: { content: { 'application/json': ClockSystemConfig } } } }
    post: {
      requestBody: { content: { 'application/json': ClockSystemConfigUpdate } }
      responses: { 200: { content: { 'application/json': StatusResponse } } }
    }
  }
  '/api/time/zonedb': {
    get: { responses: { 200: { content: { 'application/json': TimezoneEntry[] } } } }
  }
  '/api/led/effects': {
    get: { responses: { 200: { content: { 'application/json': LedEffect[] } } } }
  }
  '/api/led/config': {
    get: { responses: { 200: { content: { 'application/json': LedConfigResponse } } } }
  }
  '/api/led/channel/{channelIndex}': {
    get: {
      parameters: { path: { channelIndex: number } }
      responses: { 200: { content: { 'application/json': LedChannelState } } }
    }
    post: {
      parameters: { path: { channelIndex: number } }
      requestBody: { content: { 'application/json': LedChannelUpdate } }
      responses: { 200: { content: { 'application/json': LedChannelState } } }
    }
  }
  '/api/nixie': {
    get: { responses: { 200: { content: { 'application/json': NixieConfig } } } }
    post: {
      requestBody: { content: { 'application/json': NixieConfigUpdate } }
      responses: { 200: { content: { 'application/json': NixieConfig } } }
    }
  }
  '/api/fibonacci': {
    get: { responses: { 200: { content: { 'application/json': FibonacciConfig } } } }
    post: {
      requestBody: { content: { 'application/json': FibonacciConfigUpdate } }
      responses: { 200: { content: { 'application/json': FibonacciConfig } } }
    }
  }
}

async function handleResponse<T>(response: {
  data?: T
  error?: unknown
  response: Response
}): Promise<T> {
  if (response.error || response.data === undefined) {
    throw new Error(`Request failed: ${response.response.status} ${response.response.statusText}`)
  }
  return response.data
}

export type ClockRestClient = ReturnType<typeof createClockRest>

export function createClockRest(baseUrl: string) {
  // Route through native HTTP on device so cleartext http://<ip> LAN requests
  // aren't blocked as mixed content by the https-origin WebView (see lanFetch).
  const client = createClient<paths>({ baseUrl, fetch: lanFetch })

  const system = {
    async getAbout(): Promise<ClockAbout> {
      return handleResponse(await client.GET('/api/about'))
    },
    async getConfig(): Promise<ClockSystemConfig> {
      return handleResponse(await client.GET('/api/system/config'))
    },
    async setConfig(data: ClockSystemConfigUpdate): Promise<StatusResponse> {
      return handleResponse(await client.POST('/api/system/config', { body: data }))
    },
    async getTimezones(): Promise<TimezoneEntry[]> {
      return handleResponse(await client.GET('/api/time/zonedb'))
    },
  }

  const led = {
    async getEffects(): Promise<LedEffect[]> {
      return handleResponse(await client.GET('/api/led/effects'))
    },
    async getConfig(): Promise<LedConfigResponse> {
      return handleResponse(await client.GET('/api/led/config'))
    },
    async getChannel(channelIndex: number): Promise<LedChannelState> {
      return handleResponse(
        await client.GET('/api/led/channel/{channelIndex}', { params: { path: { channelIndex } } }),
      )
    },
    async setChannel(channelIndex: number, data: LedChannelUpdate): Promise<LedChannelState> {
      return handleResponse(
        await client.POST('/api/led/channel/{channelIndex}', {
          params: { path: { channelIndex } },
          body: data,
        }),
      )
    },
  }

  const nixie = {
    async get(): Promise<NixieConfig> {
      return handleResponse(await client.GET('/api/nixie'))
    },
    async update(data: NixieConfigUpdate): Promise<NixieConfig> {
      return handleResponse(await client.POST('/api/nixie', { body: data }))
    },
  }

  const fibonacci = {
    async get(): Promise<FibonacciConfig> {
      return handleResponse(await client.GET('/api/fibonacci'))
    },
    async update(data: FibonacciConfigUpdate): Promise<FibonacciConfig> {
      return handleResponse(await client.POST('/api/fibonacci', { body: data }))
    },
  }

  return { baseUrl, system, led, nixie, fibonacci }
}
