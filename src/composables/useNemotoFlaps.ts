import { computed, ref } from 'vue'
import { nemotoApi, type NemotoFlapDef } from '@/lib/api/nemoto'

// The flap set is static and identical for every device, so cache it once at
// module scope and share across all components.
const flaps = ref<NemotoFlapDef[]>([])
let loaded = false
let inflight: Promise<void> | null = null

export function useNemotoFlaps() {
  const byId = computed(() => {
    const map = new Map<number, NemotoFlapDef>()
    for (const flap of flaps.value) map.set(flap.id, flap)
    return map
  })

  const byGlyph = computed(() => {
    const map = new Map<string, number>()
    for (const flap of flaps.value) {
      if (flap.glyph) map.set(flap.glyph.toUpperCase(), flap.id)
    }
    return map
  })

  async function ensureLoaded() {
    if (loaded) return
    if (!inflight) {
      inflight = nemotoApi
        .getFlaps()
        .then((res) => {
          flaps.value = res.flaps
          loaded = true
        })
        .finally(() => {
          inflight = null
        })
    }
    await inflight
  }

  return { flaps, byId, byGlyph, ensureLoaded }
}
