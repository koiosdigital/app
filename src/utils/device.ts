/**
 * Device utility functions
 */

/**
 * Get status color for UI components
 */
export function getStatusColor(online: boolean): 'primary' | 'neutral' {
  return online ? 'primary' : 'neutral'
}

/**
 * Get status label
 */
export function getStatusLabel(online: boolean): string {
  return online ? 'Online' : 'Offline'
}

/**
 * Get power action label
 */
export function getPowerLabel(isOn: boolean): string {
  return isOn ? 'Turn off' : 'Turn on'
}

/**
 * How long a device has been unreachable, phrased so it can be read once and
 * trusted — "Dark since Thursday", "Unreachable for 40 minutes".
 *
 * Deliberately coarse, unlike formatRelativeTime: this line sits under a
 * device's name and should not be quietly rewriting itself every minute while
 * you look at it.
 */
export function formatLastSeen(date: string): string {
  const then = new Date(date)
  if (Number.isNaN(then.getTime())) return 'for a while'

  const diff = Date.now() - then.getTime()
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 5) return 'for a few minutes'
  if (minutes < 60) return `for ${minutes} minutes`
  if (hours < 24)
    return `since ${then.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`
  if (days < 7) return `since ${then.toLocaleDateString(undefined, { weekday: 'long' })}`
  return `since ${then.toLocaleDateString(undefined, { day: 'numeric', month: 'long' })}`
}

/**
 * Format relative time (e.g., "5m ago", "2h ago")
 */
export function formatRelativeTime(date: string): string {
  const now = new Date()
  const past = new Date(date)
  const diff = now.getTime() - past.getTime()

  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  return `${days}d ago`
}
