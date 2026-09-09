/**
 * Exponential-backoff reconnect for the Tranquil LAN WebSocket.
 *
 * 1 s → 2 s → 4 s … capped at 15 s, with ±20 % jitter so several clients that
 * lost the same access point don't all hammer the table in lock-step. The
 * caller resets the attempt counter on a successful open and on external
 * "try now" signals (app resume, network back), so a table that was gone for
 * an hour reconnects within a second of being reachable again rather than
 * at the tail of a long backoff.
 */
export class ReconnectStrategy {
  private attempt = 0
  private timeoutId: number | null = null
  private readonly maxDelay = 15000
  private readonly baseDelay = 1000

  /** Number of consecutive failed attempts (0 after a successful open). */
  get failures(): number {
    return this.attempt
  }

  schedule(reconnectFn: () => void): void {
    // Only ever one pending attempt. Overwriting timeoutId left the previous
    // timer running and untracked, so cancel() could only stop the last one and
    // the rest still fired — reconnecting a socket the caller had disconnected.
    if (this.timeoutId !== null) clearTimeout(this.timeoutId)

    const base = Math.min(this.baseDelay * Math.pow(2, this.attempt), this.maxDelay)
    const delay = Math.round(base * (0.8 + Math.random() * 0.4))
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
