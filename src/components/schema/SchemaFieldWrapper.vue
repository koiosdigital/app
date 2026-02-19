<template>
  <div
    v-if="visibilityState.visible && field.type !== 'generated'"
    class="flex justify-between items-center"
    :class="{
      'opacity-50 pointer-events-none': visibilityState.disabled,
      'flex-col gap-2 items-start': field.type === 'oauth2' && field.user_defined_client,
    }"
  >
    <!-- Label row -->
    <div class="flex flex-col gap-1.5">
      <div v-if="field.name" class="flex items-center gap-2">
        <UIcon v-if="iconName" :name="iconName" class="h-4 w-4 text-white/60" />
        <label class="text-sm font-medium text-white/90">{{ field.name }}</label>
      </div>
      <p v-if="field.description" class="text-xs text-white/50">{{ field.description }}</p>
    </div>

    <!-- Field slot -->
    <slot />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { components } from '@/types/api'
import { getSchemaIconName } from '@/utils/schemaIcons'

type AppSchemaField = components['schemas']['AppSchemaDto']['schema'][number]

const props = defineProps<{
  field: AppSchemaField
  visibilityState: { visible: boolean; disabled: boolean }
}>()

const iconName = computed(() => getSchemaIconName(props.field.icon))
</script>
