/**
 * Tranquil LAN transport: one table reached directly on the local network.
 *
 *  - REST (`createTranquilRest`) for every command and list, typed by hand
 *    against the firmware's `/api/*` server (it serves no OpenAPI doc).
 *  - WebSocket (`TranquilWebSocket`) for real-time pushes: player state, LED
 *    state, library snapshots, download/upload progress, command results.
 *  - `LanTransport` binds the two to ONE device, reduces the protobuf pushes
 *    to `LiveEvent`s for the store, and owns connection recovery: socket
 *    backoff + liveness, app-resume / network-back retries, mDNS re-resolve
 *    when the table's address changes, and `restoreSession()` after a WebView
 *    reload or deep link.
 *
 * Nothing here touches the cloud.
 */

import { ref, readonly, watch, type Ref, type WatchStopHandle } from 'vue'
import { create, fromBinary, toBinary } from '@bufbuild/protobuf'
import createClient from 'openapi-fetch'
import { App as CapacitorApp } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'
import {
  TranquilMessageSchema,
  PlayerState_PlaybackState,
  PlayerState_PlayMode,
  type TranquilMessage,
} from '@/types/proto/kd/v1/tranquil_pb'
import { lanFetch } from '@/lib/http/lanFetch'
import { isDiscoverySupported, watchKoiosDevices, type LocalDevice } from '@/lib/mdns/discovery'
import { useNetworkStatus } from '@/composables/useNetworkStatus'
import { useLocalDevicesStore } from '@/stores/localDevices'
import { TranquilError, ErrorCode } from '../local/errors'
import { ReconnectStrategy } from '../local/reconnect'
import type {
  AboutResponse,
  CommandResult,
  CreatePlaylistRequest,
  DeviceConfig,
  DeviceConfigPatch,
  HomeResponse,
  LEDChannelState,
  LEDChannelUpdate,
  LEDConfigResponse,
  LEDEffect,
  ModifyPlaylistRequest,
  OkResponse,
  Pattern,
  PatternUploadResponse,
  PatternsListResponse,
  PlayRequest,
  PlayerPatchRequest,
  PlayerState,
  Playlist,
  PlaylistsListResponse,
  PresetsListResponse,
  ReorderPlaylistRequest,
  Schedule,
  ScheduleRunRequest,
  ScheduleRunResult,
  StopRequest,
  StoreTokenResponse,
  SystemConfig,
  SystemConfigUpdate,
  SystemInfo,
  TimezoneEntry,
  UpdatePlaylistRequest,
} from '../local/types'
import type {
  LedSnapshot,
  LiveListener,
  PlayerApi,
  TranquilCapabilities,
  TranquilTransport,
} from '../client'

export const LAN_CAPABILITIES: TranquilCapabilities = Object.freeze({
  upload: true,
  config: true,
  thumbs: true,
  previous: true,
  emergencyStop: true,
  livePush: true,
  commandResults: true,
})

/** The device's own thumbnail PNG for a pattern. */
export function lanThumbUrl(baseUrl: string, patternUuid: string): string {
  return `${baseUrl}/api/pattern_thumbs/${patternUuid}.png`
}

// =============================================================================
// REST
// =============================================================================

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
  '/api/player/previous': {
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
  '/api/system/reboot': {
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
  '/api/schedule/run': {
    post: {
      requestBody: { content: { 'application/json': ScheduleRunRequest } }
      responses: { 200: { content: { 'application/json': ScheduleRunResult } } }
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

/**
 * Bare REST client bound to one device's `http://<ip>:<port>` base. Used by
 * `LanTransport` and, one-shot, by the device card on the home screen.
 */
export function createTranquilRest(baseUrl: string) {
  // Route JSON calls through native HTTP so cleartext http://<ip> LAN requests
  // aren't blocked as mixed content by the https-origin WebView on native (same
  // reason the clock client does — see lanFetch). Note: multipart upload below
  // deliberately does NOT use lanFetch (CapacitorHttp can't stream multipart).
  const client = createClient<paths>({ baseUrl, fetch: lanFetch })

  const player: PlayerApi = {
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
    async previous(): Promise<PlayerState> {
      return handleResponse(await client.POST('/api/player/previous'))
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
    // Starts the run and returns immediately (202); completion is visible via
    // getInfo().is_homing / is_homed and the device's SystemInfo push.
    async home(forceFullCalibration = false): Promise<HomeResponse> {
      const res = await client.POST('/api/system/home', {
        body: { force_full_calibration: forceFullCalibration },
      })
      if (res.response.status === 409) {
        return { success: false, error: 'Homing is already in progress.' }
      }
      return handleResponse(res)
    },
    async factoryReset(): Promise<OkResponse> {
      return handleResponse(await client.POST('/api/system/factory-reset'))
    },
    // Restart the table (settings and library are kept).
    async reboot(): Promise<OkResponse> {
      return handleResponse(await client.POST('/api/system/reboot'))
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
    /** Run one action now (Run now / Test). success=false with a detail when
     *  quiet hours block it or the action could not start. */
    async run(action: ScheduleRunRequest['action'], force = false): Promise<ScheduleRunResult> {
      return handleResponse(await client.POST('/api/schedule/run', { body: { action, force } }))
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

// =============================================================================
// WebSocket
// =============================================================================

type MessageCase = NonNullable<NonNullable<TranquilMessage['message']>['case']>
type MessageHandler = (msg: TranquilMessage) => void

// Request→response correlation. The socket is real-time only; everything else
// is REST, so this map is intentionally tiny.
const responseMap: Partial<Record<MessageCase, MessageCase>> = {
  getPlayerState: 'playerState',
  ledConfigRequest: 'ledConfig',
  ping: 'pong',
}

interface PendingRequest {
  resolve: (msg: TranquilMessage) => void
  reject: (error: Error) => void
  expectedResponseType: MessageCase
  timestamp: number
}

/**
 * Real-time socket to the table: the device pushes state snapshots (player
 * state, LED state, library changes, download progress) and keepalive over
 * `ws(s)://<device>/ws` as binary `TranquilMessage` protobufs.
 *
 * Liveness: the browser only tells us about a dead socket once TCP gives up,
 * which after an iOS background/resume or a WiFi flap can be minutes. So:
 *  - a connect attempt that hasn't opened within `connectTimeoutMs` is
 *    abandoned and retried;
 *  - the heartbeat ping expects the device's pong; missing several in a row
 *    means the socket is half-open and it is torn down and reopened;
 *  - `forceReconnect()` lets the owner (app resume, network back, address
 *    change) skip the backoff entirely.
 */
export class TranquilWebSocket {
  private ws: WebSocket | null = null
  private reconnect = new ReconnectStrategy()
  private handlers = new Map<MessageCase, Set<MessageHandler>>()
  private pending = new Map<MessageCase, PendingRequest>()
  private readonly timeout = 10000
  private _connected: Ref<boolean>
  private baseUrl: string
  private closed = false
  private connectTimer: ReturnType<typeof setTimeout> | null = null
  private readonly connectTimeoutMs = 6000
  // Keepalive. The device httpd runs a small socket budget with LRU purge, and
  // its LRU timer only advances on INBOUND frames — server-side broadcasts do
  // not keep a socket warm. A periodic client ping keeps it warm, and the pong
  // doubles as our liveness check.
  private heartbeat: ReturnType<typeof setInterval> | null = null
  private readonly heartbeatMs = 4000
  private lastInboundAt = 0
  private readonly deadAfterMs = 3 * 4000 + 500

  readonly connected: Readonly<Ref<boolean>>

  /** Consecutive failed connection attempts since the last successful open. */
  get failures(): number {
    return this.reconnect.failures
  }

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl
    this._connected = ref(false)
    this.connected = readonly(this._connected)
  }

  connect(): void {
    if (this.closed) return
    // CONNECTING has to count as "already connecting". Guarding only on OPEN
    // meant two quick connect() calls built two sockets: the first was
    // overwritten but kept its onclose, which then scheduled a reconnect for a
    // socket nobody owned — and each of those did it again on close.
    const state = this.ws?.readyState
    if (state === WebSocket.OPEN || state === WebSocket.CONNECTING) return

    const url = `${this.baseUrl.replace('http', 'ws')}/ws`
    let socket: WebSocket
    try {
      socket = new WebSocket(url)
    } catch (e) {
      console.warn('WebSocket construct failed', e)
      this.reconnect.schedule(() => this.connect())
      return
    }
    socket.binaryType = 'arraybuffer'
    this.ws = socket

    // A socket stuck in CONNECTING (iOS suspended us mid-handshake, or the
    // table's IP changed) never fires onclose on its own. Give up and retry.
    this.clearConnectTimer()
    this.connectTimer = setTimeout(() => {
      if (this.ws === socket && socket.readyState === WebSocket.CONNECTING) {
        console.warn('WebSocket connect timed out')
        this.dropSocket(socket)
        this.reconnect.schedule(() => this.connect())
      }
    }, this.connectTimeoutMs)

    socket.onopen = () => {
      if (this.ws !== socket) return
      this.clearConnectTimer()
      this.lastInboundAt = Date.now()
      this._connected.value = true
      this.reconnect.reset()
      this.startHeartbeat()
    }

    socket.onclose = () => {
      if (this.ws !== socket) return
      this.clearConnectTimer()
      this.ws = null
      this._connected.value = false
      this.stopHeartbeat()
      this.rejectAllPending(new Error('WebSocket disconnected'))
      if (!this.closed) this.reconnect.schedule(() => this.connect())
    }

    socket.onmessage = (event) => {
      if (this.ws !== socket) return
      this.lastInboundAt = Date.now()
      try {
        const msg = fromBinary(TranquilMessageSchema, new Uint8Array(event.data as ArrayBuffer))
        this.dispatch(msg)
      } catch (e) {
        console.error('Failed to decode message:', e)
      }
    }

    socket.onerror = (e) => {
      console.error('WebSocket error:', e)
    }
  }

  /**
   * Drop whatever socket exists and connect again immediately, skipping the
   * backoff. For external "the world changed" signals: app came to the
   * foreground, network came back, the table's address was re-resolved.
   */
  forceReconnect(): void {
    if (this.closed) return
    this.reconnect.reset()
    if (this.ws) {
      const dead = this.ws
      this.dropSocket(dead)
    }
    this.connect()
  }

  /** Point at a new base URL (DHCP gave the table a new address). */
  rebase(baseUrl: string): void {
    if (baseUrl === this.baseUrl) return
    this.baseUrl = baseUrl
    this.forceReconnect()
  }

  private dropSocket(socket: WebSocket): void {
    // Detach every handler first: a closing socket still fires
    // onmessage/onerror/onclose, and those closures would schedule a
    // reconnect for a socket nobody owns.
    socket.onclose = null
    socket.onopen = null
    socket.onmessage = null
    socket.onerror = null
    try {
      socket.close()
    } catch {
      /* already closed */
    }
    if (this.ws === socket) this.ws = null
    this.clearConnectTimer()
    this._connected.value = false
    this.stopHeartbeat()
    this.rejectAllPending(new Error('WebSocket disconnected'))
  }

  private clearConnectTimer(): void {
    if (this.connectTimer) {
      clearTimeout(this.connectTimer)
      this.connectTimer = null
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat()
    this.heartbeat = setInterval(() => {
      const socket = this.ws
      if (!socket || socket.readyState !== WebSocket.OPEN) return
      // Half-open detection: nothing (not even our pongs) arrived for three
      // beats. iOS leaves sockets like this after a background/resume; TCP
      // would take minutes to notice.
      if (Date.now() - this.lastInboundAt > this.deadAfterMs) {
        console.warn('WebSocket silent; reconnecting')
        this.dropSocket(socket)
        this.reconnect.reset()
        this.connect()
        return
      }
      try {
        // Fire-and-forget (not request()): the device's pong refreshes
        // lastInboundAt via onmessage.
        this.send(create(TranquilMessageSchema, { message: { case: 'ping', value: {} } }))
      } catch {
        // Socket raced closed between the readyState check and send; the
        // reconnect path will re-arm the heartbeat.
      }
    }, this.heartbeatMs)
  }

  private stopHeartbeat(): void {
    if (this.heartbeat) {
      clearInterval(this.heartbeat)
      this.heartbeat = null
    }
  }

  disconnect(): void {
    this.closed = true
    this.reconnect.cancel()
    this.stopHeartbeat()
    this.clearConnectTimer()
    if (this.ws) {
      const socket = this.ws
      this.dropSocket(socket)
    }
    // onclose used to do this, and we just unhooked it. Without it, in-flight
    // request() promises never settle and hold their closures forever.
    this.rejectAllPending(new Error('WebSocket disconnected'))
    this._connected.value = false
  }

  async request(msg: TranquilMessage): Promise<TranquilMessage> {
    const requestType = msg.message?.case
    if (!requestType) {
      throw new Error('Invalid message: no case')
    }

    const expectedResponseType = responseMap[requestType]
    if (!expectedResponseType) {
      // Fire-and-forget for messages without an expected response.
      this.send(msg)
      return msg
    }

    return new Promise((resolve, reject) => {
      this.cleanupStale()

      // The timeout has to be cancellable. It used to be left running on every
      // request, so a resolved call still pinned its closure — and the reject
      // it captured — for the full ten seconds.
      const timer = setTimeout(() => {
        this.pending.delete(expectedResponseType)
        reject(new Error(`Request timeout: ${requestType}`))
      }, this.timeout)

      const settle =
        <T>(fn: (value: T) => void) =>
        (value: T) => {
          clearTimeout(timer)
          fn(value)
        }

      this.pending.set(expectedResponseType, {
        resolve: settle(resolve),
        reject: settle(reject),
        expectedResponseType,
        timestamp: Date.now(),
      })

      try {
        this.send(msg)
      } catch (e) {
        // send() throws synchronously when the socket is down; without this the
        // entry sat in `pending` until something else happened to sweep it.
        clearTimeout(timer)
        this.pending.delete(expectedResponseType)
        reject(e instanceof Error ? e : new Error('Failed to send'))
      }
    })
  }

  subscribe(type: MessageCase, handler: MessageHandler): () => void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set())
    }
    this.handlers.get(type)!.add(handler)
    return () => this.handlers.get(type)?.delete(handler)
  }

  private send(msg: TranquilMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(toBinary(TranquilMessageSchema, msg))
    } else {
      throw new Error('WebSocket not connected')
    }
  }

  private dispatch(msg: TranquilMessage): void {
    const type = msg.message?.case
    if (!type) return

    const pending = this.pending.get(type)
    if (pending) {
      this.pending.delete(type)
      pending.resolve(msg)
      // A broadcast of the same type (LEDConfig, PlayerState) is also news
      // for subscribers - fall through.
    }

    this.handlers.get(type)?.forEach((h) => h(msg))
  }

  private cleanupStale(): void {
    const now = Date.now()
    for (const [key, value] of this.pending) {
      if (now - value.timestamp > this.timeout) {
        this.pending.delete(key)
        value.reject(new Error('Request timeout'))
      }
    }
  }

  private rejectAllPending(error: Error): void {
    for (const [key, value] of this.pending) {
      this.pending.delete(key)
      value.reject(error)
    }
  }
}

// =============================================================================
// Proto → domain reducers
// =============================================================================

function rgbToHex(r: number, g: number, b: number): string {
  const h = (v: number) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')
  return `#${h(r)}${h(g)}${h(b)}`
}

/** Proto PlayerState (camelCase, numeric enums) → REST PlayerState shape. */
function mapPlayerState(ps: {
  state: number
  mode: number
  currentPatternUuid?: string
  currentPlaylistUuid?: string
  progressPercent: number
  patternIndex?: number
  playlistSize?: number
  feedRate: number
  shuffle: boolean
  loop: boolean
}): PlayerState {
  // Map by proto enum, not raw numbers: 0 is UNSPECIFIED, so a numeric
  // mapping starting at 0 is shifted by one (PLAYING rendered as PAUSED,
  // STOPPED as PLAYING).
  return {
    state:
      ps.state === PlayerState_PlaybackState.PLAYING
        ? 'PLAYING'
        : ps.state === PlayerState_PlaybackState.PAUSED
          ? 'PAUSED'
          : 'STOPPED',
    mode:
      ps.mode === PlayerState_PlayMode.PLAYLIST
        ? 'PLAYLIST'
        : ps.mode === PlayerState_PlayMode.PLAYLIST_LOOP
          ? 'PLAYLIST_LOOP'
          : ps.mode === PlayerState_PlayMode.PLAYLIST_SHUFFLE
            ? 'PLAYLIST_SHUFFLE'
            : ps.mode === PlayerState_PlayMode.RANDOM_LOOP
              ? 'RANDOM_LOOP'
              : 'SINGLE_PATTERN',
    current_pattern_uuid: ps.currentPatternUuid,
    current_playlist_uuid: ps.currentPlaylistUuid,
    progress_percent: ps.progressPercent,
    pattern_index: ps.patternIndex,
    playlist_size: ps.playlistSize,
    feed_rate: ps.feedRate,
    shuffle: ps.shuffle,
    loop: ps.loop,
  }
}

/** Proto LEDConfig push → LedSnapshot. */
function mapLedConfig(cfg: {
  hasLeds: boolean
  ledCount: number
  format: number
  channels: {
    effectId: string
    brightness: number
    speed: number
    enabled: boolean
    color?: { r: number; g: number; b: number; w?: number; cw?: number }
  }[]
}): LedSnapshot {
  return {
    hasLeds: cfg.hasLeds,
    ledCount: cfg.ledCount,
    format: cfg.format === 3 ? 'RGBCCT' : cfg.format === 2 ? 'RGBW' : 'RGB',
    channels: cfg.channels.map((ch) => ({
      effect_id: ch.effectId,
      brightness: ch.brightness,
      speed: ch.speed,
      on: ch.enabled,
      color: ch.color ? rgbToHex(ch.color.r, ch.color.g, ch.color.b) : '#ffffff',
      w: ch.color?.w,
      cw: ch.color?.cw,
    })),
  }
}

// =============================================================================
// Transport
// =============================================================================

// Where the last-opened table is remembered, so a page reload (iOS reloads
// the WebView after a background content-process kill) or a deep link can
// reconnect without going through the device list.
const LAST_DEVICE_KEY = 'tranquil.last_local_device'

// How long restoreSession() waits for mDNS to re-resolve a table whose cached
// address no longer answers.
const RESOLVE_TIMEOUT_MS = 8000

// App-lifecycle listeners are process-wide and can't be removed per instance,
// so they are bound once and forwarded to whichever transport is current.
let current: LanTransport | null = null
let lifecycleBound = false
function bindLifecycle(): void {
  if (lifecycleBound) return
  lifecycleBound = true
  // App foreground + network-online both mean "the world changed": retry
  // immediately instead of waiting out a backoff that was computed while we
  // were asleep.
  useNetworkStatus().onReconnect(() => current?.reconnectNow())
  if (Capacitor.isNativePlatform()) {
    void CapacitorApp.addListener('appStateChange', ({ isActive }) => {
      if (isActive) current?.reconnectNow()
    })
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') current?.reconnectNow()
    })
  }
}

async function persistDevice(device: LocalDevice): Promise<void> {
  try {
    await Preferences.set({ key: LAST_DEVICE_KEY, value: JSON.stringify(device) })
  } catch {
    /* best effort */
  }
}

async function loadPersistedDevice(): Promise<LocalDevice | null> {
  try {
    const { value } = await Preferences.get({ key: LAST_DEVICE_KEY })
    return value ? (JSON.parse(value) as LocalDevice) : null
  } catch {
    return null
  }
}

/** Quick reachability check of a table's REST API. */
async function probe(url: string): Promise<boolean> {
  try {
    await createTranquilRest(url).system.getAbout()
    return true
  } catch {
    return false
  }
}

// One in-flight mDNS re-resolve shared between callers.
let resolveInFlight: Promise<LocalDevice | null> | null = null
function resolveById(id: string): Promise<LocalDevice | null> {
  if (!isDiscoverySupported()) return Promise.resolve(null)
  if (resolveInFlight) return resolveInFlight
  resolveInFlight = new Promise<LocalDevice | null>((resolve) => {
    let settled = false
    let handle: { stop: () => Promise<void> } | null = null
    const finish = (device: LocalDevice | null) => {
      if (settled) return
      settled = true
      resolve(device)
      void handle?.stop()
    }
    const timer = setTimeout(() => finish(null), RESOLVE_TIMEOUT_MS)
    watchKoiosDevices((event) => {
      if (event.action === 'resolved' && event.device.id === id && event.device.baseUrl) {
        clearTimeout(timer)
        finish(event.device)
      }
    })
      .then((h) => {
        handle = h
        if (settled) void h.stop()
      })
      .catch(() => {
        clearTimeout(timer)
        finish(null)
      })
  }).finally(() => {
    resolveInFlight = null
  })
  return resolveInFlight
}

const noConnection = () =>
  new TranquilError('No active table connection', ErrorCode.WsDisconnected)

export class LanTransport implements TranquilTransport {
  readonly transport = 'lan' as const
  readonly capabilities = LAN_CAPABILITIES

  private device: LocalDevice | null = null
  private rest: TranquilRestClient | null = null
  private ws: TranquilWebSocket | null = null
  private unsubs: Array<() => void> = []
  private stopConnWatch: WatchStopHandle | null = null
  private stopAddressWatch: WatchStopHandle | null = null
  private resuming = false
  private readonly emit: LiveListener

  constructor(listener: LiveListener) {
    this.emit = listener
  }

  get deviceId(): string | null {
    return this.device?.id ?? null
  }

  /** REST base URL of the active table, or null. */
  get baseUrl(): string | null {
    return this.rest?.baseUrl ?? null
  }

  private api(): TranquilRestClient {
    if (!this.rest) throw noConnection()
    return this.rest
  }

  // --- session --------------------------------------------------------------

  /**
   * Connect to a discovered table. Sets up state synchronously (so a caller can
   * navigate immediately), then opens the socket and fetches initial state in
   * the background. Idempotent for the same device AND address; a changed
   * address (DHCP) re-points the socket instead of keeping the stale one.
   */
  connect(device: LocalDevice): void {
    if (this.device?.id === device.id && this.ws) {
      if (device.baseUrl && device.baseUrl !== this.rest?.baseUrl) {
        this.rest = createTranquilRest(device.baseUrl)
        this.device = device
        this.ws.rebase(device.baseUrl)
        void persistDevice(device)
      }
      return
    }
    this.disconnect()
    if (!device.baseUrl) {
      this.emit({ type: 'error', message: 'Table has no network address yet' })
      return
    }

    current = this
    this.device = device
    this.rest = createTranquilRest(device.baseUrl)
    const ws = new TranquilWebSocket(device.baseUrl)
    this.ws = ws
    this.emit({
      type: 'device',
      device: { id: device.id, name: device.name, model: device.model, transport: 'lan' },
    })
    this.emit({ type: 'error', message: null })
    this.emit({ type: 'session', resuming: this.resuming, resumeFailed: false })

    this.subscribePushes(ws)
    this.stopConnWatch = watch(
      ws.connected,
      (v) => {
        this.emit({ type: 'connected', connected: v })
        if (v) {
          // (Re)connected: the socket may have missed pushes - resync.
          void this.player.getState().catch(() => {})
          void this.requestLedSnapshot()
        }
      },
      { immediate: true },
    )
    ws.connect()
    bindLifecycle()
    this.followAddress()
    void persistDevice(device)

    void this.player.getState().catch(() => {})
  }

  /** Tear down the active connection. Safe to call when already disconnected. */
  disconnect(): void {
    for (const unsub of this.unsubs) unsub()
    this.unsubs = []
    this.stopConnWatch?.()
    this.stopConnWatch = null
    this.stopAddressWatch?.()
    this.stopAddressWatch = null
    this.ws?.disconnect()
    this.ws = null
    this.rest = null
    this.device = null
    if (current === this) current = null
    this.emit({ type: 'connected', connected: false })
    this.emit({ type: 'device', device: null })
  }

  /**
   * Restore the session for a table by its mDNS service name, e.g. after the
   * WebView was reloaded on `/tranquil/local/:id` or the page was deep-linked.
   * Tries the last-known address first (fast), then re-resolves over mDNS.
   * Resolves true when a connection was set up.
   */
  async restoreSession(id: string): Promise<boolean> {
    if (this.device?.id === id && this.ws) return true
    if (this.resuming) return false
    this.resuming = true
    this.emit({ type: 'session', resuming: true, resumeFailed: false })
    try {
      // 1. Fresh discovery result already in memory?
      const live = useLocalDevicesStore().devices.find((d) => d.id === id)
      if (live?.baseUrl) {
        this.connect(live)
        return true
      }
      // 2. Last-known record: probe it, then fall back to a scan.
      const cached = await loadPersistedDevice()
      if (cached && cached.id === id && cached.baseUrl) {
        if (await probe(cached.baseUrl)) {
          this.connect(cached)
          return true
        }
      }
      // 3. mDNS: wait for the service to (re)appear.
      const found = await resolveById(id)
      if (found) {
        this.connect(found)
        return true
      }
      return false
    } finally {
      this.resuming = false
      // Failed = we gave up without binding a device: the table is not
      // reachable on this network.
      this.emit({ type: 'session', resuming: false, resumeFailed: this.device?.id !== id })
    }
  }

  /**
   * Try again right now: after the app comes to the foreground, when the
   * network returns, or from a "Retry" button. Skips the socket backoff, and
   * after repeated failures also re-resolves the address over mDNS.
   */
  reconnectNow(): void {
    if (!this.ws || !this.device) return
    if (this.ws.failures >= 3) {
      const id = this.device.id
      void resolveById(id).then((found) => {
        if (found?.baseUrl && this.device?.id === id) this.connect(found)
      })
    }
    this.ws.forceReconnect()
    void this.player.getState().catch(() => {})
  }

  // While a table is open, follow its address in the discovery results so a
  // DHCP change re-points the socket without going back to the device list.
  private followAddress(): void {
    this.stopAddressWatch?.()
    const local = useLocalDevicesStore()
    void local.start()
    this.stopAddressWatch = watch(
      () => local.devices.find((d) => d.id === this.device?.id)?.baseUrl ?? null,
      (url) => {
        if (url && this.device && url !== this.rest?.baseUrl) {
          this.connect({ ...this.device, baseUrl: url })
        }
      },
    )
  }

  // --- pushes → events ------------------------------------------------------

  private subscribePushes(ws: TranquilWebSocket): void {
    const on = (type: MessageCase, handler: MessageHandler) =>
      this.unsubs.push(ws.subscribe(type, handler))

    on('playerState', (msg) => {
      if (msg.message?.case !== 'playerState') return
      this.emit({ type: 'playerState', state: mapPlayerState(msg.message.value), at: Date.now() })
    })
    on('ledConfig', (msg) => {
      if (msg.message?.case !== 'ledConfig') return
      this.emit({ type: 'led', led: mapLedConfig(msg.message.value) })
    })
    // Library pushes: the device sends the full list on any change (delete,
    // rename, upload, download, playlist CRUD, schedule set - by any client,
    // LAN or cloud). The payload itself is not kept: the REST list is
    // paginated and richer than the socket copy, so open views refetch.
    on('downloadedPatterns', () => this.emit({ type: 'library', section: 'patterns' }))
    on('playlists', () => this.emit({ type: 'library', section: 'playlists' }))
    on('schedule', () => this.emit({ type: 'library', section: 'schedule' }))
    on('systemInfo', () => this.emit({ type: 'library', section: 'system' }))
    // Reports arrive incrementally and merge by uuid: a normal frame carries all
    // active downloads, while a terminal failure frame carries just the one that
    // failed. The store merges each entry, never replaces the map.
    on('patternDownloadProgress', (msg) => {
      if (msg.message?.case !== 'patternDownloadProgress') return
      this.emit({
        type: 'downloads',
        entries: msg.message.value.downloads.map((d) => ({
          uuid: d.uuid,
          pct: d.progressPct,
          failed: d.failed,
          error: d.failed ? d.error || 'Download failed' : undefined,
        })),
      })
    })
    on('patternConversionProgress', (msg) => {
      if (msg.message?.case !== 'patternConversionProgress') return
      this.emit({
        type: 'uploads',
        entries: msg.message.value.conversions.map((c) => ({
          uuid: c.uuid,
          phase: 'converting' as const,
          pct: c.progressPct,
          // "converting" -> "complete" here just means convert finished; the
          // thumbnail stage still follows, so it's not `done` yet.
          done: false,
          failed: c.stage === 'failed',
          error: c.stage === 'failed' ? c.error || 'Conversion failed' : undefined,
        })),
      })
    })
    on('patternThumbProgress', (msg) => {
      if (msg.message?.case !== 'patternThumbProgress') return
      this.emit({
        type: 'uploads',
        entries: msg.message.value.thumbnails.map((t) => ({
          uuid: t.uuid,
          phase: 'rendering' as const,
          pct: t.progressPct,
          done: t.stage === 'complete',
          failed: t.stage === 'failed',
          error: t.stage === 'failed' ? t.error || 'Thumbnail failed' : undefined,
        })),
      })
    })
    // The device answers socket commands (e.g. requestPatternDownload) with a
    // CommandResult that echoes our request id.
    on('commandResult', (msg) => {
      if (msg.message?.case !== 'commandResult') return
      const r = msg.message.value
      this.emit({
        type: 'commandResult',
        result: {
          requestId: r.requestId || msg.requestId,
          success: r.success,
          detail: r.detail,
          errorCode: r.errorCode,
          at: Date.now(),
        },
      })
    })
  }

  /** Ask the device for its LED snapshot over the socket (arrives as `led`). */
  async requestLedSnapshot(): Promise<void> {
    if (!this.ws) return
    try {
      await this.ws.request(
        create(TranquilMessageSchema, { message: { case: 'ledConfigRequest', value: {} } }),
      )
    } catch {
      /* the LEDConfig broadcast handler emits `led` when it arrives */
    }
  }

  /**
   * Ask the table to fetch a store pattern from the cloud. The device forwards
   * the request over its own device-plane cloud link and downloads with its
   * certificate — the app just names the pattern. Fire-and-forget over the
   * socket; the store's stall watchdog fails it out if nothing ever arrives.
   */
  async requestDownload(patternUuid: string): Promise<void> {
    if (!this.ws) throw noConnection()
    await this.ws.request(
      create(TranquilMessageSchema, {
        message: { case: 'requestPatternDownload', value: { patternUuid } },
        requestId: newRequestId(),
      }),
    )
  }

  thumbUrl(patternUuid: string): string {
    const base = this.rest?.baseUrl
    return base ? lanThumbUrl(base, patternUuid) : ''
  }

  // --- domains ----------------------------------------------------------------

  // Player ops also emit the state they return, so REST replies and socket
  // pushes reach the store through the same path.
  readonly player: PlayerApi = {
    getState: () => this.playerOp((r) => r.player.getState()),
    patch: (data) => this.playerOp((r) => r.player.patch(data)),
    play: (data) => this.playerOp((r) => r.player.play(data)),
    stop: (data) => this.playerOp((r) => r.player.stop(data)),
    skip: () => this.playerOp((r) => r.player.skip()),
    previous: () => this.playerOp((r) => r.player.previous()),
  }

  private async playerOp(op: (r: TranquilRestClient) => Promise<PlayerState>): Promise<PlayerState> {
    const state = await op(this.api())
    this.emit({ type: 'playerState', state, at: Date.now() })
    return state
  }

  get patterns() {
    return this.api().patterns
  }
  get playlists() {
    return this.api().playlists
  }
  get led() {
    return this.api().led
  }
  get schedule() {
    return this.api().schedule
  }
  get system() {
    return this.api().system
  }
  get deviceConfig() {
    return this.api().deviceConfig
  }
  get presets() {
    return this.api().presets
  }
  /** LAN-only: the device-signed store token. */
  get license() {
    return this.api().license
  }
}

function newRequestId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}
