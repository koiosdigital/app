<template>
  <div class="space-y-3">
    <!-- Fetch location options button -->
    <UButton
      v-if="field.handler"
      color="neutral"
      variant="soft"
      icon="i-fa6-solid:location-dot"
      :loading="fetching"
      @click="fetchLocationOptions"
    >
      {{ options.length > 0 ? 'Refresh Options' : 'Get Location Options' }}
    </UButton>

    <!-- Options list -->
    <div
      v-if="options.length > 0"
      class="max-h-48 overflow-y-auto rounded-lg border border-white/10 bg-zinc-900"
    >
      <button
        v-for="option in options"
        :key="option.value"
        type="button"
        class="w-full px-3 py-2 text-left text-sm hover:bg-white/10 transition"
        :class="{ 'bg-white/5': option.value === value }"
        @click="selectOption(option)"
      >
        {{ option.text || option.display || option.value }}
      </button>
    </div>

    <!-- Selected value display -->
    <div
      v-if="value && options.length === 0"
      class="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3 py-2"
    >
      <span class="text-sm text-white/70">{{ displayValue }}</span>
      <button type="button" class="p-1 rounded hover:bg-white/10" @click="clearSelection">
        <UIcon name="i-fa6-solid:xmark" class="h-4 w-4 text-white/50" />
      </button>
    </div>

    <p v-if="fetchError" class="text-xs text-red-400">{{ fetchError }}</p>
    <p v-if="error" class="text-xs text-red-400">{{ error }}</p>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import type { components } from '@/types/api'
import { appsApi } from '@/lib/api/apps'
import { getErrorMessage } from '@/lib/api/errors'

type LocationBasedField = components['schemas']['AppSchemaLocationBasedFieldDto']
type Option = components['schemas']['AppSchemaOptionDto']

const props = defineProps<{
  field: LocationBasedField
  value: unknown
  error?: string
  appId: string
  formValues?: Record<string, unknown>
}>()

const emit = defineEmits<{
  (e: 'update:value', value: string): void
  (e: 'handler-result', result: unknown): void
}>()

function buildConfig(): Record<string, string> {
  const config: Record<string, string> = {}
  if (props.formValues) {
    for (const [k, v] of Object.entries(props.formValues)) {
      if (v != null) config[k] = String(v)
    }
  }
  return config
}

const fetching = ref(false)
const fetchError = ref<string>()
const options = ref<Option[]>([])

const displayValue = computed(() => {
  if (!props.value) return ''
  // Check if we have the option in our cache
  const found = options.value.find((o) => o.value === props.value)
  if (found) return found.text || found.display || found.value
  // Try to parse if it's JSON
  try {
    const parsed = JSON.parse(String(props.value))
    return parsed.text || parsed.display || String(props.value)
  } catch {
    return String(props.value)
  }
})

async function fetchLocationOptions() {
  if (!props.field.handler) return

  fetching.value = true
  fetchError.value = undefined

  try {
    // Get current location first
    const position = await new Promise<GeolocationPosition>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 10000,
      })
    })

    const locationData = {
      lat: position.coords.latitude,
      lng: position.coords.longitude,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    }

    const response = await appsApi.callHandler(
      props.appId,
      props.field.handler,
      buildConfig(),
      JSON.stringify(locationData),
    )

    if (response?.result) {
      // Result is JSON string of options array
      try {
        const parsed = JSON.parse(response.result)
        options.value = Array.isArray(parsed) ? parsed : []
      } catch {
        options.value = []
      }
      emit('handler-result', response.result)
    }
  } catch (err) {
    fetchError.value = getErrorMessage(err, 'Failed to fetch location options')
  } finally {
    fetching.value = false
  }
}

function selectOption(option: Option) {
  emit('update:value', option.value)
  options.value = [] // Clear options after selection
}

function clearSelection() {
  emit('update:value', '')
}
</script>
