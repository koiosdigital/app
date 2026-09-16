import { computed, onMounted, watch, type ComputedRef } from 'vue'
import { useRoute } from 'vue-router'
import { useTranquilControl } from './useTranquilControl'
import { useCommandToast } from './useCommandToast'

export type TranquilSessionState =
  /** Connected and live. */
  | 'ready'
  /** Store is bound to this table but the transport is (re)connecting. */
  | 'connecting'
  /** No store state for this table yet; restoring from the last-known address / mDNS. */
  | 'resuming'
  /** Restore gave up: the table is not reachable on this network. */
  | 'lost'
  /** Cloud mode: the gateway reports the table offline. */
  | 'offline'

// One toast per command outcome, even while two views overlap during a page
// transition (both mount this composable for a few frames).
let lastToastedResult: string | null = null

/**
 * Per-view session gate for the Tranquil pages. Wraps useTranquilControl()
 * and, on LAN routes, restores the connection when the view mounts without
 * one (WebView reload, deep link, app relaunch on an inner page) instead of
 * sending the user back to the device list.
 *
 *  - `isActive`: the store is bound to the route's table (safe to call api()).
 *  - `state`:    what to show while it isn't live.
 *  - `retry()`:  user-driven reconnect.
 *
 * It also surfaces a rejected command as a toast: over the cloud a command is
 * only "delivered" when it returns, and the device's actual outcome arrives a
 * moment later on `store.lastCommandResult`.
 */
export function useTranquilSession() {
  const route = useRoute()
  const control = useTranquilControl()
  const { store, transport } = control
  const toast = useCommandToast()

  const routeId = computed(() => String(route.params.id ?? ''))
  const isActive: ComputedRef<boolean> = computed(
    () => store.activeDevice?.id === routeId.value && store.activeDevice.transport === transport,
  )

  const state = computed<TranquilSessionState>(() => {
    if (transport === 'cloud') {
      if (!isActive.value) return 'resuming'
      if (store.online === false) return 'offline'
      return store.connected ? 'ready' : 'connecting'
    }
    if (isActive.value) return store.connected ? 'ready' : 'connecting'
    if (store.resuming) return 'resuming'
    if (store.resumeFailed) return 'lost'
    return 'resuming'
  })

  function retry() {
    if (isActive.value) {
      store.reconnectNow()
      return
    }
    if (transport === 'cloud') store.connect({ transport: 'cloud', device: { id: routeId.value } })
    else void store.restoreSession(routeId.value)
  }

  onMounted(() => {
    if (transport === 'lan' && !isActive.value && routeId.value) {
      void store.restoreSession(routeId.value)
    }
  })

  watch(
    () => store.lastCommandResult,
    (r) => {
      if (!r || r.success) return
      const key = `${r.requestId}:${r.at}`
      if (key === lastToastedResult) return
      lastToastedResult = key
      toast.warn('The table rejected the command', r.detail || undefined)
    },
  )

  return { ...control, routeId, isActive, state, retry }
}
