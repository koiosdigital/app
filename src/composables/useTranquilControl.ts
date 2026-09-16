import { useRoute } from 'vue-router'
import { useTranquilStore } from '@/stores/tranquil'
import { LAN_CAPABILITIES } from '@/lib/tranquil/transport/lan'
import { CLOUD_CAPABILITIES } from '@/lib/tranquil/transport/cloud'
import type { TranquilCapabilities, TranquilTransportKind } from '@/lib/tranquil/client'

/**
 * Entry point for the Tranquil control views. A table is reached either
 * LAN-direct (`/tranquil/local/:id`) or over the cloud (`/tranquil/cloud/:id`);
 * the route decides the transport, and the ONE store drives whichever it is.
 *
 * Returns:
 *  - `store`        — the Tranquil store.
 *  - `transport`    — which transport this route uses (for copy only; gate
 *                     affordances on `capabilities`).
 *  - `capabilities` — what the route's transport supports. Static per route so
 *                     templates can read it before the connection is up.
 *  - `base`         — the current mode's device path prefix, for building links.
 *
 * On a cloud route it also (idempotently) binds the store to the route device,
 * so deep-links work without going through the home screen. On a LAN route the
 * session is restored by useTranquilSession() (mDNS re-resolve).
 */
export function useTranquilControl() {
  const route = useRoute()
  const id = String(route.params.id ?? '')
  const transport: TranquilTransportKind = route.path.startsWith('/tranquil/cloud/')
    ? 'cloud'
    : 'lan'
  const store = useTranquilStore()
  const capabilities: TranquilCapabilities =
    transport === 'cloud' ? CLOUD_CAPABILITIES : LAN_CAPABILITIES

  if (transport === 'cloud' && id) {
    const bound = store.activeDevice
    if (bound?.id !== id || bound.transport !== 'cloud') {
      store.connect({ transport: 'cloud', device: { id } })
    }
  }

  return {
    store,
    transport,
    capabilities,
    base: `/tranquil/${transport === 'cloud' ? 'cloud' : 'local'}/${encodeURIComponent(id)}`,
  }
}
