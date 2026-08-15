<template>
  <!-- `inert` rather than pointer-events-none: a field the UI shows as
       unavailable was still reachable by keyboard and by screen reader, so it
       could be changed while looking disabled. -->
  <div
    v-if="visibilityState.visible && field.type !== 'generated'"
    class="k-field"
    :class="{ 'k-field--inline': inline, 'k-field--off': visibilityState.disabled }"
    :inert="visibilityState.disabled || undefined"
  >
    <div class="k-field__label">
      <div v-if="field.name" class="flex items-center gap-2">
        <UIcon v-if="iconName" :name="iconName" class="h-4 w-4 shrink-0 text-dimmed" />
        <label class="text-sm font-medium text-highlighted">{{ field.name }}</label>
      </div>
      <p v-if="field.description" class="k-field__description">{{ field.description }}</p>
    </div>

    <div class="k-field__control">
      <slot />
    </div>

    <!-- One place for errors. Twelve fields used to render this paragraph
         themselves and three accepted an error they never showed. -->
    <p v-if="error" class="k-field__error">{{ error }}</p>
    <p v-else-if="visibilityState.disabled && disabledHint" class="k-field__hint">
      {{ disabledHint }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { components } from '@/types/api'
import { getSchemaIconName } from '@/utils/schemaIcons'

type AppSchemaField = components['schemas']['AppSchemaDto']['schema'][number]

/**
 * Controls small enough to sit beside their label. Everything else stacks, so
 * a text input or a dropdown gets the full width instead of whatever is left
 * over after a long field name and its description.
 */
const INLINE_TYPES = new Set(['onoff'])

const props = defineProps<{
  field: AppSchemaField
  visibilityState: { visible: boolean; disabled: boolean }
  error?: string
  /** Why this field is currently unavailable, in the user's terms. */
  disabledHint?: string
}>()

const iconName = computed(() => getSchemaIconName(props.field.icon))
const inline = computed(() => INLINE_TYPES.has(props.field.type))
</script>

<style scoped>
.k-field {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.k-field--off {
  opacity: 0.5;
}

/* A switch reads naturally on the same line as its label. */
.k-field--inline {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  column-gap: 16px;
}
.k-field--inline .k-field__error,
.k-field--inline .k-field__hint {
  grid-column: 1 / -1;
}

.k-field__label {
  min-width: 0;
}

.k-field__description {
  margin-top: 3px;
  font-size: 12px;
  line-height: 1.45;
  color: var(--ui-text-muted);
  text-wrap: pretty;
}

.k-field__control {
  min-width: 0;
}

.k-field__error {
  font-size: 12px;
  color: var(--ui-error);
}

.k-field__hint {
  font-size: 12px;
  color: var(--ui-text-dimmed);
}
</style>
