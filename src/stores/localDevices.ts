import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import {
  isDiscoverySupported,
  watchKoiosDevices,
  type DiscoveryHandle,
  type LocalDevice,
} from '@/lib/mdns/discovery'

/**
 * Local devices discovered over mDNS (`_koiosdigital._tcp`). Native-only —
 * on web `supported` is false and `start()` is a no-op, so the store stays
 * empty and callers render nothing.
 */
export const useLocalDevicesStore = defineStore('local_devices', () => {
  // Reactive map keyed by Bonjour service name.
  const byId = ref<Record<string, LocalDevice>>({})
  const discovering = ref(false)
  const supported = isDiscoverySupported()

  // Non-reactive: the active watch handle (not part of rendered state).
  let handle: DiscoveryHandle | null = null

  const devices = computed<LocalDevice[]>(() =>
    Object.values(byId.value).sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
    ),
  )

  /** Begin discovery. Idempotent; a no-op on unsupported platforms. */
  async function start() {
    if (!supported || discovering.value) return
    discovering.value = true
    try {
      handle = await watchKoiosDevices((event) => {
        if (event.action === 'resolved') {
          // Re-resolves refresh address/TXT for the same instance.
          byId.value = { ...byId.value, [event.device.id]: event.device }
        } else {
          const next = { ...byId.value }
          delete next[event.device.id]
          byId.value = next
        }
      })
    } catch (err) {
      console.warn('Failed to start mDNS discovery', err)
      discovering.value = false
    }
  }

  /** Stop discovery and clear the discovered set. */
  async function stop() {
    discovering.value = false
    const active = handle
    handle = null
    byId.value = {}
    if (active) await active.stop()
  }

  return {
    devices,
    discovering,
    supported,
    start,
    stop,
  }
})
