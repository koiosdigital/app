import { useRoute } from 'vue-router'
import { useTranquilLocalStore } from '@/stores/tranquilLocal'
import { useTranquilCloudStore } from '@/stores/tranquilCloud'

/**
 * Transport-agnostic entry point for the Tranquil control views. A table is
 * reached either LAN-direct (`/tranquil/local/:id`) or over the cloud
 * (`/tranquil/cloud/:id`); both stores expose the same public surface, so a
 * view can drive whichever this resolves to.
 *
 * Returns:
 *  - `store`  — the active store (typed as the local store; the cloud store is
 *               structurally compatible for the shared surface).
 *  - `isCloud`— true on the cloud route (views hide LAN-only affordances).
 *  - `base`   — the current mode's device path prefix, for building links.
 *
 * On a cloud route it also (idempotently) connects the cloud store to the route
 * device, so deep-links work without going through the home screen.
 */
export function useTranquilControl() {
  const route = useRoute()
  const id = String(route.params.id ?? '')
  const isCloud = route.path.startsWith('/tranquil/cloud/')

  if (isCloud) {
    const cloud = useTranquilCloudStore()
    if (id && cloud.activeDevice?.id !== id) cloud.connect({ id })
    return {
      store: cloud as unknown as ReturnType<typeof useTranquilLocalStore>,
      isCloud: true,
      base: `/tranquil/cloud/${encodeURIComponent(id)}`,
    }
  }

  return {
    store: useTranquilLocalStore(),
    isCloud: false,
    base: `/tranquil/local/${encodeURIComponent(id)}`,
  }
}
