/**
 * Exponential-backoff reconnect for the Tranquil LAN WebSocket, ported from
 * tranquil-app (src/api/ws/reconnect.ts).
 */
export class ReconnectStrategy {
  private attempt = 0
  private timeoutId: number | null = null
  private readonly maxDelay = 30000
  private readonly baseDelay = 1000

  schedule(reconnectFn: () => void): void {
    const delay = Math.min(this.baseDelay * Math.pow(2, this.attempt), this.maxDelay)
    this.timeoutId = window.setTimeout(() => {
      this.attempt++
      reconnectFn()
    }, delay)
  }

  reset(): void {
    this.attempt = 0
    if (this.timeoutId !== null) {
      clearTimeout(this.timeoutId)
      this.timeoutId = null
    }
  }

  cancel(): void {
    this.reset()
  }
}
