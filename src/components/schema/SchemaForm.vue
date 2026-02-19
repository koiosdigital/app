<template>
  <div class="space-y-4 md:grid md:grid-cols-2 md:gap-y-4 md:gap-x-16">
    <template v-for="field in schema" :key="field.id">
      <SchemaFieldWrapper :field="field" :visibility-state="evaluateVisibility(field.visibility)">
        <component
          :is="getFieldComponent(field.type)"
          :field="field"
          :value="values[field.id]"
          :error="errors[field.id]"
          :app-id="appId"
          v-bind="isOAuthField(field.type) ? oauthProps : {}"
          @update:value="(val: unknown) => emit('update:value', field.id, val)"
          @handler-result="(result: unknown) => emit('handler-result', field.id, result)"
        />
      </SchemaFieldWrapper>
    </template>
  </div>
</template>

<script setup lang="ts">
import { type Component, computed } from 'vue'
import type { components } from '@/types/api'
import SchemaFieldWrapper from './SchemaFieldWrapper.vue'
import SchemaTextField from './fields/SchemaTextField.vue'
import SchemaDropdownField from './fields/SchemaDropdownField.vue'
import SchemaRadioField from './fields/SchemaRadioField.vue'
import SchemaOnOffField from './fields/SchemaOnOffField.vue'
import SchemaColorField from './fields/SchemaColorField.vue'
import SchemaDatetimeField from './fields/SchemaDatetimeField.vue'
import SchemaLocationField from './fields/SchemaLocationField.vue'
import SchemaLocationBasedField from './fields/SchemaLocationBasedField.vue'
import SchemaTypeaheadField from './fields/SchemaTypeaheadField.vue'
import SchemaOAuthField from './fields/SchemaOAuthField.vue'
import SchemaPNGField from './fields/SchemaPNGField.vue'
import SchemaNotificationField from './fields/SchemaNotificationField.vue'

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

const fieldComponentMap: Record<string, Component> = {
  text: SchemaTextField,
  dropdown: SchemaDropdownField,
  radio: SchemaRadioField,
  onoff: SchemaOnOffField,
  color: SchemaColorField,
  datetime: SchemaDatetimeField,
  location: SchemaLocationField,
  locationbased: SchemaLocationBasedField,
  typeahead: SchemaTypeaheadField,
  oauth2: SchemaOAuthField,
  png: SchemaPNGField,
  notification: SchemaNotificationField,
  // generated fields have no UI component - they are hidden by the wrapper
}

function getFieldComponent(type: string): Component {
  return fieldComponentMap[type] || SchemaTextField
}

function isOAuthField(type: string): boolean {
  return type === 'oauth2'
}

const oauthProps = computed(() => ({
  deviceId: props.deviceId,
  installationId: props.installationId,
  mode: props.mode || 'install',
  formValues: props.values,
  displayTime: props.displayTime,
  skippedByUser: props.skippedByUser,
}))

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
