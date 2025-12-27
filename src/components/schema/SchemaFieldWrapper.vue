<template>
  <div
    v-if="visibilityState.visible && field.type !== 'generated'"
    class="space-y-1.5"
    :class="{ 'opacity-50 pointer-events-none': visibilityState.disabled }"
  >
    <!-- Label row -->
    <div v-if="field.name" class="flex items-center gap-2">
      <UIcon
        v-if="field.icon"
        :name="`i-lucide-${field.icon}`"
        class="h-4 w-4 text-white/60"
      />
      <label class="text-sm font-medium text-white/90">{{ field.name }}</label>
    </div>

    <!-- Field slot -->
    <slot />

    <!-- Description -->
    <p v-if="field.description" class="text-xs text-white/50">
      {{ field.description }}
    </p>
  </div>
</template>

<script setup lang="ts">
import type { components } from '@/types/api'

type AppSchemaField = components['schemas']['AppSchemaDto']['schema'][number]

defineProps<{
  field: AppSchemaField
  visibilityState: { visible: boolean; disabled: boolean }
}>()
</script>
