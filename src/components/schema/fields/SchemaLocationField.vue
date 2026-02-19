<template>
  <div>
    <!-- Location set: show label + clear button -->
    <div
      v-if="isSet"
      class="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3 py-1"
    >
      <div class="flex items-center gap-2 min-w-0">
        <UIcon name="i-fa6-solid:location-dot" class="h-4 w-4 shrink-0 text-primary-400" />
        <span class="truncate text-sm text-white/80 max-w-32 lg:max-w-48">
          {{ parsedValue?.description || 'Unknown' }}
        </span>
      </div>
      <button type="button" class="shrink-0 rounded p-1 hover:bg-white/10" @click="clearLocation">
        <UIcon name="i-fa6-solid:xmark" class="h-4 w-4 text-red-400" />
      </button>
    </div>

    <!-- No location: show set button -->
    <UButton
      v-else
      color="neutral"
      variant="soft"
      icon="i-fa6-solid:location-dot"
      @click="openPicker"
    >
      Set Location
    </UButton>

    <p v-if="error" class="mt-1 text-xs text-red-400">{{ error }}</p>

    <!-- Map picker modal -->
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
            <p class="font-medium text-white">Pick Location</p>
          </div>

          <!-- Map (lazy-loaded) -->
          <div class="flex-1">
            <GoogleMap
              :api-key="apiKey"
              :libraries="['marker']"
              :center="mapCenter"
              :zoom="mapZoom"
              :disable-default-ui="true"
              :zoom-control="true"
              gesture-handling="greedy"
              background-color="#09090b"
              map-id="koios-location-picker"
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

          <!-- Footer -->
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
              :loading="geocoding"
              @click="confirmLocation"
            >
              Confirm
            </UButton>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, defineAsyncComponent } from 'vue'
import type { components } from '@/types/api'
import { ENV } from '@/config/environment'
import { appsApi } from '@/lib/api/apps'

// Lazy-load Google Maps components — only fetched when this field renders
const GoogleMap = defineAsyncComponent(() => import('vue3-google-map').then((m) => m.GoogleMap))
const AdvancedMarker = defineAsyncComponent(() =>
  import('vue3-google-map').then((m) => m.AdvancedMarker),
)

interface LatLng {
  lat: number
  lng: number
}

type LocationField = components['schemas']['AppSchemaLocationFieldDto']

const props = defineProps<{
  field: LocationField
  value: unknown
  error?: string
  appId: string
}>()

const emit = defineEmits<{
  (e: 'update:value', value: string): void
}>()

const apiKey = ENV.googleMapsApiKey()

const isOpen = ref(false)
const locating = ref(false)
const geocoding = ref(false)
const pendingLocation = ref<LatLng | null>(null)
const mapCenter = ref<LatLng>({ lat: 37.7749, lng: -122.4194 })
const mapZoom = ref(12)

const parsedValue = computed(() => {
  if (!props.value) return null
  try {
    const parsed = JSON.parse(String(props.value))
    if (!parsed.lat || !parsed.lng) return null
    return parsed as { lat: string; lng: string; description: string }
  } catch {
    return null
  }
})

const parsedLatLng = computed<LatLng | null>(() => {
  if (!parsedValue.value) return null
  const lat = parseFloat(parsedValue.value.lat)
  const lng = parseFloat(parsedValue.value.lng)
  if (isNaN(lat) || isNaN(lng)) return null
  return { lat, lng }
})

const isSet = computed(() => !!parsedLatLng.value)

function openPicker() {
  if (parsedLatLng.value) {
    mapCenter.value = parsedLatLng.value
    pendingLocation.value = parsedLatLng.value
  } else {
    pendingLocation.value = null
  }
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
  if (!navigator.geolocation) return

  locating.value = true
  try {
    const position = await new Promise<GeolocationPosition>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 10000,
      })
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

async function confirmLocation() {
  if (!pendingLocation.value) return

  geocoding.value = true
  try {
    const loc = pendingLocation.value
    const result = await appsApi.geocode(props.appId, loc.lat, loc.lng)
    emit('update:value', JSON.stringify(result))
    isOpen.value = false
  } finally {
    geocoding.value = false
  }
}

function clearLocation() {
  emit('update:value', '')
}
</script>
