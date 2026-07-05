<template>
  <div class="flex flex-col gap-3">
    <!-- Mode toggle -->
    <div class="flex flex-wrap items-center gap-2">
      <div class="inline-flex rounded-lg border border-white/10 bg-white/5 p-0.5">
        <button
          v-for="m in MODES"
          :key="m.id"
          type="button"
          class="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-colors"
          :class="mode === m.id ? 'bg-primary-500 text-white' : 'text-white/60 hover:text-white'"
          @click="mode = m.id"
        >
          <UIcon :name="m.icon" class="h-3.5 w-3.5" />
          {{ m.id }}
        </button>
      </div>
      <span class="text-xs text-white/40">{{ modeHint }}</span>
      <div class="flex-1" />
      <UButton color="neutral" variant="ghost" size="xs" icon="i-fa6-solid:eraser" @click="clear">
        Clear
      </UButton>
    </div>

    <!-- Canvas -->
    <div class="-mx-2 overflow-x-auto rounded-lg bg-black/50 p-3 ring-1 ring-white/10 sm:mx-0">
      <div
        ref="canvasEl"
        class="nemoto-canvas mx-auto"
        :style="{
          gridTemplateColumns: `repeat(${width}, minmax(0, 1fr))`,
          maxWidth: `${width * 34}px`,
        }"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="stopPainting"
        @pointercancel="stopPainting"
      >
        <div
          v-for="(cell, idx) in flatCells"
          :key="idx"
          class="nemoto-canvas__cell"
          :data-idx="idx"
        >
          <NemotoFlap :id="cell" />
          <div v-if="mode === 'type' && cursorIdx === idx" class="nemoto-canvas__cursor" />
        </div>
      </div>
    </div>

    <!-- Palette: glyphs, then color swatches (picking one switches to paint) -->
    <div class="flex flex-col gap-2 rounded-lg border border-white/10 bg-white/5 p-3">
      <div class="flex flex-wrap gap-1">
        <button
          v-for="f in groups.glyphs"
          :key="f.id"
          type="button"
          class="flex h-8 w-8 items-center justify-center rounded border font-mono text-sm transition-colors"
          :class="
            brush === f.id && mode === 'paint'
              ? 'border-primary-500 bg-primary-500 text-white'
              : 'border-white/10 bg-white/5 text-white/80 hover:bg-white/10'
          "
          :title="f.label"
          @click="pickBrush(f.id)"
        >
          {{ f.glyph }}
        </button>
      </div>
      <div v-if="groups.colors.length" class="flex flex-wrap gap-1 border-t border-white/10 pt-2">
        <button
          v-for="f in groups.colors"
          :key="f.id"
          type="button"
          class="h-8 w-8 rounded border-2 transition-all"
          :class="
            brush === f.id && mode === 'paint'
              ? 'scale-110 border-primary-500'
              : 'border-transparent hover:border-white/30'
          "
          :style="{ backgroundColor: f.color ?? '#000' }"
          :title="f.label"
          @click="pickBrush(f.id)"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import NemotoFlap from '@/components/nemoto/NemotoFlap.vue'
import { useNemotoFlaps } from '@/composables/useNemotoFlaps'

// Same editing model as the on-device UI (nemoto-app Editor): a type mode
// with a cell cursor + hardware-keyboard entry, paint/erase drag modes, and
// a palette grouped into glyphs and color swatches.
type Mode = 'type' | 'paint' | 'erase'

const grid = defineModel<number[][]>({ required: true })

const { byGlyph, blankId, groups } = useNemotoFlaps()

const MODES: Array<{ id: Mode; icon: string }> = [
  { id: 'type', icon: 'i-fa6-solid:i-cursor' },
  { id: 'paint', icon: 'i-fa6-solid:paintbrush' },
  { id: 'erase', icon: 'i-fa6-solid:eraser' },
]

const mode = ref<Mode>('paint')
const brush = ref<number | null>(null)
const cursorIdx = ref(0)
const painting = ref(false)
const canvasEl = ref<HTMLElement | null>(null)

const width = computed(() => grid.value[0]?.length ?? 0)
const height = computed(() => grid.value.length)
const flatCells = computed(() => grid.value.flat())

const modeHint = computed(() => {
  if (mode.value === 'type') return 'Tap a cell, then type'
  if (mode.value === 'paint') return 'Drag to paint'
  return 'Drag to erase'
})

function setCell(x: number, y: number, flapId: number) {
  const row = grid.value[y]
  if (!row || x < 0 || x >= row.length || row[x] === flapId) return
  row[x] = flapId
}

function setCellAt(idx: number, flapId: number) {
  setCell(idx % width.value, Math.floor(idx / width.value), flapId)
}

function clear() {
  const bl = blankId.value
  grid.value = grid.value.map((row) => row.map(() => bl))
}

function pickBrush(id: number) {
  brush.value = id
  mode.value = 'paint'
}

// ---- Pointer painting -------------------------------------------------------
// Hit-test via elementFromPoint instead of per-cell pointerenter: with touch
// input the down-target implicitly captures the pointer, so enter events
// never fire on sibling cells and drag-painting would only ever hit one cell.
function cellIndexFromEvent(e: PointerEvent): number | null {
  const el = document.elementFromPoint(e.clientX, e.clientY)
  const cell = el?.closest<HTMLElement>('[data-idx]')
  if (!cell || !canvasEl.value?.contains(cell)) return null
  const idx = Number(cell.dataset.idx)
  return Number.isInteger(idx) ? idx : null
}

function applyBrushAt(idx: number) {
  if (mode.value === 'erase') {
    setCellAt(idx, blankId.value)
  } else if (mode.value === 'paint' && brush.value != null) {
    setCellAt(idx, brush.value)
  }
}

function onPointerDown(e: PointerEvent) {
  const idx = cellIndexFromEvent(e)
  if (idx == null) return
  if (mode.value === 'type') {
    cursorIdx.value = idx
    return
  }
  e.preventDefault()
  painting.value = true
  applyBrushAt(idx)
}

function onPointerMove(e: PointerEvent) {
  if (!painting.value) return
  const idx = cellIndexFromEvent(e)
  if (idx != null) applyBrushAt(idx)
}

function stopPainting() {
  painting.value = false
}

// ---- Keyboard entry (type mode, hardware keyboards) --------------------------
function isEditableTarget(e: Event): boolean {
  const t = e.target as HTMLElement | null
  if (!t) return false
  return t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable
}

function moveCursor(dx: number, dy: number) {
  const x = Math.max(0, Math.min(width.value - 1, (cursorIdx.value % width.value) + dx))
  const y = Math.max(0, Math.min(height.value - 1, Math.floor(cursorIdx.value / width.value) + dy))
  cursorIdx.value = y * width.value + x
}

function onKeyDown(e: KeyboardEvent) {
  if (isEditableTarget(e)) return

  if (e.key === '1') {
    mode.value = 'type'
    return
  }
  if (e.key === '2') {
    mode.value = 'paint'
    return
  }
  if (e.key === '3') {
    mode.value = 'erase'
    return
  }

  if (mode.value !== 'type') return
  const x = cursorIdx.value % width.value
  const y = Math.floor(cursorIdx.value / width.value)

  if (e.key === 'ArrowLeft') {
    moveCursor(-1, 0)
  } else if (e.key === 'ArrowRight') {
    moveCursor(1, 0)
  } else if (e.key === 'ArrowUp') {
    moveCursor(0, -1)
  } else if (e.key === 'ArrowDown') {
    moveCursor(0, 1)
  } else if (e.key === 'Enter') {
    cursorIdx.value = Math.min(height.value - 1, y + 1) * width.value
  } else if (e.key === 'Backspace') {
    const nx = Math.max(0, x - 1)
    setCell(nx, y, blankId.value)
    cursorIdx.value = y * width.value + nx
  } else if (e.key === 'Delete') {
    setCell(x, y, blankId.value)
  } else if (e.key === ' ') {
    setCell(x, y, blankId.value)
    if (x < width.value - 1) cursorIdx.value += 1
  } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
    const id = byGlyph.value.get(e.key.toUpperCase())
    if (id != null) {
      setCell(x, y, id)
      if (x < width.value - 1) cursorIdx.value += 1
    }
  } else {
    return
  }
  e.preventDefault()
}

onMounted(() => window.addEventListener('keydown', onKeyDown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeyDown))
</script>

<style scoped>
.nemoto-canvas {
  display: grid;
  gap: 2px;
  width: 100%;
  touch-action: none;
}

.nemoto-canvas__cell {
  position: relative;
  cursor: pointer;
}

.nemoto-canvas__cursor {
  position: absolute;
  inset: 0;
  border-radius: 3px;
  pointer-events: none;
  box-shadow: inset 0 0 0 2px var(--ui-primary, #3b82f6);
}
</style>
