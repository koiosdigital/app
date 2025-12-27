<template>
  <div>
    <UInput
      :model-value="String(value ?? '')"
      :placeholder="field.name || 'Enter text'"
      :color="error ? 'error' : undefined"
      @update:model-value="emit('update:value', $event)"
    />
    <p v-if="error" class="mt-1 text-xs text-red-400">{{ error }}</p>
  </div>
</template>

<script setup lang="ts">
import type { components } from '@/types/api'

type TextField = components['schemas']['AppSchemaTextFieldDto']

defineProps<{
  field: TextField
  value: unknown
  error?: string
}>()

const emit = defineEmits<{
  (e: 'update:value', value: string): void
}>()
</script>
