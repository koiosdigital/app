<template>
  <PageLayout>
    <div v-if="loading" class="flex flex-1 items-center justify-center py-20">
      <UIcon name="i-fa6-solid:spinner" class="h-8 w-8 animate-spin text-white/50" />
    </div>

    <div v-else class="flex flex-col gap-5 px-5 py-6 pb-28">
      <UAlert v-if="error" color="error" icon="i-fa6-solid:circle-exclamation" :title="error" />

      <!-- Name -->
      <UFormField label="Name">
        <UInput v-model="name" placeholder="Preset name" size="lg" :maxlength="31" />
      </UFormField>

      <!-- Dimensions -->
      <div class="flex gap-3">
        <UFormField label="Width" class="flex-1">
          <UInputNumber v-model="width" :min="1" :max="32" @update:model-value="resize" />
        </UFormField>
        <UFormField label="Height" class="flex-1">
          <UInputNumber v-model="height" :min="1" :max="16" @update:model-value="resize" />
        </UFormField>
      </div>

      <!-- Canvas -->
      <UCard class="bg-white/5">
        <template #header><h3 class="text-sm font-semibold text-white/70">Canvas</h3></template>
        <div
          class="nemoto-canvas mx-auto"
          :style="{
            gridTemplateColumns: `repeat(${width}, minmax(0, 1fr))`,
            maxWidth: `${width * 28}px`,
          }"
          @pointerup="painting = false"
          @pointerleave="painting = false"
        >
          <button
            v-for="(cell, idx) in flatCells"
            :key="idx"
            type="button"
            class="nemoto-canvas__cell"
            @pointerdown="startPaint(idx)"
            @pointerenter="dragPaint(idx)"
          >
            <NemotoFlap :id="cell" />
          </button>
        </div>
      </UCard>

      <!-- Palette -->
      <UCard class="bg-white/5">
        <template #header><h3 class="text-sm font-semibold text-white/70">Brush</h3></template>
        <div class="flex flex-wrap gap-1.5">
          <button
            v-for="flap in flaps"
            :key="flap.id"
            type="button"
            class="nemoto-swatch"
            :class="{ 'nemoto-swatch--active': flap.id === brush }"
            :title="flap.label"
            @click="brush = flap.id"
          >
            <NemotoFlap :id="flap.id" />
          </button>
        </div>
      </UCard>
    </div>

    <Teleport to="#app-footer">
      <footer class="border-t border-white/10 bg-zinc-950/95 px-6 py-4 backdrop-blur">
        <UButton
          color="primary"
          size="lg"
          block
          :loading="saving"
          :disabled="saving || !name.trim()"
          @click="save"
        >
          {{ mode === 'create' ? 'Create Preset' : 'Save Changes' }}
        </UButton>
      </footer>
    </Teleport>
  </PageLayout>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import PageLayout from '@/layouts/PageLayout.vue'
import NemotoFlap from '@/components/nemoto/NemotoFlap.vue'
import { usePageHeader } from '@/composables/usePageHeader'
import { useNemotoFlaps } from '@/composables/useNemotoFlaps'
import { nemotoApi } from '@/lib/api/nemoto'
import { getErrorMessage } from '@/lib/api/errors'

const props = defineProps<{
  deviceId: string
  presetId?: number
  mode: 'create' | 'edit'
}>()

const router = useRouter()
const { setHeader } = usePageHeader()
const { flaps, ensureLoaded } = useNemotoFlaps()

const BLANK = 56 // blank flap id

const name = ref('')
const width = ref(22)
const height = ref(6)
const grid = ref<number[][]>([])
const brush = ref(0)
const painting = ref(false)

const loading = ref(true)
const saving = ref(false)
const error = ref<string>()

const flatCells = computed(() => grid.value.flat())

function blankGrid(w: number, h: number): number[][] {
  return Array.from({ length: h }, () => Array.from({ length: w }, () => BLANK))
}

function resize() {
  const w = Math.max(1, Math.min(32, width.value))
  const h = Math.max(1, Math.min(16, height.value))
  const next = blankGrid(w, h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      next[y][x] = grid.value[y]?.[x] ?? BLANK
    }
  }
  grid.value = next
}

function paintAt(index: number) {
  const x = index % width.value
  const y = Math.floor(index / width.value)
  if (grid.value[y]) grid.value[y][x] = brush.value
}

function startPaint(index: number) {
  painting.value = true
  paintAt(index)
}

function dragPaint(index: number) {
  if (painting.value) paintAt(index)
}

async function save() {
  saving.value = true
  error.value = undefined
  try {
    if (props.mode === 'create') {
      await nemotoApi.createPreset(props.deviceId, { name: name.value.trim(), flaps: grid.value })
    } else if (props.presetId != null) {
      await nemotoApi.updatePreset(props.deviceId, props.presetId, {
        name: name.value.trim(),
        flaps: grid.value,
      })
    }
    router.push(`/nemoto/${props.deviceId}/presets`)
  } catch (err) {
    error.value = getErrorMessage(err, 'Failed to save preset')
  } finally {
    saving.value = false
  }
}

onMounted(async () => {
  setHeader({
    title: props.mode === 'create' ? 'New Preset' : 'Edit Preset',
    backRoute: `/nemoto/${props.deviceId}/presets`,
  })
  await ensureLoaded()
  try {
    if (props.mode === 'edit' && props.presetId != null) {
      const preset = await nemotoApi.getPreset(props.deviceId, props.presetId)
      name.value = preset.name
      width.value = preset.width
      height.value = preset.height
      grid.value = preset.flaps.map((row) => [...row])
    } else {
      grid.value = blankGrid(width.value, height.value)
    }
  } catch (err) {
    error.value = getErrorMessage(err, 'Failed to load preset')
    grid.value = blankGrid(width.value, height.value)
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
.nemoto-canvas {
  display: grid;
  gap: 2px;
  width: 100%;
  touch-action: none;
}

.nemoto-canvas__cell {
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
}

.nemoto-swatch {
  width: 26px;
  height: 39px;
  padding: 0;
  border: 2px solid transparent;
  border-radius: 4px;
  background: transparent;
  cursor: pointer;
}

.nemoto-swatch--active {
  border-color: var(--ui-primary, #3b82f6);
}
</style>
