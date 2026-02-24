<template>
  <div>
    <!-- Color circle trigger -->
    <button
      type="button"
      class="h-8 w-8 rounded-full border-2 transition hover:scale-110"
      :class="resolvedValue ? 'border-white/20' : 'border-dashed border-white/30'"
      :style="resolvedValue ? { backgroundColor: resolvedValue } : {}"
      @click="isOpen = true"
    />

    <p v-if="error" class="mt-1 text-xs text-red-400">{{ error }}</p>

    <!-- Color picker modal -->
    <UModal v-model:open="isOpen" :ui="{ width: 'sm:max-w-sm' }">
      <template #content>
        <div class="flex flex-col bg-zinc-900">
          <!-- Header -->
          <div class="flex items-center gap-3 border-b border-white/10 px-4 py-3">
            <UButton
              color="neutral"
              variant="ghost"
              icon="i-fa6-solid:xmark"
              square
              size="sm"
              @click="isOpen = false"
            />
            <p class="font-medium text-white">Pick Color</p>
          </div>

          <!-- Color picker area -->
          <div class="flex flex-col items-center gap-4 p-4">
            <!-- Chrome-style color picker -->
            <div class="color-picker-wrapper w-full">
              <Chrome
                :model-value="draftColor"
                :disable-alpha="true"
                :disable-fields="true"
                @update:model-value="onPickerChange"
              />
            </div>

            <!-- Presets (palette) -->
            <div v-if="normalizedPalette.length" class="w-full">
              <p class="mb-2 text-xs font-medium text-white/50 uppercase tracking-wide">Presets</p>
              <div class="flex flex-wrap gap-2">
                <button
                  v-for="preset in normalizedPalette"
                  :key="preset"
                  type="button"
                  class="h-8 w-8 rounded-full border-2 transition hover:scale-110"
                  :class="draftColor === preset ? 'border-white' : 'border-transparent'"
                  :style="{ backgroundColor: preset }"
                  @click="selectPreset(preset)"
                />
              </div>
            </div>
          </div>

          <!-- Footer -->
          <div class="flex items-center justify-end gap-2 border-t border-white/10 p-3">
            <UButton color="neutral" variant="soft" @click="isOpen = false">Cancel</UButton>
            <UButton color="primary" @click="confirmColor">Confirm</UButton>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { Chrome } from '@ckpack/vue-color'
import type { components } from '@/types/api'

type ColorField = components['schemas']['AppSchemaColorFieldDto']

const props = defineProps<{
  field: ColorField
  value: unknown
  error?: string
}>()

const emit = defineEmits<{
  (e: 'update:value', value: string): void
}>()

const isOpen = ref(false)
const draftColor = ref('#ffffff')

/** Expand shorthand hex #RGB → #RRGGBB */
function expandHex(hex: string): string {
  const m = hex.match(/^#([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])$/)
  if (m) return `#${m[1]}${m[1]}${m[2]}${m[2]}${m[3]}${m[3]}`.toLowerCase()
  return hex.toLowerCase()
}

/** Resolve any CSS color string to a full 6-digit hex */
function resolveColor(color: string): string {
  if (/^#[0-9a-fA-F]{3}$/.test(color)) return expandHex(color)
  if (/^#[0-9a-fA-F]{6}$/.test(color)) return color.toLowerCase()
  const ctx = document.createElement('canvas').getContext('2d')
  if (!ctx) return color
  ctx.fillStyle = color
  return ctx.fillStyle
}

/** Palette values normalized to full hex */
const normalizedPalette = computed(() => (props.field.palette ?? []).map(resolveColor))

/** Display value resolved from prop */
const resolvedValue = computed(() => {
  if (!props.value) return ''
  return resolveColor(String(props.value))
})

/** Seed draft state when modal opens */
watch(isOpen, (open) => {
  if (open) {
    draftColor.value = resolvedValue.value || '#ffffff'
  }
})

function onPickerChange(val: { hex: string }) {
  draftColor.value = val.hex.toLowerCase()
}

function selectPreset(color: string) {
  draftColor.value = color
}

function confirmColor() {
  emit('update:value', draftColor.value)
  isOpen.value = false
}
</script>

<style scoped>
/* Override vue-color Chrome picker to fit dark theme and fill width */
.color-picker-wrapper :deep(.vc-chrome) {
  width: 100%;
  background-color: transparent;
  box-shadow: none;
  border-radius: 0;
}
</style>
