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
    // Only ever one pending attempt. Overwriting timeoutId left the previous
    // timer running and untracked, so cancel() could only stop the last one and
    // the rest still fired — reconnecting a socket the caller had disconnected.
    if (this.timeoutId !== null) clearTimeout(this.timeoutId)

    const delay = Math.min(this.baseDelay * Math.pow(2, this.attempt), this.maxDelay)
    this.timeoutId = window.setTimeout(() => {
      this.timeoutId = null
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
