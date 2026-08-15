<template>
  <div class="flex flex-col gap-5 md:grid md:grid-cols-2 md:gap-x-10 md:gap-y-6">
    <template v-for="field in schema" :key="field.id">
      <SchemaFieldWrapper
        :field="field"
        :visibility-state="evaluateVisibility(field.visibility)"
        :error="errors[field.id]"
        :disabled-hint="describeDependency(field.visibility)"
      >
        <component
          :is="getFieldComponent(field.type)"
          :field="field"
          :value="values[field.id]"
          :error="errors[field.id]"
          :app-id="appId"
          v-bind="getExtraProps(field.type)"
          @update:value="(val: unknown) => emit('update:value', field.id, val)"
          @handler-result="(result: unknown) => emit('handler-result', field.id, result)"
        />
      </SchemaFieldWrapper>
    </template>
  </div>
</template>

<script setup lang="ts">
import { type Component, computed, defineAsyncComponent } from 'vue'
import type { components } from '@/types/api'
import SchemaFieldWrapper from './SchemaFieldWrapper.vue'

type AppSchemaField = components['schemas']['AppSchemaDto']['schema'][number]
type AppSchemaVisibility = components['schemas']['AppSchemaVisibilityDto']

const props = defineProps<{
  schema: AppSchemaField[]
  values: Record<string, unknown>
  errors: Record<string, string>
  appId: string
  // OAuth-related props
  deviceId?: string
  installationId?: string
  mode?: 'install' | 'edit'
  displayTime?: number
  skippedByUser?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:value', fieldId: string, value: unknown): void
  (e: 'handler-result', fieldId: string, result: unknown): void
}>()

/**
 * Loaded on demand. A schema typically uses two or three field types, but this
 * map used to pull all fifteen into the bundle up front — including a 436-line
 * GeoJSON editor and a Google Maps location picker — for any app that opened a
 * config form.
 */
const fieldComponentMap: Record<string, Component> = {
  text: defineAsyncComponent(() => import('./fields/SchemaTextField.vue')),
  dropdown: defineAsyncComponent(() => import('./fields/SchemaDropdownField.vue')),
  multiselect: defineAsyncComponent(() => import('./fields/SchemaMultiSelectField.vue')),
  radio: defineAsyncComponent(() => import('./fields/SchemaRadioField.vue')),
  onoff: defineAsyncComponent(() => import('./fields/SchemaOnOffField.vue')),
  color: defineAsyncComponent(() => import('./fields/SchemaColorField.vue')),
  datetime: defineAsyncComponent(() => import('./fields/SchemaDatetimeField.vue')),
  location: defineAsyncComponent(() => import('./fields/SchemaLocationField.vue')),
  locationbased: defineAsyncComponent(() => import('./fields/SchemaLocationBasedField.vue')),
  typeahead: defineAsyncComponent(() => import('./fields/SchemaTypeaheadField.vue')),
  oauth2: defineAsyncComponent(() => import('./fields/SchemaOAuthField.vue')),
  webcallback: defineAsyncComponent(() => import('./fields/SchemaWebCallbackField.vue')),
  png: defineAsyncComponent(() => import('./fields/SchemaPNGField.vue')),
  notification: defineAsyncComponent(() => import('./fields/SchemaNotificationField.vue')),
  geojson: defineAsyncComponent(() => import('./fields/SchemaGeoJSONField.vue')),
  // generated fields have no UI component - they are hidden by the wrapper
}

function getFieldComponent(type: string): Component {
  return fieldComponentMap[type] ?? fieldComponentMap.text
}

/**
 * A greyed-out field with no explanation is a dead end. The schema already
 * knows the dependency, so say it: "Available when Units is metric".
 */
function describeDependency(visibility: AppSchemaVisibility | undefined): string | undefined {
  if (!visibility || visibility.type === 'invisible') return undefined
  const source = props.schema.find((f) => f.id === visibility.variable)
  const label = source?.name || visibility.variable
  const value = String(visibility.value)
  return visibility.condition === 'equal'
    ? `Available while ${label} is not ${value}`
    : `Available while ${label} is ${value}`
}

const oauthProps = computed(() => ({
  deviceId: props.deviceId,
  installationId: props.installationId,
  mode: props.mode || 'install',
  formValues: props.values,
  displayTime: props.displayTime,
  skippedByUser: props.skippedByUser,
}))

const handlerProps = computed(() => ({
  formValues: props.values,
}))

function getExtraProps(type: string): Record<string, unknown> {
  if (type === 'oauth2' || type === 'webcallback') return oauthProps.value
  if (type === 'locationbased' || type === 'typeahead') return handlerProps.value
  return {}
}

function evaluateVisibility(visibility: AppSchemaVisibility | undefined): {
  visible: boolean
  disabled: boolean
} {
  if (!visibility) {
    return { visible: true, disabled: false }
  }

  const sourceValue = props.values[visibility.variable]
  const compareValue = visibility.value

  let conditionMet = false
  if (visibility.condition === 'equal') {
    conditionMet = String(sourceValue) === String(compareValue)
  } else if (visibility.condition === 'not_equal') {
    conditionMet = String(sourceValue) !== String(compareValue)
  }

  if (visibility.type === 'invisible') {
    return { visible: !conditionMet, disabled: false }
  } else {
    // disabled
    return { visible: true, disabled: conditionMet }
  }
}
</script>
