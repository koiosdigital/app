import { onMounted, onUnmounted } from 'vue'
import { App as CapacitorApp } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'

/**
 * Poll while the app is in front of the user, and stop when it isn't.
 *
 * A bare setInterval keeps hitting the API from a backgrounded app — on a
 * phone that is battery and cellular data spent on a screen nobody is looking
 * at. It also leaves stale state on screen for one full interval after the
 * user comes back, so returning to the app runs the callback immediately
 * rather than waiting.
 */
export function usePolling(fn: () => void | Promise<void>, intervalMs: number) {
  let timer: ReturnType<typeof setInterval> | null = null
  let removeAppListener: (() => void) | null = null
  let disposed = false

  const stop = () => {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
  }

  const start = () => {
    if (!timer && !disposed) timer = setInterval(() => void fn(), intervalMs)
  }

  const resume = () => {
    if (disposed) return
    void fn()
    start()
  }

  const onVisibility = () => {
    if (document.visibilityState === 'visible') resume()
    else stop()
  }

  onMounted(async () => {
    start()
    document.addEventListener('visibilitychange', onVisibility)

    // The webview doesn't always fire visibilitychange when a native app is
    // backgrounded, so listen to the platform directly as well.
    if (Capacitor.isNativePlatform()) {
      const handle = await CapacitorApp.addListener('appStateChange', ({ isActive }) => {
        if (isActive) resume()
        else stop()
      })
      // The view can unmount before this listener resolves.
      if (disposed) handle.remove()
      else removeAppListener = () => handle.remove()
    }
  })

  onUnmounted(() => {
    disposed = true
    stop()
    document.removeEventListener('visibilitychange', onVisibility)
    removeAppListener?.()
  })

  return { start, stop }
}
