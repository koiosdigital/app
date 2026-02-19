<template>
  <div>
    <!-- Palette colors if available -->
    <div v-if="field.palette?.length" class="flex flex-wrap gap-2">
      <button
        v-for="color in field.palette"
        :key="color"
        type="button"
        class="h-8 w-8 rounded-full border-2 transition"
        :class="value === color ? 'border-white' : 'border-transparent'"
        :style="{ backgroundColor: mapColorToHex(color) }"
        @click="emit('update:value', mapColorToHex(color))"
      />
    </div>

    <!-- Fallback to color input -->
    <div v-else class="flex items-center gap-3">
      <input
        type="color"
        :value="String(value ?? '#ffffff')"
        class="h-10 w-14 cursor-pointer rounded border border-white/20 bg-transparent"
        @input="emit('update:value', ($event.target as HTMLInputElement).value)"
      />
      <UInput
        :model-value="String(value ?? '')"
        placeholder="#FFFFFF"
        class="flex-1"
        @update:model-value="emit('update:value', $event)"
      />
    </div>
    <p v-if="error" class="mt-1 text-xs text-red-400">{{ error }}</p>
  </div>
</template>

<script setup lang="ts">
import type { components } from '@/types/api'

type ColorField = components['schemas']['AppSchemaColorFieldDto']

defineProps<{
  field: ColorField
  value: unknown
  error?: string
}>()

const emit = defineEmits<{
  (e: 'update:value', value: string): void
}>()

const mapColorToHex = (color: string): string => {
  const ctx = document.createElement('canvas').getContext('2d')
  if (!ctx) return color
  ctx.fillStyle = color
  return ctx.fillStyle
}
</script>
