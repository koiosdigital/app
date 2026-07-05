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

  // 56 is the well-known blank id in the shipped flap set; the find() keeps
  // us correct if the set is ever rearranged.
  const blankId = computed(() => flaps.value.find((f) => f.type === 'blank')?.id ?? 56)

  const groups = computed(() => ({
    glyphs: flaps.value.filter(
      (f) => f.type === 'letter' || f.type === 'digit' || f.type === 'special',
    ),
    colors: flaps.value.filter((f) => f.type === 'color'),
  }))

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

  return { flaps, byId, byGlyph, blankId, groups, ensureLoaded }
}
