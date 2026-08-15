import { readonly, ref } from 'vue'
import { App as CapacitorApp } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'

/**
 * Whether the device has a network interface at all.
 *
 * This is deliberately coarse: `navigator.onLine` reports the interface, not
 * reachability, so a phone on a wifi network with no route to the internet
 * still reads as online. It is enough to explain the common case — airplane
 * mode, a dropped connection, a lift — which otherwise surfaces as a generic
 * "Failed to load devices" on every screen in the app.
 */
const online = ref(typeof navigator === 'undefined' ? true : navigator.onLine)

/** True for a few seconds after the connection comes back, so the UI can say so. */
const reconnected = ref(false)

const listeners = new Set<() => void>()
let bound = false
let reconnectTimer: ReturnType<typeof setTimeout> | null = null

function goOffline() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
  reconnected.value = false
  online.value = false
}

function goOnline() {
  const wasOffline = !online.value
  online.value = true
  if (!wasOffline) return

  reconnected.value = true
  if (reconnectTimer) clearTimeout(reconnectTimer)
  reconnectTimer = setTimeout(() => (reconnected.value = false), 3000)

  // Whatever failed while we were dark is worth retrying now.
  for (const fn of listeners) fn()
}

function bind() {
  if (bound || typeof window === 'undefined') return
  bound = true

  window.addEventListener('online', goOnline)
  window.addEventListener('offline', goOffline)

  // The window events are unreliable while a native app is backgrounded, so
  // re-read the flag whenever it comes forward.
  if (Capacitor.isNativePlatform()) {
    void CapacitorApp.addListener('appStateChange', ({ isActive }) => {
      if (!isActive) return
      if (navigator.onLine) goOnline()
      else goOffline()
    })
  }
}

export function useNetworkStatus() {
  bind()

  /** Run `fn` each time the connection is restored. */
  const onReconnect = (fn: () => void) => {
    listeners.add(fn)
    return () => listeners.delete(fn)
  }

  return {
    online: readonly(online),
    reconnected: readonly(reconnected),
    onReconnect,
  }
}
