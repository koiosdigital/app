<template>
  <!-- The wrapper lays this out beside its label; the switch is the control. -->
  <USwitch
    :model-value="value === 'true' || value === true"
    @update:model-value="emit('update:value', $event ? 'true' : 'false')"
  />
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
