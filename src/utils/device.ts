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
