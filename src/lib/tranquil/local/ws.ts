/**
 * Tranquil LAN WebSocket client.
 *
 * Real-time only: the device pushes state snapshots (player state, LED state,
 * library changes, download progress) and keepalive over `ws(s)://<device>/ws`
 * as binary `TranquilMessage` protobufs. All CRUD/config is REST (see rest.ts).
 * There is NO module singleton — koios-app connects per-device by `baseUrl`
 * (from mDNS discovery).
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

import { ref, readonly, type Ref } from 'vue'
import { create, fromBinary, toBinary } from '@bufbuild/protobuf'
import { TranquilMessageSchema, type TranquilMessage } from '@/types/proto/kd/v1/tranquil_pb'
import { ReconnectStrategy } from './reconnect'

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
