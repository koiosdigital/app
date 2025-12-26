/**
 * Device utility functions
 */

/**
 * Get status color for UI components
 */
export function getStatusColor(status: 'online' | 'offline' | string): 'primary' | 'neutral' {
  return status === 'online' ? 'primary' : 'neutral'
}

/**
 * Get status label
 */
export function getStatusLabel(status: 'online' | 'offline'): string {
  return status === 'online' ? 'Online' : 'Offline'
}

/**
 * Get power action label
 */
export function getPowerLabel(isOn: boolean): string {
  return isOn ? 'Turn off' : 'Turn on'
}
