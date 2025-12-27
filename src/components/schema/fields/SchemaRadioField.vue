<template>
  <div class="space-y-2">
    <URadioGroup
      :model-value="String(value ?? '')"
      :options="radioOptions"
      @update:model-value="handleUpdate"
    />
    <p v-if="error" class="mt-1 text-xs text-red-400">{{ error }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { components } from '@/types/api'

type RadioField = components['schemas']['AppSchemaRadioFieldDto']

const props = defineProps<{
  field: RadioField
  value: unknown
  error?: string
}>()

const emit = defineEmits<{
  (e: 'update:value', value: string): void
}>()

const radioOptions = computed(() => {
  return (props.field.options || []).map((opt) => ({
    label: opt.text || opt.display || opt.value,
    value: opt.value,
  }))
})

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function handleUpdate(val: any) {
  emit('update:value', String(val ?? ''))
}
</script>
