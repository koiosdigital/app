<template>
  <div class="flex items-center justify-between">
    <span v-if="!hideLabel" class="text-sm text-white/70">{{ field.name }}</span>
    <USwitch
      :model-value="value === 'true' || value === true"
      @update:model-value="emit('update:value', $event ? 'true' : 'false')"
    />
  </div>
</template>

<script setup lang="ts">
import type { components } from '@/types/api'

type OnOffField = components['schemas']['AppSchemaOnOffFieldDto']

defineProps<{
  field: OnOffField
  value: unknown
  error?: string
  hideLabel?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:value', value: string): void
}>()
</script>
