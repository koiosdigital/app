/**
 * Tranquil LAN WebSocket client, ported from tranquil-app (src/api/ws/index.ts).
 *
 * Real-time only: the device pushes state snapshots (player state) and keepalive
 * over `ws(s)://<device>/ws` as binary `TranquilMessage` protobufs. All CRUD/
 * config is REST (see rest.ts). Unlike the source, there is NO module singleton —
 * koios-app connects per-device by `baseUrl` (from mDNS discovery).
 */

import { ref, readonly, type Ref } from 'vue'
import { fromBinary, toBinary } from '@bufbuild/protobuf'
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

  readonly connected: Readonly<Ref<boolean>>

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl
    this._connected = ref(false)
    this.connected = readonly(this._connected)
  }

  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) return

    const url = `${this.baseUrl.replace('http', 'ws')}/ws`
    this.ws = new WebSocket(url)
    this.ws.binaryType = 'arraybuffer'

    this.ws.onopen = () => {
      this._connected.value = true
      this.reconnect.reset()
    }

    this.ws.onclose = () => {
      this._connected.value = false
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

  disconnect(): void {
    this.reconnect.cancel()
    if (this.ws) {
      // Drop handlers so a closing socket doesn't trigger a reconnect.
      this.ws.onclose = null
      this.ws.close()
      this.ws = null
    }
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

      this.pending.set(expectedResponseType, {
        resolve,
        reject,
        expectedResponseType,
        timestamp: Date.now(),
      })

      this.send(msg)

      setTimeout(() => {
        const pending = this.pending.get(expectedResponseType)
        if (pending && pending.timestamp <= Date.now() - this.timeout) {
          this.pending.delete(expectedResponseType)
          reject(new Error(`Request timeout: ${requestType}`))
        }
      }, this.timeout)
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
