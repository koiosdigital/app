<template>
  <div>
    <USelectMenu
      :model-value="value as string"
      :items="selectItems"
      value-key="value"
      placeholder="Select option"
      class="w-full"
      @update:model-value="handleSelect"
    >
      <template #item="{ item }">
        <span>{{ item.label }}</span>
      </template>
    </USelectMenu>
    <p v-if="error" class="mt-1 text-xs text-red-400">{{ error }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { components } from '@/types/api'

type DropdownField = components['schemas']['AppSchemaDropdownFieldDto']

interface SelectItem {
  label: string
  value: string
}

const props = defineProps<{
  field: DropdownField
  value: unknown
  error?: string
}>()

const emit = defineEmits<{
  (e: 'update:value', value: string): void
}>()

const selectItems = computed<SelectItem[]>(() => {
  return (props.field.options || []).map((opt) => ({
    label: opt.text || opt.display || opt.value,
    value: opt.value,
  }))
})

function handleSelect(selected: string | null) {
  emit('update:value', selected || '')
}
</script>
