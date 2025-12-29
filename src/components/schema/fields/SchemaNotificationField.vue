<template>
  <div class="space-y-2">
    <USelectMenu
      :model-value="value as string"
      :items="soundItems"
      value-key="value"
      placeholder="Select notification sound"
      class="w-full"
      @update:model-value="handleSelect"
    >
      <template #item="{ item }">
        <span>{{ item.label }}</span>
      </template>
    </USelectMenu>

    <!-- Preview button -->
    <UButton
      v-if="value"
      size="xs"
      color="neutral"
      variant="ghost"
      icon="i-fa6-solid:play"
      @click="previewSound"
    >
      Preview
    </UButton>

    <p v-if="error" class="text-xs text-red-400">{{ error }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { components } from '@/types/api'

type NotificationField = components['schemas']['AppSchemaNotificationFieldDto']

const props = defineProps<{
  field: NotificationField
  value: unknown
  error?: string
}>()

const emit = defineEmits<{
  (e: 'update:value', value: string): void
}>()

interface SoundItem {
  label: string
  value: string
  path: string
}

const soundItems = computed<SoundItem[]>(() => {
  return (props.field.sounds || []).map((sound) => ({
    label: sound.title,
    value: sound.id,
    path: sound.path,
  }))
})

function handleSelect(selected: string | null) {
  emit('update:value', selected || '')
}

function previewSound() {
  const sound = soundItems.value.find((s) => s.value === props.value)
  if (sound?.path) {
    // Would need to construct full URL to sound file
    console.info('Would play sound:', sound.path)
  }
}
</script>
