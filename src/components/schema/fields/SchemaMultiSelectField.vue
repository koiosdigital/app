<template>
  <div>
    <USelectMenu
      :model-value="selectedValues"
      :items="selectItems"
      value-key="value"
      multiple
      placeholder="Select options"
      class="w-full"
      :search-input="false"
      @update:model-value="handleSelect"
      :ui="{ base: 'min-w-32!' }"
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

type MultiSelectField = components['schemas']['AppSchemaMultiSelectFieldDto']

interface SelectItem {
  label: string
  value: string
}

/**
 * The config value is a JSON-encoded array of the selected options as
 * `{display, value}` pairs (same convention as typeahead's stored option
 * JSON). The menu models plain value strings; displays are re-resolved from
 * the field's options on emit.
 */

const props = defineProps<{
  field: MultiSelectField
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

const selectedValues = computed<string[]>(() => {
  if (typeof props.value !== 'string' || !props.value) return []
  try {
    const parsed = JSON.parse(props.value) as Array<{ value?: string }>
    if (!Array.isArray(parsed)) return []
    return parsed.map((o) => o?.value ?? '').filter(Boolean)
  } catch {
    return []
  }
})

function handleSelect(values: string[] | null) {
  const selected = (values ?? []).map((v) => {
    const opt = (props.field.options || []).find((o) => o.value === v)
    return { display: opt?.display || opt?.text || v, value: v }
  })
  emit('update:value', JSON.stringify(selected))
}
</script>
