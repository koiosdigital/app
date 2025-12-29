<template>
  <div>
    <UInput type="datetime-local" :model-value="formattedValue" @update:model-value="handleInput" />
    <p v-if="error" class="mt-1 text-xs text-red-400">{{ error }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { components } from '@/types/api'

type DatetimeField = components['schemas']['AppSchemaDatetimeFieldDto']

const props = defineProps<{
  field: DatetimeField
  value: unknown
  error?: string
}>()

const emit = defineEmits<{
  (e: 'update:value', value: string): void
}>()

const formattedValue = computed(() => {
  if (!props.value) return ''
  try {
    const date = new Date(String(props.value))
    if (isNaN(date.getTime())) return String(props.value)
    // Format for datetime-local input: YYYY-MM-DDTHH:mm
    return date.toISOString().slice(0, 16)
  } catch {
    return String(props.value)
  }
})

function handleInput(val: string) {
  if (!val) {
    emit('update:value', '')
    return
  }
  // Convert to ISO format for API
  emit('update:value', new Date(val).toISOString())
}
</script>
