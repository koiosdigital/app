import { ref, watch, type Ref } from 'vue'
import type { components } from '@/types/api'

type AppSchemaField = components['schemas']['AppSchemaDto']['schema'][number]
type AppSchemaVisibility = components['schemas']['AppSchemaVisibilityDto']

export interface VisibilityState {
  visible: boolean
  disabled: boolean
}

export function useSchemaForm(schema: Ref<AppSchemaField[] | undefined>) {
  const values = ref<Record<string, unknown>>({})
  const errors = ref<Record<string, string>>({})
  const generatedFieldTriggers = ref<Map<string, string[]>>(new Map())
  const configLoaded = ref(false)
  // Track if form has been initialized at least once to prevent resetting on schema changes
  const formInitialized = ref(false)

  /**
   * Initialize form values from schema defaults
   * Only sets values for fields that don't already have a value
   */
  function initializeFromSchema() {
    if (!schema.value) return

    console.log('[useSchemaForm] initializeFromSchema called, formInitialized:', formInitialized.value)
    console.log('[useSchemaForm] current values:', JSON.stringify(values.value))

    const triggers = new Map<string, string[]>()

    // If form is already initialized, only add defaults for NEW fields (don't overwrite existing)
    if (formInitialized.value) {
      for (const field of schema.value) {
        // Only set default if field doesn't have a value yet
        if (values.value[field.id] === undefined) {
          if (field.default !== undefined && field.type !== 'oauth2') {
            console.log(`[useSchemaForm] Setting default for NEW field ${field.id}:`, field.default)
            values.value = { ...values.value, [field.id]: field.default }
          } else if (field.type === 'onoff') {
            console.log(`[useSchemaForm] Setting default for NEW onoff field ${field.id}: false`)
            values.value = { ...values.value, [field.id]: 'false' }
          }
        }

        // Track generated field triggers
        if (field.type === 'generated' && 'source' in field && field.source) {
          const existing = triggers.get(field.source) || []
          existing.push(field.id)
          triggers.set(field.source, existing)
        }
      }
      generatedFieldTriggers.value = triggers
      return
    }

    // First initialization - set all defaults
    const initialValues: Record<string, unknown> = {}

    for (const field of schema.value) {
      // Set default value if present
      // Skip defaults for OAuth fields - they require actual authentication
      if (field.default !== undefined && field.type !== 'oauth2') {
        initialValues[field.id] = field.default
      } else if (field.type === 'onoff') {
        // Default to false for toggle fields
        initialValues[field.id] = 'false'
      }

      // Track generated field triggers (source field -> generated field ids)
      if (field.type === 'generated' && 'source' in field && field.source) {
        const existing = triggers.get(field.source) || []
        existing.push(field.id)
        triggers.set(field.source, existing)
      }
    }

    console.log('[useSchemaForm] First init, setting values:', JSON.stringify(initialValues))
    values.value = initialValues
    generatedFieldTriggers.value = triggers
    formInitialized.value = true
  }

  /**
   * Initialize form values from existing config (for edit mode)
   */
  function initializeFromConfig(config: Record<string, unknown>) {
    console.log('[useSchemaForm] initializeFromConfig called with:', JSON.stringify(config))
    configLoaded.value = true
    formInitialized.value = true
    values.value = { ...config }
  }

  /**
   * Update a single field value and clear any error for that field
   */
  function updateValue(fieldId: string, value: unknown) {
    console.log(`[useSchemaForm] updateValue called: ${fieldId} =`, value)
    values.value = { ...values.value, [fieldId]: value }

    // Clear error for this field if present
    if (errors.value[fieldId]) {
      const newErrors = { ...errors.value }
      delete newErrors[fieldId]
      errors.value = newErrors
    }
  }

  /**
   * Set validation errors from API response
   */
  function setErrors(validationErrors: Array<{ field: string; message: string }>) {
    const newErrors: Record<string, string> = {}
    for (const err of validationErrors) {
      newErrors[err.field] = err.message
    }
    errors.value = newErrors
  }

  /**
   * Clear all validation errors
   */
  function clearErrors() {
    errors.value = {}
  }

  /**
   * Evaluate visibility condition for a field
   */
  function evaluateVisibility(visibility: AppSchemaVisibility | undefined): VisibilityState {
    if (!visibility) {
      return { visible: true, disabled: false }
    }

    const sourceValue = values.value[visibility.variable]
    const compareValue = visibility.value

    let conditionMet = false
    if (visibility.condition === 'equal') {
      conditionMet = String(sourceValue) === String(compareValue)
    } else if (visibility.condition === 'not_equal') {
      conditionMet = String(sourceValue) !== String(compareValue)
    }

    if (visibility.type === 'invisible') {
      // If condition is met, field should be invisible
      return { visible: !conditionMet, disabled: false }
    } else {
      // disabled - if condition is met, field should be disabled
      return { visible: true, disabled: conditionMet }
    }
  }

  /**
   * Get list of generated field IDs that depend on a source field
   */
  function getGeneratedFieldsForSource(sourceFieldId: string): string[] {
    return generatedFieldTriggers.value.get(sourceFieldId) || []
  }

  /**
   * Reset the form to initial state
   */
  function reset() {
    values.value = {}
    errors.value = {}
    generatedFieldTriggers.value = new Map()
    initializeFromSchema()
  }

  // Initialize from schema defaults only if config wasn't already loaded
  watch(
    schema,
    (newSchema, oldSchema) => {
      console.log('[useSchemaForm] schema watcher triggered')
      console.log('[useSchemaForm] configLoaded:', configLoaded.value, 'formInitialized:', formInitialized.value)
      console.log('[useSchemaForm] old schema fields:', oldSchema?.length, 'new schema fields:', newSchema?.length)
      if (!configLoaded.value) {
        initializeFromSchema()
      } else {
        console.log('[useSchemaForm] configLoaded is true, skipping initializeFromSchema but updating triggers')
        // Still need to update generated field triggers when schema changes
        if (newSchema) {
          const triggers = new Map<string, string[]>()
          for (const field of newSchema) {
            if (field.type === 'generated' && 'source' in field && field.source) {
              const existing = triggers.get(field.source) || []
              existing.push(field.id)
              triggers.set(field.source, existing)
            }
          }
          generatedFieldTriggers.value = triggers
        }
      }
    },
    { immediate: true },
  )

  return {
    values,
    errors,
    initializeFromSchema,
    initializeFromConfig,
    updateValue,
    setErrors,
    clearErrors,
    evaluateVisibility,
    getGeneratedFieldsForSource,
    reset,
  }
}
