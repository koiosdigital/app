/**
 * Tranquil LAN WebSocket client, ported from tranquil-app (src/api/ws/index.ts).
 *
 * Real-time only: the device pushes state snapshots (player state) and keepalive
 * over `ws(s)://<device>/ws` as binary `TranquilMessage` protobufs. All CRUD/
 * config is REST (see rest.ts). Unlike the source, there is NO module singleton —
 * koios-app connects per-device by `baseUrl` (from mDNS discovery).
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
  // Keepalive. The device httpd runs a small socket budget with LRU purge, and
  // its LRU timer only advances on INBOUND frames — server-side broadcasts do
  // not keep a socket warm. Without a periodic client ping, an idle WS is the
  // first socket purged when thumbnail/REST traffic saturates the budget, and
  // the app silently stops receiving state pushes. A light ping keeps it warm.
  private heartbeat: ReturnType<typeof setInterval> | null = null
  private readonly heartbeatMs = 4000

  readonly connected: Readonly<Ref<boolean>>

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl
    this._connected = ref(false)
    this.connected = readonly(this._connected)
  }

  connect(): void {
    // CONNECTING has to count as "already connecting". Guarding only on OPEN
    // meant two quick connect() calls built two sockets: the first was
    // overwritten but kept its onclose, which then scheduled a reconnect for a
    // socket nobody owned — and each of those did it again on close.
    const state = this.ws?.readyState
    if (state === WebSocket.OPEN || state === WebSocket.CONNECTING) return

    const url = `${this.baseUrl.replace('http', 'ws')}/ws`
    this.ws = new WebSocket(url)
    this.ws.binaryType = 'arraybuffer'

    this.ws.onopen = () => {
      this._connected.value = true
      this.reconnect.reset()
      this.startHeartbeat()
    }

    this.ws.onclose = () => {
      this._connected.value = false
      this.stopHeartbeat()
      this.rejectAllPending(new Error('WebSocket disconnected'))
      this.reconnect.schedule(() => this.connect())
    }

    this.ws.onmessage = (event) => {
      try {
        const msg = fromBinary(TranquilMessageSchema, new Uint8Array(event.data as ArrayBuffer))
        this.dispatch(msg)
      } catch (e) {
        console.error('Failed to decode message:', e)
      }
    }

    this.ws.onerror = (e) => {
      console.error('WebSocket error:', e)
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat()
    this.heartbeat = setInterval(() => {
      if (this.ws?.readyState !== WebSocket.OPEN) return
      try {
        // Fire-and-forget (not request()): we only need the inbound frame to
        // refresh the device's LRU timer; the pong is harmless if ignored.
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
    this.reconnect.cancel()
    this.stopHeartbeat()
    if (this.ws) {
      // Drop every handler, not just onclose: a socket that is closing still
      // fires onmessage/onerror, and each of those closures pins this instance
      // (and the store subscribers behind it) until the socket finally dies.
      this.ws.onclose = null
      this.ws.onopen = null
      this.ws.onmessage = null
      this.ws.onerror = null
      this.ws.close()
      this.ws = null
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
      return
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
