<template>
  <div>
    <!-- Value selected: show badge -->
    <div
      v-if="isSet"
      class="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3 py-1"
    >
      <div class="flex items-center gap-2 min-w-0">
        <UIcon name="i-fa6-solid:location-dot" class="h-4 w-4 shrink-0 text-primary-400" />
        <span class="truncate text-sm text-white/80 max-w-32 lg:max-w-48">
          {{ parsedDisplay }}
        </span>
      </div>
      <button type="button" class="shrink-0 rounded p-1 hover:bg-white/10" @click="clearSelection">
        <UIcon name="i-fa6-solid:xmark" class="h-4 w-4 text-red-400" />
      </button>
    </div>

    <!-- No value: show select button -->
    <UButton
      v-else
      color="neutral"
      variant="soft"
      icon="i-fa6-solid:location-dot"
      @click="openPicker"
    >
      Select
    </UButton>

    <p v-if="error" class="mt-1 text-xs text-red-400">{{ error }}</p>

    <!-- Modal with stepper -->
    <UModal v-model:open="isOpen" :ui="{ width: 'sm:max-w-xl' }">
      <template #content>
        <div class="flex h-[75vh] flex-col bg-zinc-900">
          <!-- Header -->
          <div class="flex items-center gap-3 border-b border-white/10 px-4 py-3">
            <UButton
              color="neutral"
              variant="ghost"
              icon="i-fa6-solid:xmark"
              square
              size="sm"
              @click="isOpen = false"
            />
            <p class="font-medium text-white">{{ field.name || 'Select Option' }}</p>
          </div>

          <!-- Stepper -->
          <div class="px-4 pt-3">
            <UStepper v-model="activeStep" :items="stepperItems" size="sm" color="primary" />
          </div>

          <!-- Step 1: Location picker -->
          <template v-if="activeStep === 'location'">
            <div class="flex-1 mt-3">
              <GoogleMap
                :api-key="apiKey"
                :libraries="['marker']"
                :center="mapCenter"
                :zoom="mapZoom"
                :disable-default-ui="true"
                :zoom-control="true"
                gesture-handling="greedy"
                background-color="#09090b"
                map-id="koios-locationbased-picker"
                style="width: 100%; height: 100%"
                @click="onMapClick"
              >
                <AdvancedMarker
                  v-if="pendingLocation"
                  :options="{ position: pendingLocation, gmpDraggable: true }"
                  @dragend="onMarkerDragEnd"
                />
              </GoogleMap>
            </div>

            <div class="flex items-center gap-2 border-t border-white/10 p-3">
              <UButton
                color="neutral"
                variant="soft"
                icon="i-fa6-solid:location-crosshairs"
                :loading="locating"
                @click="useCurrentLocation"
              >
                Use Current Location
              </UButton>
              <div class="flex-1" />
              <UButton
                color="primary"
                :disabled="!pendingLocation"
                :loading="fetching"
                @click="goToSelect"
              >
                Next
              </UButton>
            </div>
          </template>

          <!-- Step 2: Select from options -->
          <template v-if="activeStep === 'select'">
            <!-- Loading -->
            <div v-if="fetching" class="flex flex-1 items-center justify-center">
              <UIcon name="i-fa6-solid:spinner" class="h-6 w-6 animate-spin text-white/50" />
            </div>

            <!-- Error -->
            <div
              v-else-if="fetchError"
              class="flex flex-1 flex-col items-center justify-center px-4"
            >
              <UIcon name="i-fa6-solid:circle-exclamation" class="h-8 w-8 text-red-400" />
              <p class="mt-2 text-sm text-red-400">{{ fetchError }}</p>
            </div>

            <!-- Empty -->
            <div
              v-else-if="options.length === 0"
              class="flex flex-1 flex-col items-center justify-center"
            >
              <UIcon name="i-fa6-solid:list" class="h-8 w-8 text-white/30" />
              <p class="mt-2 text-sm text-white/50">No options found</p>
            </div>

            <!-- Options list -->
            <div v-else class="mt-4 flex-1 overflow-y-auto divide-y divide-white/5">
              <button
                v-for="option in options"
                :key="option.value"
                type="button"
                class="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-white/5"
                :class="{ 'bg-primary-500/10': option.value === parsedValue?.value }"
                @click="selectOption(option)"
              >
                <UIcon
                  v-if="option.value === parsedValue?.value"
                  name="i-fa6-solid:check"
                  class="h-4 w-4 text-primary-400"
                />
                <div :class="{ 'pl-7': option.value !== parsedValue?.value }">
                  <p class="font-medium text-white">
                    {{ option.text || option.display || option.value }}
                  </p>
                  <p v-if="option.display && option.text" class="text-xs text-white/50">
                    {{ option.display }}
                  </p>
                </div>
              </button>
            </div>

            <div class="flex items-center gap-2 border-t border-white/10 p-3">
              <UButton color="neutral" variant="soft" icon="i-fa6-solid:arrow-left" @click="goBack">
                Back
              </UButton>
            </div>
          </template>
        </div>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, defineAsyncComponent } from 'vue'
import { Geolocation } from '@capacitor/geolocation'
import type { components } from '@/types/api'
import { ENV } from '@/config/environment'
import { appsApi } from '@/lib/api/apps'
import { getErrorMessage } from '@/lib/api/errors'

const GoogleMap = defineAsyncComponent(() => import('vue3-google-map').then((m) => m.GoogleMap))
const AdvancedMarker = defineAsyncComponent(() =>
  import('vue3-google-map').then((m) => m.AdvancedMarker),
)

interface LatLng {
  lat: number
  lng: number
}

type LocationBasedField = components['schemas']['AppSchemaLocationBasedFieldDto']
type Option = components['schemas']['AppSchemaOptionDto']

const props = defineProps<{
  field: LocationBasedField
  value?: string
  error?: string
  appId: string
  formValues?: Record<string, unknown>
}>()

const emit = defineEmits<{
  (e: 'update:value', value: string): void
  (e: 'handler-result', result: unknown): void
}>()

const apiKey = ENV.googleMapsApiKey()

const stepperItems = [
  { value: 'location', title: 'Location', icon: 'i-fa6-solid:location-dot' as const },
  { value: 'select', title: 'Select', icon: 'i-fa6-solid:list' as const },
]

// Modal state
const isOpen = ref(false)
const activeStep = ref<string | number>('location')

// Map state
const pendingLocation = ref<LatLng | null>(null)
const locating = ref(false)
const mapCenter = ref<LatLng>({ lat: 37.7749, lng: -122.4194 })
const mapZoom = ref(12)

// Handler state
const fetching = ref(false)
const fetchError = ref<string>()
const options = ref<Option[]>([])

function buildConfig(): Record<string, string> {
  const config: Record<string, string> = {}
  if (props.formValues) {
    for (const [k, v] of Object.entries(props.formValues)) {
      if (v != null) config[k] = String(v)
    }
  }
  return config
}

const parsedValue = computed<{ display: string; value: string } | null>(() => {
  if (!props.value) return null
  try {
    const parsed = JSON.parse(props.value)
    if (!parsed.value) return null
    return parsed as { display: string; value: string }
  } catch {
    return null
  }
})

const isSet = computed(() => !!parsedValue.value?.value)
const parsedDisplay = computed(() => parsedValue.value?.display || parsedValue.value?.value || '')

function openPicker() {
  pendingLocation.value = null
  options.value = []
  fetchError.value = undefined
  activeStep.value = 'location'
  isOpen.value = true
}

function onMapClick(event: google.maps.MapMouseEvent) {
  if (!event.latLng) return
  pendingLocation.value = { lat: event.latLng.lat(), lng: event.latLng.lng() }
}

function onMarkerDragEnd(event: google.maps.MapMouseEvent) {
  if (!event.latLng) return
  pendingLocation.value = { lat: event.latLng.lat(), lng: event.latLng.lng() }
}

async function useCurrentLocation() {
  locating.value = true
  try {
    const position = await Geolocation.getCurrentPosition({
      enableHighAccuracy: true,
      timeout: 10000,
    })

    const pos = { lat: position.coords.latitude, lng: position.coords.longitude }
    pendingLocation.value = pos
    mapCenter.value = pos
  } catch (err) {
    console.error('Geolocation error:', err)
  } finally {
    locating.value = false
  }
}

async function goToSelect() {
  if (!pendingLocation.value || !props.field.handler) return

  fetching.value = true
  fetchError.value = undefined
  activeStep.value = 'select'

  try {
    const locationData = {
      lat: pendingLocation.value.lat,
      lng: pendingLocation.value.lng,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    }

    const response = await appsApi.callHandler(
      props.appId,
      props.field.handler,
      buildConfig(),
      JSON.stringify(locationData),
    )

    if (response?.result) {
      try {
        const parsed = JSON.parse(response.result)
        options.value = Array.isArray(parsed) ? parsed : []
      } catch {
        options.value = []
      }
      emit('handler-result', response.result)
    }
  } catch (err) {
    fetchError.value = getErrorMessage(err, 'Failed to fetch options')
  } finally {
    fetching.value = false
  }
}

function goBack() {
  activeStep.value = 'location'
}

function selectOption(option: Option) {
  const value = {
    display: option.display || option.text,
    value: option.value,
  }
  emit('update:value', JSON.stringify(value))
  isOpen.value = false
}

function clearSelection() {
  emit('update:value', '')
}
</script>
