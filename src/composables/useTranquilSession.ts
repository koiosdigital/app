import { computed, onMounted, type ComputedRef } from 'vue'
import { useRoute } from 'vue-router'
import { useTranquilControl } from './useTranquilControl'
import { useTranquilLocalStore } from '@/stores/tranquilLocal'

export type TranquilSessionState =
  /** Connected and live. */
  | 'ready'
  /** Store is bound to this table but the socket is (re)connecting. */
  | 'connecting'
  /** No store state for this table yet; restoring from the last-known address / mDNS. */
  | 'resuming'
  /** Restore gave up: the table is not reachable on this network. */
  | 'lost'
  /** Cloud mode: the gateway reports the table offline. */
  | 'offline'

/**
 * Per-view session gate for the Tranquil pages. Wraps useTranquilControl()
 * and, on LAN routes, restores the connection when the view mounts without
 * one (WebView reload, deep link, app relaunch on an inner page) instead of
 * sending the user back to the device list.
 *
 *  - `isActive`: the store is bound to the route's table (safe to call api()).
 *  - `state`:    what to show while it isn't live.
 *  - `retry()`:  user-driven reconnect.
 */
export function useTranquilSession() {
  const route = useRoute()
  const control = useTranquilControl()
  const { store, isCloud } = control
  const local = useTranquilLocalStore()

  const routeId = computed(() => String(route.params.id ?? ''))
  const isActive: ComputedRef<boolean> = computed(() => store.activeDevice?.id === routeId.value)

  const state = computed<TranquilSessionState>(() => {
    if (isCloud) {
      if (!isActive.value) return 'resuming'
      // The cloud store exposes `online` (gateway connection state).
      const online = (store as unknown as { online?: boolean }).online
      if (online === false) return 'offline'
      return store.connected ? 'ready' : 'connecting'
    }
    if (isActive.value) return store.connected ? 'ready' : 'connecting'
    if (local.resuming) return 'resuming'
    if (local.resumeFailed) return 'lost'
    return 'resuming'
  })

  function retry() {
    if (isCloud) {
      ;(store as unknown as { reconnectNow?: () => void }).reconnectNow?.()
      return
    }
    if (isActive.value) local.reconnectNow()
    else void local.restoreSession(routeId.value)
  }

  onMounted(() => {
    if (!isCloud && !isActive.value && routeId.value) {
      void local.restoreSession(routeId.value)
    }
  })

  return { ...control, routeId, isActive, state, retry }
}
